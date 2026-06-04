import "server-only";

import OpenAI from "openai";
import { AppError } from "@/lib/errors";
import { estimateTokenCount, logger, toSafeErrorLog } from "@/lib/logger";
import { getDeepSeekBaseUrl, getDeepSeekModel, hasUsableDeepSeekKey } from "@/lib/server-config";
import {
  toOpenAIChatMessages,
  type ChatProvider,
  type ChatProviderInput,
  type ChatProviderResult,
  type ProviderUsage
} from "@/lib/ai/types";

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;

let cachedClient: OpenAI | null = null;
let cachedClientKey = "";

function getDeepSeekClient() {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();

  if (!apiKey || !hasUsableDeepSeekKey()) {
    throw new AppError("MISSING_AI_API_KEY", "DeepSeek API Key 未配置。", 500);
  }

  const cacheKey = `${getDeepSeekBaseUrl()}::${apiKey.slice(0, 8)}`;

  if (!cachedClient || cachedClientKey !== cacheKey) {
    cachedClient = new OpenAI({
      apiKey,
      baseURL: getDeepSeekBaseUrl(),
      maxRetries: 0,
      timeout: REQUEST_TIMEOUT_MS
    });
    cachedClientKey = cacheKey;
  }

  return cachedClient;
}

function usageToRecord(usage: unknown): ProviderUsage | undefined {
  return usage && typeof usage === "object" ? { ...(usage as Record<string, unknown>) } : undefined;
}

function normalizeDeepSeekError(error: unknown) {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof OpenAI.APIError) {
    if (error.status === 401 || error.status === 403) {
      return new AppError("MISSING_AI_API_KEY", "DeepSeek API Key 未配置或无效。", 500);
    }

    if (error.status === 429) {
      const type = String(error.type ?? "").toLowerCase();

      return new AppError(
        type.includes("quota") ? "AI_QUOTA_EXCEEDED" : "AI_RATE_LIMITED",
        type.includes("quota") ? "DeepSeek 额度不足，请检查账号额度。" : "DeepSeek 请求过于频繁，请稍后再试。",
        429
      );
    }
  }

  return new AppError("DEEPSEEK_REQUEST_FAILED", "DeepSeek provider 调用失败。", 502);
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

export function createDeepSeekChatProvider(): ChatProvider {
  return {
    name: "deepseek",
    model: getDeepSeekModel(),
    async chat(input: ChatProviderInput): Promise<ChatProviderResult> {
      const startedAt = Date.now();
      const estimatedInputTokens = estimateTokenCount(input.messages.map((message) => message.content).join("\n"));
      const model = input.model?.trim() || getDeepSeekModel();

      try {
        const response = await withRetry(
          () => getDeepSeekClient().chat.completions.create({
            model,
            temperature: input.temperature ?? 0.2,
            max_tokens: input.maxTokens,
            messages: toOpenAIChatMessages(input)
          }),
          (attempt, error) => {
            logger.warn("ai.provider_retry", {
              requestId: input.requestId,
              provider: "deepseek",
              model,
              attempt,
              error: toSafeErrorLog(error)
            });
          }
        );
        const text = response.choices[0]?.message.content?.trim();

        if (!text) {
          throw new AppError("DEEPSEEK_REQUEST_FAILED", "DeepSeek 返回了空内容。", 502);
        }

        logger.info("ai.provider_call", {
          requestId: input.requestId,
          provider: "deepseek",
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
          provider: "deepseek",
          model: response.model
        };
      } catch (error) {
        logger.error("ai.provider_failed", {
          requestId: input.requestId,
          provider: "deepseek",
          model,
          durationMs: Date.now() - startedAt,
          error: toSafeErrorLog(error)
        });

        throw normalizeDeepSeekError(error);
      }
    }
  };
}
