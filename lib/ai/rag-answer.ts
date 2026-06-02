import "server-only";

import { normalizeOpenAIError, openai, openaiConfig } from "@/lib/openai";
import { buildRagPromptMessages, type RagContext } from "@/lib/ai/rag-prompt";
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
}

export interface GenerateRagAnswerOptions {
  requestId?: string;
  userId?: string;
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

  const messages = buildRagPromptMessages(normalizedQuestion, contexts);
  const startedAt = Date.now();
  const estimatedInputTokens = estimateTokenCount(messages.map((message) => message.content).join("\n\n"));

  try {
    const response = await openai.chat.completions.create({
      model: openaiConfig.chatModel,
      temperature: 0.2,
      messages
    });
    const answer = response.choices[0]?.message.content?.trim();

    if (!answer) {
      throw new Error("OpenAI returned an empty RAG answer.");
    }

    const estimatedOutputTokens = estimateTokenCount(answer);
    const durationMs = Date.now() - startedAt;

    logger.info("ai.call", {
      requestId: options.requestId,
      operation: "rag_answer",
      provider: "openai",
      model: response.model,
      durationMs,
      estimatedInputTokens,
      estimatedOutputTokens,
      estimatedTotalTokens: estimatedInputTokens + estimatedOutputTokens,
      actualInputTokens: response.usage?.prompt_tokens,
      actualOutputTokens: response.usage?.completion_tokens,
      actualTotalTokens: response.usage?.total_tokens,
      contextCount: contexts.length
    });
    await recordAiUsage({
      requestId: options.requestId,
      userId: options.userId,
      operation: "rag_answer",
      model: response.model,
      durationMs,
      estimatedInputTokens,
      estimatedOutputTokens,
      actualInputTokens: response.usage?.prompt_tokens,
      actualOutputTokens: response.usage?.completion_tokens,
      actualTotalTokens: response.usage?.total_tokens,
      metadata: {
        contextCount: contexts.length
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
      model: response.model
    };
  } catch (error) {
    logger.error("ai.call_failed", {
      requestId: options.requestId,
      operation: "rag_answer",
      provider: "openai",
      model: openaiConfig.chatModel,
      durationMs: Date.now() - startedAt,
      estimatedInputTokens,
      contextCount: contexts.length,
      error: toSafeErrorLog(error)
    });

    throw normalizeOpenAIError(error, "generateRagAnswer failed");
  }
}
