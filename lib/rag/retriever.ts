import "server-only";

import { prisma } from "@/lib/prisma";
import { AnalyticsEventType, recordAnalyticsEvent } from "@/lib/analytics";
import { AIError } from "@/lib/errors";
import { getEffectiveKnowledgeStatus } from "@/lib/knowledge/status";
import {
  hasUsableOpenAIKey,
  isAIFallbackAllowed,
  SEARCH_DEFAULT_TOP_K,
  SEARCH_MAX_TOP_K
} from "@/lib/server-config";
import { toVectorLiteral } from "@/lib/knowledge/vector";
import { logger } from "@/lib/logger";

const STOP_TERMS = new Set([
  "什么",
  "哪些",
  "怎么",
  "如何",
  "需要",
  "可以",
  "是否",
  "以及",
  "一个",
  "这个",
  "那个",
  "内容",
  "问题",
  "是什么",
  "有哪些"
]);

const DEFAULT_MIN_SIMILARITY = 0.12;
const CANDIDATE_MULTIPLIER = 4;
const SIMILARITY_WEIGHT = 0.78;
const IMPORTANCE_WEIGHT = 0.12;
const RECENCY_WEIGHT = 0.1;
const RECENCY_HALF_LIFE_DAYS = 90;

export type RetrievalMode = "hybrid" | "vector" | "keyword";

export interface RetrievedKnowledgeChunk {
  chunkId: string;
  knowledgeItemId: string;
  title: string;
  chunkText: string;
  summary: string;
  tags: string[];
  sourceType: string;
  sourceTitle: string | null;
  sourceUrl: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  status: string;
  importance: number;
  similarity: number;
  score: number;
  vectorSimilarity: number | null;
  keywordSimilarity: number | null;
}

export interface RetrieveKnowledgeOptions {
  query: string;
  userId: string;
  topK?: number;
  minSimilarity?: number;
  minResults?: number;
  requestId?: string;
}

export interface RetrieveKnowledgeResponse {
  results: RetrievedKnowledgeChunk[];
  mode: RetrievalMode;
  insufficient: boolean;
  message: string | null;
  totalCandidates: number;
  filteredCandidates: number;
}

type RawCandidate = {
  chunkId: string;
  knowledgeItemId: string;
  title: string;
  chunkText: string;
  summary: string;
  tags: string[];
  sourceType: string;
  sourceTitle: string | null;
  sourceUrl: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  expiresAt: Date | string | null;
  status: string;
  importance: number;
  vectorSimilarity: number | null;
  keywordSimilarity: number | null;
};

type VectorSearchRow = {
  chunkId: string;
  knowledgeItemId: string;
  title: string;
  chunkText: string;
  summary: string;
  tags: string[];
  sourceType: string;
  sourceTitle: string | null;
  sourceUrl: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  expiresAt: Date | string | null;
  status: string;
  importance: number;
  similarity: number;
};

function normalizeTopK(topK?: number) {
  const rawTopK = typeof topK === "number" ? Math.round(topK) : SEARCH_DEFAULT_TOP_K;

  return Number.isInteger(rawTopK) && rawTopK > 0
    ? Math.min(rawTopK, SEARCH_MAX_TOP_K)
    : SEARCH_DEFAULT_TOP_K;
}

function clamp01(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numberValue)) {
    return 0;
  }

  return Math.max(0, Math.min(1, numberValue));
}

function roundScore(value: number) {
  return Math.round(clamp01(value) * 10000) / 10000;
}

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function extractSearchTerms(query: string) {
  const normalized = query
    .toLowerCase()
    .replace(/[^0-9a-zA-Z\u4e00-\u9fff]+/g, " ")
    .trim();
  const terms = new Set<string>();

  for (const segment of normalized.split(/\s+/).filter(Boolean)) {
    if (segment.length >= 2 && !STOP_TERMS.has(segment)) {
      terms.add(segment);
    }

    if (/[\u4e00-\u9fff]/.test(segment)) {
      for (let index = 0; index < segment.length - 1; index += 1) {
        const term = segment.slice(index, index + 2);

        if (!STOP_TERMS.has(term)) {
          terms.add(term);
        }
      }
    }
  }

  return Array.from(terms).slice(0, 12);
}

function scoreKeywordResult(query: string, item: { title: string; summary: string; chunkText: string; tags: string[] }) {
  const normalizedQuery = query.toLowerCase();
  const title = item.title.toLowerCase();
  const summary = item.summary.toLowerCase();
  const chunkText = item.chunkText.toLowerCase();
  const tags = item.tags.map((tag) => tag.toLowerCase());
  const terms = extractSearchTerms(query);
  let score = 0;

  if (title.includes(normalizedQuery)) {
    score += 0.45;
  }

  if (summary.includes(normalizedQuery)) {
    score += 0.3;
  }

  if (chunkText.includes(normalizedQuery)) {
    score += 0.25;
  }

  if (tags.some((tag) => tag.includes(normalizedQuery))) {
    score += 0.2;
  }

  for (const term of terms) {
    if (title.includes(term)) {
      score += 0.12;
    }

    if (summary.includes(term)) {
      score += 0.08;
    }

    if (chunkText.includes(term)) {
      score += 0.06;
    }

    if (tags.some((tag) => tag.includes(term))) {
      score += 0.05;
    }
  }

  return clamp01(score);
}

function getRecencyScore(updatedAt: Date | string) {
  const updatedTime = updatedAt instanceof Date ? updatedAt.getTime() : new Date(updatedAt).getTime();

  if (!Number.isFinite(updatedTime)) {
    return 0;
  }

  const ageDays = Math.max(0, (Date.now() - updatedTime) / (1000 * 60 * 60 * 24));

  return Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
}

function getImportanceScore(importance: number) {
  return clamp01((importance - 1) / 4);
}

function getLifecycleWeight(candidate: RawCandidate) {
  const effectiveStatus = getEffectiveKnowledgeStatus(candidate.status, candidate.expiresAt);

  if (effectiveStatus === "archived") {
    return 0.2;
  }

  if (effectiveStatus === "stale") {
    return 0.45;
  }

  return 1;
}

function getCombinedSimilarity(candidate: RawCandidate) {
  const vectorSimilarity = candidate.vectorSimilarity ?? 0;
  const keywordSimilarity = candidate.keywordSimilarity ?? 0;

  if (candidate.vectorSimilarity !== null && candidate.keywordSimilarity !== null) {
    return clamp01((vectorSimilarity * 0.68) + (keywordSimilarity * 0.32));
  }

  return clamp01(Math.max(vectorSimilarity, keywordSimilarity));
}

function rerankCandidate(candidate: RawCandidate): RetrievedKnowledgeChunk {
  const rawSimilarity = getCombinedSimilarity(candidate);
  const importanceScore = getImportanceScore(candidate.importance);
  const recencyScore = getRecencyScore(candidate.updatedAt);
  const rawScore = clamp01(
    (rawSimilarity * SIMILARITY_WEIGHT)
    + (importanceScore * IMPORTANCE_WEIGHT)
    + (recencyScore * RECENCY_WEIGHT)
  ) * getLifecycleWeight(candidate);

  return {
    chunkId: candidate.chunkId,
    knowledgeItemId: candidate.knowledgeItemId,
    title: candidate.title,
    chunkText: candidate.chunkText,
    summary: candidate.summary,
    tags: candidate.tags,
    sourceType: candidate.sourceType,
    sourceTitle: candidate.sourceTitle,
    sourceUrl: candidate.sourceUrl,
    createdAt: toIsoString(candidate.createdAt),
    updatedAt: toIsoString(candidate.updatedAt),
    expiresAt: candidate.expiresAt ? toIsoString(candidate.expiresAt) : null,
    status: getEffectiveKnowledgeStatus(candidate.status, candidate.expiresAt),
    importance: candidate.importance,
    similarity: roundScore(rawSimilarity),
    score: roundScore(rawScore),
    vectorSimilarity: candidate.vectorSimilarity === null ? null : roundScore(candidate.vectorSimilarity),
    keywordSimilarity: candidate.keywordSimilarity === null ? null : roundScore(candidate.keywordSimilarity)
  };
}

async function vectorSearch(
  query: string,
  candidateLimit: number,
  userId: string,
  requestId?: string
): Promise<RawCandidate[]> {
  const { createEmbedding } = await import("@/lib/ai/embeddings");
  const { embedding } = await createEmbedding(query, {
    requestId,
    operation: "rag_query_embedding",
    userId
  });
  const vector = toVectorLiteral(embedding);

  const rows = await prisma.$queryRaw<VectorSearchRow[]>`
    SELECT
      kc."id" AS "chunkId",
      kc."knowledgeItemId" AS "knowledgeItemId",
      ki."title" AS "title",
      kc."chunkText" AS "chunkText",
      ki."summary" AS "summary",
      ki."tags" AS "tags",
      ki."sourceType" AS "sourceType",
      ki."sourceTitle" AS "sourceTitle",
      ki."sourceUrl" AS "sourceUrl",
      ki."createdAt" AS "createdAt",
      ki."updatedAt" AS "updatedAt",
      ki."expiresAt" AS "expiresAt",
      ki."status" AS "status",
      ki."importance" AS "importance",
      1 - (kc."embedding" <=> ${vector}::vector) AS "similarity"
    FROM "knowledge_chunks" kc
    INNER JOIN "knowledge_items" ki ON ki."id" = kc."knowledgeItemId"
    WHERE kc."embedding" IS NOT NULL
      AND ki."userId" = ${userId}
    ORDER BY kc."embedding" <=> ${vector}::vector
    LIMIT ${candidateLimit}
  `;

  return rows.map((row) => ({
    chunkId: row.chunkId,
    knowledgeItemId: row.knowledgeItemId,
    title: row.title,
    chunkText: row.chunkText,
    summary: row.summary,
    tags: row.tags,
    sourceType: row.sourceType,
    sourceTitle: row.sourceTitle,
    sourceUrl: row.sourceUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    expiresAt: row.expiresAt,
    status: row.status,
    importance: row.importance,
    vectorSimilarity: clamp01(row.similarity),
    keywordSimilarity: null
  }));
}

async function keywordSearch(query: string, candidateLimit: number, userId: string): Promise<RawCandidate[]> {
  const terms = extractSearchTerms(query);
  const textFilters = [query, ...terms].map((term) => ({
    OR: [
      { chunkText: { contains: term, mode: "insensitive" as const } },
      {
        knowledgeItem: {
          is: {
            OR: [
              { title: { contains: term, mode: "insensitive" as const } },
              { summary: { contains: term, mode: "insensitive" as const } },
              { content: { contains: term, mode: "insensitive" as const } },
              { tags: { has: term } }
            ]
          }
        }
      }
    ]
  }));
  const chunks = await prisma.knowledgeChunk.findMany({
    where: {
      knowledgeItem: {
        is: {
          userId
        }
      },
      OR: textFilters
    },
    orderBy: [
      {
        knowledgeItem: {
          importance: "desc"
        }
      },
      {
        knowledgeItem: {
          updatedAt: "desc"
        }
      }
    ],
    take: candidateLimit,
    include: {
      knowledgeItem: true
    }
  });

  return chunks
    .map((chunk) => {
      const keywordSimilarity = scoreKeywordResult(query, {
        title: chunk.knowledgeItem.title,
        summary: chunk.knowledgeItem.summary,
        chunkText: chunk.chunkText,
        tags: chunk.knowledgeItem.tags
      });

      return {
        chunkId: chunk.id,
        knowledgeItemId: chunk.knowledgeItemId,
        title: chunk.knowledgeItem.title,
        chunkText: chunk.chunkText,
        summary: chunk.knowledgeItem.summary,
        tags: chunk.knowledgeItem.tags,
        sourceType: chunk.knowledgeItem.sourceType,
        sourceTitle: chunk.knowledgeItem.sourceTitle,
        sourceUrl: chunk.knowledgeItem.sourceUrl,
        createdAt: chunk.knowledgeItem.createdAt,
        updatedAt: chunk.knowledgeItem.updatedAt,
        expiresAt: chunk.knowledgeItem.expiresAt,
        status: chunk.knowledgeItem.status,
        importance: chunk.knowledgeItem.importance,
        vectorSimilarity: null,
        keywordSimilarity
      };
    })
    .filter((candidate) => (candidate.keywordSimilarity ?? 0) > 0);
}

function mergeCandidates(vectorCandidates: RawCandidate[], keywordCandidates: RawCandidate[]) {
  const merged = new Map<string, RawCandidate>();

  for (const candidate of [...vectorCandidates, ...keywordCandidates]) {
    const existing = merged.get(candidate.chunkId);

    if (!existing) {
      merged.set(candidate.chunkId, candidate);
      continue;
    }

    merged.set(candidate.chunkId, {
      ...existing,
      vectorSimilarity: Math.max(existing.vectorSimilarity ?? 0, candidate.vectorSimilarity ?? 0) || null,
      keywordSimilarity: Math.max(existing.keywordSimilarity ?? 0, candidate.keywordSimilarity ?? 0) || null
    });
  }

  return Array.from(merged.values());
}

function getRetrievalMode(vectorCount: number, keywordCount: number): RetrievalMode {
  if (vectorCount > 0 && keywordCount > 0) {
    return "hybrid";
  }

  if (vectorCount > 0) {
    return "vector";
  }

  return "keyword";
}

function buildMessage(resultsCount: number, topK: number, minResults: number) {
  if (resultsCount < minResults) {
    return "知识库中没有找到足够依据。可以换个问法，或先补充相关知识。";
  }

  if (resultsCount < topK) {
    return `只找到 ${resultsCount} 条达到相似度阈值的相关知识，少于请求的 ${topK} 条。`;
  }

  return null;
}

export async function retrieveKnowledge(options: RetrieveKnowledgeOptions): Promise<RetrieveKnowledgeResponse> {
  const query = options.query.trim();

  if (!query) {
    throw new Error("query is required and cannot be empty.");
  }

  const topK = normalizeTopK(options.topK);
  const candidateLimit = Math.max(topK * CANDIDATE_MULTIPLIER, topK);
  const minSimilarity = typeof options.minSimilarity === "number"
    ? clamp01(options.minSimilarity)
    : DEFAULT_MIN_SIMILARITY;
  const minResults = typeof options.minResults === "number" && options.minResults > 0
    ? Math.min(Math.round(options.minResults), topK)
    : 1;
  const startedAt = Date.now();

  let vectorCandidates: RawCandidate[] = [];
  let vectorSearchFailed = false;

  if (hasUsableOpenAIKey()) {
    try {
      vectorCandidates = await vectorSearch(query, candidateLimit, options.userId, options.requestId);
    } catch {
      vectorSearchFailed = true;
      vectorCandidates = [];
    }
  } else if (!isAIFallbackAllowed()) {
    throw new AIError("生产环境必须配置真实 OPENAI_API_KEY，不能降级为关键词检索。");
  }

  if (vectorSearchFailed && !isAIFallbackAllowed()) {
    throw new AIError("生产环境向量检索失败，不能降级为关键词检索。");
  }

  const keywordCandidates = await keywordSearch(query, candidateLimit, options.userId);
  const mode = getRetrievalMode(vectorCandidates.length, keywordCandidates.length);
  const mergedCandidates = mergeCandidates(vectorCandidates, keywordCandidates);
  const rerankedCandidates = mergedCandidates
    .map(rerankCandidate)
    .filter((candidate) => candidate.similarity >= minSimilarity)
    .sort((left, right) => right.score - left.score);
  const results = rerankedCandidates.slice(0, topK);
  const message = buildMessage(results.length, topK, minResults);
  const similarities = results.map((result) => result.similarity);

  logger.info("rag.retrieval", {
    requestId: options.requestId,
    mode,
    topK,
    minSimilarity,
    minResults,
    durationMs: Date.now() - startedAt,
    hitCount: results.length,
    totalCandidates: mergedCandidates.length,
    filteredCandidates: rerankedCandidates.length,
    vectorCandidateCount: vectorCandidates.length,
    keywordCandidateCount: keywordCandidates.length,
    vectorSearchFailed,
    insufficient: results.length < minResults,
    maxSimilarity: similarities.length > 0 ? Math.max(...similarities) : null,
    minResultSimilarity: similarities.length > 0 ? Math.min(...similarities) : null,
    avgSimilarity: similarities.length > 0
      ? Math.round((similarities.reduce((sum, value) => sum + value, 0) / similarities.length) * 10000) / 10000
      : null
  });
  await recordAnalyticsEvent({
    userId: options.userId,
    type: AnalyticsEventType.RAG_RETRIEVAL,
    numericValue: results.length,
    metadata: {
      requestId: options.requestId,
      mode,
      topK,
      minSimilarity,
      minResults,
      durationMs: Date.now() - startedAt,
      hitCount: results.length,
      totalCandidates: mergedCandidates.length,
      filteredCandidates: rerankedCandidates.length,
      vectorCandidateCount: vectorCandidates.length,
      keywordCandidateCount: keywordCandidates.length,
      vectorSearchFailed,
      insufficient: results.length < minResults,
      maxSimilarity: similarities.length > 0 ? Math.max(...similarities) : null,
      minResultSimilarity: similarities.length > 0 ? Math.min(...similarities) : null,
      avgSimilarity: similarities.length > 0
        ? Math.round((similarities.reduce((sum, value) => sum + value, 0) / similarities.length) * 10000) / 10000
        : null
    }
  });

  return {
    results,
    mode,
    insufficient: results.length < minResults,
    message,
    totalCandidates: mergedCandidates.length,
    filteredCandidates: rerankedCandidates.length
  };
}
