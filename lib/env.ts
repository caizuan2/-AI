type EnvKey =
  | "DATABASE_URL"
  | "DIRECT_URL"
  | "SESSION_SECRET"
  | "QWEN_API_KEY"
  | "QWEN_BASE_URL"
  | "QWEN_MODEL"
  | "OPENAI_API_KEY"
  | "OPENAI_BASE_URL"
  | "OPENAI_MODEL"
  | "OPENAI_EMBEDDING_MODEL"
  | "LLM_PROVIDER"
  | "LLM_MODEL"
  | "EMBEDDING_PROVIDER"
  | "EMBEDDING_MODEL"
  | "DEEPSEEK_API_KEY"
  | "DEEPSEEK_BASE_URL"
  | "DEEPSEEK_MODEL"
  | "AI_PROVIDER"
  | "AI_FALLBACK_PROVIDER"
  | "AI_SECONDARY_FALLBACK_PROVIDER"
  | "RAG_TOP_K"
  | "RAG_MIN_SCORE"
  | "RAG_SIMILARITY_THRESHOLD"
  | "RAG_MAX_CONTEXT_CHUNKS"
  | "RAG_MAX_CONTEXT_CHARS"
  | "RAG_ENABLE_RERANK";

const requiredEnvKeys: EnvKey[] = [
  "DATABASE_URL",
  "QWEN_API_KEY",
  "QWEN_MODEL",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "OPENAI_EMBEDDING_MODEL"
];
const knownEnvKeys: EnvKey[] = [
  "DATABASE_URL",
  "DIRECT_URL",
  "SESSION_SECRET",
  "QWEN_API_KEY",
  "QWEN_BASE_URL",
  "QWEN_MODEL",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL",
  "OPENAI_EMBEDDING_MODEL",
  "LLM_PROVIDER",
  "LLM_MODEL",
  "EMBEDDING_PROVIDER",
  "EMBEDDING_MODEL",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_BASE_URL",
  "DEEPSEEK_MODEL",
  "AI_PROVIDER",
  "AI_FALLBACK_PROVIDER",
  "AI_SECONDARY_FALLBACK_PROVIDER",
  "RAG_TOP_K",
  "RAG_MIN_SCORE",
  "RAG_SIMILARITY_THRESHOLD",
  "RAG_MAX_CONTEXT_CHUNKS",
  "RAG_MAX_CONTEXT_CHARS",
  "RAG_ENABLE_RERANK"
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
