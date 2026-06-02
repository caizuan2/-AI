export const OPENAI_PLACEHOLDER_API_KEY = "sk-your-openai-api-key";
export const SEARCH_DEFAULT_TOP_K = 5;
export const SEARCH_MAX_TOP_K = 20;
export const CHAT_TOP_K = 5;
export const CHAT_MIN_RELEVANT_SIMILARITY = 0.2;
export const DATABASE_URL_ENV_NAME = "DATABASE_URL" as const;

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
