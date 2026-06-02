export const OPENAI_PLACEHOLDER_API_KEY = "sk-your-openai-api-key";
export const SEARCH_DEFAULT_TOP_K = 5;
export const SEARCH_MAX_TOP_K = 20;
export const CHAT_TOP_K = 5;
export const CHAT_MIN_RELEVANT_SIMILARITY = 0.2;

export function hasUsableOpenAIKey() {
  const key = process.env.OPENAI_API_KEY?.trim();

  return Boolean(key && !key.includes(OPENAI_PLACEHOLDER_API_KEY));
}

export function isProductionRuntime() {
  return process.env.NODE_ENV === "production";
}

export function isAIFallbackAllowed() {
  return !isProductionRuntime();
}

export function hasDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL?.trim());
}
