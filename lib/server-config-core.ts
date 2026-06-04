export const OPENAI_PLACEHOLDER_API_KEY = "sk-your-openai-api-key";
export const DEEPSEEK_PLACEHOLDER_API_KEY = "sk-your-deepseek-api-key";
export const QWEN_PLACEHOLDER_API_KEY = "sk-your-qwen-api-key";
export type ChatProviderName = "qwen" | "openai" | "deepseek";
export type EmbeddingProviderName = "openai";

export const SEARCH_DEFAULT_TOP_K = readIntEnv("RAG_TOP_K", 10, 1, 20);
export const SEARCH_MAX_TOP_K = 20;
export const CHAT_TOP_K = readIntEnv("RAG_TOP_K", 10, 1, 20);
export const CHAT_MIN_RELEVANT_SIMILARITY = readSimilarityThreshold();
export const RAG_MAX_CONTEXT_CHUNKS = readIntEnv("RAG_MAX_CONTEXT_CHUNKS", 12, 1, 20);
export const RAG_MAX_CONTEXT_CHARS = readIntEnv("RAG_MAX_CONTEXT_CHARS", 12_000, 1_000, 60_000);
export const RAG_CACHE_TTL_SECONDS = readIntEnv("RAG_CACHE_TTL_SECONDS", 3_600, 60, 86_400);
export const RAG_ENABLE_RERANK = readBooleanEnv("RAG_ENABLE_RERANK", true);
export const RATE_LIMIT_PER_USER_PER_MINUTE = readIntEnv("RATE_LIMIT_PER_USER_PER_MINUTE", 20, 1, 1_000);
export const RATE_LIMIT_GLOBAL_PER_MINUTE = readIntEnv("RATE_LIMIT_GLOBAL_PER_MINUTE", 500, 1, 20_000);
export const INGEST_MAX_CHUNK_CHARS = readIntEnv("INGEST_MAX_CHUNK_CHARS", 1_200, 400, 4_000);
export const INGEST_CHUNK_OVERLAP_CHARS = readIntEnv("INGEST_CHUNK_OVERLAP_CHARS", 150, 0, 1_000);
export const INGEST_BATCH_SIZE = readIntEnv("INGEST_BATCH_SIZE", 20, 1, 100);
export const DATABASE_URL_ENV_NAME = "DATABASE_URL" as const;

function readIntEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name]);

  if (!Number.isInteger(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, value));
}

function readFloatEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name]);

  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, value));
}

function readSimilarityThreshold() {
  const explicit = process.env.RAG_SIMILARITY_THRESHOLD?.trim();

  if (explicit) {
    return readFloatEnv("RAG_SIMILARITY_THRESHOLD", 0.35, 0, 1);
  }

  return readFloatEnv("RAG_MIN_SCORE", 0.35, 0, 1);
}

function readBooleanEnv(name: string, fallback: boolean) {
  const value = process.env[name]?.trim().toLowerCase();

  if (!value) {
    return fallback;
  }

  if (["1", "true", "yes", "on"].includes(value)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(value)) {
    return false;
  }

  return fallback;
}

function readFirstEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();

    if (value) {
      return value;
    }
  }

  return "";
}

function normalizeProviderName(value: string | undefined, fallback: ChatProviderName): ChatProviderName {
  const normalized = value?.trim().toLowerCase();

  return normalized === "qwen" || normalized === "deepseek" || normalized === "openai" ? normalized : fallback;
}

function normalizeEmbeddingProviderName(value: string | undefined): EmbeddingProviderName {
  const normalized = value?.trim().toLowerCase();

  return normalized === "openai" ? "openai" : "openai";
}

function getConfiguredPrimaryProvider() {
  return normalizeProviderName(readFirstEnv("AI_PROVIDER", "LLM_PROVIDER"), "qwen");
}

function readProviderScopedLLMModel(provider: ChatProviderName) {
  const model = process.env.LLM_MODEL?.trim();

  if (!model) {
    return "";
  }

  const configuredProvider = normalizeProviderName(readFirstEnv("AI_PROVIDER", "LLM_PROVIDER"), "qwen");

  return configuredProvider === provider ? model : "";
}

export function hasUsableOpenAIKey() {
  const key = process.env.OPENAI_API_KEY?.trim();

  return Boolean(key && !key.includes(OPENAI_PLACEHOLDER_API_KEY));
}

export function hasUsableQwenKey() {
  const key = process.env.QWEN_API_KEY?.trim();

  return Boolean(key && !key.includes(QWEN_PLACEHOLDER_API_KEY));
}

export function hasUsableDeepSeekKey() {
  const key = process.env.DEEPSEEK_API_KEY?.trim();

  return Boolean(key && !key.includes(DEEPSEEK_PLACEHOLDER_API_KEY));
}

export function getPrimaryAIProvider(): ChatProviderName {
  return getConfiguredPrimaryProvider();
}

export function getFallbackAIProvider(): ChatProviderName | null {
  const fallback = normalizeProviderName(process.env.AI_FALLBACK_PROVIDER, "openai");
  const primary = getPrimaryAIProvider();

  return fallback === primary ? null : fallback;
}

export function getSecondaryFallbackAIProvider(): ChatProviderName | null {
  const secondary = normalizeProviderName(process.env.AI_SECONDARY_FALLBACK_PROVIDER, "deepseek");
  const primary = getPrimaryAIProvider();
  const fallback = getFallbackAIProvider();

  return secondary === primary || secondary === fallback ? null : secondary;
}

export function getAIProviderFallbackChain(provider = getPrimaryAIProvider()) {
  const providers: ChatProviderName[] = [provider];
  const fallback = getFallbackAIProvider();
  const secondary = getSecondaryFallbackAIProvider();

  if (fallback && !providers.includes(fallback)) {
    providers.push(fallback);
  }

  if (secondary && !providers.includes(secondary)) {
    providers.push(secondary);
  }

  return providers;
}

export function hasUsableChatProvider(name = getPrimaryAIProvider()) {
  const hasProvider = (provider: ChatProviderName) => {
    if (provider === "qwen") {
      return hasUsableQwenKey();
    }

    return provider === "deepseek" ? hasUsableDeepSeekKey() : hasUsableOpenAIKey();
  };

  if (name !== getPrimaryAIProvider()) {
    return hasProvider(name);
  }

  return getAIProviderFallbackChain(name).some(hasProvider);
}

export function getOpenAIBaseUrl() {
  return process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1";
}

export function getQwenBaseUrl() {
  return process.env.QWEN_BASE_URL?.trim() || "https://dashscope.aliyuncs.com/compatible-mode/v1";
}

export function getDeepSeekBaseUrl() {
  return process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com";
}

export function getOpenAIModel() {
  return process.env.OPENAI_MODEL?.trim() || readProviderScopedLLMModel("openai") || "gpt-4.1-mini";
}

export function getQwenModel() {
  return process.env.QWEN_MODEL?.trim() || readProviderScopedLLMModel("qwen") || "qwen-plus";
}

export function getDeepSeekModel() {
  return process.env.DEEPSEEK_MODEL?.trim() || readProviderScopedLLMModel("deepseek") || "deepseek-chat";
}

export function getChatModelForProvider(provider = getPrimaryAIProvider()) {
  if (provider === "qwen") {
    return getQwenModel();
  }

  if (provider === "deepseek") {
    return getDeepSeekModel();
  }

  return getOpenAIModel();
}

export function getEmbeddingProviderName(): EmbeddingProviderName {
  return normalizeEmbeddingProviderName(process.env.EMBEDDING_PROVIDER);
}

export function getEmbeddingModel() {
  return readFirstEnv("OPENAI_EMBEDDING_MODEL", "EMBEDDING_MODEL") || "text-embedding-3-small";
}

export function isProductionRuntime() {
  return process.env.NODE_ENV === "production";
}

export function isAIFallbackAllowed() {
  return !isProductionRuntime();
}

function isPlaceholderDatabaseUrl(value: string) {
  return /your-|placeholder|example|changeme|\.\.\./i.test(value);
}

function isLocalDatabaseUrl(value: string) {
  return /(^|[@:/])(?:localhost|127\.0\.0\.1|\[::1\])(?=[:/?]|$)/i.test(value);
}

function isUsableDatabaseUrl(value: string) {
  const trimmed = value.trim();

  if (!trimmed || isPlaceholderDatabaseUrl(trimmed)) {
    return false;
  }

  if (isProductionRuntime() && isLocalDatabaseUrl(trimmed)) {
    return false;
  }

  return true;
}

export function getDatabaseUrl() {
  const value = process.env.DATABASE_URL?.trim();

  if (value && isUsableDatabaseUrl(value)) {
    return value;
  }

  return "";
}

export function getDatabaseUrlEnvName() {
  return getDatabaseUrl() ? DATABASE_URL_ENV_NAME : null;
}

export function hasDatabaseUrl() {
  return Boolean(getDatabaseUrl());
}

export function hasSessionSecret() {
  return Boolean(process.env.SESSION_SECRET?.trim());
}

export function hasLicenseSecret() {
  return Boolean(process.env.LICENSE_SECRET?.trim() || process.env.SESSION_SECRET?.trim());
}
