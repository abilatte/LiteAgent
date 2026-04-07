import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import type { NormalizedMcpServerConfig } from "./mcp-config";

const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"] as const;
const DEFAULT_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcNotification = {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc?: string;
  id?: number;
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
  };
};

type PendingRequest = {
  method: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

export type McpToolDefinition = {
  name: string;
  description?: string;
  inputSchema?: object;
};

export type McpInitializeResult = {
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  serverInfo: {
    name: string;
    version: string;
  };
  instructions?: string;
};

type McpClientOptions = {
  cwd: string;
  timeoutMs?: number;
  clientInfo?: {
    name: string;
    version: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function createErrorMessage(prefix: string, stderr: string): string {
  const normalizedStderr = stderr.trim();
  return normalizedStderr ? `${prefix}，stderr: ${normalizedStderr}` : prefix;
}

export function createMcpClient(server: NormalizedMcpServerConfig, options: McpClientOptions) {
  if (server.transport !== "stdio" || !server.command) {
    throw new Error(`MCP client 目前只支持带 command 的 stdio server，当前为 ${server.name}`);
  }

  const timeoutMs = options.timeoutMs ?? 5_000;
  const clientInfo = options.clientInfo ?? {
    name: "LiteAgent",
    version: "0.1.0",
  };

  let child: ChildProcessWithoutNullStreams | undefined;
  let stdoutBuffer = "";
  let stderrBuffer = "";
  let nextRequestId = 1;
  let closed = false;
  let initializePromise: Promise<McpInitializeResult> | undefined;
  let initializeResult: McpInitializeResult | undefined;
  let childExitPromise: Promise<void> | undefined;
  let resolveChildExit: (() => void) | undefined;
  const pendingRequests = new Map<number, PendingRequest>();

  function rejectAllPending(error: Error) {
    for (const pending of pendingRequests.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }

    pendingRequests.clear();
  }

  function detachChild() {
    child = undefined;
    stdoutBuffer = "";
  }

  function handleIncomingLine(line: string) {
    let message: JsonRpcResponse;

    try {
      message = JSON.parse(line) as JsonRpcResponse;
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      const failure = new Error(`MCP server "${server.name}" 返回了无法解析的 JSON: ${messageText}`);
      rejectAllPending(failure);
      return;
    }

    if (typeof message.id !== "number") {
      return;
    }

    const pending = pendingRequests.get(message.id);

    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    pendingRequests.delete(message.id);

    if (message.error) {
      const errorCode = typeof message.error.code === "number" ? `(${message.error.code}) ` : "";
      pending.reject(new Error(`MCP 请求 ${pending.method} 失败: ${errorCode}${message.error.message ?? "未知错误"}`));
      return;
    }

    pending.resolve(message.result);
  }

  function attachChildListeners(activeChild: ChildProcessWithoutNullStreams) {
    activeChild.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk.toString();

      while (true) {
        const newlineIndex = stdoutBuffer.indexOf("\n");

        if (newlineIndex === -1) {
          break;
        }

        const line = stdoutBuffer.slice(0, newlineIndex).trim();
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);

        if (!line) {
          continue;
        }

        handleIncomingLine(line);
      }
    });

    activeChild.stderr.on("data", (chunk) => {
      stderrBuffer += chunk.toString();
    });

    activeChild.on("error", (error) => {
      detachChild();
      rejectAllPending(new Error(createErrorMessage(`MCP server "${server.name}" 启动失败: ${error.message}`, stderrBuffer)));
    });

    activeChild.on("close", (exitCode, signal) => {
      resolveChildExit?.();
      resolveChildExit = undefined;
      detachChild();

      if (closed && pendingRequests.size === 0) {
        return;
      }

      const exitSuffix =
        signal !== null
          ? `收到信号 ${signal}`
          : `退出码 ${exitCode ?? "unknown"}`;
      rejectAllPending(
        new Error(createErrorMessage(`MCP server "${server.name}" 已退出，${exitSuffix}`, stderrBuffer)),
      );
    });
  }

  function ensureChild() {
    if (closed) {
      throw new Error(`MCP client "${server.name}" 已关闭，不能再次使用`);
    }

    if (child) {
      return child;
    }

    stderrBuffer = "";
    const command = server.command;

    if (!command) {
      throw new Error(`MCP server "${server.name}" 缺少可执行 command`);
    }

    const activeChild = spawn(command, server.args ?? [], {
      cwd: options.cwd,
      stdio: "pipe",
      shell: false,
    });
    childExitPromise = new Promise<void>((resolve) => {
      resolveChildExit = resolve;
    });
    child = activeChild;
    attachChildListeners(activeChild);
    return activeChild;
  }

  function writeMessage(message: JsonRpcRequest | JsonRpcNotification) {
    const activeChild = ensureChild();

    if (!activeChild.stdin.writable) {
      throw new Error(`MCP server "${server.name}" 的 stdin 不可写`);
    }

    activeChild.stdin.write(`${JSON.stringify(message)}\n`);
  }

  function request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = nextRequestId;
    nextRequestId += 1;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingRequests.delete(id);

        if (child && !child.killed) {
          child.kill();
        }

        reject(new Error(createErrorMessage(`MCP 请求 ${method} 超时: ${server.name}`, stderrBuffer)));
      }, timeoutMs);

      pendingRequests.set(id, {
        method,
        resolve,
        reject,
        timer,
      });

      try {
        writeMessage({
          jsonrpc: "2.0",
          id,
          method,
          params,
        });
      } catch (error) {
        clearTimeout(timer);
        pendingRequests.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  function notify(method: string, params?: Record<string, unknown>) {
    writeMessage({
      jsonrpc: "2.0",
      method,
      params,
    });
  }

  function normalizeInitializeResult(result: unknown): McpInitializeResult {
    if (!isRecord(result)) {
      throw new Error(`MCP server "${server.name}" 返回了无效的 initialize 结果`);
    }

    const protocolVersion = typeof result.protocolVersion === "string" ? result.protocolVersion : "";
    const capabilities = isRecord(result.capabilities) ? result.capabilities : {};
    const serverInfo = isRecord(result.serverInfo) ? result.serverInfo : {};
    const name = typeof serverInfo.name === "string" ? serverInfo.name : server.name;
    const version = typeof serverInfo.version === "string" ? serverInfo.version : "unknown";
    const instructions = typeof result.instructions === "string" ? result.instructions : undefined;

    if (!protocolVersion) {
      throw new Error(`MCP server "${server.name}" 未返回 protocolVersion`);
    }

    if (!SUPPORTED_PROTOCOL_VERSIONS.includes(protocolVersion as (typeof SUPPORTED_PROTOCOL_VERSIONS)[number])) {
      throw new Error(`MCP server "${server.name}" 返回了不支持的协议版本: ${protocolVersion}`);
    }

    return {
      protocolVersion,
      capabilities,
      serverInfo: {
        name,
        version,
      },
      instructions,
    };
  }

  async function initialize() {
    if (initializeResult) {
      return initializeResult;
    }

    if (initializePromise) {
      return await initializePromise;
    }

    initializePromise = (async () => {
      const result = await request("initialize", {
        protocolVersion: DEFAULT_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo,
      });
      const normalized = normalizeInitializeResult(result);
      initializeResult = normalized;
      notify("notifications/initialized");
      return normalized;
    })();

    try {
      return await initializePromise;
    } finally {
      initializePromise = undefined;
    }
  }

  async function listTools(): Promise<McpToolDefinition[]> {
    await initialize();

    const tools: McpToolDefinition[] = [];
    let cursor: string | undefined;

    while (true) {
      const result = await request(
        "tools/list",
        cursor
          ? {
              cursor,
            }
          : undefined,
      );

      if (!isRecord(result)) {
        throw new Error(`MCP server "${server.name}" 返回了无效的 tools/list 结果`);
      }

      const pageTools = Array.isArray(result.tools) ? result.tools : [];

      for (const item of pageTools) {
        if (!isRecord(item) || typeof item.name !== "string") {
          continue;
        }

        tools.push({
          name: item.name,
          description: typeof item.description === "string" ? item.description : undefined,
          inputSchema: isRecord(item.inputSchema) ? item.inputSchema : undefined,
        });
      }

      cursor = typeof result.nextCursor === "string" ? result.nextCursor : undefined;

      if (!cursor) {
        break;
      }
    }

    return tools;
  }

  async function close() {
    closed = true;

    if (!child) {
      if (childExitPromise) {
        await childExitPromise;
      }
      return;
    }

    const activeChild = child;
    detachChild();
    rejectAllPending(new Error(`MCP client "${server.name}" 已关闭`));

    if (activeChild.exitCode !== null || activeChild.killed) {
      if (childExitPromise) {
        await childExitPromise;
      }
      return;
    }

    activeChild.kill();

    if (childExitPromise) {
      await childExitPromise;
    }
  }

  return {
    initialize,
    listTools,
    close,
  };
}
