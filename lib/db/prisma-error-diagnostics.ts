export interface PrismaErrorDiagnostics {
  prismaCode: string | null;
  safeErrorMessage: string | null;
  missingTable: string | null;
  missingColumn: string | null;
  model: string | null;
  operation: string;
}

const tableToModel: Record<string, string> = {
  users: "User",
  sessions: "Session",
  user_settings: "UserSettings",
  knowledge_items: "KnowledgeItem",
  knowledge_chunks: "KnowledgeChunk",
  conversations: "Conversation",
  messages: "Message",
  license_keys: "LicenseKey",
  activation_logs: "ActivationLog",
  feedback: "Feedback",
  analytics_events: "AnalyticsEvent",
  knowledge_merge_histories: "KnowledgeMergeHistory",
  knowledge_completion_suggestions: "KnowledgeCompletionSuggestion"
};

const modelToTable: Record<string, string> = Object.fromEntries(
  Object.entries(tableToModel).map(([table, model]) => [model, table])
);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function getErrorCode(error: unknown): string | null {
  if (!isObject(error)) {
    return null;
  }

  const code = error.code;

  return typeof code === "string" ? code : null;
}

function getErrorMessage(error: unknown): string | null {
  if (error instanceof Error) {
    return error.message;
  }

  if (isObject(error) && typeof error.message === "string") {
    return error.message;
  }

  return null;
}

function sanitizeMessage(message: string | null) {
  if (!message) {
    return null;
  }

  return message
    .replace(/postgres(?:ql)?:\/\/[^)\s]+/gi, "postgresql://[redacted]")
    .replace(/DATABASE_URL=([^&\s]+)/gi, "DATABASE_URL=[redacted]")
    .replace(/DIRECT_URL=([^&\s]+)/gi, "DIRECT_URL=[redacted]")
    .replace(/SESSION_SECRET=([^&\s]+)/gi, "SESSION_SECRET=[redacted]")
    .replace(/OPENAI_API_KEY=([^&\s]+)/gi, "OPENAI_API_KEY=[redacted]")
    .replace(/QWEN_API_KEY=([^&\s]+)/gi, "QWEN_API_KEY=[redacted]")
    .replace(/DEEPSEEK_API_KEY=([^&\s]+)/gi, "DEEPSEEK_API_KEY=[redacted]")
    .slice(0, 500);
}

function extractFromMeta(error: unknown, key: string) {
  if (!isObject(error) || !isObject(error.meta)) {
    return null;
  }

  const value = error.meta[key];

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && value.length > 0 && typeof value[0] === "string") {
    return value[0];
  }

  return null;
}

function normalizeTableName(value: string | null) {
  if (!value) {
    return null;
  }

  return value
    .replace(/^public\./, "")
    .replace(/^"public"\./, "")
    .replace(/^`public`\./, "")
    .replace(/^["`]|["`]$/g, "");
}

function extractMissingTable(message: string | null, error: unknown) {
  const metaTable = normalizeTableName(extractFromMeta(error, "table"));

  if (metaTable) {
    return metaTable;
  }

  if (!message) {
    return null;
  }

  const patterns = [
    /table\s+[`"]?(?:public\.)?([A-Za-z0-9_]+)[`"]?\s+does not exist/i,
    /relation\s+["`]?(?:public\.)?([A-Za-z0-9_]+)["`]?\s+does not exist/i,
    /The table\s+[`"]?(?:public\.)?([A-Za-z0-9_]+)[`"]?\s+does not exist/i
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);

    if (match?.[1]) {
      return normalizeTableName(match[1]);
    }
  }

  return null;
}

function extractMissingColumn(message: string | null, error: unknown) {
  const metaColumn = normalizeTableName(extractFromMeta(error, "column"));

  if (metaColumn) {
    return metaColumn;
  }

  if (!message) {
    return null;
  }

  const patterns = [
    /column\s+["`]?(?:[A-Za-z0-9_]+\.)?([A-Za-z0-9_]+)["`]?\s+does not exist/i,
    /The column\s+[`"]?([A-Za-z0-9_]+)[`"]?\s+does not exist/i
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);

    if (match?.[1]) {
      return normalizeTableName(match[1]);
    }
  }

  return null;
}

function inferTableFromOperation(operation: string) {
  const modelName = operation.split(".")[0];

  return modelToTable[modelName] ?? null;
}

function inferModel(table: string | null, operation: string) {
  if (table && tableToModel[table]) {
    return tableToModel[table];
  }

  const modelName = operation.split(".")[0];

  return modelName && modelToTable[modelName] ? modelName : null;
}

export function getPrismaErrorDiagnostics(error: unknown, operation: string): PrismaErrorDiagnostics {
  const prismaCode = getErrorCode(error);
  const message = getErrorMessage(error);
  const safeErrorMessage = sanitizeMessage(message);
  const missingTable = extractMissingTable(message, error) ?? (prismaCode === "P2021" ? inferTableFromOperation(operation) : null);
  const missingColumn = extractMissingColumn(message, error);
  const model = inferModel(missingTable, operation);

  return {
    prismaCode,
    safeErrorMessage,
    missingTable,
    missingColumn,
    model,
    operation
  };
}

export function isPrismaLikeError(error: unknown) {
  const code = getErrorCode(error);

  return Boolean(code && /^P\d{4}$/.test(code));
}
