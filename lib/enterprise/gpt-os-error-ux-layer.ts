import {
  GPT_OS_SAFE_UI_MESSAGE,
  normalizeGptOSError,
  sanitizeGptOSErrorMessage
} from "@/lib/enterprise/gpt-os-error-handler";

export type GptOSErrorType =
  | "NETWORK_ERROR"
  | "OPENAI_TIMEOUT"
  | "MODEL_FAILURE"
  | "PARSING_ERROR"
  | "UNKNOWN_ERROR";

export interface GptOSErrorUX {
  type: GptOSErrorType;
  userMessage: string;
  recoveryMessage: string;
  retryable: boolean;
  shouldAttemptModelFallback: boolean;
  fallbackModel: "deepseek" | "qwen" | "safe-fallback";
  diagnostics: string[];
}

function readErrorDetails(error: unknown) {
  const record = error && typeof error === "object"
    ? error as { code?: unknown; name?: unknown; message?: unknown; status?: unknown; cause?: { code?: unknown; message?: unknown } }
    : {};
  const message = typeof record.message === "string" ? record.message : String(error ?? "");
  const code = typeof record.code === "string" ? record.code : "";
  const name = typeof record.name === "string" ? record.name : "";
  const status = typeof record.status === "number" ? record.status : undefined;
  const causeCode = typeof record.cause?.code === "string" ? record.cause.code : "";
  const causeMessage = typeof record.cause?.message === "string" ? record.cause.message : "";

  return {
    code,
    name,
    status,
    causeCode,
    message,
    lower: `${message} ${causeMessage}`.toLowerCase()
  };
}

export function classifyGptOSError(error: unknown): GptOSErrorType {
  const details = readErrorDetails(error);

  if (details.name === "AbortError" || details.code.includes("TIMEOUT") || details.lower.includes("timeout") || details.lower.includes("超时")) {
    return "OPENAI_TIMEOUT";
  }

  if (details.name === "TypeError" || details.causeCode.startsWith("UND_ERR_") || details.lower.includes("fetch failed") || details.lower.includes("network") || details.lower.includes("socket")) {
    return "NETWORK_ERROR";
  }

  if (details.code.includes("PARSE_FAILED") || details.lower.includes("解析失败") || details.lower.includes("unsupported openai response format") || details.lower.includes("json")) {
    return "PARSING_ERROR";
  }

  if (details.code.includes("REQUEST_FAILED") || details.code.includes("PRO_QUALITY_FAILED") || details.lower.includes("model") || details.lower.includes("模型") || details.status === 429 || (typeof details.status === "number" && details.status >= 500)) {
    return "MODEL_FAILURE";
  }

  return "UNKNOWN_ERROR";
}

export function mapErrorToUserMessage(input: GptOSErrorType | { type: GptOSErrorType }) {
  const type = typeof input === "string" ? input : input.type;

  if (type === "NETWORK_ERROR") {
    return "网络不太稳定，已帮你重新尝试";
  }

  if (type === "OPENAI_TIMEOUT") {
    return "AI响应较慢，正在自动优化路径";
  }

  if (type === "MODEL_FAILURE") {
    return "AI模型暂时繁忙，已自动切换备用方案";
  }

  if (type === "PARSING_ERROR") {
    return "AI正在整理回答格式，已自动保护本次结果";
  }

  return "系统正在优化回答，请稍后再试";
}

export function buildGptOSErrorUX(error: unknown, input: {
  primaryProvider?: "openai" | "deepseek" | "qwen" | "unknown";
  fallbackModel?: "deepseek" | "qwen" | "safe-fallback";
} = {}): GptOSErrorUX {
  const normalized = normalizeGptOSError(error);
  const type = classifyGptOSError(error);
  const fallbackModel = input.fallbackModel ?? (input.primaryProvider === "openai" ? "deepseek" : input.primaryProvider === "deepseek" ? "qwen" : "safe-fallback");
  const shouldAttemptModelFallback = fallbackModel !== "safe-fallback" && (normalized.retryable || normalized.code === "AI_CONFIGURATION_REQUIRED");
  const userMessage = shouldAttemptModelFallback
    ? mapErrorToUserMessage({ type: "MODEL_FAILURE" })
    : mapErrorToUserMessage({ type });

  return {
    type,
    userMessage,
    recoveryMessage: shouldAttemptModelFallback
      ? "已自动切换备用AI模型，正在生成更稳定结果"
      : userMessage || GPT_OS_SAFE_UI_MESSAGE,
    retryable: normalized.retryable,
    shouldAttemptModelFallback,
    fallbackModel,
    diagnostics: [
      `errorType:${type}`,
      `userFacingError:false`,
      `retryable:${normalized.retryable ? "true" : "false"}`,
      `fallbackModel:${fallbackModel}`,
      `shouldAttemptModelFallback:${shouldAttemptModelFallback ? "true" : "false"}`,
      ...normalized.diagnostics
    ]
  };
}

export function sanitizeErrorUXMessage(message: string) {
  const sanitized = sanitizeGptOSErrorMessage(message, GPT_OS_SAFE_UI_MESSAGE);

  if (/api error|api key|base_url|stack trace|traceback|raw json|openai|responses api|deepseek|syntaxerror|typeerror|referenceerror|error:/i.test(sanitized)) {
    return "AI正在优化回答路径，请稍等片刻...";
  }

  if (/^\s*[{[]/.test(sanitized)) {
    return "系统正在优化回答，请稍后再试";
  }

  return sanitized;
}
