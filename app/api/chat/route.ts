import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { AnalyticsEventType, recordAnalyticsEvent } from "@/lib/analytics";
import { requireLicensedUser } from "@/lib/auth/guards";
import type { RagContext } from "@/lib/ai/rag-answer";
import { AIError, RateLimitError, ValidationError } from "@/lib/errors";
import { getRequestIdFromHeaders } from "@/lib/logger";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { retrieveKnowledge, type RetrievedKnowledgeChunk } from "@/lib/rag/retriever";
import {
  CHAT_MIN_RELEVANT_SIMILARITY,
  CHAT_TOP_K,
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
}

interface ChatResponse {
  answer: string;
  sources: ChatSource[];
  retrievalMessage: string | null;
}

const MAX_CHAT_QUESTION_CHARS = 2000;
const CHAT_RATE_LIMIT = {
  limit: 20,
  windowMs: 60_000
};

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
      createdAt: result.createdAt
    });
  }

  return sources;
}

function toRagContexts(sources: ChatSource[]): RagContext[] {
  return sources.map((source) => ({
    id: source.knowledgeItemId,
    title: source.title,
    content: source.chunkText,
    sourceType: source.sourceType,
    sourceId: source.chunkId
  }));
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
  let currentUser: Awaited<ReturnType<typeof requireLicensedUser>>;

  try {
    currentUser = await requireLicensedUser();
    const rateLimit = checkRateLimit(request, {
      namespace: "api:chat",
      userId: currentUser.id,
      ...CHAT_RATE_LIMIT
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
    const searchResult = await retrieveKnowledge({
      query: input.question,
      topK: CHAT_TOP_K,
      userId: currentUser.id,
      minSimilarity: CHAT_MIN_RELEVANT_SIMILARITY,
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
      return apiSuccess<ChatResponse>({
        answer: searchResult.message ?? "知识库中没有找到足够依据。",
        sources: [],
        retrievalMessage: searchResult.message
      });
    }

    if (hasUsableOpenAIKey()) {
      try {
        const { generateRagAnswer } = await import("@/lib/ai/rag-answer");
        const ragAnswer = await generateRagAnswer(input.question, toRagContexts(sources), {
          requestId,
          userId: currentUser.id
        });

        return apiSuccess<ChatResponse>({
          answer: withRetrievalMessage(ensureAnswerHasCitation(ragAnswer.answer, sources), searchResult.message),
          sources,
          retrievalMessage: searchResult.message
        });
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
      retrievalMessage: searchResult.message
    });
  } catch (error) {
    return apiError(error);
  }
}
