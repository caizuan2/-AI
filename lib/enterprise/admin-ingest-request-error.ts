export type AdminIngestRequestErrorDetails = {
  status?: number;
  errorCode?: string;
  causeCode?: string;
  retryable?: boolean;
  provider?: string;
  requestedProvider?: string;
  actualProvider?: string | null;
  selectedModelLabel?: string;
  requestedModel?: string;
  actualModel?: string | null;
  fallbackUsed?: boolean;
  requestId?: string;
  failureDetails?: {
    parseStage?: string;
    finishReason?: string;
    eventCount?: number;
    receivedChars?: number;
    receivedContent?: boolean;
    timeoutStage?: string;
    abortSource?: string;
    retryAfterMs?: number;
  };
};

export class AdminIngestRequestError extends Error {
  readonly status?: number;
  readonly errorCode?: string;
  readonly causeCode?: string;
  readonly retryable?: boolean;
  readonly provider?: string;
  readonly requestedProvider?: string;
  readonly actualProvider?: string | null;
  readonly selectedModelLabel?: string;
  readonly requestedModel?: string;
  readonly actualModel?: string | null;
  readonly fallbackUsed?: boolean;
  readonly requestId?: string;
  readonly failureDetails?: AdminIngestRequestErrorDetails["failureDetails"];

  constructor(message: string, details: AdminIngestRequestErrorDetails = {}) {
    super(message);
    this.name = "AdminIngestRequestError";
    this.status = details.status;
    this.errorCode = details.errorCode;
    this.causeCode = details.causeCode;
    this.retryable = details.retryable;
    this.provider = details.provider;
    this.requestedProvider = details.requestedProvider;
    this.actualProvider = details.actualProvider;
    this.selectedModelLabel = details.selectedModelLabel;
    this.requestedModel = details.requestedModel;
    this.actualModel = details.actualModel;
    this.fallbackUsed = details.fallbackUsed;
    this.requestId = details.requestId;
    this.failureDetails = details.failureDetails;
  }
}

const RETRYABLE_DOUBAO_STRICT_FAILURE_CODES = new Set([
  "DOUBAO_RATE_LIMITED",
  "DOUBAO_REQUEST_FAILED",
  "DOUBAO_RESPONSE_PARSE_FAILED",
  "DOUBAO_TIMEOUT"
]);

export function isRetryableDoubaoStrictModelFailure(causeCode: string) {
  return RETRYABLE_DOUBAO_STRICT_FAILURE_CODES.has(causeCode.trim().toUpperCase());
}

export function readAdminIngestRequestError(error: unknown): AdminIngestRequestErrorDetails | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const record = error as Record<string, unknown>;
  const status = typeof record.status === "number" ? record.status : undefined;
  const readString = (value: unknown) => typeof value === "string" && value ? value : undefined;
  const readNullableString = (value: unknown) => value === null ? null : readString(value);
  const failureDetailsRecord = record.failureDetails && typeof record.failureDetails === "object" && !Array.isArray(record.failureDetails)
    ? record.failureDetails as Record<string, unknown>
    : null;
  const retryAfterMs = Number(failureDetailsRecord?.retryAfterMs);

  if (
    !status
    && !readString(record.errorCode)
    && !readString(record.causeCode)
    && typeof record.retryable !== "boolean"
  ) {
    return null;
  }

  return {
    status,
    errorCode: readString(record.errorCode),
    causeCode: readString(record.causeCode),
    retryable: typeof record.retryable === "boolean" ? record.retryable : undefined,
    provider: readString(record.provider),
    requestedProvider: readString(record.requestedProvider),
    actualProvider: readNullableString(record.actualProvider),
    selectedModelLabel: readString(record.selectedModelLabel),
    requestedModel: readString(record.requestedModel),
    actualModel: readNullableString(record.actualModel),
    fallbackUsed: typeof record.fallbackUsed === "boolean" ? record.fallbackUsed : undefined,
    requestId: readString(record.requestId),
    failureDetails: failureDetailsRecord
      ? {
          parseStage: readString(failureDetailsRecord.parseStage),
          finishReason: readString(failureDetailsRecord.finishReason),
          eventCount: Number.isSafeInteger(Number(failureDetailsRecord.eventCount)) && Number(failureDetailsRecord.eventCount) >= 0
            ? Number(failureDetailsRecord.eventCount)
            : undefined,
          receivedChars: Number.isSafeInteger(Number(failureDetailsRecord.receivedChars)) && Number(failureDetailsRecord.receivedChars) >= 0
            ? Number(failureDetailsRecord.receivedChars)
            : undefined,
          receivedContent: typeof failureDetailsRecord.receivedContent === "boolean"
            ? failureDetailsRecord.receivedContent
            : undefined,
          timeoutStage: readString(failureDetailsRecord.timeoutStage),
          abortSource: readString(failureDetailsRecord.abortSource),
          retryAfterMs: Number.isSafeInteger(retryAfterMs) && retryAfterMs >= 0
            ? retryAfterMs
            : undefined
        }
      : undefined
  };
}

export function isStrictSelectedModelFailure(error: unknown) {
  const errorCode = readAdminIngestRequestError(error)?.errorCode;

  return errorCode === "ADMIN_INGEST_SELECTED_MODEL_UNAVAILABLE"
    || errorCode === "ADMIN_INGEST_STRICT_KNOWLEDGE_REQUIRED";
}
