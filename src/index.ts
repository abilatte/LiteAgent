import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  formatConfigIssueReport,
  formatPatchFileApprovalPrompt,
  formatRunCommandApprovalPrompt,
  formatToolResultSummary,
  formatWelcomeMessage,
} from "./cli/display";
import { readPrompt } from "./cli/io";
import { createReplState, handleSlashCommand } from "./cli/repl";
import { applySlashAction } from "./cli/session-actions";
import { loadConfig } from "./config/config";
import { bootstrapEnv } from "./config/env";
import { validateConfig } from "./config/validation";
import { runAgentTurn } from "./core/agent-loop";
import { createSessionManager } from "./core/session-manager";
import { createSession } from "./core/session";
import { buildExtensionSystemPrompt, createRuntimeExtensionsState } from "./extensions/base";
import { createMcpExtension } from "./extensions/mcp";
import { registerMcpTools } from "./extensions/mcp-tool-bridge";
import { createSkillsExtension } from "./extensions/skills";
import { createOpenAIProvider } from "./providers/openai";
import { createSessionStore } from "./storage/session-store";
import { createDefaultToolRegistry } from "./tools/default-tools";

export function createApp(
  env: Record<string, string | undefined> = process.env,
  cwd = process.cwd(),
) {
  const config = loadConfig(env);
  const extensions = createRuntimeExtensionsState([
    createMcpExtension(config.enableMcp, cwd),
    createSkillsExtension(config.enableSkills, cwd),
  ]);
  const extensionPrompt = buildExtensionSystemPrompt(extensions.all);
  const baseSystemPrompt =
    "You are LiteAgent, a concise coding assistant. Use tools when necessary, ask concise clarifying questions, and never claim to have edited files unless a patch was approved and applied.";

  return {
    name: "LiteAgent",
    version: "0.1.0",
    config,
    validation: validateConfig(config),
    extensions,
    systemPrompt: extensionPrompt
      ? `${baseSystemPrompt}\n\n${extensionPrompt}`
      : baseSystemPrompt,
    repl: createReplState(),
  };
}

async function promptConfirm(
  rl: readline.Interface,
  subject: string | { path: string; diff: string },
): Promise<boolean> {
  if (typeof subject === "string") {
    const prompt = `${formatRunCommandApprovalPrompt({ command: subject })}\n是否继续执行？(y/N) `;
    const answer = await readPrompt(rl, prompt);

    if (answer === null) {
      return false;
    }

    return answer.trim().toLowerCase() === "y";
  }

  output.write(`\n${formatPatchFileApprovalPrompt(subject)}\n${subject.diff}\n`);
  const answer = await readPrompt(rl, "确认写入这些变更吗？(y/N) ");

  if (answer === null) {
    return false;
  }

  return answer.trim().toLowerCase() === "y";
}

async function promptAsk(rl: readline.Interface, question: string): Promise<string> {
  return (await readPrompt(rl, `${question}\n> `)) ?? "";
}

export async function runCli(): Promise<number> {
  const envResult = bootstrapEnv();

  if (envResult.error) {
    output.write(`读取 .env 失败：${envResult.error.message}\n`);
    return 1;
  }

  const cwd = process.cwd();
  const app = createApp(process.env, cwd);

  if (!app.validation.ok) {
    output.write(`${formatConfigIssueReport(app.validation.issues)}\n`);
    return 1;
  }

  const rl = readline.createInterface({ input, output });
  const provider = createOpenAIProvider({
    apiKey: app.config.apiKey,
    baseUrl: app.config.baseUrl,
    model: app.config.model,
  });
  const registry = createDefaultToolRegistry({
    cwd,
    timeoutMs: app.config.commandTimeoutMs,
    maxOutput: app.config.maxCommandOutput,
    confirm: async (subject) => await promptConfirm(rl, subject),
    ask: async (question) => await promptAsk(rl, question),
  });
  const mcpBridge = app.config.enableMcp
    ? await registerMcpTools(registry, {
        cwd,
        timeoutMs: app.config.commandTimeoutMs,
      })
    : undefined;
  const store = createSessionStore(path.join(cwd, ".data", "sessions"));
  const sessionManager = createSessionManager({
    cwd,
    store,
  });
  let session = createSession(cwd);

  output.write(
    `${formatWelcomeMessage({
      cwd,
      model: app.config.model,
      sessionId: session.id,
    })}\n`,
  );

  try {
    while (true) {
      const userInput = await readPrompt(rl, "> ");

      if (userInput === null) {
        break;
      }

      const trimmedInput = userInput.trim();

      if (!trimmedInput) {
        continue;
      }

      if (trimmedInput.startsWith("/")) {
        const slashResult = handleSlashCommand(trimmedInput, {
          cwd,
          model: app.config.model,
          status: app.repl.status,
          sessionId: session.id,
          historyCount: session.messages.length,
        });

        if (slashResult) {
          if (slashResult.shouldExit) {
            output.write(`${slashResult.output}\n`);
            break;
          }

          if (slashResult.action) {
            if (session.messages.length > 0) {
              await store.save(session);
            }

            const actionResult = await applySlashAction(slashResult.action, {
              currentSession: session,
              listSessions: async () => await sessionManager.listSessions(),
              listSkills: async () => {
                const skillsExtension = app.extensions.all.find((extension) => extension.name === "skills");

                return {
                  enabled: skillsExtension?.enabled === true,
                  items: skillsExtension?.items ?? [],
                };
              },
              listMcp: async () => {
                const mcpExtension = app.extensions.all.find((extension) => extension.name === "mcp");

                return {
                  enabled: mcpExtension?.enabled === true,
                  items: mcpExtension?.items ?? [],
                  errors: [...(mcpExtension?.errors ?? []), ...(mcpBridge?.errors ?? [])],
                  connectedServers: mcpBridge?.connectedServers ?? [],
                  toolBindings: mcpBridge?.toolBindings ?? [],
                };
              },
              loadLatestSession: async () => await sessionManager.loadLatestSession(),
              loadSessionById: async (sessionId) => await sessionManager.loadSessionById(sessionId),
              resetSession: (currentSession) => sessionManager.resetSession(currentSession),
            });

            output.write(`${actionResult.output}\n`);

            if (actionResult.kind === "session-updated") {
              session = actionResult.session;
            }

            continue;
          }

          output.write(`${slashResult.output}\n`);
          continue;
        }

        output.write(`未知命令: ${trimmedInput}\n`);
        continue;
      }

      try {
        app.repl.status = "running";
        app.repl.history.push(trimmedInput);

        let streamedOutput = false;
        let printedToolMessage = false;
        const result = await runAgentTurn({
          provider,
          registry,
          session,
          userInput: trimmedInput,
          systemPrompt: app.systemPrompt,
          onTextDelta(text) {
            output.write(text);
            streamedOutput = true;
          },
          onToolResult(toolResult) {
            const message = formatToolResultSummary(toolResult);

            if (!message) {
              return;
            }

            if (streamedOutput) {
              output.write("\n");
            }

            output.write(`${message}\n`);
            printedToolMessage = true;
            streamedOutput = false;
          },
        });

        if (streamedOutput) {
          output.write("\n");
        } else if (result.outputText) {
          output.write(`${result.outputText}\n`);
        } else if (!printedToolMessage) {
          output.write("本轮未返回可显示内容。\n");
        }

        session = result.session;
        await store.save(result.session);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        output.write(`执行失败: ${message}\n`);
      } finally {
        app.repl.status = "idle";
      }
    }
  } finally {
    await mcpBridge?.close();
    rl.close();
  }

  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      console.error(message);
      process.exitCode = 1;
    });
}
