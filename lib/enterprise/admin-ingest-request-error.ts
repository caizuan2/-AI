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
    failureDetails: record.failureDetails && typeof record.failureDetails === "object" && !Array.isArray(record.failureDetails)
      ? record.failureDetails as AdminIngestRequestErrorDetails["failureDetails"]
      : undefined
  };
}

export function isStrictSelectedModelFailure(error: unknown) {
  return readAdminIngestRequestError(error)?.errorCode === "ADMIN_INGEST_SELECTED_MODEL_UNAVAILABLE";
}
