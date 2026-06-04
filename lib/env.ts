type EnvKey =
  | "DATABASE_URL"
  | "DIRECT_URL"
  | "SESSION_SECRET"
  | "OPENAI_API_KEY"
  | "OPENAI_BASE_URL"
  | "OPENAI_MODEL"
  | "OPENAI_EMBEDDING_MODEL"
  | "DEEPSEEK_API_KEY"
  | "DEEPSEEK_BASE_URL"
  | "DEEPSEEK_MODEL"
  | "AI_PROVIDER"
  | "AI_FALLBACK_PROVIDER";

const requiredEnvKeys: EnvKey[] = [
  "DATABASE_URL",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "OPENAI_EMBEDDING_MODEL"
];
const knownEnvKeys: EnvKey[] = [
  "DATABASE_URL",
  "DIRECT_URL",
  "SESSION_SECRET",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL",
  "OPENAI_EMBEDDING_MODEL",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_BASE_URL",
  "DEEPSEEK_MODEL",
  "AI_PROVIDER",
  "AI_FALLBACK_PROVIDER"
];

function readRequiredEnv(key: EnvKey) {
  const value = process.env[key]?.trim();

  if (!value) {
    return null;
  }

  return value;
}

export function getRequiredEnv(key: EnvKey) {
  const value = readRequiredEnv(key);

  if (!value) {
    throw new Error(
      [
        `Missing required environment variable: ${key}`,
        "Create a .env file from .env.example and fill in these values.",
        "Never commit real API keys."
      ].join(" ")
    );
  }

  return value;
}

export const env = new Proxy({} as Record<EnvKey, string>, {
  get(_target, property) {
    if (typeof property !== "string" || !knownEnvKeys.includes(property as EnvKey)) {
      return undefined;
    }

    return requiredEnvKeys.includes(property as EnvKey)
      ? getRequiredEnv(property as EnvKey)
      : process.env[property as EnvKey]?.trim();
  }
});
