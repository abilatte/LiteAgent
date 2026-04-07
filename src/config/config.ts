export type EnvInput = Record<string, string | undefined>;

export type RuntimeConfig = {
  provider: "openai";
  apiKey: string;
  baseUrl?: string;
  model: string;
  commandTimeoutMs: number;
  maxCommandOutput: number;
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

export function loadConfig(env: EnvInput): RuntimeConfig {
  return {
    provider: "openai",
    apiKey: readString(env.OPENAI_API_KEY),
    baseUrl: readOptionalString(env.OPENAI_BASE_URL),
    model: readString(env.OPENAI_MODEL, "gpt-5.4"),
    commandTimeoutMs: readNumber(env.COMMAND_TIMEOUT_MS, 15000),
    maxCommandOutput: readNumber(env.MAX_COMMAND_OUTPUT, 12000),
  };
}
