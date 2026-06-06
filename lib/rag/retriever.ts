import "server-only";

import { prisma } from "@/lib/prisma";
import { AnalyticsEventType, recordAnalyticsEvent } from "@/lib/analytics";
import { getEffectiveKnowledgeStatus } from "@/lib/knowledge/status";
import {
  CHAT_MIN_RELEVANT_SIMILARITY,
  RAG_ENABLE_RERANK,
  SEARCH_DEFAULT_TOP_K,
  SEARCH_MAX_TOP_K,
  hasUsableOpenAIKey
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
  "有哪些",
  "我",
  "你",
  "他",
  "她",
  "它",
  "我们",
  "他们",
  "应该",
  "一下"
]);

const DEFAULT_MIN_SIMILARITY = CHAT_MIN_RELEVANT_SIMILARITY;
const DEFAULT_MIN_RESULTS = 3;
const CANDIDATE_MULTIPLIER = 4;
const MIN_CANDIDATE_LIMIT = 40;
const RELAXED_MIN_SIMILARITY = 0.18;
const KEYWORD_FALLBACK_MIN_SIMILARITY = 0.05;
const SIMILARITY_WEIGHT = 0.74;
const IMPORTANCE_WEIGHT = 0.14;
const RECENCY_WEIGHT = 0.12;
const RECENCY_HALF_LIFE_DAYS = 90;

export type RetrievalMode = "hybrid" | "vector" | "keyword";
export type RetrievalAnswerMode = "none" | "partial" | "full";
export type RetrievalIntentType =
  | "policy_explanation"
  | "business_script"
  | "customer_objection"
  | "product_knowledge"
  | "operation_process"
  | "team_management"
  | "sales_communication"
  | "policy_boundary"
  | "other";

export interface RetrievalIntent {
  type: RetrievalIntentType;
  label: string;
}

export interface RetrievedKnowledgeChunk {
  chunkId: string;
  knowledgeItemId: string;
  title: string;
  chunkText: string;
  summary: string;
  tags: string[];
  category: string;
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
  answerMode: RetrievalAnswerMode;
  confidence: number;
  message: string | null;
  totalCandidates: number;
  filteredCandidates: number;
  queries: string[];
  intent: RetrievalIntent;
  suggestedKnowledgeTypes: string[];
  relaxedRetrievalUsed: boolean;
  keywordFallbackUsed: boolean;
}

type RawCandidate = {
  chunkId: string;
  knowledgeItemId: string;
  title: string;
  chunkText: string;
  summary: string;
  tags: string[];
  category: string;
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
  category: string;
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

type SearchRun = {
  vectorCandidates: RawCandidate[];
  keywordCandidates: RawCandidate[];
  mergedCandidates: RawCandidate[];
  rerankedCandidates: RetrievedKnowledgeChunk[];
  results: RetrievedKnowledgeChunk[];
  mode: RetrievalMode;
  vectorSearchFailed: boolean;
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

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^0-9a-zA-Z\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function addChineseNgrams(segment: string, terms: Set<string>) {
  const maxLength = Math.min(6, segment.length);

  for (let size = 2; size <= maxLength; size += 1) {
    for (let index = 0; index <= segment.length - size; index += 1) {
      const term = segment.slice(index, index + size);

      if (!STOP_TERMS.has(term)) {
        terms.add(term);
      }
    }
  }
}

function getSearchTermPriority(term: string) {
  if (/联创|合伙人|梦想家园|资格|条件|要求|话术|禁止|不能|不得|边界/.test(term)) {
    return 3;
  }

  if (/客户|伙伴|新人|制度|政策|计划|领导人|讲师|提成|收益|沟通/.test(term)) {
    return 2;
  }

  if (term.length >= 4) {
    return 1;
  }

  return 0;
}

export function extractSearchTerms(query: string, maxTerms = 16) {
  const normalized = normalizeText(query);
  const terms = new Set<string>();

  for (const segment of normalized.split(/\s+/).filter(Boolean)) {
    if (segment.length >= 2 && !STOP_TERMS.has(segment)) {
      terms.add(segment);
    }

    if (/[\u4e00-\u9fff]/.test(segment)) {
      addChineseNgrams(segment, terms);
    }
  }

  return Array.from(terms)
    .sort((left, right) => {
      const priorityGap = getSearchTermPriority(right) - getSearchTermPriority(left);

      return priorityGap !== 0 ? priorityGap : right.length - left.length;
    })
    .slice(0, maxTerms);
}

function inferIntent(query: string): RetrievalIntent {
  const normalized = normalizeText(query);

  if (/异议|质疑|反对|顾虑|不愿意|担心/.test(normalized)) {
    return { type: "customer_objection", label: "客户异议" };
  }

  if (/话术|怎么说|如何说|回复|沟通|新伙伴|客户问|客户说/.test(normalized)) {
    return { type: "business_script", label: "业务话术" };
  }

  if (/销售|提成|成交|转化|邀约|跟进/.test(normalized)) {
    return { type: "sales_communication", label: "销售沟通" };
  }

  if (/资格|条件|要求|权限|制度|政策|合伙人|能不能|可以说|不能说|禁止/.test(normalized)) {
    return /不能|禁止|边界|公开|承诺/.test(normalized)
      ? { type: "policy_boundary", label: "政策边界" }
      : { type: "policy_explanation", label: "制度解释" };
  }

  if (/产品|功能|规格|价格|版本|服务/.test(normalized)) {
    return { type: "product_knowledge", label: "产品知识" };
  }

  if (/流程|步骤|操作|怎么做|办理|提交|审批/.test(normalized)) {
    return { type: "operation_process", label: "操作流程" };
  }

  if (/团队|管理|培训|考核|领导人|讲师/.test(normalized)) {
    return { type: "team_management", label: "团队管理" };
  }

  return { type: "other", label: "其他" };
}

function compactQuery(query: string) {
  return normalizeText(query)
    .split(/\s+/)
    .filter((term) => !STOP_TERMS.has(term))
    .join(" ")
    .trim();
}

function buildSearchQueries(query: string, intent: RetrievalIntent) {
  const normalizedQuestion = query.trim();
  const terms = extractSearchTerms(query, 8);
  const coreTerms = terms.slice(0, 5).join(" ");
  const titleTerms = terms.filter((term) => term.length >= 3).slice(0, 3).join(" ");
  const compacted = compactQuery(query);
  const queries = [
    normalizedQuestion,
    coreTerms,
    titleTerms || compacted
  ];

  if (intent.type === "business_script" || intent.type === "sales_communication" || intent.type === "customer_objection") {
    queries.push(`${titleTerms || coreTerms} 沟通 话术 注意事项 不能说 推荐表达`.trim());
  } else if (intent.type === "policy_explanation" || intent.type === "policy_boundary") {
    queries.push(`${titleTerms || coreTerms} 资格 条件 要求 适用对象 禁止 需要确认`.trim());
  } else if (intent.type === "operation_process") {
    queries.push(`${titleTerms || coreTerms} 流程 步骤 操作 注意事项`.trim());
  } else if (intent.type === "product_knowledge") {
    queries.push(`${titleTerms || coreTerms} 产品 介绍 规则 场景`.trim());
  } else {
    queries.push(`${titleTerms || coreTerms} 规则 场景 建议`.trim());
  }

  if (terms.length > 0) {
    queries.push(terms.slice(0, 3).join(" "));
  }

  return Array.from(new Set(queries.map((item) => item.replace(/\s+/g, " ").trim()).filter(Boolean))).slice(0, 5);
}

function fieldIncludes(field: string | null | undefined, needle: string) {
  return Boolean(field && needle && field.toLowerCase().includes(needle.toLowerCase()));
}

function tagIncludes(tags: string[], needle: string) {
  const normalizedNeedle = needle.toLowerCase();

  return tags.some((tag) => tag.toLowerCase().includes(normalizedNeedle));
}

function scoreKeywordResult(
  query: string,
  item: {
    title: string;
    summary: string;
    chunkText: string;
    content?: string;
    tags: string[];
    category: string;
    sourceTitle: string | null;
  }
) {
  const normalizedQuery = normalizeText(query);
  const terms = extractSearchTerms(query);
  let score = 0;

  if (fieldIncludes(item.title, normalizedQuery)) {
    score += 0.38;
  }

  if (fieldIncludes(item.sourceTitle, normalizedQuery)) {
    score += 0.16;
  }

  if (fieldIncludes(item.category, normalizedQuery)) {
    score += 0.14;
  }

  if (fieldIncludes(item.summary, normalizedQuery)) {
    score += 0.22;
  }

  if (fieldIncludes(item.chunkText, normalizedQuery)) {
    score += 0.28;
  }

  if (item.content && fieldIncludes(item.content, normalizedQuery)) {
    score += 0.18;
  }

  if (tagIncludes(item.tags, normalizedQuery)) {
    score += 0.18;
  }

  for (const term of terms) {
    if (fieldIncludes(item.title, term)) {
      score += 0.08;
    }

    if (fieldIncludes(item.sourceTitle, term)) {
      score += 0.05;
    }

    if (fieldIncludes(item.category, term)) {
      score += 0.05;
    }

    if (fieldIncludes(item.summary, term)) {
      score += 0.05;
    }

    if (fieldIncludes(item.chunkText, term)) {
      score += 0.06;
    }

    if (item.content && fieldIncludes(item.content, term)) {
      score += 0.04;
    }

    if (tagIncludes(item.tags, term)) {
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
    return 0.55;
  }

  return 1;
}

function getCombinedSimilarity(candidate: RawCandidate) {
  const vectorSimilarity = candidate.vectorSimilarity ?? 0;
  const keywordSimilarity = candidate.keywordSimilarity ?? 0;

  if (candidate.vectorSimilarity !== null && candidate.keywordSimilarity !== null) {
    return clamp01((vectorSimilarity * 0.62) + (keywordSimilarity * 0.38));
  }

  return clamp01(Math.max(vectorSimilarity, keywordSimilarity));
}

function rerankCandidate(candidate: RawCandidate): RetrievedKnowledgeChunk {
  const rawSimilarity = getCombinedSimilarity(candidate);
  const importanceScore = getImportanceScore(candidate.importance);
  const recencyScore = getRecencyScore(candidate.updatedAt);
  const rawScore = RAG_ENABLE_RERANK
    ? clamp01(
      (rawSimilarity * SIMILARITY_WEIGHT)
      + (importanceScore * IMPORTANCE_WEIGHT)
      + (recencyScore * RECENCY_WEIGHT)
    ) * getLifecycleWeight(candidate)
    : rawSimilarity;

  return {
    chunkId: candidate.chunkId,
    knowledgeItemId: candidate.knowledgeItemId,
    title: candidate.title,
    chunkText: candidate.chunkText,
    summary: candidate.summary,
    tags: candidate.tags,
    category: candidate.category,
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
      ki."category" AS "category",
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
      AND ki."deleted_at" IS NULL
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
    category: row.category,
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

function buildKeywordFilters(query: string) {
  const terms = Array.from(new Set([query.trim(), ...extractSearchTerms(query)])).filter(Boolean);

  return terms.map((term) => ({
    OR: [
      { chunkText: { contains: term, mode: "insensitive" as const } },
      {
        knowledgeItem: {
          is: {
            OR: [
              { title: { contains: term, mode: "insensitive" as const } },
              { summary: { contains: term, mode: "insensitive" as const } },
              { content: { contains: term, mode: "insensitive" as const } },
              { category: { contains: term, mode: "insensitive" as const } },
              { sourceTitle: { contains: term, mode: "insensitive" as const } },
              { tags: { has: term } }
            ]
          }
        }
      }
    ]
  }));
}

async function keywordSearch(query: string, candidateLimit: number, userId: string): Promise<RawCandidate[]> {
  const textFilters = buildKeywordFilters(query);

  if (textFilters.length === 0) {
    return [];
  }

  const chunks = await prisma.knowledgeChunk.findMany({
    where: {
      knowledgeItem: {
        is: {
          userId,
          deletedAt: null
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
        content: chunk.knowledgeItem.content,
        tags: chunk.knowledgeItem.tags,
        category: chunk.knowledgeItem.category,
        sourceTitle: chunk.knowledgeItem.sourceTitle
      });

      return {
        chunkId: chunk.id,
        knowledgeItemId: chunk.knowledgeItemId,
        title: chunk.knowledgeItem.title,
        chunkText: chunk.chunkText,
        summary: chunk.knowledgeItem.summary,
        tags: chunk.knowledgeItem.tags,
        category: chunk.knowledgeItem.category,
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

async function hasIndexedEmbeddings(userId: string) {
  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS "count"
    FROM "knowledge_chunks" kc
    INNER JOIN "knowledge_items" ki ON ki."id" = kc."knowledgeItemId"
    WHERE ki."userId" = ${userId}
      AND ki."deleted_at" IS NULL
      AND kc."embedding" IS NOT NULL
  `;

  return (rows[0]?.count ?? 0) > 0;
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

async function runSearch(
  queries: string[],
  candidateLimit: number,
  topK: number,
  minSimilarity: number,
  userId: string,
  requestId?: string,
  options: { vectorEnabled?: boolean } = {}
): Promise<SearchRun> {
  const vectorEnabled = options.vectorEnabled ?? hasUsableOpenAIKey();
  const vectorCandidates: RawCandidate[] = [];
  const keywordCandidates: RawCandidate[] = [];
  let vectorSearchFailed = false;

  for (const query of queries) {
    if (vectorEnabled) {
      try {
        vectorCandidates.push(...await vectorSearch(query, candidateLimit, userId, requestId));
      } catch {
        vectorSearchFailed = true;
      }
    }

    keywordCandidates.push(...await keywordSearch(query, candidateLimit, userId));
  }

  const mergedCandidates = mergeCandidates(vectorCandidates, keywordCandidates);
  const rerankedCandidates = mergedCandidates
    .map(rerankCandidate)
    .filter((candidate) => candidate.similarity >= minSimilarity)
    .sort((left, right) => right.score - left.score);

  return {
    vectorCandidates,
    keywordCandidates,
    mergedCandidates,
    rerankedCandidates,
    results: rerankedCandidates.slice(0, topK),
    mode: getRetrievalMode(vectorCandidates.length, keywordCandidates.length),
    vectorSearchFailed
  };
}

function chooseBetterRun(current: SearchRun, next: SearchRun) {
  if (next.results.length > current.results.length) {
    return next;
  }

  const currentBestScore = current.results[0]?.score ?? 0;
  const nextBestScore = next.results[0]?.score ?? 0;

  return nextBestScore > currentBestScore ? next : current;
}

function calculateConfidence(results: RetrievedKnowledgeChunk[]) {
  if (results.length === 0) {
    return 0;
  }

  const top = results[0]?.score ?? 0;
  const topThree = results.slice(0, 3);
  const averageSimilarity = topThree.reduce((sum, result) => sum + result.similarity, 0) / topThree.length;
  const coverage = Math.min(results.length / DEFAULT_MIN_RESULTS, 1);

  return roundScore((top * 0.42) + (averageSimilarity * 0.38) + (coverage * 0.2));
}

function getAnswerMode(results: RetrievedKnowledgeChunk[], confidence: number): RetrievalAnswerMode {
  if (results.length === 0) {
    return "none";
  }

  if (results.length < DEFAULT_MIN_RESULTS || confidence < 0.55) {
    return "partial";
  }

  return "full";
}

function getSuggestedKnowledgeTypes(intent: RetrievalIntent) {
  if (intent.type === "business_script" || intent.type === "sales_communication" || intent.type === "customer_objection") {
    return ["标准沟通话术", "客户异议处理案例", "禁止承诺边界", "可复制示例对话"];
  }

  if (intent.type === "policy_explanation" || intent.type === "policy_boundary") {
    return ["完整制度原文", "资格条件清单", "可以说/不能说边界", "审批或确认流程"];
  }

  if (intent.type === "operation_process") {
    return ["操作步骤", "流程负责人", "异常处理方式", "常见问答"];
  }

  if (intent.type === "product_knowledge") {
    return ["产品说明", "适用场景", "价格或权益边界", "常见问答"];
  }

  return ["背景场景", "核心结论", "适用对象", "注意事项"];
}

function buildMessage(
  resultsCount: number,
  answerMode: RetrievalAnswerMode,
  totalCandidates: number,
  usedCount: number,
  suggestedKnowledgeTypes: string[]
) {
  if (answerMode === "none") {
    return `目前知识库里还没有找到和这个问题直接相关的资料。建议补充：${suggestedKnowledgeTypes.join("、")}。`;
  }

  if (answerMode === "partial") {
    return `已找到 ${totalCandidates} 条相关候选知识，其中 ${usedCount} 条用于回答；依据还不完整，将按当前资料谨慎整理。`;
  }

  return `已找到 ${totalCandidates} 条相关候选知识，其中 ${resultsCount} 条用于回答。`;
}

export async function retrieveKnowledge(options: RetrieveKnowledgeOptions): Promise<RetrieveKnowledgeResponse> {
  const query = options.query.trim();

  if (!query) {
    throw new Error("query is required and cannot be empty.");
  }

  const topK = normalizeTopK(options.topK);
  const candidateLimit = Math.max(topK * CANDIDATE_MULTIPLIER, topK, MIN_CANDIDATE_LIMIT);
  const minSimilarity = typeof options.minSimilarity === "number"
    ? clamp01(options.minSimilarity)
    : DEFAULT_MIN_SIMILARITY;
  const minResults = typeof options.minResults === "number" && options.minResults > 0
    ? Math.min(Math.round(options.minResults), topK)
    : DEFAULT_MIN_RESULTS;
  const intent = inferIntent(query);
  const queries = buildSearchQueries(query, intent);
  const vectorEnabled = hasUsableOpenAIKey() && await hasIndexedEmbeddings(options.userId);
  const startedAt = Date.now();

  let selectedRun = await runSearch(
    queries,
    candidateLimit,
    topK,
    minSimilarity,
    options.userId,
    options.requestId,
    { vectorEnabled }
  );
  let relaxedRetrievalUsed = false;
  let keywordFallbackUsed = false;

  if (selectedRun.results.length < Math.max(DEFAULT_MIN_RESULTS, minResults)) {
    const relaxedThreshold = Math.max(RELAXED_MIN_SIMILARITY, minSimilarity * 0.65);
    const relaxedRun = await runSearch(
      queries,
      candidateLimit * 2,
      topK,
      relaxedThreshold,
      options.userId,
      options.requestId,
      { vectorEnabled }
    );

    relaxedRetrievalUsed = true;
    selectedRun = chooseBetterRun(selectedRun, relaxedRun);
  }

  if (selectedRun.results.length === 0) {
    const keywordRun = await runSearch(
      queries,
      candidateLimit * 2,
      topK,
      KEYWORD_FALLBACK_MIN_SIMILARITY,
      options.userId,
      options.requestId,
      { vectorEnabled: false }
    );

    keywordFallbackUsed = true;
    selectedRun = chooseBetterRun(selectedRun, keywordRun);
  }

  const results = selectedRun.results;
  const confidence = calculateConfidence(results);
  const answerMode = getAnswerMode(results, confidence);
  const suggestedKnowledgeTypes = getSuggestedKnowledgeTypes(intent);
  const message = buildMessage(
    results.length,
    answerMode,
    selectedRun.mergedCandidates.length,
    results.length,
    suggestedKnowledgeTypes
  );
  const similarities = results.map((result) => result.similarity);
  const durationMs = Date.now() - startedAt;

  logger.info("rag.retrieval", {
    requestId: options.requestId,
    mode: selectedRun.mode,
    topK,
    minSimilarity,
    minResults,
    durationMs,
    hitCount: results.length,
    totalCandidates: selectedRun.mergedCandidates.length,
    filteredCandidates: selectedRun.rerankedCandidates.length,
    vectorCandidateCount: selectedRun.vectorCandidates.length,
    keywordCandidateCount: selectedRun.keywordCandidates.length,
    vectorSearchFailed: selectedRun.vectorSearchFailed,
    insufficient: answerMode === "none",
    answerMode,
    confidence,
    intent: intent.type,
    queries,
    relaxedRetrievalUsed,
    keywordFallbackUsed,
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
      mode: selectedRun.mode,
      topK,
      minSimilarity,
      minResults,
      durationMs,
      hitCount: results.length,
      totalCandidates: selectedRun.mergedCandidates.length,
      filteredCandidates: selectedRun.rerankedCandidates.length,
      vectorCandidateCount: selectedRun.vectorCandidates.length,
      keywordCandidateCount: selectedRun.keywordCandidates.length,
      vectorSearchFailed: selectedRun.vectorSearchFailed,
      insufficient: answerMode === "none",
      answerMode,
      confidence,
      intent: intent.type,
      queries,
      relaxedRetrievalUsed,
      keywordFallbackUsed,
      maxSimilarity: similarities.length > 0 ? Math.max(...similarities) : null,
      minResultSimilarity: similarities.length > 0 ? Math.min(...similarities) : null,
      avgSimilarity: similarities.length > 0
        ? Math.round((similarities.reduce((sum, value) => sum + value, 0) / similarities.length) * 10000) / 10000
        : null
    }
  });

  return {
    results,
    mode: selectedRun.mode,
    insufficient: answerMode === "none",
    answerMode,
    confidence,
    message,
    totalCandidates: selectedRun.mergedCandidates.length,
    filteredCandidates: selectedRun.rerankedCandidates.length,
    queries,
    intent,
    suggestedKnowledgeTypes,
    relaxedRetrievalUsed,
    keywordFallbackUsed
  };
}
