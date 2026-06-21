export const GPT_OS_SAFE_FALLBACK_MESSAGE = "AI暂时繁忙，请稍后重试";
export const GPT_OS_SAFE_UI_MESSAGE = "AI暂时未响应，请稍后重试（已自动保护）";

export type GptOSNormalizedErrorCode =
  | "AI_TEMPORARILY_UNAVAILABLE"
  | "AI_TIMEOUT"
  | "AI_PARSE_FAILED"
  | "AI_CONFIGURATION_REQUIRED";

export interface GptOSNormalizedError {
  safe: true;
  message: string;
  retryable: boolean;
  code: GptOSNormalizedErrorCode;
  originalMessage?: string;
  diagnostics: string[];
}

function readErrorRecord(error: unknown) {
  return error && typeof error === "object"
    ? error as { code?: unknown; name?: unknown; message?: unknown; status?: unknown; cause?: { code?: unknown; message?: unknown } }
    : {};
}

export function sanitizeGptOSErrorMessage(message: string, fallback = GPT_OS_SAFE_UI_MESSAGE) {
  const text = message.trim();

  if (!text) {
    return fallback;
  }

  if (/模型未完成|本次未完成|API解析失败|解析失败|未返回有效调用证据|未返回可解析|未完成|unsupported openai response format/i.test(text)) {
    return fallback;
  }

  return text;
}

export function isGptOSRetryableError(error: unknown) {
  const record = readErrorRecord(error);
  const code = typeof record.code === "string" ? record.code : "";
  const name = typeof record.name === "string" ? record.name : "";
  const message = `${typeof record.message === "string" ? record.message : ""} ${typeof record.cause?.message === "string" ? record.cause.message : ""}`.toLowerCase();
  const causeCode = typeof record.cause?.code === "string" ? record.cause.code : "";
  const status = typeof record.status === "number" ? record.status : undefined;

  if (name === "AbortError" || code.includes("TIMEOUT") || message.includes("timeout") || message.includes("超时")) {
    return true;
  }

  if (code.includes("REQUEST_FAILED") || code.includes("PARSE_FAILED")) {
    return true;
  }

  if (status === 429 || (typeof status === "number" && status >= 500)) {
    return true;
  }

  return name === "TypeError"
    || causeCode.startsWith("UND_ERR_")
    || message.includes("fetch failed")
    || message.includes("network")
    || message.includes("connect timeout")
    || message.includes("socket");
}

export function normalizeGptOSError(error: unknown): GptOSNormalizedError {
  const record = readErrorRecord(error);
  const originalMessage = typeof record.message === "string" ? record.message.trim() : String(error ?? "").trim();
  const code = typeof record.code === "string" ? record.code : "";
  const name = typeof record.name === "string" ? record.name : "";
  const lower = originalMessage.toLowerCase();
  const retryable = isGptOSRetryableError(error);
  const normalizedCode: GptOSNormalizedErrorCode = name === "AbortError" || code.includes("TIMEOUT") || lower.includes("timeout") || lower.includes("超时")
    ? "AI_TIMEOUT"
    : code.includes("API_KEY") || lower.includes("api key") || lower.includes("未配置")
      ? "AI_CONFIGURATION_REQUIRED"
      : code.includes("PARSE_FAILED") || lower.includes("解析失败") || lower.includes("unsupported openai response format")
        ? "AI_PARSE_FAILED"
        : "AI_TEMPORARILY_UNAVAILABLE";

  return {
    safe: true,
    message: GPT_OS_SAFE_FALLBACK_MESSAGE,
    retryable,
    code: normalizedCode,
    originalMessage: originalMessage || undefined,
    diagnostics: [
      `safeError:${normalizedCode}`,
      `retryable:${retryable ? "true" : "false"}`,
      originalMessage ? `original:${originalMessage.slice(0, 220)}` : "original:empty"
    ]
  };
}

