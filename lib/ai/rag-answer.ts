import "server-only";

import { chatWithFallback } from "@/lib/ai/providers";
import {
  buildRagPromptMessages,
  type RagAnswerMode,
  type RagContext
} from "@/lib/ai/rag-prompt";
import type { ChatProviderName, ModelFeedbackEvent } from "@/lib/ai/types";
import { recordAiUsage } from "@/lib/analytics";
import { estimateTokenCount, logger, toSafeErrorLog } from "@/lib/logger";

export type { RagContext } from "@/lib/ai/rag-prompt";

export interface RagCitation {
  id: string;
  title: string;
  sourceType?: string;
  sourceId?: string;
}

export interface RagAnswerResult {
  answer: string;
  citations: RagCitation[];
  model: string;
  providerUsed: string;
  fallbackUsed: boolean;
  answer_grounding_score: number;
  model_feedback_event: ModelFeedbackEvent;
  originalProviderErrorCode?: string;
}

export interface GenerateRagAnswerOptions {
  requestId?: string;
  userId?: string;
  provider?: ChatProviderName;
  providerChain?: ChatProviderName[];
  model?: string;
  answerMode?: RagAnswerMode;
  confidence?: number;
  intentLabel?: string;
  retrievalMessage?: string | null;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function averageContextRelevance(contexts: RagContext[]) {
  if (contexts.length === 0) {
    return 0;
  }

  const total = contexts.reduce((sum, context) => {
    const score = typeof context.relevance_score === "number"
      ? context.relevance_score
      : typeof context.score === "number"
        ? context.score
        : 0;

    return sum + score;
  }, 0);

  return clamp01(total / contexts.length);
}

function calculateAnswerGroundingScore(answer: string, contexts: RagContext[]) {
  const relevance = averageContextRelevance(contexts);
  const hasStructuredOutput = /(^|\n)#{1,3}\s|\n[-*]\s|\*\*|\|/.test(answer);
  const answerPresence = answer.trim() ? 0.2 : 0;
  const structureBonus = hasStructuredOutput ? 0.1 : 0;

  return clamp01((relevance * 0.7) + answerPresence + structureBonus);
}

export async function generateRagAnswer(
  question: string,
  contexts: RagContext[],
  options: GenerateRagAnswerOptions = {}
): Promise<RagAnswerResult> {
  const normalizedQuestion = question.trim();

  if (!normalizedQuestion) {
    throw new Error("generateRagAnswer failed: question is required.");
  }

  if (contexts.length === 0) {
    throw new Error("generateRagAnswer failed: at least one context is required.");
  }

  const messages = buildRagPromptMessages(normalizedQuestion, contexts, {
    answerMode: options.answerMode,
    confidence: options.confidence,
    intentLabel: options.intentLabel,
    retrievalMessage: options.retrievalMessage
  });
  const startedAt = Date.now();
  const estimatedInputTokens = estimateTokenCount(messages.map((message) => message.content).join("\n\n"));

  try {
    const response = await chatWithFallback({
      temperature: options.answerMode === "partial" ? 0.25 : 0.35,
      messages,
      requestId: options.requestId,
      provider: options.provider,
      providerChain: options.providerChain,
      model: options.model
    });
    const answer = response.text.trim();

    if (!answer) {
      throw new Error("AI provider returned an empty RAG answer.");
    }

    const estimatedOutputTokens = estimateTokenCount(answer);
    const durationMs = Date.now() - startedAt;
    const answerGroundingScore = calculateAnswerGroundingScore(answer, contexts);
    const modelFeedbackEvent: ModelFeedbackEvent = {
      ...response.model_feedback_event,
      response_quality: answerGroundingScore,
      latency: durationMs,
    };

    logger.info("ai.call", {
      requestId: options.requestId,
      operation: "rag_answer",
      provider: response.provider,
      model: response.model,
      durationMs,
      estimatedInputTokens,
      estimatedOutputTokens,
      estimatedTotalTokens: estimatedInputTokens + estimatedOutputTokens,
      fallbackUsed: response.fallbackUsed,
      model_feedback_event: modelFeedbackEvent,
      contextCount: contexts.length,
      answerGroundingScore,
      answerMode: options.answerMode,
      confidence: options.confidence,
      intentLabel: options.intentLabel
    });
    await recordAiUsage({
      requestId: options.requestId,
      userId: options.userId,
      operation: "rag_answer",
      model: response.model,
      durationMs,
      estimatedInputTokens,
      estimatedOutputTokens,
      metadata: {
        provider: response.provider,
        fallbackUsed: response.fallbackUsed,
        model_feedback_event: modelFeedbackEvent,
        originalProviderErrorCode: response.originalProviderErrorCode,
        contextCount: contexts.length,
        answerGroundingScore,
        answerMode: options.answerMode,
        confidence: options.confidence,
        intentLabel: options.intentLabel
      }
    });

    return {
      answer,
      citations: contexts.map((context) => ({
        id: context.id,
        title: context.title,
        sourceType: context.sourceType,
        sourceId: context.sourceId
      })),
      model: response.model,
      providerUsed: response.provider,
      fallbackUsed: response.fallbackUsed,
      answer_grounding_score: answerGroundingScore,
      model_feedback_event: modelFeedbackEvent,
      originalProviderErrorCode: response.originalProviderErrorCode
    };
  } catch (error) {
    logger.error("ai.call_failed", {
      requestId: options.requestId,
      operation: "rag_answer",
      durationMs: Date.now() - startedAt,
      estimatedInputTokens,
      contextCount: contexts.length,
      error: toSafeErrorLog(error)
    });

    throw error;
  }
}
