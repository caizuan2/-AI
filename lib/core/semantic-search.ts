import "server-only";

import { prisma } from "@/lib/prisma";
import {
  createCoreEmbedding,
  readEmbeddingVector
} from "@/lib/core/embedding-service";
import { ValidationError } from "@/lib/errors";

export interface SemanticSearchInput {
  tenantId: string;
  userId: string;
  query: string;
  topK?: number;
  requestId?: string;
}

export interface SemanticSearchResult {
  id: string;
  title: string;
  summary: string;
  content: string;
  category: string;
  tags: string[];
  sourceType: string;
  sourceTitle: string | null;
  sourceUrl: string | null;
  createdAt: string;
  updatedAt: string;
  similarity: number;
  score: number;
  retrievalType: "semantic" | "keyword";
  embeddingModel: string | null;
  indexedAt: string | null;
}

const DEFAULT_TOP_K = 5;
const MAX_TOP_K = 12;
const MIN_SEMANTIC_SCORE = 0.08;
const MAX_VECTOR_CANDIDATES = 400;

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTopK(value: unknown) {
  const topK = typeof value === "number" ? Math.round(value) : DEFAULT_TOP_K;

  return Number.isInteger(topK) && topK > 0 ? Math.min(topK, MAX_TOP_K) : DEFAULT_TOP_K;
}

function cosineSimilarity(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);

  if (length === 0) {
    return 0;
  }

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;

    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return Math.max(0, Math.min(1, dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude))));
}

function toResult(item: {
  id: string;
  title: string;
  summary: string;
  content: string;
  category: string;
  tags: string[];
  sourceType: string;
  sourceTitle: string | null;
  sourceUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  embeddingModel: string | null;
  indexedAt: Date | null;
}, score: number, retrievalType: SemanticSearchResult["retrievalType"]): SemanticSearchResult {
  return {
    id: item.id,
    title: item.title,
    summary: item.summary,
    content: item.content,
    category: item.category,
    tags: item.tags,
    sourceType: item.sourceType,
    sourceTitle: item.sourceTitle,
    sourceUrl: item.sourceUrl,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    similarity: Number(score.toFixed(4)),
    score: Number(score.toFixed(4)),
    retrievalType,
    embeddingModel: item.embeddingModel,
    indexedAt: item.indexedAt?.toISOString() ?? null
  };
}

function extractTerms(query: string) {
  return Array.from(new Set(query.split(/[^a-z0-9\u4e00-\u9fa5]+/i).map((term) => term.trim()).filter(Boolean))).slice(0, 8);
}

async function keywordFallback(input: SemanticSearchInput, topK: number): Promise<SemanticSearchResult[]> {
  const query = cleanText(input.query);
  const terms = extractTerms(query);
  const filters = [
    { title: { contains: query, mode: "insensitive" as const } },
    { summary: { contains: query, mode: "insensitive" as const } },
    { content: { contains: query, mode: "insensitive" as const } },
    { category: { contains: query, mode: "insensitive" as const } },
    ...terms.map((term) => ({ title: { contains: term, mode: "insensitive" as const } })),
    ...terms.map((term) => ({ summary: { contains: term, mode: "insensitive" as const } })),
    ...terms.map((term) => ({ content: { contains: term, mode: "insensitive" as const } }))
  ];

  const items = await prisma.knowledgeItem.findMany({
    where: {
      tenantId: input.tenantId,
      deletedAt: null,
      status: "active",
      OR: filters
    },
    orderBy: [
      { importance: "desc" },
      { updatedAt: "desc" }
    ],
    take: topK,
    select: {
      id: true,
      title: true,
      summary: true,
      content: true,
      category: true,
      tags: true,
      sourceType: true,
      sourceTitle: true,
      sourceUrl: true,
      createdAt: true,
      updatedAt: true,
      embeddingModel: true,
      indexedAt: true
    }
  });

  return items.map((item, index) => toResult(item, Math.max(0.2, 0.7 - (index * 0.08)), "keyword"));
}

export async function semanticSearch(input: SemanticSearchInput) {
  const query = cleanText(input.query);

  if (!query) {
    throw new ValidationError("语义搜索内容不能为空。");
  }

  if (!input.tenantId) {
    throw new ValidationError("缺少企业租户上下文，无法执行语义搜索。");
  }

  const topK = normalizeTopK(input.topK);
  const queryEmbedding = await createCoreEmbedding(query, {
    requestId: input.requestId,
    userId: input.userId,
    operation: "core_query_embedding"
  });
  const candidates = await prisma.knowledgeItem.findMany({
    where: {
      tenantId: input.tenantId,
      deletedAt: null,
      status: "active",
      indexedAt: { not: null }
    },
    orderBy: { updatedAt: "desc" },
    take: MAX_VECTOR_CANDIDATES,
    select: {
      id: true,
      title: true,
      summary: true,
      content: true,
      category: true,
      tags: true,
      sourceType: true,
      sourceTitle: true,
      sourceUrl: true,
      createdAt: true,
      updatedAt: true,
      embedding: true,
      embeddingModel: true,
      indexedAt: true
    }
  });
  const semanticResults = candidates
    .map((item) => ({
      item,
      score: cosineSimilarity(queryEmbedding.vector, readEmbeddingVector(item.embedding))
    }))
    .filter((item) => item.score >= MIN_SEMANTIC_SCORE)
    .sort((left, right) => right.score - left.score)
    .slice(0, topK)
    .map(({ item, score }) => toResult(item, score, "semantic"));
  const keywordResults = semanticResults.length < topK
    ? await keywordFallback(input, topK - semanticResults.length)
    : [];
  const seen = new Set(semanticResults.map((item) => item.id));
  const merged = [
    ...semanticResults,
    ...keywordResults.filter((item) => !seen.has(item.id))
  ].slice(0, topK);

  return {
    query,
    embedding: {
      model: queryEmbedding.model,
      provider: queryEmbedding.provider,
      fallbackUsed: queryEmbedding.fallbackUsed,
      dimensions: queryEmbedding.dimensions
    },
    mode: semanticResults.length > 0 ? (keywordResults.length > 0 ? "hybrid" : "semantic") : "keyword",
    results: merged,
    semanticCount: semanticResults.length,
    keywordCount: keywordResults.length,
    topK
  };
}
