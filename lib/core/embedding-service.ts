import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createEmbedding } from "@/lib/ai/embeddings";
import { getEmbeddingModel } from "@/lib/server-config";
import { ValidationError } from "@/lib/errors";
import { logger, toSafeErrorLog } from "@/lib/logger";

export interface CoreEmbeddingResult {
  text: string;
  vector: number[];
  model: string;
  provider: "openai" | "mock";
  fallbackUsed: boolean;
  dimensions: number;
}

export interface IndexKnowledgeEmbeddingInput {
  knowledgeItemId: string;
  tenantId: string;
  userId: string;
  requestId?: string;
}

const MOCK_EMBEDDING_DIMENSIONS = 256;
const MAX_EMBEDDING_TEXT_CHARS = 8_000;

function cleanText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function hashToken(token: string) {
  let hash = 2166136261;

  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function normalizeVector(vector: number[]) {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + (value * value), 0));

  if (magnitude === 0) {
    return vector;
  }

  return vector.map((value) => Number((value / magnitude).toFixed(8)));
}

function createMockEmbedding(text: string) {
  const vector = Array.from({ length: MOCK_EMBEDDING_DIMENSIONS }, () => 0);
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5]+/i)
    .map((token) => token.trim())
    .filter(Boolean);

  for (const token of tokens.length > 0 ? tokens : [text.toLowerCase()]) {
    const hash = hashToken(token);
    const index = hash % MOCK_EMBEDDING_DIMENSIONS;
    const direction = hash % 2 === 0 ? 1 : -1;

    vector[index] += direction;
    vector[(index * 7 + 13) % MOCK_EMBEDDING_DIMENSIONS] += direction * 0.5;
  }

  return normalizeVector(vector);
}

export function buildKnowledgeEmbeddingText(item: {
  title: string;
  summary: string;
  content: string;
  category: string;
  tags: string[];
}) {
  return [
    `标题：${item.title}`,
    `分类：${item.category}`,
    item.tags.length > 0 ? `标签：${item.tags.join("、")}` : "",
    `摘要：${item.summary}`,
    `正文：${item.content}`
  ]
    .map(cleanText)
    .filter(Boolean)
    .join("\n")
    .slice(0, MAX_EMBEDDING_TEXT_CHARS);
}

function toJsonVector(vector: number[]): Prisma.InputJsonArray {
  return vector.map((value) => Number.isFinite(value) ? value : 0) as Prisma.InputJsonArray;
}

export function readEmbeddingVector(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => typeof item === "number" && Number.isFinite(item) ? item : null)
    .filter((item): item is number => item !== null);
}

export async function createCoreEmbedding(text: string, options: {
  requestId?: string;
  userId?: string;
  operation?: string;
} = {}): Promise<CoreEmbeddingResult> {
  const clean = cleanText(text);

  if (!clean) {
    throw new ValidationError("Embedding 输入不能为空。");
  }

  try {
    const result = await createEmbedding(clean, {
      requestId: options.requestId,
      userId: options.userId,
      operation: options.operation ?? "core_embedding"
    });

    return {
      text: clean,
      vector: normalizeVector(result.embedding),
      model: result.model,
      provider: "openai",
      fallbackUsed: false,
      dimensions: result.dimensions
    };
  } catch (error) {
    logger.warn("core.embedding_fallback", {
      requestId: options.requestId,
      operation: options.operation ?? "core_embedding",
      model: getEmbeddingModel(),
      error: toSafeErrorLog(error)
    });

    const vector = createMockEmbedding(clean);

    return {
      text: clean,
      vector,
      model: "mock-hash-embedding-v1",
      provider: "mock",
      fallbackUsed: true,
      dimensions: vector.length
    };
  }
}

export async function indexKnowledgeItemEmbedding(input: IndexKnowledgeEmbeddingInput) {
  const item = await prisma.knowledgeItem.findFirst({
    where: {
      id: input.knowledgeItemId,
      tenantId: input.tenantId,
      deletedAt: null
    },
    select: {
      id: true,
      title: true,
      summary: true,
      content: true,
      category: true,
      tags: true
    }
  });

  if (!item) {
    throw new ValidationError("知识不存在或不属于当前企业，无法向量化。");
  }

  const text = buildKnowledgeEmbeddingText(item);
  const embedding = await createCoreEmbedding(text, {
    requestId: input.requestId,
    userId: input.userId,
    operation: "core_knowledge_item_embedding"
  });
  const updated = await prisma.knowledgeItem.update({
    where: { id: item.id },
    data: {
      embedding: toJsonVector(embedding.vector),
      embeddingModel: embedding.model,
      indexedAt: new Date()
    },
    select: {
      id: true,
      tenantId: true,
      title: true,
      embeddingModel: true,
      indexedAt: true
    }
  });

  return {
    ...embedding,
    knowledgeItem: {
      id: updated.id,
      tenantId: updated.tenantId,
      title: updated.title,
      embeddingModel: updated.embeddingModel,
      indexedAt: updated.indexedAt?.toISOString() ?? null
    }
  };
}
