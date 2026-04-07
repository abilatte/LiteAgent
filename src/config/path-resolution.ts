import { homedir } from "node:os";
import path from "node:path";

export type ResolveConfigPathsOptions = {
  cwd?: string;
  homeDir?: string;
};

export type ResolvedConfigPaths = {
  cwd: string;
  homeDir: string;
  userConfigDir: string;
  userSettingsPath: string;
  userMcpPath: string;
  projectEnvPath: string;
  projectMcpConfigPaths: string[];
  projectSkillsDir: string;
};

export function resolveConfigPaths(
  options: ResolveConfigPathsOptions = {},
): ResolvedConfigPaths {
  const resolvedCwd = path.resolve(options.cwd ?? process.cwd());
  const resolvedHomeDir = path.resolve(options.homeDir ?? homedir());
  const userConfigDir = path.join(resolvedHomeDir, ".liteagent");

  return {
    cwd: resolvedCwd,
    homeDir: resolvedHomeDir,
    userConfigDir,
    userSettingsPath: path.join(userConfigDir, "settings.json"),
    userMcpPath: path.join(userConfigDir, "mcp.json"),
    projectEnvPath: path.join(resolvedCwd, ".env"),
    projectMcpConfigPaths: [
      path.join(resolvedCwd, "liteagent.mcp.json"),
      path.join(resolvedCwd, ".mcp.json"),
    ],
    projectSkillsDir: path.join(resolvedCwd, "skills"),
  };
}
