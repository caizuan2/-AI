import "server-only";

import { getEmbeddingProvider } from "@/lib/ai/providers";
import { recordAiUsage } from "@/lib/analytics";
import { estimateTokenCount, logger, toSafeErrorLog } from "@/lib/logger";

export interface CreateEmbeddingResult {
  embedding: number[];
  provider: string;
  model: string;
  dimensions: number;
}

export interface CreateEmbeddingsResult {
  embeddings: CreateEmbeddingResult[];
  provider: string;
  model: string;
}

export interface CreateEmbeddingOptions {
  requestId?: string;
  operation?: string;
  userId?: string;
}

export async function createEmbeddings(texts: string[], options: CreateEmbeddingOptions = {}): Promise<CreateEmbeddingsResult> {
  const inputs = texts.map((text) => text.trim()).filter(Boolean);

  if (inputs.length === 0) {
    throw new Error("createEmbeddings failed: texts are required.");
  }

  const startedAt = Date.now();
  const estimatedInputTokens = estimateTokenCount(inputs.join("\n"));
  const operation = options.operation ?? "embedding";

  try {
    const provider = getEmbeddingProvider();
    const response = await provider.embed({
      texts: inputs,
      requestId: options.requestId
    });
    const embeddings = response.vectors.map((embedding) => ({
      embedding,
      provider: response.provider,
      model: response.model,
      dimensions: embedding.length
    }));

    const durationMs = Date.now() - startedAt;

    logger.info("ai.call", {
      requestId: options.requestId,
      operation,
      provider: response.provider,
      model: response.model,
      durationMs,
      estimatedInputTokens,
      estimatedOutputTokens: 0,
      estimatedTotalTokens: estimatedInputTokens,
      textCount: inputs.length,
      dimensions: embeddings[0]?.dimensions ?? 0
    });
    await recordAiUsage({
      requestId: options.requestId,
      userId: options.userId,
      operation,
      model: response.model,
      durationMs,
      estimatedInputTokens,
      estimatedOutputTokens: 0,
      metadata: {
        provider: response.provider,
        textCount: inputs.length,
        dimensions: embeddings[0]?.dimensions ?? 0
      }
    });

    return {
      embeddings,
      provider: response.provider,
      model: response.model
    };
  } catch (error) {
    logger.error("ai.call_failed", {
      requestId: options.requestId,
      operation,
      provider: "openai",
      durationMs: Date.now() - startedAt,
      estimatedInputTokens,
      error: toSafeErrorLog(error)
    });

    throw error;
  }
}

export async function createEmbedding(text: string, options: CreateEmbeddingOptions = {}): Promise<CreateEmbeddingResult> {
  const result = await createEmbeddings([text], options);
  const first = result.embeddings[0];

  if (!first) {
    throw new Error("createEmbedding failed: embedding provider returned no vectors.");
  }

  return first;
}
