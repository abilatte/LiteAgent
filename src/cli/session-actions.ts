import type { ResetSessionResult } from "../core/session-manager";
import type { RuntimeExtensionItem } from "../extensions/base";
import type { McpToolBridgeBinding } from "../extensions/mcp-tool-bridge";
import type { SessionSummary } from "../storage/session-store";
import type { SessionRecord } from "../types";
import type { SlashCommandAction } from "./repl";

type SessionActionHandlers = {
  currentSession: SessionRecord;
  listSessions: () => Promise<SessionSummary[]>;
  listSkills: () => Promise<{
    enabled: boolean;
    items: RuntimeExtensionItem[];
  }>;
  listMcp?: () => Promise<{
    enabled: boolean;
    items: RuntimeExtensionItem[];
    errors: string[];
    connectedServers: string[];
    toolBindings: McpToolBridgeBinding[];
  }>;
  loadLatestSession: () => Promise<SessionRecord | null>;
  loadSessionById: (sessionId: string) => Promise<SessionRecord | null>;
  resetSession: (currentSession?: SessionRecord) => ResetSessionResult;
};

export type SessionActionResult =
  | {
      kind: "session-updated";
      session: SessionRecord;
      sessionId: string;
      output: string;
      previousSessionId?: string;
    }
  | {
      kind: "message";
      output: string;
    };

export async function applySlashAction(
  action: SlashCommandAction,
  handlers: SessionActionHandlers,
): Promise<SessionActionResult> {
  if (action.type === "list-sessions") {
    const sessions = await handlers.listSessions();

    return {
      kind: "message",
      output: formatSessionList(sessions),
    };
  }

  if (action.type === "list-skills") {
    const skills = await handlers.listSkills();

    return {
      kind: "message",
      output: formatSkillsList(skills),
    };
  }

  if (action.type === "list-mcp") {
    const mcp = handlers.listMcp
      ? await handlers.listMcp()
      : {
          enabled: false,
          items: [],
          errors: [],
          connectedServers: [],
          toolBindings: [],
        };

    return {
      kind: "message",
      output: formatMcpList(mcp),
    };
  }

  if (action.type === "resume-session") {
    if (typeof action.sessionIndex === "number") {
      const sessions = await handlers.listSessions();
      const summary = sessions[action.sessionIndex - 1];

      if (!summary) {
        return {
          kind: "message",
          output: `未找到序号为 ${action.sessionIndex} 的会话，可先使用 /sessions 查看可恢复列表。`,
        };
      }

      const session = await handlers.loadSessionById(summary.id);

      if (!session) {
        return {
          kind: "message",
          output: `第 ${action.sessionIndex} 条会话 ${summary.id} 已不可用，请重新执行 /sessions 后再试。`,
        };
      }

      return {
        kind: "session-updated",
        session,
        sessionId: session.id,
        output: `已恢复第 ${action.sessionIndex} 条会话 ${session.id}，当前共有 ${session.messages.length} 条消息。`,
      };
    }

    const session = action.sessionId
      ? await handlers.loadSessionById(action.sessionId)
      : await handlers.loadLatestSession();

    if (!session) {
      return {
        kind: "message",
        output: action.sessionId
          ? `未找到会话: ${action.sessionId}`
          : "没有可恢复的最近会话，可先开始新会话或使用 /sessions 查看历史记录。",
      };
    }

    return {
      kind: "session-updated",
      session,
      sessionId: session.id,
      output: action.sessionId
        ? `已恢复会话 ${session.id}，当前共有 ${session.messages.length} 条消息。`
        : `已恢复最近会话 ${session.id}，当前共有 ${session.messages.length} 条消息。`,
    };
  }

  const resetResult = handlers.resetSession(handlers.currentSession);

  return {
    kind: "session-updated",
    session: resetResult.session,
    sessionId: resetResult.session.id,
    previousSessionId: resetResult.previousSessionId,
    output: resetResult.previousSessionId
      ? `已开始新会话，上一会话为 ${resetResult.previousSessionId}。`
      : "已开始新会话。",
  };
}

function formatSessionList(sessions: SessionSummary[]): string {
  if (sessions.length === 0) {
    return "暂无本地历史会话。";
  }

  const lines = [
    "本地历史会话（按最近活动排序）",
    "使用 /resume <序号> 或 /resume <sessionId> 可恢复指定会话。",
    "",
  ];

  for (const [index, session] of sessions.entries()) {
    lines.push(`${index + 1}. ${session.id}`);
    lines.push(`   ${session.messageCount} 条消息 | 最近活动 ${formatTimestamp(session.lastActivityAt)}`);
  }

  return lines.join("\n");
}

function formatSkillsList(input: {
  enabled: boolean;
  items: RuntimeExtensionItem[];
}): string {
  if (input.items.length === 0) {
    return input.enabled
      ? "暂无已发现的 skills。"
      : "暂无已发现的 skills，或 Skills 扩展尚未启用。";
  }

  const lines = ["当前已发现的 skills", ""];

  for (const [index, skill] of input.items.entries()) {
    lines.push(`${index + 1}. ${skill.name}`);

    if (skill.description) {
      lines.push(`   ${skill.description}`);
    }

    if (skill.entryPath) {
      lines.push(`   ${skill.entryPath}`);
    }
  }

  if (!input.enabled) {
    lines.push("");
    lines.push("当前 Skills 扩展未启用，这些 skill 还不会自动参与运行时提示。");
  }

  return lines.join("\n");
}

function formatMcpList(input: {
  enabled: boolean;
  items: RuntimeExtensionItem[];
  errors: string[];
  connectedServers: string[];
  toolBindings: McpToolBridgeBinding[];
}): string {
  if (input.items.length === 0) {
    return input.enabled
      ? "暂未发现 MCP server 配置。"
      : "暂未发现 MCP server 配置，或 MCP 扩展尚未启用。";
  }

  const lines = ["当前 MCP 状态", ""];

  for (const [index, item] of input.items.entries()) {
    lines.push(`${index + 1}. ${item.name}`);

    if (item.source) {
      lines.push(`   来源：${item.source}`);
    }

    if (item.transport) {
      lines.push(`   传输：${item.transport}`);
    }

    lines.push(`   状态：${input.connectedServers.includes(item.name) ? "已连接" : "未连接"}`);

    const bindings = input.toolBindings.filter((binding) => binding.serverName === item.name);

    if (bindings.length > 0) {
      lines.push(`   已注册工具：${bindings.map((binding) => binding.bridgeToolName).join(", ")}`);
    }
  }

  if (input.errors.length > 0) {
    lines.push("");
    lines.push("错误 / 警告");

    for (const error of input.errors) {
      lines.push(`- ${error}`);
    }
  }

  if (!input.enabled) {
    lines.push("");
    lines.push("当前 MCP 扩展未启用，这些 server 还不会自动参与运行时工具注册。");
  }

  return lines.join("\n");
}

function formatTimestamp(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}
