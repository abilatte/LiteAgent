import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { config as loadDotenv, parse as parseDotenv, type DotenvConfigOutput } from "dotenv";

import {
  RUNTIME_CONFIG_ENV_KEYS,
  SETTINGS_JSON_ENV_ALIASES,
  type RuntimeConfigEnvKey,
} from "./config";
import { resolveConfigPaths, type ResolveConfigPathsOptions, type ResolvedConfigPaths } from "./path-resolution";

export type ProjectEnvOptions = {
  cwd?: string;
  fileName?: string;
};

type SupportedEnvInput = Record<string, string | undefined>;
type EnvSourceName = "user-settings" | "project-env" | "process-env";

export type BootstrapEnvOptions = ResolveConfigPathsOptions & {
  env?: SupportedEnvInput;
};

export type BootstrapEnvResult = {
  env: SupportedEnvInput;
  parsed: Partial<Record<RuntimeConfigEnvKey, string>>;
  sources: Partial<Record<RuntimeConfigEnvKey, EnvSourceName>>;
  loadedFiles: string[];
  paths: ResolvedConfigPaths;
  error?: Error;
};

const DEFAULT_ENV_FILE = ".env";

export function loadProjectEnv(
  options: ProjectEnvOptions = {},
): DotenvConfigOutput {
  const cwd = options.cwd ?? process.cwd();
  const fileName = options.fileName ?? DEFAULT_ENV_FILE;
  const envPath = resolve(cwd, fileName);

  if (!existsSync(envPath)) {
    return { parsed: {} };
  }

  return loadDotenv({
    override: false,
    path: envPath,
    quiet: true,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeSettingValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return undefined;
}

function readProjectEnvFile(envPath: string): Partial<Record<RuntimeConfigEnvKey, string>> {
  if (!existsSync(envPath)) {
    return {};
  }

  const parsed = parseDotenv(readFileSync(envPath, "utf8"));
  const result: Partial<Record<RuntimeConfigEnvKey, string>> = {};

  for (const key of RUNTIME_CONFIG_ENV_KEYS) {
    const value = parsed[key];

    if (typeof value === "string") {
      result[key] = value;
    }
  }

  return result;
}

function readUserSettingsFile(settingsPath: string): Partial<Record<RuntimeConfigEnvKey, string>> {
  if (!existsSync(settingsPath)) {
    return {};
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(readFileSync(settingsPath, "utf8")) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`解析 ${settingsPath} 失败: ${message}`);
  }

  if (!isRecord(parsed)) {
    throw new Error(`解析 ${settingsPath} 失败: settings.json 顶层必须是对象`);
  }

  const result: Partial<Record<RuntimeConfigEnvKey, string>> = {};

  for (const [key, value] of Object.entries(parsed)) {
    const envKey = SETTINGS_JSON_ENV_ALIASES[key];

    if (!envKey) {
      continue;
    }

    const normalizedValue = normalizeSettingValue(value);

    if (normalizedValue !== undefined) {
      result[envKey] = normalizedValue;
    }
  }

  return result;
}

export function bootstrapEnv(options: BootstrapEnvOptions = {}): BootstrapEnvResult {
  const targetEnv = options.env ?? process.env;
  const paths = resolveConfigPaths(options);
  const loadedFiles: string[] = [];

  try {
    const userSettings = readUserSettingsFile(paths.userSettingsPath);
    const projectEnv = readProjectEnvFile(paths.projectEnvPath);

    if (Object.keys(userSettings).length > 0) {
      loadedFiles.push(paths.userSettingsPath);
    }

    if (Object.keys(projectEnv).length > 0) {
      loadedFiles.push(paths.projectEnvPath);
    }

    const mergedEnv: SupportedEnvInput = {
      ...userSettings,
      ...projectEnv,
      ...targetEnv,
    };
    const sources: Partial<Record<RuntimeConfigEnvKey, EnvSourceName>> = {};

    for (const key of RUNTIME_CONFIG_ENV_KEYS) {
      if (targetEnv[key] !== undefined) {
        sources[key] = "process-env";
      } else if (projectEnv[key] !== undefined) {
        sources[key] = "project-env";
      } else if (userSettings[key] !== undefined) {
        sources[key] = "user-settings";
      }

      const value = mergedEnv[key];

      if (value !== undefined) {
        targetEnv[key] = value;
      }
    }

    return {
      env: targetEnv,
      parsed: {
        ...userSettings,
        ...projectEnv,
      },
      sources,
      loadedFiles,
      paths,
    };
  } catch (error) {
    return {
      env: targetEnv,
      parsed: {},
      sources: {},
      loadedFiles,
      paths,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
