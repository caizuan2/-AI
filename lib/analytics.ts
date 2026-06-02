import "server-only";

import { AnalyticsEventType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { hasDatabaseUrl } from "@/lib/server-config";

export interface RecordAnalyticsEventInput {
  userId?: string | null;
  type: AnalyticsEventType;
  numericValue?: number | null;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
}

export interface RecordAiUsageInput {
  userId?: string | null;
  requestId?: string;
  operation: string;
  model: string;
  durationMs: number;
  estimatedInputTokens: number;
  estimatedOutputTokens?: number;
  actualInputTokens?: number | null;
  actualOutputTokens?: number | null;
  actualTotalTokens?: number | null;
  metadata?: Record<string, unknown>;
}

const CHAT_INPUT_COST_PER_1M = readCostEnv("OPENAI_CHAT_INPUT_COST_PER_1M", 0.4);
const CHAT_OUTPUT_COST_PER_1M = readCostEnv("OPENAI_CHAT_OUTPUT_COST_PER_1M", 1.6);
const EMBEDDING_COST_PER_1M = readCostEnv("OPENAI_EMBEDDING_COST_PER_1M", 0.02);

function readCostEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);

  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function isEmbeddingOperation(operation: string) {
  return operation.toLowerCase().includes("embedding");
}

function estimateCostUsd(input: {
  operation: string;
  inputTokens: number;
  outputTokens: number;
}) {
  if (isEmbeddingOperation(input.operation)) {
    return (input.inputTokens / 1_000_000) * EMBEDDING_COST_PER_1M;
  }

  return ((input.inputTokens / 1_000_000) * CHAT_INPUT_COST_PER_1M)
    + ((input.outputTokens / 1_000_000) * CHAT_OUTPUT_COST_PER_1M);
}

function roundUsd(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function cleanMetadata(metadata: Record<string, unknown>): Prisma.InputJsonObject {
  const cleaned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (value === null || value === undefined) {
      continue;
    }

    if (value instanceof Date) {
      cleaned[key] = value.toISOString();
      continue;
    }

    if (Array.isArray(value)) {
      cleaned[key] = value
        .filter((item) => item !== null && item !== undefined)
        .map((item) => (item instanceof Date ? item.toISOString() : item));
      continue;
    }

    if (typeof value === "object") {
      cleaned[key] = cleanMetadata(value as Record<string, unknown>);
      continue;
    }

    cleaned[key] = value;
  }

  return cleaned as Prisma.InputJsonObject;
}

export async function recordAnalyticsEvent(input: RecordAnalyticsEventInput) {
  if (!hasDatabaseUrl()) {
    return;
  }

  try {
    await prisma.analyticsEvent.create({
      data: {
        userId: input.userId ?? null,
        type: input.type,
        numericValue: input.numericValue ?? null,
        metadata: input.metadata ? cleanMetadata(input.metadata) : undefined,
        occurredAt: input.occurredAt
      }
    });
  } catch (error) {
    logger.warn("analytics.record_failed", {
      type: input.type,
      errorName: error instanceof Error ? error.name : "UnknownError"
    });
  }
}

export async function recordAiUsage(input: RecordAiUsageInput) {
  const inputTokens = input.actualInputTokens ?? input.estimatedInputTokens;
  const outputTokens = input.actualOutputTokens ?? input.estimatedOutputTokens ?? 0;
  const totalTokens = input.actualTotalTokens ?? inputTokens + outputTokens;
  const estimatedCostUsd = roundUsd(estimateCostUsd({
    operation: input.operation,
    inputTokens,
    outputTokens
  }));
  const metadata = cleanMetadata({
    requestId: input.requestId,
    operation: input.operation,
    model: input.model,
    durationMs: input.durationMs,
    estimatedInputTokens: input.estimatedInputTokens,
    estimatedOutputTokens: input.estimatedOutputTokens ?? 0,
    actualInputTokens: input.actualInputTokens,
    actualOutputTokens: input.actualOutputTokens,
    actualTotalTokens: input.actualTotalTokens,
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCostUsd,
    pricing: isEmbeddingOperation(input.operation)
      ? {
          embeddingCostPer1M: EMBEDDING_COST_PER_1M
        }
      : {
          chatInputCostPer1M: CHAT_INPUT_COST_PER_1M,
          chatOutputCostPer1M: CHAT_OUTPUT_COST_PER_1M
        },
    ...(input.metadata ?? {})
  });

  await recordAnalyticsEvent({
    userId: input.userId,
    type: AnalyticsEventType.AI_CALL,
    numericValue: estimatedCostUsd,
    metadata
  });
}

export { AnalyticsEventType };
