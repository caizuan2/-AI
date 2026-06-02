import "server-only";

import { normalizeOpenAIError, openai, openaiConfig } from "@/lib/openai";
import { recordAiUsage } from "@/lib/analytics";
import { estimateTokenCount, logger, toSafeErrorLog } from "@/lib/logger";

export interface CreateEmbeddingResult {
  embedding: number[];
  model: string;
  dimensions: number;
}

export interface CreateEmbeddingOptions {
  requestId?: string;
  operation?: string;
  userId?: string;
}

export async function createEmbedding(text: string, options: CreateEmbeddingOptions = {}): Promise<CreateEmbeddingResult> {
  const input = text.trim();

  if (!input) {
    throw new Error("createEmbedding failed: text is required.");
  }

  const startedAt = Date.now();
  const estimatedInputTokens = estimateTokenCount(input);
  const operation = options.operation ?? "embedding";

  try {
    const response = await openai.embeddings.create({
      model: openaiConfig.embeddingModel,
      input
    });
    const embedding = response.data[0]?.embedding;

    if (!embedding || embedding.length === 0) {
      throw new Error("OpenAI returned an empty embedding.");
    }

    const result = {
      embedding,
      model: response.model,
      dimensions: embedding.length
    };
    const durationMs = Date.now() - startedAt;

    logger.info("ai.call", {
      requestId: options.requestId,
      operation,
      provider: "openai",
      model: result.model,
      durationMs,
      estimatedInputTokens,
      estimatedOutputTokens: 0,
      estimatedTotalTokens: estimatedInputTokens,
      dimensions: result.dimensions
    });
    await recordAiUsage({
      requestId: options.requestId,
      userId: options.userId,
      operation,
      model: result.model,
      durationMs,
      estimatedInputTokens,
      estimatedOutputTokens: 0,
      metadata: {
        dimensions: result.dimensions
      }
    });

    return result;
  } catch (error) {
    logger.error("ai.call_failed", {
      requestId: options.requestId,
      operation,
      provider: "openai",
      model: openaiConfig.embeddingModel,
      durationMs: Date.now() - startedAt,
      estimatedInputTokens,
      error: toSafeErrorLog(error)
    });

    throw normalizeOpenAIError(error, "createEmbedding failed");
  }
}
