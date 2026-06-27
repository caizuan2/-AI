import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { generateRagAnswer, type RagContext } from "@/lib/ai/rag-answer";
import type { ChatProviderName } from "@/lib/ai/types";
import { requireLicensedUser } from "@/lib/auth/guards";
import { buildAiCacheKey, getAiCacheValue, setAiCacheValue } from "@/lib/cache/ai-cache";
import {
  getKnowledgeAccessCorpusVersion,
  resolveAgentKnowledgeScope
} from "@/lib/enterprise/knowledge-access-scope";
import { AIError, RateLimitError, ValidationError } from "@/lib/errors";
import { cleanUserFacingRagAnswer } from "@/lib/ai/rag-output";
import { getRequestIdFromHeaders, logger, toSafeErrorLog } from "@/lib/logger";
import { checkPersistentRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { retrieveKnowledge } from "@/lib/rag/retriever";
import { getOrCreateUserSettings } from "@/lib/settings";
import {
  RAG_MAX_CONTEXT_CHUNKS,
  RAG_MAX_CONTEXT_CHARS,
  getDeepSeekModel,
  getOpenAIModel,
  getPrimaryAIProvider,
  getQwenModel,
  hasDatabaseUrl,
  hasUsableChatProvider,
  type ChatProviderName as ConfigChatProviderName
} from "@/lib/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface KnowledgeQueryRequest {
  query: string;
  topK: number;
  provider?: ChatProviderName;
  agentId?: string | null;
  knowledgeBaseId?: string | null;
  namespace?: string | null;
  knowledgeVersion?: string | number | null;
  minQualityScore?: number | null;
  includeLowQuality?: boolean;
}

interface KnowledgeQuerySource {
  knowledgeItemId: string;
  chunkId: string;
  title: string;
  contentPreview: string;
  similarity: number;
  score: number;
  qualityScore: number | null;
  behaviorScore: number;
  behaviorEventCount: number;
  behaviorReasons: string[];
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
  coldKnowledge: boolean;
  conflictLikely: boolean;
  staleVersion: boolean;
  knowledgeVersion: string | null;
  lowQuality: boolean;
  highValue: boolean;
}

interface KnowledgeQueryResponse {
  answer: string;
  sources: KnowledgeQuerySource[];
  messageId?: string;
  agentId?: string | null;
  knowledgeBaseId?: string | null;
  namespace?: string | null;
  chunkIds?: string[];
  evidenceIds?: string[];
  retrievalTrace?: {
    mode: string;
    sourceCount: number;
    confidence: number;
  };
  answerHash?: string;
  questionHash?: string;
  providerUsed: string;
  modelUsed: string;
  fallbackUsed: boolean;
  originalProviderErrorCode?: string;
  cached: boolean;
  requestId: string;
  latencyMs: number;
}

const MAX_QUERY_CHARS = 2_000;

function normalizeProvider(value: unknown): ChatProviderName | undefined {
  return value === "qwen" || value === "openai" || value === "deepseek" ? value : undefined;
}

function normalizeTopK(value: unknown) {
  const topK = typeof value === "number" ? Math.round(value) : 8;

  return Number.isInteger(topK) && topK > 0 ? Math.min(topK, 20) : 8;
}

function parseRequest(body: unknown): KnowledgeQueryRequest {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";

  if (!query) {
    throw new ValidationError("请输入问题。");
  }

  if (query.length > MAX_QUERY_CHARS) {
    throw new ValidationError(`问题过长，请控制在 ${MAX_QUERY_CHARS} 字以内。`);
  }

  return {
    query,
    topK: normalizeTopK(body.topK),
    provider: normalizeProvider(body.provider),
    agentId: typeof body.agentId === "string" ? body.agentId.trim() || null : null,
    knowledgeBaseId: typeof body.knowledgeBaseId === "string" ? body.knowledgeBaseId.trim() || null : null,
    namespace: typeof body.namespace === "string" ? body.namespace.trim() || null : null,
    knowledgeVersion: typeof body.knowledgeVersion === "string" || typeof body.knowledgeVersion === "number"
      ? body.knowledgeVersion
      : null,
    minQualityScore: typeof body.minQualityScore === "number" ? body.minQualityScore : null,
    includeLowQuality: body.includeLowQuality === true
  };
}

function toRagContexts(results: Awaited<ReturnType<typeof retrieveKnowledge>>["results"]): RagContext[] {
  let usedChars = 0;
  const contexts: RagContext[] = [];

  for (const result of results.slice(0, RAG_MAX_CONTEXT_CHUNKS)) {
    const remaining = RAG_MAX_CONTEXT_CHARS - usedChars;

    if (remaining <= 0) {
      break;
    }

    const content = result.chunkText.slice(0, remaining);

    usedChars += content.length;
    contexts.push({
      id: result.knowledgeItemId,
      title: result.title,
      content,
      summary: result.summary,
      category: result.category,
      sourceType: result.sourceType,
      sourceId: result.chunkId,
      sourceTitle: result.sourceTitle,
      sourceUrl: result.sourceUrl,
      score: result.score,
      similarity: result.similarity
    });
  }

  return contexts;
}

function toSources(results: Awaited<ReturnType<typeof retrieveKnowledge>>["results"]): KnowledgeQuerySource[] {
  return results.map((result) => ({
    knowledgeItemId: result.knowledgeItemId,
    chunkId: result.chunkId,
    title: result.title,
    contentPreview: result.chunkText.slice(0, 240),
    similarity: result.similarity,
    score: result.score,
    qualityScore: result.qualityScore,
    behaviorScore: result.behaviorScore,
    behaviorEventCount: result.behaviorEventCount,
    behaviorReasons: result.behaviorReasons,
    optimizationScore: result.optimizationScore,
    stabilityScore: result.stabilityScore,
    confidenceWeight: result.confidenceWeight,
    trustWeight: result.trustWeight,
    volatilityPenalty: result.volatilityPenalty,
    stableOptimizationScore: result.stableOptimizationScore,
    trendScore: result.trendScore,
    trendLabel: result.trendLabel,
    trendConfidence: result.trendConfidence,
    staleRisk: result.staleRisk,
    fastRising: result.fastRising,
    staleHighScore: result.staleHighScore,
    decliningTrend: result.decliningTrend,
    evergreen: result.evergreen,
    trendReason: result.trendReason,
    trendShadowMode: result.trendShadowMode,
    lifecycleStage: result.lifecycleStage,
    lifecycleScore: result.lifecycleScore,
    lifecycleConfidence: result.lifecycleConfidence,
    lifecycleReason: result.lifecycleReason,
    lifecycleSuggestion: result.lifecycleSuggestion,
    shouldBoost: result.shouldBoost,
    shouldDecay: result.shouldDecay,
    shouldReview: result.shouldReview,
    shouldArchiveCandidate: result.shouldArchiveCandidate,
    policyDecision: result.policyDecision,
    policyScore: result.policyScore,
    policyRiskLevel: result.policyRiskLevel,
    policyConfidence: result.policyConfidence,
    policySuggestion: result.policySuggestion,
    sampleCount: result.sampleCount,
    suspectedGaming: result.suspectedGaming,
    optimizationReason: result.optimizationReason,
    optimizationSuggestion: result.optimizationSuggestion,
    duplicateLikely: result.duplicateLikely,
    coldKnowledge: result.coldKnowledge,
    conflictLikely: result.conflictLikely,
    staleVersion: result.staleVersion,
    knowledgeVersion: result.knowledgeVersion,
    lowQuality: result.lowQuality,
    highValue: result.highValue
  }));
}

function providerModel(provider: ConfigChatProviderName) {
  if (provider === "qwen") {
    return getQwenModel();
  }

  return provider === "deepseek" ? getDeepSeekModel() : getOpenAIModel();
}

function buildAnswerHash(text: string) {
  let hash = 0;

  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(index);
    hash |= 0;
  }

  return `ans_${Math.abs(hash).toString(36)}`;
}

function buildFeedbackMetadata(input: {
  messageId: string;
  query: string;
  answer: string;
  agentScope: ReturnType<typeof resolveAgentKnowledgeScope>;
  sources: KnowledgeQuerySource[];
  retrieval: Awaited<ReturnType<typeof retrieveKnowledge>>;
}) {
  return {
    messageId: input.messageId,
    agentId: input.agentScope.agentId,
    knowledgeBaseId: input.agentScope.knowledgeBaseId,
    namespace: input.agentScope.namespace,
    chunkIds: input.sources.map((source) => source.chunkId).filter(Boolean),
    evidenceIds: input.sources.map((source) => source.knowledgeItemId).filter(Boolean),
    retrievalTrace: {
      mode: input.retrieval.mode,
      sourceCount: input.sources.length,
      confidence: input.retrieval.confidence
    },
    answerHash: buildAnswerHash(input.answer),
    questionHash: buildAnswerHash(input.query)
  };
}

export async function POST(request: Request) {
  const requestId = getRequestIdFromHeaders(request.headers);
  const startedAt = Date.now();
  let user: Awaited<ReturnType<typeof requireLicensedUser>>;

  try {
    user = await requireLicensedUser();
    const rateLimit = await checkPersistentRateLimit(request, {
      namespace: "api:knowledge:query",
      userId: user.id
    });

    if (!rateLimit.allowed) {
      return apiError(
        new RateLimitError(`请求过于频繁，请 ${rateLimit.retryAfterSeconds} 秒后再试。`),
        { headers: rateLimitHeaders(rateLimit) }
      );
    }
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("查询知识库"));
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return apiError(new ValidationError("请求体必须是合法 JSON。"));
  }

  let input: KnowledgeQueryRequest;

  try {
    input = parseRequest(body);
  } catch (error) {
    return apiError(error);
  }

  try {
    const requestedProvider = input.provider ?? getPrimaryAIProvider();
    const userSettings = await getOrCreateUserSettings(user.id);
    const effectiveProvider = input.provider
      ?? (userSettings.preferredProvider === "qwen" || userSettings.preferredProvider === "openai" || userSettings.preferredProvider === "deepseek"
        ? userSettings.preferredProvider
        : requestedProvider);
    const requestedModel = userSettings.preferredModel || providerModel(effectiveProvider);
    const effectiveTopK = userSettings.ragTopK ?? input.topK;
    const effectiveMinScore = userSettings.ragMinScore ?? undefined;
    const agentScope = resolveAgentKnowledgeScope({
      agentId: input.agentId,
      knowledgeBaseId: input.knowledgeBaseId,
      namespace: input.namespace
    });
    const accessScope = {
      actorUserId: user.id,
      appType: "user_app",
      ...agentScope,
      includeShared: true,
      includePublished: true
    };
    const corpusVersion = await getKnowledgeAccessCorpusVersion(accessScope);
    const cacheKey = buildAiCacheKey({
      namespace: "rag-answer",
      userId: user.id,
      provider: effectiveProvider,
      model: requestedModel,
      topK: effectiveTopK,
      corpusVersion,
      input: `${agentScope.agentId}\n${agentScope.knowledgeBaseId}\n${agentScope.namespace}\n${input.query}`
    });
    const cached = await getAiCacheValue<KnowledgeQueryResponse>(cacheKey, requestId);

    if (cached) {
      return apiSuccess<KnowledgeQueryResponse>({
        ...cached,
        answer: cleanUserFacingRagAnswer(cached.answer),
        cached: true,
        requestId,
        latencyMs: Date.now() - startedAt
      });
    }

    const retrieval = await retrieveKnowledge({
      query: input.query,
      topK: effectiveTopK,
      minSimilarity: effectiveMinScore,
      minResults: 3,
      userId: user.id,
      appType: "user_app",
      ...agentScope,
      includeShared: true,
      includePublished: true,
      knowledgeVersion: input.knowledgeVersion,
      minQualityScore: input.minQualityScore,
      includeLowQuality: input.includeLowQuality,
      requestId
    });
    const sources = toSources(retrieval.results);
    const messageId = `knowledge-${requestId}`;

    if (sources.length === 0) {
      const answer = "这个问题当前没有足够的内部资料可以直接确认。可以先补充相关制度原文、标准口径、适用边界或实际沟通案例，我再帮你整理成可直接使用的回答。";
      const response: KnowledgeQueryResponse = {
        answer,
        sources: [],
        ...buildFeedbackMetadata({
          messageId,
          query: input.query,
          answer,
          agentScope,
          sources: [],
          retrieval
        }),
        providerUsed: effectiveProvider,
        modelUsed: requestedModel,
        fallbackUsed: false,
        cached: false,
        requestId,
        latencyMs: Date.now() - startedAt
      };

      return apiSuccess<KnowledgeQueryResponse>(response);
    }

    if (!hasUsableChatProvider(effectiveProvider)) {
      throw new AIError("当前选择的 AI 生成 provider 未配置，请在环境变量或设置中配置可用模型。");
    }

    const ragAnswer = await generateRagAnswer(input.query, toRagContexts(retrieval.results), {
      requestId,
      messageId,
      userId: user.id,
      provider: effectiveProvider,
      model: requestedModel,
      ...agentScope,
      answerMode: retrieval.answerMode,
      confidence: retrieval.confidence,
      intentLabel: retrieval.intent.label,
      retrievalMessage: retrieval.message
    });
    const response: KnowledgeQueryResponse = {
      answer: cleanUserFacingRagAnswer(ragAnswer.answer),
      sources,
      ...buildFeedbackMetadata({
        messageId,
        query: input.query,
        answer: cleanUserFacingRagAnswer(ragAnswer.answer),
        agentScope,
        sources,
        retrieval
      }),
      providerUsed: ragAnswer.providerUsed,
      modelUsed: ragAnswer.model,
      fallbackUsed: ragAnswer.fallbackUsed,
      originalProviderErrorCode: ragAnswer.originalProviderErrorCode,
      cached: false,
      requestId,
      latencyMs: Date.now() - startedAt
    };

    await prisma.knowledgeQueryLog.create({
      data: {
        userId: user.id,
        query: input.query,
        providerUsed: response.providerUsed,
        modelUsed: response.modelUsed,
        topK: effectiveTopK,
        latencyMs: response.latencyMs,
        tokenUsage: {
          requestId,
          fallbackUsed: response.fallbackUsed,
          originalProviderErrorCode: response.originalProviderErrorCode,
          sourceCount: sources.length,
          governance: {
            knowledgeVersion: input.knowledgeVersion,
            minQualityScore: input.minQualityScore,
            includeLowQuality: input.includeLowQuality,
            avgQualityScore: sources.length > 0
              ? Math.round((sources.reduce((sum, source) => sum + (source.qualityScore ?? 1), 0) / sources.length) * 10000) / 10000
              : null,
            avgStabilityScore: sources.length > 0
              ? Math.round((sources.reduce((sum, source) => sum + source.stabilityScore, 0) / sources.length) * 10000) / 10000
              : null,
            avgConfidenceWeight: sources.length > 0
              ? Math.round((sources.reduce((sum, source) => sum + source.confidenceWeight, 0) / sources.length) * 10000) / 10000
              : null,
            avgTrendScore: sources.length > 0
              ? Math.round((sources.reduce((sum, source) => sum + source.trendScore, 0) / sources.length) * 10000) / 10000
              : null,
            fastRisingHitCount: sources.filter((source) => source.fastRising).length,
            decliningTrendHitCount: sources.filter((source) => source.decliningTrend).length,
            staleHighScoreHitCount: sources.filter((source) => source.staleHighScore).length,
            evergreenHitCount: sources.filter((source) => source.evergreen).length,
            lifecycle: {
              newCount: sources.filter((source) => source.lifecycleStage === "new").length,
              growingCount: sources.filter((source) => source.lifecycleStage === "growing").length,
              stableCount: sources.filter((source) => source.lifecycleStage === "stable").length,
              decliningCount: sources.filter((source) => source.lifecycleStage === "declining").length,
              archiveCandidateCount: sources.filter((source) => source.lifecycleStage === "archive_candidate").length,
              unknownCount: sources.filter((source) => source.lifecycleStage === "unknown").length
            },
            policy: {
              boostCount: sources.filter((source) => source.policyDecision === "boost").length,
              keepCount: sources.filter((source) => source.policyDecision === "keep").length,
              monitorCount: sources.filter((source) => source.policyDecision === "monitor").length,
              decayCount: sources.filter((source) => source.policyDecision === "decay").length,
              reviewRequiredCount: sources.filter((source) => source.policyDecision === "review_required").length,
              mergeCandidateCount: sources.filter((source) => source.policyDecision === "merge_candidate").length,
              archiveCandidateCount: sources.filter((source) => source.policyDecision === "archive_candidate").length,
              blockedAutoActionCount: sources.filter((source) => source.policyDecision === "blocked_auto_action").length,
              unknownCount: sources.filter((source) => source.policyDecision === "unknown").length
            },
            volatilityHitCount: sources.filter((source) => source.volatilityPenalty >= 0.08 || source.suspectedGaming).length,
            lowQualityHitCount: sources.filter((source) => source.lowQuality).length
          }
        },
        cached: false
      }
    }).catch((error) => {
      logger.warn("rag.query_log_failed", {
        requestId,
        error: toSafeErrorLog(error)
      });
    });
    await setAiCacheValue(cacheKey, response, { requestId });

    return apiSuccess<KnowledgeQueryResponse>(response);
  } catch (error) {
    const appError = error instanceof AIError ? error : error;

    return apiError(appError);
  }
}
