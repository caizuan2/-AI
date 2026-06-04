import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { prisma } from "@/lib/prisma";
import { AnalyticsEventType, recordAnalyticsEvent } from "@/lib/analytics";
import { requireLicensedUser } from "@/lib/auth/guards";
import type { RagContext } from "@/lib/ai/rag-answer";
import { AIError, RateLimitError, ValidationError } from "@/lib/errors";
import { buildAiCacheKey, getAiCacheValue, getCorpusVersion, setAiCacheValue } from "@/lib/cache/ai-cache";
import { getRequestIdFromHeaders, logger, toSafeErrorLog } from "@/lib/logger";
import { checkPersistentRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { retrieveKnowledge, type RetrievedKnowledgeChunk } from "@/lib/rag/retriever";
import { getOrCreateUserSettings } from "@/lib/settings";
import {
  CHAT_MIN_RELEVANT_SIMILARITY,
  CHAT_TOP_K,
  RAG_MAX_CONTEXT_CHARS,
  getDeepSeekModel,
  getOpenAIModel,
  getPrimaryAIProvider,
  getQwenModel,
  hasDatabaseUrl,
  hasUsableOpenAIKey,
  isAIFallbackAllowed
} from "@/lib/server-config";

export const dynamic = "force-dynamic";

interface ChatRequest {
  question: string;
}

interface ChatSource {
  citationIndex: number;
  chunkId: string;
  knowledgeItemId: string;
  title: string;
  summary: string;
  chunkText: string;
  sourceType: string;
  createdAt: string;
  similarity: number;
}

interface ChatResponse {
  answer: string;
  sources: ChatSource[];
  retrievalMessage: string | null;
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

  return { question };
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
      sourceType: result.sourceType,
      createdAt: result.createdAt,
      similarity: result.similarity
    });
  }

  return sources;
}

function toRagContexts(sources: ChatSource[]): RagContext[] {
  let usedChars = 0;
  const contexts: RagContext[] = [];

  for (const source of sources) {
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
      sourceType: source.sourceType,
      sourceId: source.chunkId
    });
  }

  return contexts;
}

function buildFallbackAnswer(question: string, sources: ChatSource[]) {
  if (sources.length === 0) {
    return "知识库中没有找到足够依据。";
  }

  const sourceTitles = sources.map((source) => `[${source.citationIndex}]「${source.title}」`).join("、");
  const snippets = sources
    .slice(0, 2)
    .map((source) => `${source.chunkText.slice(0, 120)} [${source.citationIndex}]`)
    .join("；");

  return [
    `基于知识库来源 ${sourceTitles}，可以先参考以下依据回答：${snippets}`,
    `针对问题「${question}」，建议结合上述来源再做人工确认。`
  ].join("\n");
}

function ensureAnswerHasCitation(answer: string, sources: ChatSource[]) {
  if (sources.length === 0 || sources.some((source) => answer.includes(`[${source.citationIndex}]`))) {
    return answer;
  }

  const titles = sources.map((source) => `[${source.citationIndex}]「${source.title}」`).join("、");

  return `${answer}\n\n引用来源：${titles}`;
}

function withRetrievalMessage(answer: string, message: string | null) {
  if (!message) {
    return answer;
  }

  return `${message}\n\n${answer}`;
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
    const modelForCache = getModelForProvider(providerForCache);
    const corpusVersion = await getCorpusVersion(currentUser.id);
    const cacheKey = buildAiCacheKey({
      namespace: "rag-answer",
      userId: currentUser.id,
      provider: providerForCache,
      model: modelForCache,
      topK: effectiveTopK,
      corpusVersion,
      input: input.question
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
        cached: true,
        latencyMs: Date.now() - requestStartedAt,
        requestId
      });
    }

    const searchResult = await retrieveKnowledge({
      query: input.question,
      topK: effectiveTopK,
      userId: currentUser.id,
      minSimilarity: effectiveMinScore,
      minResults: 1,
      requestId
    });
    const results = searchResult.results;
    const sources = toSources(results);
    await recordAnalyticsEvent({
      userId: currentUser.id,
      type: AnalyticsEventType.CHAT_QUESTION,
      numericValue: sources.length,
      metadata: {
        requestId,
        sourceCount: sources.length,
        retrievalMode: searchResult.mode,
        insufficient: searchResult.insufficient,
        totalCandidates: searchResult.totalCandidates,
        filteredCandidates: searchResult.filteredCandidates
      }
    });

    if (searchResult.insufficient) {
      const insufficientResponse: ChatResponse = {
        answer: searchResult.message ?? "知识库中没有找到足够依据。",
        sources: [],
        retrievalMessage: searchResult.message,
        cached: false,
        latencyMs: Date.now() - requestStartedAt,
        requestId
      };

      await prisma.knowledgeQueryLog.create({
        data: {
          userId: currentUser.id,
          query: input.question,
          providerUsed: "none",
          modelUsed: "none",
          topK: effectiveTopK,
          latencyMs: insufficientResponse.latencyMs ?? 0,
          tokenUsage: {
            requestId,
            retrievalMode: searchResult.mode,
            sourceCount: 0
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

    if (hasUsableOpenAIKey()) {
      try {
        const { generateRagAnswer } = await import("@/lib/ai/rag-answer");
        const ragAnswer = await generateRagAnswer(input.question, toRagContexts(sources), {
          requestId,
          userId: currentUser.id,
          provider: providerForCache
        });
        const responsePayload: ChatResponse = {
          answer: withRetrievalMessage(ensureAnswerHasCitation(ragAnswer.answer, sources), searchResult.message),
          sources,
          retrievalMessage: searchResult.message,
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
              retrievalMode: searchResult.mode
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

        // Fall back to a citation-preserving local answer when LLM generation is unavailable.
      }
    } else if (!isAIFallbackAllowed()) {
      return apiError(new AIError("生产环境必须配置真实 OPENAI_API_KEY，不能使用本地问答 fallback。"));
    }

    return apiSuccess<ChatResponse>({
      answer: withRetrievalMessage(ensureAnswerHasCitation(buildFallbackAnswer(input.question, sources), sources), searchResult.message),
      sources,
      retrievalMessage: searchResult.message,
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
