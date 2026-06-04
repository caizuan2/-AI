import "server-only";

import { AppError, toAppError } from "@/lib/errors";
import { logger, toSafeErrorLog } from "@/lib/logger";
import {
  getFallbackAIProvider,
  getPrimaryAIProvider,
  hasUsableDeepSeekKey,
  hasUsableOpenAIKey,
  type ChatProviderName
} from "@/lib/server-config";
import { createDeepSeekChatProvider } from "@/lib/ai/deepseek-provider";
import { createOpenAIChatProvider, createOpenAIEmbeddingProvider } from "@/lib/ai/openai-provider";
import type {
  ChatProvider,
  ChatProviderInput,
  ChatWithFallbackResult,
  EmbeddingProvider
} from "@/lib/ai/types";

function getChatProvider(name: ChatProviderName): ChatProvider {
  if (name === "deepseek") {
    return createDeepSeekChatProvider();
  }

  return createOpenAIChatProvider();
}

function isProviderConfigured(name: ChatProviderName) {
  return name === "deepseek" ? hasUsableDeepSeekKey() : hasUsableOpenAIKey();
}

function getProviderMissingError(name: ChatProviderName) {
  const label = name === "deepseek" ? "DEEPSEEK_API_KEY" : "OPENAI_API_KEY";

  return new AppError("MISSING_AI_API_KEY", `${label} 未配置，无法使用 ${name} provider。`, 500);
}

export function getEmbeddingProvider(): EmbeddingProvider {
  return createOpenAIEmbeddingProvider();
}

export async function chatWithFallback(
  input: ChatProviderInput & { provider?: ChatProviderName }
): Promise<ChatWithFallbackResult> {
  const primaryName = input.provider ?? getPrimaryAIProvider();
  const fallbackName = getFallbackAIProvider();
  const primaryProvider = getChatProvider(primaryName);
  const requestId = input.requestId;

  try {
    if (!isProviderConfigured(primaryName)) {
      throw getProviderMissingError(primaryName);
    }

    const result = await primaryProvider.chat(input);

    return {
      ...result,
      fallbackUsed: false
    };
  } catch (error) {
    const appError = toAppError(error);

    logger.warn("ai.primary_provider_failed", {
      requestId,
      provider: primaryName,
      fallbackProvider: fallbackName,
      code: appError.code,
      error: toSafeErrorLog(error)
    });

    if (!fallbackName || fallbackName === primaryName) {
      throw error;
    }

    if (!isProviderConfigured(fallbackName)) {
      throw error;
    }

    try {
      const fallbackProvider = getChatProvider(fallbackName);
      const result = await fallbackProvider.chat(input);

      return {
        ...result,
        fallbackUsed: true,
        originalProviderErrorCode: appError.code
      };
    } catch (fallbackError) {
      logger.error("ai.fallback_provider_failed", {
        requestId,
        primaryProvider: primaryName,
        fallbackProvider: fallbackName,
        primaryErrorCode: appError.code,
        error: toSafeErrorLog(fallbackError)
      });

      throw fallbackError;
    }
  }
}

export function getProviderReadiness() {
  const primaryProvider = getPrimaryAIProvider();
  const fallbackProvider = getFallbackAIProvider();

  return {
    primaryProvider,
    fallbackProvider,
    openaiConfigured: hasUsableOpenAIKey(),
    deepseekConfigured: hasUsableDeepSeekKey()
  };
}
