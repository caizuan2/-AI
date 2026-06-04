import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { generateRagAnswer, type RagContext } from "@/lib/ai/rag-answer";
import type { ChatProviderName } from "@/lib/ai/types";
import { requireLicensedUser } from "@/lib/auth/guards";
import { buildAiCacheKey, getAiCacheValue, getCorpusVersion, setAiCacheValue } from "@/lib/cache/ai-cache";
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
}

interface KnowledgeQuerySource {
  knowledgeItemId: string;
  chunkId: string;
  title: string;
  contentPreview: string;
  similarity: number;
  score: number;
}

interface KnowledgeQueryResponse {
  answer: string;
  sources: KnowledgeQuerySource[];
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
    provider: normalizeProvider(body.provider)
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
    score: result.score
  }));
}

function providerModel(provider: ConfigChatProviderName) {
  if (provider === "qwen") {
    return getQwenModel();
  }

  return provider === "deepseek" ? getDeepSeekModel() : getOpenAIModel();
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
    const corpusVersion = await getCorpusVersion(user.id);
    const cacheKey = buildAiCacheKey({
      namespace: "rag-answer",
      userId: user.id,
      provider: effectiveProvider,
      model: requestedModel,
      topK: effectiveTopK,
      corpusVersion,
      input: input.query
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
      requestId
    });
    const sources = toSources(retrieval.results);

    if (sources.length === 0) {
      const response: KnowledgeQueryResponse = {
        answer: `这个问题当前没有足够的内部资料可以直接确认。可以先补充相关制度原文、标准口径、适用边界或实际沟通案例，我再帮你整理成可直接使用的回答。`,
        sources: [],
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
      userId: user.id,
      provider: effectiveProvider,
      model: requestedModel,
      answerMode: retrieval.answerMode,
      confidence: retrieval.confidence,
      intentLabel: retrieval.intent.label,
      retrievalMessage: retrieval.message
    });
    const response: KnowledgeQueryResponse = {
      answer: cleanUserFacingRagAnswer(ragAnswer.answer),
      sources,
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
          sourceCount: sources.length
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
