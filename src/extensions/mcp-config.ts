import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { resolveConfigPaths } from "../config/path-resolution";

export type McpTransport = "stdio" | "http" | "sse";

type McpConfigShape = {
  mcpServers?: Record<string, unknown>;
  servers?: Record<string, unknown>;
};

type RawMcpServerConfig = Record<string, unknown>;

export type NormalizedMcpServerConfig = {
  name: string;
  transport: McpTransport;
  source: string;
  command?: string;
  args?: string[];
  url?: string;
};

export type LoadedMcpConfig = {
  source?: string;
  servers: NormalizedMcpServerConfig[];
  errors: string[];
};

const PROJECT_MCP_CONFIG_CANDIDATES = ["liteagent.mcp.json", ".mcp.json"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeTransport(config: RawMcpServerConfig): McpTransport | null {
  const explicitTransport = typeof config.transport === "string" ? config.transport.trim().toLowerCase() : undefined;

  if (explicitTransport === "stdio") {
    return "stdio";
  }

  if (explicitTransport === "sse") {
    return "sse";
  }

  if (explicitTransport === "http" || explicitTransport === "streamable-http") {
    return "http";
  }

  if (explicitTransport) {
    return null;
  }

  return typeof config.url === "string" ? "http" : "stdio";
}

function normalizeArgs(name: string, config: RawMcpServerConfig): string[] {
  if (config.args === undefined) {
    return [];
  }

  if (!Array.isArray(config.args) || config.args.some((value) => typeof value !== "string")) {
    throw new Error(`MCP server "${name}" 的 args 必须是字符串数组`);
  }

  return config.args;
}

function normalizeServerConfig(
  name: string,
  config: unknown,
  source: string,
): NormalizedMcpServerConfig {
  if (!isRecord(config)) {
    throw new Error(`MCP server "${name}" 的配置必须是对象`);
  }

  const transport = normalizeTransport(config);

  if (transport === null) {
    throw new Error(`MCP server "${name}" 使用了不支持的 transport: ${String(config.transport)}`);
  }

  if (transport === "stdio") {
    const command = typeof config.command === "string" ? config.command.trim() : "";

    if (!command) {
      throw new Error(`MCP server "${name}" 使用 stdio 时必须提供 command`);
    }

    return {
      name,
      transport,
      source,
      command,
      args: normalizeArgs(name, config),
    };
  }

  const url = typeof config.url === "string" ? config.url.trim() : "";

  if (!url) {
    throw new Error(`MCP server "${name}" 使用 ${transport} 时必须提供 url`);
  }

  return {
    name,
    transport,
    source,
    url,
  };
}

function loadSingleMcpConfigFile(filePath: string, source: string): LoadedMcpConfig {
  if (!existsSync(filePath)) {
    return {
      servers: [],
      errors: [],
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as McpConfigShape;
    const rawServers = parsed.mcpServers ?? parsed.servers;

    if (!isRecord(rawServers)) {
      return {
        source,
        servers: [],
        errors: [`${source} 中未找到有效的 mcpServers/servers 对象`],
      };
    }

    const servers: NormalizedMcpServerConfig[] = [];
    const errors: string[] = [];

    for (const [name, config] of Object.entries(rawServers)) {
      try {
        servers.push(normalizeServerConfig(name, config, source));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(message);
      }
    }

    return {
      source,
      servers,
      errors,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      source,
      servers: [],
      errors: [`解析 ${source} 失败: ${message}`],
    };
  }
}

function loadProjectMcpConfig(cwd: string): LoadedMcpConfig {
  for (const fileName of PROJECT_MCP_CONFIG_CANDIDATES) {
    const filePath = path.join(cwd, fileName);

    if (!existsSync(filePath)) {
      continue;
    }

    return loadSingleMcpConfigFile(filePath, fileName);
  }

  return {
    servers: [],
    errors: [],
  };
}

export function loadMcpConfig(cwd: string, homeDir?: string): LoadedMcpConfig {
  const paths = resolveConfigPaths({ cwd, homeDir });
  const userConfig = loadSingleMcpConfigFile(paths.userMcpPath, "~/.liteagent/mcp.json");
  const projectConfig = loadProjectMcpConfig(cwd);
  const mergedServers = new Map<string, NormalizedMcpServerConfig>();

  for (const server of userConfig.servers) {
    mergedServers.set(server.name, server);
  }

  for (const server of projectConfig.servers) {
    mergedServers.set(server.name, server);
  }

  return {
    source: projectConfig.source ?? userConfig.source,
    servers: [...mergedServers.values()],
    errors: [...userConfig.errors, ...projectConfig.errors],
  };
}
