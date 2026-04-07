import type { ToolDefinition } from "../tools/tool-types";
import { createMcpClient } from "./mcp-client";
import { loadMcpConfig } from "./mcp-config";

type ToolRegistry = {
  registerMany(tools: ToolDefinition[]): void;
};

type RegisterMcpToolsOptions = {
  cwd: string;
  timeoutMs: number;
};

type McpToolBridgeResult = {
  registeredTools: string[];
  errors: string[];
  close(): Promise<void>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeBridgeSegment(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9_-]/g, "_");
  return normalized.length > 0 ? normalized : "unnamed";
}

function buildBridgeToolName(serverName: string, toolName: string): string {
  return `mcp__${normalizeBridgeSegment(serverName)}__${normalizeBridgeSegment(toolName)}`;
}

function normalizeInputSchema(schema: unknown): object {
  return isRecord(schema)
    ? schema
    : {
        type: "object",
        properties: {},
      };
}

export async function registerMcpTools(
  registry: ToolRegistry,
  options: RegisterMcpToolsOptions,
): Promise<McpToolBridgeResult> {
  const configResult = loadMcpConfig(options.cwd);
  const registeredTools: string[] = [];
  const errors = [...configResult.errors];
  const clients: Array<ReturnType<typeof createMcpClient>> = [];
  const toolsToRegister: ToolDefinition[] = [];

  for (const server of configResult.servers) {
    if (server.transport !== "stdio" || !server.command) {
      errors.push(`MCP server "${server.name}" 当前 transport=${server.transport}，暂不支持动态注册工具`);
      continue;
    }

    const client = createMcpClient(server, {
      cwd: options.cwd,
      timeoutMs: options.timeoutMs,
    });

    try {
      const remoteTools = await client.listTools();
      clients.push(client);

      for (const remoteTool of remoteTools) {
        const bridgeToolName = buildBridgeToolName(server.name, remoteTool.name);
        registeredTools.push(bridgeToolName);
        toolsToRegister.push({
          name: bridgeToolName,
          description: remoteTool.description ?? `MCP tool ${server.name}/${remoteTool.name}`,
          inputSchema: normalizeInputSchema(remoteTool.inputSchema),
          async run(args) {
            const inputArgs =
              typeof args === "object" && args !== null
                ? (args as Record<string, unknown>)
                : {};
            const result = await client.callTool(remoteTool.name, inputArgs);

            return {
              message: `MCP 工具 "${server.name}/${remoteTool.name}" 已执行。`,
              serverName: server.name,
              toolName: remoteTool.name,
              ...result,
            };
          },
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`MCP server "${server.name}" 注册失败: ${message}`);
      await client.close();
    }
  }

  registry.registerMany(toolsToRegister);

  return {
    registeredTools,
    errors,
    async close() {
      await Promise.all(clients.map(async (client) => await client.close()));
    },
  };
}
