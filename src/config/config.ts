export type EnvInput = Record<string, string | undefined>;

export const RUNTIME_CONFIG_ENV_KEYS = [
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL",
  "COMMAND_TIMEOUT_MS",
  "MAX_COMMAND_OUTPUT",
  "ENABLE_MCP",
  "ENABLE_SKILLS",
] as const;

export type RuntimeConfigEnvKey = (typeof RUNTIME_CONFIG_ENV_KEYS)[number];

export const SETTINGS_JSON_ENV_ALIASES: Record<string, RuntimeConfigEnvKey> = {
  OPENAI_API_KEY: "OPENAI_API_KEY",
  OPENAI_BASE_URL: "OPENAI_BASE_URL",
  OPENAI_MODEL: "OPENAI_MODEL",
  COMMAND_TIMEOUT_MS: "COMMAND_TIMEOUT_MS",
  MAX_COMMAND_OUTPUT: "MAX_COMMAND_OUTPUT",
  ENABLE_MCP: "ENABLE_MCP",
  ENABLE_SKILLS: "ENABLE_SKILLS",
  apiKey: "OPENAI_API_KEY",
  openaiApiKey: "OPENAI_API_KEY",
  baseUrl: "OPENAI_BASE_URL",
  openaiBaseUrl: "OPENAI_BASE_URL",
  model: "OPENAI_MODEL",
  openaiModel: "OPENAI_MODEL",
  commandTimeoutMs: "COMMAND_TIMEOUT_MS",
  maxCommandOutput: "MAX_COMMAND_OUTPUT",
  enableMcp: "ENABLE_MCP",
  enableSkills: "ENABLE_SKILLS",
};

export type RuntimeConfig = {
  provider: "openai";
  apiKey: string;
  baseUrl?: string;
  model: string;
  commandTimeoutMs: number;
  maxCommandOutput: number;
  enableMcp: boolean;
  enableSkills: boolean;
};

function readOptionalString(value: string | undefined): string | undefined {
  const normalizedValue = value?.trim();

  return normalizedValue ? normalizedValue : undefined;
}

function readString(value: string | undefined, fallback = ""): string {
  return readOptionalString(value) ?? fallback;
}

function readNumber(value: string | undefined, fallback: number): number {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    return fallback;
  }

  return Number(normalizedValue);
}

function readBoolean(value: string | undefined, fallback = false): boolean {
  const normalizedValue = value?.trim().toLowerCase();

  if (!normalizedValue) {
    return fallback;
  }

  if (["1", "true", "yes", "on"].includes(normalizedValue)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalizedValue)) {
    return false;
  }

  return fallback;
}

export function loadConfig(env: EnvInput): RuntimeConfig {
  return {
    provider: "openai",
    apiKey: readString(env.OPENAI_API_KEY),
    baseUrl: readOptionalString(env.OPENAI_BASE_URL),
    model: readString(env.OPENAI_MODEL, "gpt-5.4"),
    commandTimeoutMs: readNumber(env.COMMAND_TIMEOUT_MS, 15000),
    maxCommandOutput: readNumber(env.MAX_COMMAND_OUTPUT, 12000),
    enableMcp: readBoolean(env.ENABLE_MCP),
    enableSkills: readBoolean(env.ENABLE_SKILLS),
  };
}
