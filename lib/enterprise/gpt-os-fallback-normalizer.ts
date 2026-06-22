export type GptOSFallbackProvider = "openai" | "deepseek" | "mock";
export type GptOSFallbackErrorType =
  | "NETWORK_ERROR"
  | "OPENAI_TIMEOUT"
  | "MODEL_FAILURE"
  | "PARSING_ERROR"
  | "AUTH_ERROR"
  | "QUALITY_ERROR"
  | "UNKNOWN_ERROR";

export interface GptOSFallbackResponse {
  ok: false;
  success: false;
  fallback: true;
  provider: GptOSFallbackProvider;
  message: string;
  raw: null;
  retryable: boolean;
  errorType: GptOSFallbackErrorType;
  analytics: GptOSFallbackAnalytics;
  diagnostics: string[];
}

export interface GptOSFallbackAnalytics {
  fallbackCount: number;
  fallbackRate: number;
  reasons: Array<{
    type: GptOSFallbackErrorType;
    count: number;
  }>;
  providers: Array<{
    provider: GptOSFallbackProvider;
    count: number;
  }>;
  lastFallbackType: GptOSFallbackErrorType | null;
  fallbackModelPath: GptOSFallbackProvider[];
}

export interface GptOSUserFriendlyMessage {
  type: "friendly";
  title: string;
  message: string;
  showToUser: true;
  exposeRaw: false;
  showRedBox: false;
  raw?: undefined;
}

function readErrorRecord(error: unknown) {
  return error && typeof error === "object"
    ? error as { code?: unknown; message?: unknown; name?: unknown }
    : {};
}

export function classifyGptOSError(error: unknown): GptOSFallbackErrorType {
  const record = readErrorRecord(error);
  const code = typeof record.code === "string" ? record.code.toLowerCase() : "";
  const message = typeof record.message === "string" ? record.message.toLowerCase() : "";
  const name = typeof record.name === "string" ? record.name.toLowerCase() : "";

  if (code.includes("api_key") || message.includes("api key") || message.includes("401") || message.includes("403")) {
    return "AUTH_ERROR";
  }

  if (name === "aborterror" || code.includes("timeout") || message.includes("timeout") || message.includes("超时")) {
    return "OPENAI_TIMEOUT";
  }

  if (code.includes("parse") || code.includes("normalization") || message.includes("解析失败") || message.includes("response format")) {
    return "PARSING_ERROR";
  }

  if (code.includes("quality") || message.includes("未达到") || message.includes("replymarkdown")) {
    return "QUALITY_ERROR";
  }

  if (message.includes("fetch failed") || message.includes("network") || message.includes("connect")) {
    return "NETWORK_ERROR";
  }

  if (code.includes("request_failed") || message.includes("model") || message.includes("模型")) {
    return "MODEL_FAILURE";
  }

  return "UNKNOWN_ERROR";
}

export function mapGptOSErrorToUserMessage(error: unknown) {
  const type = classifyGptOSError(error);

  switch (type) {
    case "NETWORK_ERROR":
      return "网络暂时不稳定，请稍后再试。";
    case "OPENAI_TIMEOUT":
      return "AI响应较慢，请稍后再试。";
    case "MODEL_FAILURE":
      return "AI模型暂时繁忙，请稍后再试。";
    case "PARSING_ERROR":
      return "AI返回暂时不稳定，请稍后再试。";
    case "AUTH_ERROR":
      return "AI服务授权暂不可用，请检查模型连接后再试。";
    case "QUALITY_ERROR":
      return "AI服务暂时不稳定，请稍后再试。";
    default:
      return "AI服务暂时不稳定，请稍后再试。";
  }
}

export function normalizeGptOSFallback(input: {
  error: unknown;
  provider: GptOSFallbackProvider;
  diagnostics?: string[];
}): GptOSFallbackResponse {
  const errorType = classifyGptOSError(input.error);
  const retryable = errorType !== "AUTH_ERROR";
  const analytics = buildGptOSFallbackAnalytics({
    fallbackUsed: true,
    provider: input.provider,
    errorType
  });

  return {
    ok: false,
    success: false,
    fallback: true,
    provider: input.provider,
    message: mapGptOSErrorToUserMessage(input.error),
    raw: null,
    retryable,
    errorType,
    analytics,
    diagnostics: [
      "apiResilience:fallbackNormalized:true",
      `apiResilience:errorType:${errorType}`,
      `apiResilience:provider:${input.provider}`,
      `observability:fallbackCount:${analytics.fallbackCount}`,
      `observability:fallbackPath:${analytics.fallbackModelPath.join(">")}`,
      ...(input.diagnostics ?? [])
    ]
  };
}

export function toUserFriendlyMessage(error: unknown): GptOSUserFriendlyMessage | null {
  if (!error) {
    return null;
  }

  return {
    type: "friendly",
    title: "AI暂时不稳定",
    message: "系统正在自动优化，请稍后再试",
    showToUser: true,
    exposeRaw: false,
    showRedBox: false,
    raw: undefined
  };
}

export function buildGptOSFallbackAnalytics(input?: {
  fallbackUsed?: boolean;
  provider?: GptOSFallbackProvider;
  errorType?: GptOSFallbackErrorType;
}): GptOSFallbackAnalytics {
  const fallbackUsed = input?.fallbackUsed === true;
  const provider = input?.provider ?? "mock";
  const errorType = input?.errorType ?? "UNKNOWN_ERROR";
  const fallbackCount = fallbackUsed ? 1 : 0;
  const fallbackModelPath = fallbackUsed
    ? Array.from(new Set<GptOSFallbackProvider>(["openai", provider, "mock"]))
    : [];

  return {
    fallbackCount,
    fallbackRate: fallbackUsed ? 1 : 0,
    reasons: fallbackUsed ? [{ type: errorType, count: 1 }] : [],
    providers: fallbackUsed ? [{ provider, count: 1 }] : [],
    lastFallbackType: fallbackUsed ? errorType : null,
    fallbackModelPath
  };
}

export function sanitizeGptOSUserMessage(message: string) {
  const normalized = message.trim();

  if (!normalized) {
    return "AI服务暂时不稳定，请稍后再试。";
  }

  if (/api\s*error|stack trace|raw json|json error|parse failed|解析失败|模型未完成|本次未完成|model failed|response format|未返回/i.test(normalized)) {
    return "AI服务暂时不稳定，请稍后再试。";
  }

  return normalized;
}
