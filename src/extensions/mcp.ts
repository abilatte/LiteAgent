import type { RuntimeExtension, RuntimeExtensionItem } from "./base";
import { loadMcpConfig } from "./mcp-config";

export function createMcpExtension(
  enabled: boolean,
  cwd = process.cwd(),
): RuntimeExtension {
  const configResult = enabled ? loadMcpConfig(cwd) : { servers: [], errors: [] };
  const items: RuntimeExtensionItem[] = configResult.servers.map((server) => ({
    name: server.name,
    source: server.source,
    transport: server.transport,
  }));

  return {
    name: "mcp",
    enabled,
    description: enabled
      ? `MCP 扩展已启用，发现 ${items.length} 个 MCP 服务配置。`
      : "MCP 扩展未启用。",
    items,
    systemPrompt: enabled
      ? [
          "MCP extension is enabled.",
          items.length > 0
            ? `Configured MCP servers: ${items.map((item) => item.name).join(", ")}.`
            : "No MCP server configuration was discovered.",
          "If MCP-backed capabilities are available in the runtime, prefer using them through the registered extension surface instead of inventing unavailable tools.",
        ].join(" ")
      : undefined,
    errors: enabled ? configResult.errors : undefined,
  };
}
