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

function loadEnv() {
  const values = Object.fromEntries(requiredEnvKeys.map((key) => [key, readRequiredEnv(key)])) as Record<
    EnvKey,
    string | null
  >;
  const missingKeys = requiredEnvKeys.filter((key) => values[key] === null);

  if (missingKeys.length > 0) {
    throw new Error(
      [
        `Missing required environment variable${missingKeys.length > 1 ? "s" : ""}: ${missingKeys.join(", ")}`,
        "Create a .env file from .env.example and fill in these values.",
        "Never commit real API keys."
      ].join(" ")
    );
  }

  return values as Record<EnvKey, string>;
}

export const env = loadEnv();
