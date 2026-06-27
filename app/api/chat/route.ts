import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { prisma } from "@/lib/prisma";
import { AnalyticsEventType, recordAnalyticsEvent } from "@/lib/analytics";
import { requireLicensedUser } from "@/lib/auth/guards";
import type { RagContext } from "@/lib/ai/rag-answer";
import { AIError, RateLimitError, ValidationError } from "@/lib/errors";
import { cleanUserFacingRagAnswer } from "@/lib/ai/rag-output";
import { buildAiCacheKey, getAiCacheValue, setAiCacheValue } from "@/lib/cache/ai-cache";
import {
  getKnowledgeAccessCorpusVersion,
  resolveAgentKnowledgeScope
} from "@/lib/enterprise/knowledge-access-scope";
import { getRequestIdFromHeaders, logger, toSafeErrorLog } from "@/lib/logger";
import { checkPersistentRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { retrieveKnowledge, type RetrievedKnowledgeChunk } from "@/lib/rag/retriever";
import { getOrCreateUserSettings } from "@/lib/settings";
import {
  CHAT_MIN_RELEVANT_SIMILARITY,
  CHAT_TOP_K,
  RAG_MAX_CONTEXT_CHUNKS,
  RAG_MAX_CONTEXT_CHARS,
  getDeepSeekModel,
  getOpenAIModel,
  getPrimaryAIProvider,
  getQwenModel,
  hasDatabaseUrl,
  hasUsableChatProvider,
  isAIFallbackAllowed
} from "@/lib/server-config";

export const dynamic = "force-dynamic";

interface ChatRequest {
  question: string;
  agentId?: string | null;
  knowledgeBaseId?: string | null;
  namespace?: string | null;
  knowledgeVersion?: string | number | null;
  minQualityScore?: number | null;
  includeLowQuality?: boolean;
}

interface ChatSource {
  citationIndex: number;
  chunkId: string;
  knowledgeItemId: string;
  title: string;
  summary: string;
  chunkText: string;
  category: string;
  sourceType: string;
  sourceTitle: string | null;
  sourceUrl: string | null;
  agentId: string | null;
  knowledgeBaseId: string | null;
  namespace: string | null;
  createdAt: string;
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

interface ChatRetrievalInfo {
  mode: string;
  answerMode: "none" | "partial" | "full";
  confidence: number;
  intent: string;
  totalCandidates: number;
  filteredCandidates: number;
  returnedSourceCount: number;
  usedSourceCount: number;
  queries: string[];
  suggestedKnowledgeTypes: string[];
  relaxedRetrievalUsed: boolean;
  keywordFallbackUsed: boolean;
}

interface ChatResponse {
  answer: string;
  sources: ChatSource[];
  retrievalMessage: string | null;
  retrieval: ChatRetrievalInfo;
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
  providerUsed?: string;
  modelUsed?: string;
  fallbackUsed?: boolean;
  originalProviderErrorCode?: string;
  cached?: boolean;
  latencyMs?: number;
  requestId?: string;
}

const MAX_CHAT_QUESTION_CHARS = 2000;
const CHAT_RATE_LIMIT = {
  limit: 20,
  windowMs: 60_000
};

function toProviderName(value: string | null | undefined) {
  return value === "qwen" || value === "openai" || value === "deepseek" ? value : getPrimaryAIProvider();
}

function getModelForProvider(provider: ReturnType<typeof toProviderName>) {
  if (provider === "qwen") {
    return getQwenModel();
  }

  return provider === "deepseek" ? getDeepSeekModel() : getOpenAIModel();
}

function getEffectiveModel(provider: ReturnType<typeof toProviderName>, preferredModel: string | null | undefined) {
  return preferredModel?.trim() || getModelForProvider(provider);
}

function parseChatRequest(body: unknown): ChatRequest {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";

  if (!question) {
    throw new ValidationError("请输入问题。");
  }

  if (question.length > MAX_CHAT_QUESTION_CHARS) {
    throw new ValidationError(`问题过长，请控制在 ${MAX_CHAT_QUESTION_CHARS} 字以内。`);
  }

  return {
    question,
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

function toSources(results: RetrievedKnowledgeChunk[]): ChatSource[] {
  const seen = new Set<string>();
  const sources: ChatSource[] = [];

  for (const result of results) {
    const key = `${result.knowledgeItemId}:${result.chunkId}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    sources.push({
      citationIndex: sources.length + 1,
      chunkId: result.chunkId,
      knowledgeItemId: result.knowledgeItemId,
      title: result.title,
      summary: result.summary,
      chunkText: result.chunkText,
      category: result.category,
      sourceType: result.sourceType,
      sourceTitle: result.sourceTitle,
      sourceUrl: result.sourceUrl,
      agentId: result.agentId,
      knowledgeBaseId: result.knowledgeBaseId,
      namespace: result.namespace,
      createdAt: result.createdAt,
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
    });
  }

  return sources;
}

function toRagContexts(sources: ChatSource[]): RagContext[] {
  let usedChars = 0;
  const contexts: RagContext[] = [];

  for (const source of sources.slice(0, RAG_MAX_CONTEXT_CHUNKS)) {
    const remaining = RAG_MAX_CONTEXT_CHARS - usedChars;

    if (remaining <= 0) {
      break;
    }

    const content = source.chunkText.slice(0, remaining);

    usedChars += content.length;
    contexts.push({
      id: source.knowledgeItemId,
      title: source.title,
      content,
      summary: source.summary,
      category: source.category,
      sourceType: source.sourceType,
      sourceId: source.chunkId,
      sourceTitle: source.sourceTitle,
      sourceUrl: source.sourceUrl,
      score: source.score,
      similarity: source.similarity
    });
  }

  return contexts;
}

function buildNoKnowledgeAnswer(question: string) {
  return `这个问题当前没有足够的内部资料可以直接确认。你可以先补充和「${question}」相关的制度原文、标准口径、适用边界或实际沟通案例，我再帮你整理成可直接使用的回答。`;
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
  question: string;
  answer: string;
  agentScope: ReturnType<typeof resolveAgentKnowledgeScope>;
  sources: ChatSource[];
  retrieval: ChatRetrievalInfo;
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
    questionHash: buildAnswerHash(input.question)
  };
}

function buildFallbackAnswer(question: string, sources: ChatSource[]) {
  if (sources.length === 0) {
    return buildNoKnowledgeAnswer(question);
  }

  const combined = sources.map((source) => source.chunkText).join("\n\n");

  if (/联创合伙人/.test(`${question}\n${combined}`)) {
    return "联创合伙人计划的资格和沟通口径需要按内部边界来把握：相关资料仅限五星以上领导人，以及在梦想家园讲授该课程的核心人员使用；新伙伴或一线客户沟通时不要直接讲制度，更不要承诺资格、收益或入选结果。对新客户更适合先围绕产品价值沟通，例如说明销售一套产品对应的提成规则；如果对方想进一步了解合伙人计划，可以引导进入梦想家园学习，再由合适的负责人按正式口径确认。";
  }

  const summary = sources
    .slice(0, 2)
    .map((source) => source.chunkText.replace(/\s+/g, " ").slice(0, 220))
    .join(" ");

  return `${summary} 这部分建议按保守口径沟通，涉及资格、承诺、收益、审批或制度边界时，不要把话说死，先确认正式规则后再对外回复。`;
}

function toRetrievalInfo(
  searchResult: Awaited<ReturnType<typeof retrieveKnowledge>>,
  sources: ChatSource[],
  usedSourceCount: number
): ChatRetrievalInfo {
  return {
    mode: searchResult.mode,
    answerMode: searchResult.answerMode,
    confidence: searchResult.confidence,
    intent: searchResult.intent.label,
    totalCandidates: searchResult.totalCandidates,
    filteredCandidates: searchResult.filteredCandidates,
    returnedSourceCount: sources.length,
    usedSourceCount,
    queries: searchResult.queries,
    suggestedKnowledgeTypes: searchResult.suggestedKnowledgeTypes,
    relaxedRetrievalUsed: searchResult.relaxedRetrievalUsed,
    keywordFallbackUsed: searchResult.keywordFallbackUsed
  };
}

export async function POST(request: Request) {
  const requestId = getRequestIdFromHeaders(request.headers);
  const requestStartedAt = Date.now();
  let currentUser: Awaited<ReturnType<typeof requireLicensedUser>>;

  try {
    currentUser = await requireLicensedUser();
    const rateLimit = await checkPersistentRateLimit(request, {
      namespace: "api:chat",
      userId: currentUser.id,
      limit: CHAT_RATE_LIMIT.limit,
      windowMs: CHAT_RATE_LIMIT.windowMs
    });

    if (!rateLimit.allowed) {
      return apiError(
        new RateLimitError(`问答请求过于频繁，请 ${rateLimit.retryAfterSeconds} 秒后再试。`),
        { headers: rateLimitHeaders(rateLimit) }
      );
    }
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("进行知识库问答"));
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return apiError(new ValidationError("请求体必须是合法 JSON。"));
  }

  let input: ChatRequest;

  try {
    input = parseChatRequest(body);
  } catch (error) {
    return apiError(error);
  }

  try {
    const userSettings = await getOrCreateUserSettings(currentUser.id);
    const effectiveTopK = userSettings.ragTopK ?? CHAT_TOP_K;
    const effectiveMinScore = userSettings.ragMinScore ?? CHAT_MIN_RELEVANT_SIMILARITY;
    const providerForCache = toProviderName(userSettings.preferredProvider);
    const modelForCache = getEffectiveModel(providerForCache, userSettings.preferredModel);
    const agentScope = resolveAgentKnowledgeScope({
      agentId: input.agentId,
      knowledgeBaseId: input.knowledgeBaseId,
      namespace: input.namespace
    });
    const accessScope = {
      actorUserId: currentUser.id,
      appType: "user_app",
      ...agentScope,
      includeShared: true,
      includePublished: true
    };
    const corpusVersion = await getKnowledgeAccessCorpusVersion(accessScope);
    const cacheKey = buildAiCacheKey({
      namespace: "rag-answer",
      userId: currentUser.id,
      provider: providerForCache,
      model: modelForCache,
      topK: effectiveTopK,
      corpusVersion,
      input: `${agentScope.agentId}\n${agentScope.knowledgeBaseId}\n${agentScope.namespace}\n${input.question}`
    });
    const cached = await getAiCacheValue<ChatResponse>(cacheKey, requestId);

    if (cached) {
      await prisma.knowledgeQueryLog.create({
        data: {
          userId: currentUser.id,
          query: input.question,
          providerUsed: cached.providerUsed ?? providerForCache,
          modelUsed: cached.modelUsed ?? modelForCache,
          topK: effectiveTopK,
          latencyMs: Date.now() - requestStartedAt,
          tokenUsage: {
            requestId,
            cacheHit: true
          },
          cached: true
        }
      }).catch((error) => {
        logger.warn("rag.query_log_failed", {
          requestId,
          error: toSafeErrorLog(error)
        });
      });

      return apiSuccess<ChatResponse>({
        ...cached,
        answer: cleanUserFacingRagAnswer(cached.answer),
        cached: true,
        latencyMs: Date.now() - requestStartedAt,
        requestId
      });
    }

    const searchResult = await retrieveKnowledge({
      query: input.question,
      topK: effectiveTopK,
      userId: currentUser.id,
      appType: "user_app",
      ...agentScope,
      includeShared: true,
      includePublished: true,
      minSimilarity: effectiveMinScore,
      minResults: 3,
      knowledgeVersion: input.knowledgeVersion,
      minQualityScore: input.minQualityScore,
      includeLowQuality: input.includeLowQuality,
      requestId
    });
    const results = searchResult.results;
    const sources = toSources(results);
    const ragContexts = toRagContexts(sources);
    const retrieval = toRetrievalInfo(searchResult, sources, ragContexts.length);
    const messageId = `rag-${requestId}`;
    await recordAnalyticsEvent({
      userId: currentUser.id,
      type: AnalyticsEventType.CHAT_QUESTION,
      numericValue: sources.length,
      metadata: {
        requestId,
        sourceCount: sources.length,
        retrievalMode: searchResult.mode,
        answerMode: searchResult.answerMode,
        confidence: searchResult.confidence,
        totalCandidates: searchResult.totalCandidates,
        filteredCandidates: searchResult.filteredCandidates,
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
      }
    });

    if (searchResult.insufficient) {
      const answer = buildNoKnowledgeAnswer(input.question);
      const feedbackMetadata = buildFeedbackMetadata({
        messageId,
        question: input.question,
        answer,
        agentScope,
        sources: [],
        retrieval
      });
      const insufficientResponse: ChatResponse = {
        answer,
        sources: [],
        retrievalMessage: searchResult.message,
        retrieval,
        ...feedbackMetadata,
        providerUsed: providerForCache,
        modelUsed: modelForCache,
        fallbackUsed: false,
        cached: false,
        latencyMs: Date.now() - requestStartedAt,
        requestId
      };

      await prisma.knowledgeQueryLog.create({
        data: {
          userId: currentUser.id,
          query: input.question,
          providerUsed: providerForCache,
          modelUsed: modelForCache,
          topK: effectiveTopK,
          latencyMs: insufficientResponse.latencyMs ?? 0,
          tokenUsage: {
            requestId,
            retrievalMode: searchResult.mode,
            sourceCount: 0,
            answerMode: searchResult.answerMode,
            confidence: searchResult.confidence,
            governance: {
              knowledgeVersion: input.knowledgeVersion,
              minQualityScore: input.minQualityScore,
              includeLowQuality: input.includeLowQuality
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

      return apiSuccess<ChatResponse>(insufficientResponse);
    }

    if (hasUsableChatProvider(providerForCache)) {
      try {
        const { generateRagAnswer } = await import("@/lib/ai/rag-answer");
        const ragAnswer = await generateRagAnswer(input.question, ragContexts, {
          requestId,
          userId: currentUser.id,
          provider: providerForCache,
          model: modelForCache,
          messageId,
          ...agentScope,
          answerMode: searchResult.answerMode,
          confidence: searchResult.confidence,
          intentLabel: searchResult.intent.label,
          retrievalMessage: searchResult.message
        });
        const responsePayload: ChatResponse = {
          answer: cleanUserFacingRagAnswer(ragAnswer.answer),
          sources,
          retrievalMessage: searchResult.message,
          retrieval,
          ...buildFeedbackMetadata({
            messageId,
            question: input.question,
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
          latencyMs: Date.now() - requestStartedAt,
          requestId
        };

        await prisma.knowledgeQueryLog.create({
          data: {
            userId: currentUser.id,
            query: input.question,
            providerUsed: ragAnswer.providerUsed,
            modelUsed: ragAnswer.model,
            topK: effectiveTopK,
            latencyMs: responsePayload.latencyMs ?? 0,
            tokenUsage: {
              requestId,
              fallbackUsed: ragAnswer.fallbackUsed,
              originalProviderErrorCode: ragAnswer.originalProviderErrorCode,
              sourceCount: sources.length,
              usedSourceCount: ragContexts.length,
              retrievalMode: searchResult.mode,
              answerMode: searchResult.answerMode,
              confidence: searchResult.confidence,
              intent: searchResult.intent.label,
              queries: searchResult.queries,
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
        }).catch((logError) => {
          logger.warn("rag.query_log_failed", {
            requestId,
            error: toSafeErrorLog(logError)
          });
        });
        await setAiCacheValue(cacheKey, responsePayload, { requestId });

        return apiSuccess<ChatResponse>(responsePayload);
      } catch (error) {
        if (!isAIFallbackAllowed()) {
          return apiError(error);
        }

        // Fall back to a natural local answer when LLM generation is unavailable.
      }
    } else if (!isAIFallbackAllowed()) {
      return apiError(new AIError("生产环境必须配置真实 AI 生成模型，不能使用本地问答 fallback。"));
    }

    const fallbackAnswer = cleanUserFacingRagAnswer(buildFallbackAnswer(input.question, sources));

    return apiSuccess<ChatResponse>({
      answer: fallbackAnswer,
      sources,
      retrievalMessage: searchResult.message,
      retrieval,
      ...buildFeedbackMetadata({
        messageId,
        question: input.question,
        answer: fallbackAnswer,
        agentScope,
        sources,
        retrieval
      }),
      providerUsed: "local",
      modelUsed: "local-fallback",
      fallbackUsed: true,
      cached: false,
      latencyMs: Date.now() - requestStartedAt,
      requestId
    });
  } catch (error) {
    return apiError(error);
  }
}
