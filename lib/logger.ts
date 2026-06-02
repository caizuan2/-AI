export const REQUEST_ID_HEADER = "x-request-id";

type LogLevel = "debug" | "info" | "warn" | "error";
type LogMetadata = Record<string, unknown>;
export type StoredLogEntry = LogMetadata & {
  timestamp: string;
  level: LogLevel;
  event: string;
};

const REDACTED = "[redacted]";
const MAX_STRING_LENGTH = 240;
const MAX_ARRAY_ITEMS = 20;
const MAX_OBJECT_KEYS = 40;
const MAX_RECENT_LOG_ENTRIES = 500;

const sensitiveKeys = new Set([
  "authorization",
  "cookie",
  "setcookie",
  "password",
  "secret",
  "apikey",
  "openaiapikey",
  "databaseurl",
  "email",
  "username",
  "displayname",
  "prompt",
  "content",
  "question",
  "answer",
  "input",
  "text",
  "chunktext",
  "summary",
  "sourceurl",
  "url"
]);

function normalizeKey(key: string) {
  return key.replace(/[-_\s]/g, "").toLowerCase();
}

function shouldRedactKey(key: string) {
  const normalized = normalizeKey(key);

  return sensitiveKeys.has(normalized) || normalized.endsWith("token") || normalized.endsWith("key");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date);
}

function sanitizeString(value: string) {
  if (value.length <= MAX_STRING_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_STRING_LENGTH)}...`;
}

function sanitizeValue(value: unknown, key = "", depth = 0): unknown {
  if (key && shouldRedactKey(key)) {
    return REDACTED;
  }

  if (value instanceof Error) {
    return toSafeErrorLog(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    return sanitizeString(value);
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (depth >= 4) {
    return "[truncated]";
  }

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeValue(item, key, depth + 1));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, MAX_OBJECT_KEYS)
        .map(([entryKey, entryValue]) => [entryKey, sanitizeValue(entryValue, entryKey, depth + 1)])
    );
  }

  return String(value);
}

export function sanitizeLogMetadata(metadata: LogMetadata = {}) {
  return sanitizeValue(metadata) as LogMetadata;
}

export function createRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getRequestIdFromHeaders(headers: Headers | null | undefined) {
  const requestId = headers?.get(REQUEST_ID_HEADER)?.trim();

  if (requestId && /^[a-zA-Z0-9_.:-]{8,120}$/.test(requestId)) {
    return requestId;
  }

  return createRequestId();
}

export function estimateTokenCount(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "") ?? "";
  const cjkMatches = text.match(/[\u3400-\u9fff]/g);
  const cjkCount = cjkMatches?.length ?? 0;
  const nonCjkText = text.replace(/[\u3400-\u9fff]/g, "");
  const nonCjkTokenEstimate = Math.ceil(nonCjkText.replace(/\s+/g, " ").trim().length / 4);

  return Math.max(1, cjkCount + nonCjkTokenEstimate);
}

export function toSafeErrorLog(error: unknown) {
  if (error instanceof Error) {
    const maybeAppError = error as Error & {
      code?: unknown;
      statusCode?: unknown;
    };

    return {
      errorName: error.name,
      code: typeof maybeAppError.code === "string" ? maybeAppError.code : undefined,
      statusCode: typeof maybeAppError.statusCode === "number" ? maybeAppError.statusCode : undefined,
      message: typeof maybeAppError.code === "string" ? sanitizeString(error.message) : undefined
    };
  }

  return {
    errorName: "UnknownError"
  };
}

function recentLogStore() {
  const globalStore = globalThis as typeof globalThis & {
    __aiKnowledgeBaseRecentLogs?: StoredLogEntry[];
  };

  if (!globalStore.__aiKnowledgeBaseRecentLogs) {
    globalStore.__aiKnowledgeBaseRecentLogs = [];
  }

  return globalStore.__aiKnowledgeBaseRecentLogs;
}

function rememberLogEntry(entry: StoredLogEntry) {
  const store = recentLogStore();

  store.push(entry);

  if (store.length > MAX_RECENT_LOG_ENTRIES) {
    store.splice(0, store.length - MAX_RECENT_LOG_ENTRIES);
  }
}

export function getRecentLogEntries(options: {
  level?: LogLevel;
  event?: string;
  limit?: number;
  since?: Date;
} = {}) {
  const limit = Math.max(1, Math.min(options.limit ?? 50, 100));
  const sinceTime = options.since?.getTime() ?? null;

  return recentLogStore()
    .filter((entry) => {
      if (options.level && entry.level !== options.level) {
        return false;
      }

      if (options.event && entry.event !== options.event) {
        return false;
      }

      if (sinceTime !== null && new Date(entry.timestamp).getTime() < sinceTime) {
        return false;
      }

      return true;
    })
    .slice(-limit)
    .reverse();
}

export function countRecentLogEntries(predicate: (entry: StoredLogEntry) => boolean) {
  return recentLogStore().filter(predicate).length;
}

function write(level: LogLevel, event: string, metadata: LogMetadata = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...sanitizeLogMetadata(metadata)
  } as StoredLogEntry;
  const line = JSON.stringify(payload);

  rememberLogEntry(payload);

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  if (level === "debug") {
    console.debug(line);
    return;
  }

  console.info(line);
}

export const logger = {
  debug: (event: string, metadata?: LogMetadata) => write("debug", event, metadata),
  info: (event: string, metadata?: LogMetadata) => write("info", event, metadata),
  warn: (event: string, metadata?: LogMetadata) => write("warn", event, metadata),
  error: (event: string, metadata?: LogMetadata) => write("error", event, metadata)
};
