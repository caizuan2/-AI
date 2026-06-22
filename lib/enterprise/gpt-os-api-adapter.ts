export type GptOSApiProvider = "openai" | "deepseek" | "mock";
export type GptOSApiResponseType = "responses" | "chat_completions" | "string" | "unknown";

export interface GptOSApiUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
}

export interface NormalizedLLMResponse {
  text: string;
  provider: GptOSApiProvider;
  rawResponseType: GptOSApiResponseType;
  normalized: true;
  parserUsed: "gpt-os-api-adapter";
  model?: string;
  responseId?: string;
  createdAt?: string;
  usage?: GptOSApiUsage;
  partial?: boolean;
}

export interface NormalizedLLMContentResult {
  ok: true;
  content: string;
  provider: GptOSApiProvider;
  requestedModel: string;
  actualModel?: string;
  responseId?: string;
  usage?: GptOSApiUsage;
  fallbackUsed: false;
  rawResponseType: GptOSApiResponseType;
  normalized: true;
  parserUsed: "gpt-os-api-adapter";
}

export interface ResilientCallResult<T> {
  value: T;
  retryCount: number;
  responseLatency: number;
  circuitBreaker: "closed" | "open";
}

export class LLMResponseNormalizationError extends Error {
  readonly code = "LLM_RESPONSE_NORMALIZATION_FAILED";

  constructor(message = "AI 返回格式暂时无法解析。") {
    super(message);
    this.name = "LLMResponseNormalizationError";
  }
}

type CircuitState = {
  failures: number;
  openedUntil: number;
};

const circuitStates = new Map<string, CircuitState>();

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeCreatedAt(value: unknown) {
  const numeric = readNumber(value);

  if (numeric) {
    return new Date(numeric * 1000).toISOString();
  }

  return undefined;
}

function normalizeUsage(value: unknown): GptOSApiUsage | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const outputDetails = record.output_tokens_details && typeof record.output_tokens_details === "object"
    ? record.output_tokens_details as Record<string, unknown>
    : {};
  const completionDetails = record.completion_tokens_details && typeof record.completion_tokens_details === "object"
    ? record.completion_tokens_details as Record<string, unknown>
    : {};
  const usage: GptOSApiUsage = {
    inputTokens: readNumber(record.input_tokens) ?? readNumber(record.prompt_tokens),
    outputTokens: readNumber(record.output_tokens) ?? readNumber(record.completion_tokens),
    totalTokens: readNumber(record.total_tokens),
    reasoningTokens: readNumber(outputDetails.reasoning_tokens) ?? readNumber(completionDetails.reasoning_tokens)
  };

  return Object.values(usage).some((item) => typeof item === "number") ? usage : undefined;
}

function readTextValue(value: unknown): string[] {
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => readTextValue(item));
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;
  const nestedMessage = record.message && typeof record.message === "object"
    ? readTextValue(record.message)
    : [];
  const direct = [
    record.output_text,
    record.text,
    record.content
  ].flatMap((item) => {
    if (typeof item === "string") {
      return item.trim() ? [item.trim()] : [];
    }

    if (item && typeof item === "object" && !Array.isArray(item)) {
      const nested = item as Record<string, unknown>;

      if (typeof nested.value === "string" && nested.value.trim()) {
        return [nested.value.trim()];
      }

      if (typeof nested.text === "string" && nested.text.trim()) {
        return [nested.text.trim()];
      }
    }

    return [];
  });

  const nestedContent = Array.isArray(record.content) ? readTextValue(record.content) : [];
  const nestedOutput = Array.isArray(record.output) ? readTextValue(record.output) : [];
  const nestedChoices = Array.isArray(record.choices) ? readTextValue(record.choices) : [];

  return [...direct, ...nestedContent, ...nestedOutput, ...nestedChoices, ...nestedMessage];
}

function detectResponseType(response: unknown): GptOSApiResponseType {
  if (typeof response === "string") {
    return "string";
  }

  if (!response || typeof response !== "object") {
    return "unknown";
  }

  const record = response as Record<string, unknown>;

  if (typeof record.output_text === "string" || Array.isArray(record.output)) {
    return "responses";
  }

  if (Array.isArray(record.choices)) {
    return "chat_completions";
  }

  return "unknown";
}

export function normalizeLLMResponse(response: unknown, options: {
  provider: GptOSApiProvider;
  fallbackModel?: string;
  fallbackResponseId?: string;
  allowPartial?: boolean;
}): NormalizedLLMResponse {
  const rawResponseType = detectResponseType(response);

  if (typeof response === "string") {
    const text = response.trim();

    if (!text) {
      throw new LLMResponseNormalizationError();
    }

    return {
      text,
      provider: options.provider,
      rawResponseType,
      normalized: true,
      parserUsed: "gpt-os-api-adapter",
      model: options.fallbackModel,
      responseId: options.fallbackResponseId,
      partial: options.allowPartial
    };
  }

  const record = response && typeof response === "object" ? response as Record<string, unknown> : {};
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const firstChoice = choices[0] && typeof choices[0] === "object" ? choices[0] as Record<string, unknown> : {};
  const message = firstChoice.message && typeof firstChoice.message === "object" ? firstChoice.message as Record<string, unknown> : {};
  const chatText = typeof message.content === "string" ? message.content.trim() : "";
  const responseText = readTextValue(record).join("\n").trim();
  const text = rawResponseType === "chat_completions" ? chatText || responseText : responseText || chatText;

  if (!text) {
    throw new LLMResponseNormalizationError();
  }

  const responseId = typeof record.id === "string" && record.id.trim()
    ? record.id.trim()
    : options.fallbackResponseId;
  const model = typeof record.model === "string" && record.model.trim()
    ? record.model.trim()
    : options.fallbackModel;

  return {
    text,
    provider: options.provider,
    rawResponseType,
    normalized: true,
    parserUsed: "gpt-os-api-adapter",
    model,
    responseId,
    createdAt: normalizeCreatedAt(record.created_at ?? record.created),
    usage: normalizeUsage(record.usage),
    partial: options.allowPartial && (!responseId || !model)
  };
}

export function normalizeLLMContentResult(response: unknown, options: {
  provider: GptOSApiProvider;
  requestedModel: string;
  fallbackModel?: string;
  fallbackResponseId?: string;
  allowPartial?: boolean;
}): NormalizedLLMContentResult {
  const normalized = normalizeLLMResponse(response, {
    provider: options.provider,
    fallbackModel: options.fallbackModel ?? options.requestedModel,
    fallbackResponseId: options.fallbackResponseId,
    allowPartial: options.allowPartial
  });

  return {
    ok: true,
    content: normalized.text,
    provider: normalized.provider,
    requestedModel: options.requestedModel,
    actualModel: normalized.model,
    responseId: normalized.responseId,
    usage: normalized.usage,
    fallbackUsed: false,
    rawResponseType: normalized.rawResponseType,
    normalized: true,
    parserUsed: normalized.parserUsed
  };
}

export function createRecoveredResponseId(provider: GptOSApiProvider) {
  return `${provider}-stream-recovered-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;
}

export function isRetryableLLMError(error: unknown) {
  if (!error || typeof error !== "object") {
    return true;
  }

  const record = error as { code?: unknown; message?: unknown; name?: unknown };
  const code = typeof record.code === "string" ? record.code.toLowerCase() : "";
  const message = typeof record.message === "string" ? record.message.toLowerCase() : "";
  const name = typeof record.name === "string" ? record.name.toLowerCase() : "";

  if (code.includes("api_key") || message.includes("api key") || message.includes("401") || message.includes("403")) {
    return false;
  }

  if (name.includes("normalization")) {
    return false;
  }

  return code.includes("timeout")
    || message.includes("timeout")
    || message.includes("fetch failed")
    || message.includes("connect")
    || message.includes("429")
    || message.includes("500")
    || message.includes("502")
    || message.includes("503")
    || message.includes("504")
    || !message;
}

export async function withResilientLLMCall<T>(
  key: string,
  fn: () => Promise<T>,
  options: {
    retries?: number;
    retryDelayMs?: number;
    openAfterFailures?: number;
    circuitOpenMs?: number;
  } = {}
): Promise<ResilientCallResult<T>> {
  const retries = options.retries ?? 2;
  const retryDelayMs = options.retryDelayMs ?? 500;
  const openAfterFailures = options.openAfterFailures ?? 3;
  const circuitOpenMs = options.circuitOpenMs ?? 30_000;
  const startedAt = Date.now();
  const state = circuitStates.get(key);

  if (state && state.openedUntil > Date.now()) {
    throw new Error("AI服务暂时不稳定，请稍后再试。");
  }

  let retryCount = 0;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const value = await fn();

      circuitStates.set(key, {
        failures: 0,
        openedUntil: 0
      });

      return {
        value,
        retryCount,
        responseLatency: Date.now() - startedAt,
        circuitBreaker: "closed"
      };
    } catch (error) {
      lastError = error;

      if (attempt >= retries || !isRetryableLLMError(error)) {
        break;
      }

      retryCount += 1;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  const nextFailures = (circuitStates.get(key)?.failures ?? 0) + 1;

  circuitStates.set(key, {
    failures: nextFailures,
    openedUntil: nextFailures >= openAfterFailures ? Date.now() + circuitOpenMs : 0
  });

  throw lastError;
}
