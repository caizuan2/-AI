import "server-only";

import { AppError, toAppError } from "@/lib/errors";
import { logger, toSafeErrorLog } from "@/lib/logger";
import {
  getAIProviderFallbackChain,
  getFallbackAIProvider,
  getPrimaryAIProvider,
  getSecondaryFallbackAIProvider,
  hasUsableDeepSeekKey,
  hasUsableOpenAIKey,
  hasUsableQwenKey,
  type ChatProviderName
} from "@/lib/server-config";
import { createDeepSeekChatProvider } from "@/lib/ai/deepseek-provider";
import { createOpenAIChatProvider, createOpenAIEmbeddingProvider } from "@/lib/ai/openai-provider";
import { createQwenChatProvider } from "@/lib/ai/qwen-provider";
import type {
  ChatProvider,
  ChatProviderInput,
  ChatWithFallbackResult,
  EmbeddingProvider
} from "@/lib/ai/types";

function getChatProvider(name: ChatProviderName): ChatProvider {
  if (name === "qwen") {
    return createQwenChatProvider();
  }

  if (name === "deepseek") {
    return createDeepSeekChatProvider();
  }

  return createOpenAIChatProvider();
}

function isProviderConfigured(name: ChatProviderName) {
  if (name === "qwen") {
    return hasUsableQwenKey();
  }

  return name === "deepseek" ? hasUsableDeepSeekKey() : hasUsableOpenAIKey();
}

function getProviderMissingError(name: ChatProviderName) {
  if (name === "qwen") {
    return new AppError("MISSING_QWEN_API_KEY", "QWEN_API_KEY 未配置，无法使用 qwen provider。", 500);
  }

  const label = name === "deepseek" ? "DEEPSEEK_API_KEY" : "OPENAI_API_KEY";

  return new AppError("MISSING_AI_API_KEY", `${label} 未配置，无法使用 ${name} provider。`, 500);
}

function normalizeProviderChain(primaryName: ChatProviderName, providerChain?: ChatProviderName[]) {
  const normalized = (providerChain ?? [])
    .filter((provider): provider is ChatProviderName => provider === "qwen" || provider === "openai" || provider === "deepseek")
    .filter((provider, index, chain) => chain.indexOf(provider) === index);

  if (normalized.length === 0) {
    return getAIProviderFallbackChain(primaryName);
  }

  return normalized.includes(primaryName) ? normalized : [primaryName, ...normalized];
}

export function getEmbeddingProvider(): EmbeddingProvider {
  return createOpenAIEmbeddingProvider();
}

export async function chatWithFallback(
  input: ChatProviderInput & { provider?: ChatProviderName }
): Promise<ChatWithFallbackResult> {
  const primaryName = input.provider ?? getPrimaryAIProvider();
  const providerChain = normalizeProviderChain(primaryName, input.providerChain);
  const requestId = input.requestId;
  let firstError: AppError | null = null;
  let lastError: unknown = null;

  for (let index = 0; index < providerChain.length; index += 1) {
    const providerName = providerChain[index];
    const attemptStartedAt = Date.now();

    if (!providerName) {
      continue;
    }

    try {
      if (!isProviderConfigured(providerName)) {
        throw getProviderMissingError(providerName);
      }

      const provider = getChatProvider(providerName);
      const result = await provider.chat(
        providerName === primaryName
          ? input
          : { ...input, model: undefined }
      );

      return {
        ...result,
        fallbackUsed: index > 0,
        originalProviderErrorCode: index > 0 ? firstError?.code : undefined,
        model_feedback_event: {
          model_used: result.model,
          was_successful: true,
          fallback_triggered: index > 0,
          response_quality: null,
          latency: Date.now() - attemptStartedAt,
        },
      };
    } catch (error) {
      const appError = toAppError(error);

      firstError ??= appError;
      lastError = error;

      logger.warn(index === 0 ? "ai.primary_provider_failed" : "ai.fallback_provider_failed", {
        requestId,
        provider: providerName,
        nextProvider: providerChain[index + 1] ?? null,
        code: appError.code,
        model_feedback_event: {
          model_used: input.model ?? providerName,
          was_successful: false,
          fallback_triggered: index > 0,
          response_quality: null,
          latency: Date.now() - attemptStartedAt,
        },
        error: toSafeErrorLog(error)
      });
    }
  }

  logger.error("ai.provider_chain_failed", {
    requestId,
    providerChain,
    firstErrorCode: firstError?.code,
    error: toSafeErrorLog(lastError)
  });

  throw lastError ?? new AppError("AI_PROVIDER_FAILED", "所有 AI provider 都调用失败。", 502);
}

export function getProviderReadiness() {
  const primaryProvider = getPrimaryAIProvider();
  const fallbackProvider = getFallbackAIProvider();
  const secondaryFallbackProvider = getSecondaryFallbackAIProvider();

  return {
    primaryProvider,
    fallbackProvider,
    secondaryFallbackProvider,
    providerChain: getAIProviderFallbackChain(),
    qwenConfigured: hasUsableQwenKey(),
    openaiConfigured: hasUsableOpenAIKey(),
    deepseekConfigured: hasUsableDeepSeekKey()
  };
}
