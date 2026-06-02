type EnvKey = "DATABASE_URL" | "OPENAI_API_KEY" | "OPENAI_MODEL" | "OPENAI_EMBEDDING_MODEL";

const requiredEnvKeys: EnvKey[] = [
  "DATABASE_URL",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "OPENAI_EMBEDDING_MODEL"
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
    if (typeof property !== "string" || !requiredEnvKeys.includes(property as EnvKey)) {
      return undefined;
    }

    return getRequiredEnv(property as EnvKey);
  }
});
