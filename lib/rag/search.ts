import type { RagContext } from "@/lib/ai/rag-prompt";
import {
  buildKnowledgeChunkAccessWhere,
  resolveKnowledgeAccessScope
} from "@/lib/enterprise/knowledge-access-scope";
import {
  buildFeedbackRankingBoost,
  buildPolicyDiagnostics,
  candidatePassesGovernance,
  applyPolicyRankingAdjustment,
  readKnowledgeGovernanceMetadata,
  type KnowledgeGovernanceControls
} from "@/lib/enterprise/knowledge-governance";
import { calculateFeedbackAwareRankingScore } from "@/lib/enterprise/knowledge-feedback-ranking";
import { analyzeKnowledgeOptimization } from "@/lib/enterprise/knowledge-self-optimization-engine";
import { ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

export type AiChatMode = "fast" | "expert";
export type RagConfidence = "high" | "medium" | "low";

export interface RetrievedRagChunk {
  chunkId: string;
  fileId: string | null;
  knowledgeItemId: string;
  knowledgeBaseId: string | null;
  agentId: string | null;
  tenantId: string | null;
  namespace: string | null;
  sourceApp: string | null;
  includeShared: boolean;
  includePublished: boolean;
  title: string;
  content: string;
  summary: string | null;
  category: string | null;
  tags: string[];
  sourceType: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
  score: number;
  relevance_score: number;
  qualityScore: number | null;
  feedbackScore: number;
  behaviorScore: number;
  behaviorEventCount: number;
  behaviorReasons: string[];
  usageScore: number;
  freshnessScore: number;
  optimizationScore: number;
  stabilityScore: number;
  confidenceWeight: number;
  trustWeight: number;
  volatilityPenalty: number;
  stableOptimizationScore: number;
  trendScore: number;
  trendLabel: string;
  trendConfidence: number;
  staleRisk: number;
  fastRising: boolean;
  staleHighScore: boolean;
  decliningTrend: boolean;
  evergreen: boolean;
  trendReason: string;
  trendShadowMode: boolean;
  lifecycleStage: string;
  lifecycleScore: number;
  lifecycleConfidence: number;
  lifecycleReason: string;
  lifecycleSuggestion: string;
  shouldBoost: boolean;
  shouldDecay: boolean;
  shouldReview: boolean;
  shouldArchiveCandidate: boolean;
  policyDecision: string;
  policyScore: number;
  policyRiskLevel: string;
  policyConfidence: number;
  policySuggestion: string;
  sampleCount: number;
  suspectedGaming: boolean;
  optimizationReason: string;
  optimizationSuggestion: string;
  duplicateLikely: boolean;
  duplicateGroupKey?: string;
  coldKnowledge: boolean;
  conflictLikely: boolean;
  staleVersion: boolean;
  knowledgeVersion: string | null;
  lowQuality: boolean;
  highValue: boolean;
  matchedBy: "kb_id" | "expert_id" | "namespace" | "shared_public" | "none";
  chunk_rank: number;
  createdAt: string | null;
}

export interface RetrieveRelevantChunksOptions {
  userId: string;
  tenantId?: string | null;
  appType?: string | null;
  agentId?: string | null;
  knowledgeBaseId?: string | null;
  namespace?: string | null;
  knowledgeVersion?: string | number | null;
  minQualityScore?: number | null;
  includeLowQuality?: boolean;
  includeShared?: boolean;
  includePublished?: boolean;
  mode?: AiChatMode;
  topK?: number;
  category?: string | null;
  fileId?: string | null;
  knowledgeScope?: {
    knowledgeBaseId?: string | null;
    agentId?: string | null;
    tenantId?: string | null;
    namespace?: string | null;
  } | null;
  allowScopedFallback?: boolean;
  db?: RagSearchDb;
}

type KnowledgeChunkRecord = Record<string, unknown> & {
  id?: string;
  fileId?: string | null;
  knowledgeItemId?: string;
  chunkText?: string;
  summary?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date | string;
  knowledgeItem?: Record<string, unknown>;
  file?: Record<string, unknown> | null;
};

export type RagSearchDb = {
  knowledgeChunk: {
    findMany(args: unknown): Promise<KnowledgeChunkRecord[]>;
  };
};

const MAX_QUESTION_CHARS = 2000;
const FAST_TOP_K = 5;
const EXPERT_TOP_K = 10;
const MAX_TOP_K = 20;
const MIN_RELEVANT_SCORE = 0.08;
const SHARED_INGEST_SOURCE_APPS = ["ingest_admin", "admin_ingest", "admin_feed", "public", "shared", "published"];
const SHARED_INGEST_VISIBILITIES = ["published", "shared"];

const STOP_TERMS = new Set([
  "什么",
  "哪些",
  "怎么",
  "如何",
  "需要",
  "可以",
  "是否",
  "以及",
  "这个",
  "那个",
  "问题",
  "内容",
  "我们",
  "你们"
]);

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions?/i,
  /disregard\s+(all\s+)?previous\s+instructions?/i,
  /reveal\s+(the\s+)?(system|developer)\s+prompt/i,
  /泄露.*(系统提示|开发者指令|api\s*key|密钥|数据库连接)/i,
  /输出.*(系统提示|开发者指令|api\s*key|密钥|数据库连接)/i,
  /忽略.*(之前|以上|系统).*(指令|规则)/i
];

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/\u0000/g, "")
    .replace(/[^0-9a-zA-Z\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function addChineseTerms(segment: string, terms: Set<string>) {
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

export function normalizeAiChatMode(value: unknown): AiChatMode {
  return value === "expert" ? "expert" : "fast";
}

export function getTopKForMode(mode: AiChatMode) {
  return mode === "expert" ? EXPERT_TOP_K : FAST_TOP_K;
}

export function sanitizeRagInput(question: unknown) {
  const normalized = typeof question === "string"
    ? question.replace(/\u0000/g, "").replace(/\s+/g, " ").trim()
    : "";

  if (!normalized) {
    throw new ValidationError("请输入问题。");
  }

  if (normalized.length > MAX_QUESTION_CHARS) {
    throw new ValidationError(`问题过长，请控制在 ${MAX_QUESTION_CHARS} 字以内。`);
  }

  return normalized;
}

export function hasPromptInjectionRisk(value: string) {
  return PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(value));
}

export function guardAgainstPromptInjection(context: string) {
  return context
    .replace(/\u0000/g, "")
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();

      return hasPromptInjectionRisk(trimmed) ? "[已忽略上下文中的不可信指令]" : line;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractRagSearchTerms(query: string, maxTerms = 18) {
  const normalized = normalizeText(query);
  const terms = new Set<string>();

  for (const segment of normalized.split(/\s+/).filter(Boolean)) {
    if (segment.length >= 2 && !STOP_TERMS.has(segment)) {
      terms.add(segment);
    }

    if (/[\u4e00-\u9fff]/.test(segment)) {
      addChineseTerms(segment, terms);
    }
  }

  return Array.from(terms).slice(0, maxTerms);
}

function normalizeTopK(options: RetrieveRelevantChunksOptions) {
  const fallback = getTopKForMode(options.mode ?? "fast");
  const rawTopK = typeof options.topK === "number" ? Math.round(options.topK) : fallback;

  if (!Number.isInteger(rawTopK) || rawTopK < 1) {
    return fallback;
  }

  return Math.min(rawTopK, MAX_TOP_K);
}

function toStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function toIsoString(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return typeof value === "string" && value ? new Date(value).toISOString() : null;
}

function fieldScore(value: unknown, query: string, terms: string[], exactWeight: number, termWeight: number) {
  const text = normalizeText(typeof value === "string" ? value : "");

  if (!text) {
    return 0;
  }

  let score = text.includes(normalizeText(query)) ? exactWeight : 0;

  for (const term of terms) {
    if (term && text.includes(term.toLowerCase())) {
      score += termWeight;
    }
  }

  return score;
}

function extractExplicitIdentifiers(query: string) {
  return Array.from(query.matchAll(/[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+){2,}/g))
    .map((match) => match[0].toLowerCase())
    .filter((value, index, values) => value.length >= 8 && values.indexOf(value) === index);
}

function hasExplicitIdentifierMatch(row: KnowledgeChunkRecord, query: string) {
  const item = row.knowledgeItem ?? {};
  const identifiers = extractExplicitIdentifiers(query);

  if (identifiers.length === 0) {
    return false;
  }

  const haystack = [
    row.chunkText,
    row.summary,
    item.title,
    item.summary,
    item.sourceTitle
  ]
    .map((value) => typeof value === "string" ? value.toLowerCase() : "")
    .join(" ");

  return identifiers.some((identifier) => haystack.includes(identifier));
}

function identifierScore(row: KnowledgeChunkRecord, query: string) {
  return hasExplicitIdentifierMatch(row, query) ? 0.36 : 0;
}

function scoreChunk(row: KnowledgeChunkRecord, query: string, terms: string[]) {
  const item = row.knowledgeItem ?? {};
  const tags = toStringArray(item.tags);
  let score = 0;

  score += identifierScore(row, query);
  score += fieldScore(row.chunkText, query, terms, 0.44, 0.08);
  score += fieldScore(row.summary, query, terms, 0.2, 0.04);
  score += fieldScore(item.title, query, terms, 0.28, 0.06);
  score += fieldScore(item.summary, query, terms, 0.18, 0.04);
  score += fieldScore(item.category, query, terms, 0.14, 0.03);
  score += fieldScore(item.sourceTitle, query, terms, 0.12, 0.03);

  for (const tag of tags) {
    score += fieldScore(tag, query, terms, 0.08, 0.02);
  }

  return clamp01(score);
}

function metadataEqualsAny(path: string, values: string[]) {
  return values.map((value) => ({
    metadata: {
      path: [path],
      equals: value
    }
  }));
}

function cleanScopeValue(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 120) : "";
}

function hasKnowledgeScope(options: RetrieveRelevantChunksOptions) {
  const scope = options.knowledgeScope;

  return Boolean(
    cleanScopeValue(scope?.knowledgeBaseId)
    || cleanScopeValue(scope?.agentId)
    || cleanScopeValue(scope?.tenantId)
    || cleanScopeValue(scope?.namespace)
  );
}

function metadataEqualsAnyPath(paths: string[], value: string) {
  return {
    OR: paths.map((path) => ({
      metadata: {
        path: [path],
        equals: value
      }
    }))
  };
}

function buildKnowledgeScopeWhere(options: RetrieveRelevantChunksOptions) {
  const scope = options.knowledgeScope;

  if (!scope) {
    return [];
  }

  const knowledgeBaseId = cleanScopeValue(scope.knowledgeBaseId);
  const agentId = cleanScopeValue(scope.agentId);
  const tenantId = cleanScopeValue(scope.tenantId);
  const namespace = cleanScopeValue(scope.namespace);
  const hasExplicitKnowledgeTarget = Boolean(knowledgeBaseId || agentId);
  const filters = [];

  if (knowledgeBaseId) {
    filters.push(metadataEqualsAnyPath(["knowledgeBaseId", "knowledge_base_id", "kb_id", "kbId"], knowledgeBaseId));
  }

  if (agentId) {
    filters.push(metadataEqualsAnyPath(["agentId", "agent_id", "expert_id", "expertId"], agentId));
  }

  if (tenantId && !hasExplicitKnowledgeTarget) {
    filters.push(metadataEqualsAnyPath(["tenantId", "tenant_id"], tenantId));
  }

  if (namespace && namespace !== tenantId && !hasExplicitKnowledgeTarget) {
    filters.push(metadataEqualsAnyPath(["namespace"], namespace));
  }

  return filters;
}

function buildSharedIngestKnowledgeWhere(options: RetrieveRelevantChunksOptions) {
  return {
    AND: [
      ...buildKnowledgeScopeWhere(options),
      {
        OR: [
          ...metadataEqualsAny("sourceApp", SHARED_INGEST_SOURCE_APPS),
          ...metadataEqualsAny("source", SHARED_INGEST_SOURCE_APPS)
        ]
      },
      {
        OR: [
          {
            metadata: {
              path: ["sharedToUserApp"],
              equals: true
            }
          },
          {
            metadata: {
              path: ["published"],
              equals: true
            }
          },
          ...metadataEqualsAny("visibility", SHARED_INGEST_VISIBILITIES)
        ]
      },
      {
        knowledgeItem: {
          is: {
            deletedAt: null,
            status: {
              in: ["active", "published"]
            },
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: new Date() } }
            ],
            ...(options.category ? { category: options.category } : {})
          }
        }
      }
    ]
  };
}

function hasDirectRuntimeScope(options: RetrieveRelevantChunksOptions) {
  return Boolean(
    cleanScopeValue(options.agentId)
    || cleanScopeValue(options.knowledgeBaseId)
    || cleanScopeValue(options.namespace)
  );
}

async function buildPrismaWhere(terms: string[], options: RetrieveRelevantChunksOptions, includeTermFilters = true) {
  const accessScope = await resolveKnowledgeAccessScope({
    actorUserId: options.userId,
    tenantId: cleanScopeValue(options.knowledgeScope?.tenantId) || options.tenantId,
    appType: options.appType,
    agentId: cleanScopeValue(options.knowledgeScope?.agentId) || options.agentId,
    knowledgeBaseId: cleanScopeValue(options.knowledgeScope?.knowledgeBaseId) || options.knowledgeBaseId,
    namespace: cleanScopeValue(options.knowledgeScope?.namespace) || options.namespace,
    includeShared: options.includeShared === true || Boolean(options.tenantId) || hasKnowledgeScope(options),
    includePublished: options.includePublished === true || Boolean(options.tenantId) || hasKnowledgeScope(options)
  });
  console.info("RAG_SCOPE: agentId + knowledgeBaseId", {
    agentId: accessScope.agentId,
    knowledgeBaseId: accessScope.knowledgeBaseId,
    namespace: accessScope.namespace
  });
  const termFilters = terms.map((term) => ({
    OR: [
      { chunkText: { contains: term, mode: "insensitive" as const } },
      { summary: { contains: term, mode: "insensitive" as const } },
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

  const accessWhere = hasKnowledgeScope(options)
    ? buildSharedIngestKnowledgeWhere(options)
    : hasDirectRuntimeScope(options)
      ? buildKnowledgeChunkAccessWhere(accessScope)
      : {
        OR: [
          {
            knowledgeItem: {
              is: {
                userId: options.userId,
                deletedAt: null,
                ...(options.category ? { category: options.category } : {})
              }
            }
          },
          buildSharedIngestKnowledgeWhere(options)
        ]
      };

  return {
    ...(options.fileId ? { fileId: options.fileId } : {}),
    AND: [
      accessWhere,
      {
        OR: [
          { fileId: null },
          {
            file: {
              is: {
                deletedAt: null
              }
            }
          }
        ]
      }
    ],
    ...(includeTermFilters && termFilters.length > 0 ? { OR: termFilters } : {})
  };
}

function metadataString(metadata: unknown, keys: string[]) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const record = metadata as Record<string, unknown>;

  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function metadataBoolean(metadata: unknown, keys: string[]) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }

  const record = metadata as Record<string, unknown>;

  return keys.some((key) => record[key] === true);
}

function metadataStringLower(metadata: unknown, keys: string[]) {
  return metadataString(metadata, keys)?.toLowerCase() ?? null;
}

function isSharedOrPublishedMetadata(metadata: unknown) {
  const sourceApp = metadataStringLower(metadata, ["sourceApp", "source"]);
  const visibility = metadataStringLower(metadata, ["visibility", "status"]);

  return Boolean(
    (sourceApp && SHARED_INGEST_SOURCE_APPS.includes(sourceApp))
    || (visibility && SHARED_INGEST_VISIBILITIES.includes(visibility))
    || metadataBoolean(metadata, ["sharedToUserApp", "shared", "published"])
  );
}

function chunkMatchesKnowledgeScope(row: KnowledgeChunkRecord, options: RetrieveRelevantChunksOptions) {
  const scope = options.knowledgeScope;

  if (!scope) {
    return {
      matched: true,
      matchedBy: "shared_public" as const
    };
  }

  const metadata = row.metadata;
  const knowledgeBaseId = cleanScopeValue(scope.knowledgeBaseId);
  const agentId = cleanScopeValue(scope.agentId);
  const tenantId = cleanScopeValue(scope.tenantId);
  const namespace = cleanScopeValue(scope.namespace);
  const chunkKnowledgeBaseId = metadataString(metadata, ["knowledgeBaseId", "knowledge_base_id", "kb_id", "kbId"]);
  const chunkAgentId = metadataString(metadata, ["agentId", "agent_id", "expert_id", "expertId"]);
  const chunkTenantId = metadataString(metadata, ["tenantId", "tenant_id"]);
  const chunkNamespace = metadataString(metadata, ["namespace"]);
  const tenantMatches = !tenantId || !chunkTenantId || chunkTenantId === tenantId;
  const sharedOrPublished = isSharedOrPublishedMetadata(metadata);

  if (knowledgeBaseId) {
    return {
      matched: chunkKnowledgeBaseId === knowledgeBaseId && tenantMatches && sharedOrPublished,
      matchedBy: chunkKnowledgeBaseId === knowledgeBaseId ? "kb_id" as const : "none" as const
    };
  }

  if (agentId) {
    return {
      matched: chunkAgentId === agentId && tenantMatches && sharedOrPublished,
      matchedBy: chunkAgentId === agentId ? "expert_id" as const : "none" as const
    };
  }

  if (namespace) {
    const namespaceMatches = chunkNamespace === namespace
      || chunkKnowledgeBaseId === namespace
      || chunkAgentId === namespace;

    return {
      matched: namespaceMatches && tenantMatches && sharedOrPublished,
      matchedBy: namespaceMatches ? "namespace" as const : "none" as const
    };
  }

  if (tenantId) {
    return {
      matched: tenantMatches && sharedOrPublished,
      matchedBy: tenantMatches && sharedOrPublished ? "shared_public" as const : "none" as const
    };
  }

  return {
    matched: true,
    matchedBy: "shared_public" as const
  };
}

function toRetrievedChunk(row: KnowledgeChunkRecord, score: number): RetrievedRagChunk {
  const item = row.knowledgeItem ?? {};
  const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
    ? row.metadata as Record<string, unknown>
    : {};
  const tenantId = metadataString(metadata, ["tenantId", "tenant_id"]);
  const chunkAgentId = metadataString(metadata, ["agentId", "expert_id", "expertId"]);
  const chunkKnowledgeBaseId = metadataString(metadata, ["knowledgeBaseId", "kb_id", "kbId"]);
  const chunkNamespace = metadataString(metadata, ["namespace"])
    ?? tenantId
    ?? (chunkAgentId && chunkKnowledgeBaseId
      ? `agent:${chunkAgentId}:kb:${chunkKnowledgeBaseId}`
      : null);
  const governance = readKnowledgeGovernanceMetadata(row.metadata);
  const feedbackBoost = buildFeedbackRankingBoost(row.metadata);
  const optimization = analyzeKnowledgeOptimization({
    baseScore: score,
    qualityScore: governance?.qualityScore ?? score,
    feedbackScore: feedbackBoost.feedbackScore,
    behaviorScore: feedbackBoost.behaviorScore,
    usageScore: feedbackBoost.usageScore,
    freshnessScore: feedbackBoost.freshnessScore,
    stabilityScore: feedbackBoost.stabilityScore,
    confidenceWeight: feedbackBoost.confidenceWeight,
    trustWeight: feedbackBoost.trustWeight,
    volatilityPenalty: feedbackBoost.volatilityPenalty,
    stableOptimizationScore: feedbackBoost.stableOptimizationScore,
    trendScore: feedbackBoost.trendScore,
    trendConfidence: feedbackBoost.trendConfidence,
    trendLabel: feedbackBoost.trendLabel,
    staleRisk: feedbackBoost.staleRisk,
    fastRising: feedbackBoost.fastRising,
    staleHighScore: feedbackBoost.staleHighScore,
    decliningTrend: feedbackBoost.decliningTrend,
    evergreen: feedbackBoost.evergreen,
    sampleCount: feedbackBoost.sampleCount,
    suspectedGaming: feedbackBoost.suspectedGaming,
    metadata: row.metadata,
    title: typeof item.title === "string" ? item.title : null,
    content: typeof row.chunkText === "string" ? row.chunkText : null,
    createdAt: row.createdAt,
    sourceType: typeof item.sourceType === "string" ? item.sourceType : null,
    status: typeof item.status === "string" ? item.status : null,
    knowledgeVersion: governance?.version
  });
  const policy = buildPolicyDiagnostics({
    metadata: row.metadata,
    qualityScore: governance?.qualityScore ?? score,
    feedbackScore: feedbackBoost.feedbackScore,
    behaviorScore: feedbackBoost.behaviorScore,
    optimizationScore: optimization.optimizationScore,
    stableOptimizationScore: optimization.stableOptimizationScore,
    trend: {
      trendScore: optimization.trendScore,
      confidence: optimization.trendConfidence,
      fastRising: optimization.fastRising,
      staleHighScore: optimization.staleHighScore,
      decliningTrend: optimization.decliningTrend
    },
    lifecycle: {
      lifecycleStage: optimization.lifecycleStage,
      lifecycleScore: optimization.lifecycleScore,
      lifecycleConfidence: optimization.lifecycleConfidence,
      shouldArchiveCandidate: optimization.shouldArchiveCandidate
    },
    highValue: optimization.highValue,
    lowQuality: optimization.lowQuality,
    duplicateLikely: optimization.duplicateLikely,
    conflictLikely: optimization.conflictLikely,
    coldKnowledge: optimization.coldKnowledge,
    confidence: optimization.lifecycleConfidence,
    volatilityPenalty: optimization.volatilityPenalty,
    trustWeight: optimization.trustWeight
  });

  return {
    chunkId: String(row.id ?? ""),
    fileId: typeof row.fileId === "string" ? row.fileId : null,
    knowledgeItemId: String(row.knowledgeItemId ?? item.id ?? ""),
    knowledgeBaseId: chunkKnowledgeBaseId,
    agentId: chunkAgentId,
    tenantId,
    sourceApp: metadataString(metadata, ["sourceApp", "source"]),
    includeShared: metadataBoolean(metadata, ["sharedToUserApp", "shared"]),
    includePublished: metadataBoolean(metadata, ["published"]),
    title: String(item.title ?? row.file?.originalName ?? "知识库资料"),
    content: String(row.chunkText ?? ""),
    summary: typeof row.summary === "string"
      ? row.summary
      : typeof item.summary === "string"
        ? item.summary
        : null,
    category: typeof item.category === "string" ? item.category : null,
    tags: toStringArray(item.tags),
    sourceType: typeof item.sourceType === "string" ? item.sourceType : null,
    sourceTitle: typeof item.sourceTitle === "string" ? item.sourceTitle : null,
    sourceUrl: typeof item.sourceUrl === "string" ? item.sourceUrl : null,
    namespace: chunkNamespace,
    score,
    relevance_score: score,
    qualityScore: governance?.qualityScore ?? null,
    feedbackScore: Math.round(feedbackBoost.feedbackScore * 10000) / 10000,
    behaviorScore: Math.round(feedbackBoost.behaviorScore * 10000) / 10000,
    behaviorEventCount: feedbackBoost.behaviorEventCount,
    behaviorReasons: feedbackBoost.behaviorReasons,
    usageScore: Math.round(feedbackBoost.usageScore * 10000) / 10000,
    freshnessScore: Math.round(feedbackBoost.freshnessScore * 10000) / 10000,
    optimizationScore: Math.round(optimization.optimizationScore * 10000) / 10000,
    stabilityScore: Math.round(optimization.stabilityScore * 10000) / 10000,
    confidenceWeight: Math.round(optimization.confidenceWeight * 10000) / 10000,
    trustWeight: Math.round(optimization.trustWeight * 10000) / 10000,
    volatilityPenalty: Math.round(optimization.volatilityPenalty * 10000) / 10000,
    stableOptimizationScore: Math.round(optimization.stableOptimizationScore * 10000) / 10000,
    trendScore: Math.round(optimization.trendScore * 10000) / 10000,
    trendLabel: optimization.trendLabel,
    trendConfidence: Math.round(optimization.trendConfidence * 10000) / 10000,
    staleRisk: Math.round(optimization.staleRisk * 10000) / 10000,
    fastRising: optimization.fastRising,
    staleHighScore: optimization.staleHighScore,
    decliningTrend: optimization.decliningTrend,
    evergreen: optimization.evergreen,
    trendReason: optimization.trendReason,
    trendShadowMode: optimization.trendShadowMode,
    lifecycleStage: optimization.lifecycleStage,
    lifecycleScore: Math.round(optimization.lifecycleScore * 10000) / 10000,
    lifecycleConfidence: Math.round(optimization.lifecycleConfidence * 10000) / 10000,
    lifecycleReason: optimization.lifecycleReason,
    lifecycleSuggestion: optimization.lifecycleSuggestion,
    shouldBoost: optimization.shouldBoost,
    shouldDecay: optimization.shouldDecay,
    shouldReview: optimization.shouldReview,
    shouldArchiveCandidate: optimization.shouldArchiveCandidate,
    policyDecision: policy.decision,
    policyScore: Math.round(policy.policyScore * 10000) / 10000,
    policyRiskLevel: policy.riskLevel,
    policyConfidence: Math.round(policy.confidence * 10000) / 10000,
    policySuggestion: policy.suggestion,
    sampleCount: optimization.sampleCount,
    suspectedGaming: optimization.suspectedGaming,
    optimizationReason: optimization.optimizationReason,
    optimizationSuggestion: optimization.optimizationSuggestion,
    duplicateLikely: optimization.duplicateLikely,
    duplicateGroupKey: optimization.duplicateGroupKey,
    coldKnowledge: optimization.coldKnowledge,
    conflictLikely: optimization.conflictLikely,
    staleVersion: optimization.staleVersion,
    knowledgeVersion: governance?.version ?? null,
    lowQuality: optimization.lowQuality,
    highValue: optimization.highValue,
    matchedBy: "none",
    chunk_rank: 0,
    createdAt: toIsoString(row.createdAt ?? item.createdAt)
  };
}

export async function retrieveRelevantChunks(query: string, options: RetrieveRelevantChunksOptions) {
  const safeQuery = sanitizeRagInput(query);
  const terms = extractRagSearchTerms(safeQuery);

  if (terms.length === 0 && !hasKnowledgeScope(options)) {
    return [];
  }

  const topK = normalizeTopK(options);
  const db = options.db ?? (prisma as unknown as RagSearchDb);

  async function fetchRows(includeTermFilters: boolean) {
    const where = await buildPrismaWhere(terms, options, includeTermFilters);

    return db.knowledgeChunk.findMany({
      where,
      take: Math.min(topK * 4, 80),
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
      include: {
        knowledgeItem: true,
        file: {
          select: {
            id: true,
            originalName: true,
            deletedAt: true
          }
        }
      }
    });
  }

  function rankRows(rows: KnowledgeChunkRecord[], scopedFallback = false) {
    return rows.map((row) => ({
      row,
      scopeMatch: chunkMatchesKnowledgeScope(row, options)
    }))
    .filter((item) => item.scopeMatch.matched)
    .filter(({ row }) => candidatePassesGovernance(row.metadata, {
      knowledgeVersion: options.knowledgeVersion,
      minQualityScore: options.minQualityScore,
      includeLowQuality: options.includeLowQuality
    } satisfies KnowledgeGovernanceControls))
    .map(({ row, scopeMatch }) => {
      const directScore = scoreChunk(row, safeQuery, terms);
      const baseScore = scopedFallback ? Math.max(directScore, MIN_RELEVANT_SCORE) : directScore;
      const feedbackBoost = buildFeedbackRankingBoost(row.metadata);
      const qualityScore = feedbackBoost.qualityScore ?? baseScore;
      const optimization = analyzeKnowledgeOptimization({
        baseScore,
        qualityScore,
        feedbackScore: feedbackBoost.feedbackScore,
        behaviorScore: feedbackBoost.behaviorScore,
        usageScore: feedbackBoost.usageScore,
        freshnessScore: feedbackBoost.freshnessScore,
        stabilityScore: feedbackBoost.stabilityScore,
        confidenceWeight: feedbackBoost.confidenceWeight,
        trustWeight: feedbackBoost.trustWeight,
        volatilityPenalty: feedbackBoost.volatilityPenalty,
        stableOptimizationScore: feedbackBoost.stableOptimizationScore,
        trendScore: feedbackBoost.trendScore,
        trendConfidence: feedbackBoost.trendConfidence,
        trendLabel: feedbackBoost.trendLabel,
        staleRisk: feedbackBoost.staleRisk,
        fastRising: feedbackBoost.fastRising,
        staleHighScore: feedbackBoost.staleHighScore,
        decliningTrend: feedbackBoost.decliningTrend,
        evergreen: feedbackBoost.evergreen,
        sampleCount: feedbackBoost.sampleCount,
        suspectedGaming: feedbackBoost.suspectedGaming,
        metadata: row.metadata,
        title: typeof row.knowledgeItem?.title === "string" ? row.knowledgeItem.title : null,
        content: typeof row.chunkText === "string" ? row.chunkText : null,
        createdAt: row.createdAt,
        sourceType: typeof row.knowledgeItem?.sourceType === "string" ? row.knowledgeItem.sourceType : null,
        status: typeof row.knowledgeItem?.status === "string" ? row.knowledgeItem.status : null
      });
      const policy = buildPolicyDiagnostics({
        metadata: row.metadata,
        qualityScore,
        feedbackScore: feedbackBoost.feedbackScore,
        behaviorScore: feedbackBoost.behaviorScore,
        optimizationScore: optimization.optimizationScore,
        stableOptimizationScore: optimization.stableOptimizationScore,
        trend: {
          trendScore: optimization.trendScore,
          confidence: optimization.trendConfidence,
          fastRising: optimization.fastRising,
          staleHighScore: optimization.staleHighScore,
          decliningTrend: optimization.decliningTrend
        },
        lifecycle: {
          lifecycleStage: optimization.lifecycleStage,
          lifecycleScore: optimization.lifecycleScore,
          lifecycleConfidence: optimization.lifecycleConfidence,
          shouldArchiveCandidate: optimization.shouldArchiveCandidate
        },
        highValue: optimization.highValue,
        lowQuality: optimization.lowQuality,
        duplicateLikely: optimization.duplicateLikely,
        conflictLikely: optimization.conflictLikely,
        coldKnowledge: optimization.coldKnowledge,
        confidence: optimization.lifecycleConfidence,
        volatilityPenalty: optimization.volatilityPenalty,
        trustWeight: optimization.trustWeight
      });
      const feedbackAwareScore = calculateFeedbackAwareRankingScore({
        baseScore,
        qualityScore,
        feedbackScore: feedbackBoost.feedbackScore,
        behaviorScore: feedbackBoost.behaviorScore,
        usageScore: feedbackBoost.usageScore,
        freshnessScore: feedbackBoost.freshnessScore,
        optimizationScore: optimization.optimizationScore,
        stabilityScore: optimization.stabilityScore,
        stableOptimizationScore: optimization.stableOptimizationScore,
        trendScore: optimization.trendScore,
        trendConfidence: optimization.trendConfidence,
        lifecycleScore: optimization.lifecycleScore,
        lifecycleConfidence: optimization.lifecycleConfidence,
        lifecycleStage: optimization.lifecycleStage,
        confidenceWeight: optimization.confidenceWeight,
        trustWeight: optimization.trustWeight,
        volatilityPenalty: optimization.volatilityPenalty,
        sampleCount: optimization.sampleCount,
        lowQuality: optimization.lowQuality,
        highValue: optimization.highValue
      });
      const adjustedScore = applyPolicyRankingAdjustment(feedbackAwareScore, policy);
      const finalScore = scopedFallback ? Math.max(adjustedScore, MIN_RELEVANT_SCORE) : adjustedScore;

      return {
        chunk: {
          ...toRetrievedChunk(row, finalScore),
          matchedBy: scopeMatch.matchedBy
        },
        score: finalScore,
        identifierMatch: hasExplicitIdentifierMatch(row, safeQuery)
      };
    })
    .filter((item) => item.chunk.chunkId && item.chunk.content && item.score >= MIN_RELEVANT_SCORE)
    .sort((left, right) => (
      Number(right.identifierMatch) - Number(left.identifierMatch)
      || right.score - left.score
    ))
    .slice(0, topK)
    .map((item, index) => ({
      ...item.chunk,
      chunk_rank: index + 1,
    }));
  }

  const primaryRows = terms.length > 0 ? await fetchRows(true) : [];
  const primaryChunks = rankRows(primaryRows);

  if (
    primaryChunks.length > 0
    || !hasKnowledgeScope(options)
    || options.allowScopedFallback === false
  ) {
    return primaryChunks;
  }

  return rankRows(await fetchRows(false), true);
}

export function buildRagContext(chunks: RetrievedRagChunk[]): RagContext[] {
  return chunks
    .map((chunk) => ({
      id: chunk.knowledgeItemId,
      title: chunk.title,
      content: guardAgainstPromptInjection(chunk.content),
      summary: chunk.summary ?? undefined,
      category: chunk.category ?? undefined,
      tags: chunk.tags,
      sourceType: chunk.sourceType ?? undefined,
      sourceId: chunk.chunkId,
      sourceTitle: chunk.sourceTitle,
      sourceUrl: chunk.sourceUrl,
      score: chunk.score,
      relevance_score: chunk.relevance_score,
      chunk_rank: chunk.chunk_rank,
      similarity: chunk.score
    }))
    .filter((context) => context.content);
}

export function calculateConfidence(chunks: RetrievedRagChunk[]): RagConfidence {
  if (chunks.length === 0) {
    return "low";
  }

  const bestScore = Math.max(...chunks.map((chunk) => chunk.score));

  if (bestScore >= 0.68 && chunks.length >= 2) {
    return "high";
  }

  if (bestScore >= 0.28) {
    return "medium";
  }

  return "low";
}
