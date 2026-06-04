import "server-only";

import OpenAI from "openai";
import { AppError } from "@/lib/errors";
import { estimateTokenCount, logger, toSafeErrorLog } from "@/lib/logger";
import {
  getEmbeddingModel,
  getOpenAIBaseUrl,
  getOpenAIModel,
  hasUsableOpenAIKey
} from "@/lib/server-config";
import {
  toOpenAIChatMessages,
  type ChatProvider,
  type ChatProviderInput,
  type ChatProviderResult,
  type EmbeddingProvider,
  type EmbeddingProviderInput,
  type EmbeddingProviderResult,
  type ProviderUsage
} from "@/lib/ai/types";

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;

let cachedClient: OpenAI | null = null;
let cachedClientKey = "";

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey || !hasUsableOpenAIKey()) {
    throw new AppError("MISSING_AI_API_KEY", "OpenAI API Key 未配置。", 500);
  }

  const cacheKey = `${getOpenAIBaseUrl()}::${apiKey.slice(0, 8)}`;

  if (!cachedClient || cachedClientKey !== cacheKey) {
    cachedClient = new OpenAI({
      apiKey,
      baseURL: getOpenAIBaseUrl(),
      maxRetries: 0,
      timeout: REQUEST_TIMEOUT_MS
    });
    cachedClientKey = cacheKey;
  }

  return cachedClient;
}

function getProviderErrorCode(error: unknown) {
  if (error instanceof AppError) {
    return error.code;
  }

  if (error instanceof OpenAI.APIError) {
    if (error.status === 401 || error.status === 403) {
      return "MISSING_AI_API_KEY";
    }

    if (error.status === 429) {
      const type = String(error.type ?? "").toLowerCase();

      return type.includes("quota") ? "AI_QUOTA_EXCEEDED" : "AI_RATE_LIMITED";
    }

    return "OPENAI_REQUEST_FAILED";
  }

  return "OPENAI_REQUEST_FAILED";
}

function normalizeChatError(error: unknown) {
  const code = getProviderErrorCode(error);
  const message = code === "MISSING_AI_API_KEY"
    ? "OpenAI API Key 未配置或无效。"
    : code === "AI_RATE_LIMITED"
      ? "OpenAI 请求过于频繁，请稍后再试。"
      : code === "AI_QUOTA_EXCEEDED"
        ? "OpenAI 额度不足，请检查账号额度。"
        : "OpenAI provider 调用失败。";

  return new AppError(code, message, code === "MISSING_AI_API_KEY" ? 500 : 502);
}

function normalizeEmbeddingError(error: unknown) {
  if (error instanceof AppError && error.code === "MISSING_AI_API_KEY") {
    return new AppError("MISSING_EMBEDDING_API_KEY", "OpenAI embedding API Key 未配置。", 500);
  }

  if (error instanceof OpenAI.APIError && (error.status === 401 || error.status === 403)) {
    return new AppError("MISSING_EMBEDDING_API_KEY", "OpenAI embedding API Key 未配置或无效。", 500);
  }

  if (error instanceof OpenAI.APIError && error.status === 429) {
    return new AppError("AI_RATE_LIMITED", "Embedding 请求过于频繁，请稍后再试。", 429);
  }

  return new AppError("EMBEDDING_FAILED", "Embedding 生成失败，请稍后再试。", 502);
}

async function withRetry<T>(operation: () => Promise<T>, onRetry: (attempt: number, error: unknown) => void) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt < MAX_ATTEMPTS) {
        onRetry(attempt, error);
      }
    }
  }

  throw lastError;
}

function usageToRecord(usage: unknown): ProviderUsage | undefined {
  return usage && typeof usage === "object" ? { ...(usage as Record<string, unknown>) } : undefined;
}

export function createOpenAIChatProvider(): ChatProvider {
  return {
    name: "openai",
    model: getOpenAIModel(),
    async chat(input: ChatProviderInput): Promise<ChatProviderResult> {
      const startedAt = Date.now();
      const estimatedInputTokens = estimateTokenCount(input.messages.map((message) => message.content).join("\n"));
      const model = input.model?.trim() || getOpenAIModel();

      try {
        const response = await withRetry(
          () => getOpenAIClient().chat.completions.create({
            model,
            temperature: input.temperature ?? 0.2,
            max_tokens: input.maxTokens,
            messages: toOpenAIChatMessages(input)
          }),
          (attempt, error) => {
            logger.warn("ai.provider_retry", {
              requestId: input.requestId,
              provider: "openai",
              model,
              attempt,
              error: toSafeErrorLog(error)
            });
          }
        );
        const text = response.choices[0]?.message.content?.trim();

        if (!text) {
          throw new AppError("OPENAI_REQUEST_FAILED", "OpenAI 返回了空内容。", 502);
        }

        logger.info("ai.provider_call", {
          requestId: input.requestId,
          provider: "openai",
          model: response.model,
          durationMs: Date.now() - startedAt,
          estimatedInputTokens,
          actualInputTokens: response.usage?.prompt_tokens,
          actualOutputTokens: response.usage?.completion_tokens,
          actualTotalTokens: response.usage?.total_tokens
        });

        return {
          text,
          usage: usageToRecord(response.usage),
          provider: "openai",
          model: response.model
        };
      } catch (error) {
        logger.error("ai.provider_failed", {
          requestId: input.requestId,
          provider: "openai",
          model,
          durationMs: Date.now() - startedAt,
          error: toSafeErrorLog(error)
        });

        throw normalizeChatError(error);
      }
    }
  };
}

export function createOpenAIEmbeddingProvider(): EmbeddingProvider {
  return {
    name: "openai",
    model: getEmbeddingModel(),
    async embed(input: EmbeddingProviderInput): Promise<EmbeddingProviderResult> {
      const texts = input.texts.map((text) => text.trim()).filter(Boolean);
      const startedAt = Date.now();

      if (texts.length === 0) {
        throw new AppError("INVALID_INPUT", "Embedding 输入不能为空。", 400);
      }

      try {
        const response = await withRetry(
          () => getOpenAIClient().embeddings.create({
            model: getEmbeddingModel(),
            input: texts
          }),
          (attempt, error) => {
            logger.warn("ai.embedding_retry", {
              requestId: input.requestId,
              provider: "openai",
              model: getEmbeddingModel(),
              attempt,
              error: toSafeErrorLog(error)
            });
          }
        );
        const vectors = response.data.map((item) => item.embedding).filter((vector) => vector.length > 0);

        if (vectors.length !== texts.length) {
          throw new AppError("EMBEDDING_FAILED", "OpenAI 返回的 embedding 数量不匹配。", 502);
        }

        logger.info("ai.embedding_call", {
          requestId: input.requestId,
          provider: "openai",
          model: response.model,
          durationMs: Date.now() - startedAt,
          textCount: texts.length,
          dimensions: vectors[0]?.length ?? 0,
          actualInputTokens: response.usage?.prompt_tokens,
          actualTotalTokens: response.usage?.total_tokens
        });

        return {
          vectors,
          usage: usageToRecord(response.usage),
          provider: "openai",
          model: response.model
        };
      } catch (error) {
        logger.error("ai.embedding_failed", {
          requestId: input.requestId,
          provider: "openai",
          model: getEmbeddingModel(),
          durationMs: Date.now() - startedAt,
          textCount: texts.length,
          error: toSafeErrorLog(error)
        });

        throw normalizeEmbeddingError(error);
      }
    }
  };
}
