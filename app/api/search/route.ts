import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { requireBetaAccess } from "@/lib/beta";
import { ValidationError } from "@/lib/errors";
import { getRequestIdFromHeaders } from "@/lib/logger";
import { retrieveKnowledge, type RetrieveKnowledgeResponse } from "@/lib/rag/retriever";
import { hasDatabaseUrl, SEARCH_DEFAULT_TOP_K, SEARCH_MAX_TOP_K } from "@/lib/server-config";

export const dynamic = "force-dynamic";

interface SearchRequest {
  query: string;
  topK?: number;
}

const MAX_SEARCH_QUERY_CHARS = 1000;

function parseSearchRequest(body: unknown): SearchRequest {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";

  if (!query) {
    throw new ValidationError("请输入搜索问题。");
  }

  if (query.length > MAX_SEARCH_QUERY_CHARS) {
    throw new ValidationError(`搜索问题过长，请控制在 ${MAX_SEARCH_QUERY_CHARS} 字以内。`);
  }

  const rawTopK = typeof body.topK === "number" ? Math.round(body.topK) : SEARCH_DEFAULT_TOP_K;
  const topK = Number.isInteger(rawTopK) && rawTopK > 0
    ? Math.min(rawTopK, SEARCH_MAX_TOP_K)
    : SEARCH_DEFAULT_TOP_K;

  return { query, topK };
}

export async function POST(request: Request) {
  const requestId = getRequestIdFromHeaders(request.headers);
  let currentUser: Awaited<ReturnType<typeof requireBetaAccess>>;

  try {
    currentUser = await requireBetaAccess();
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("搜索知识库"));
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return apiError(new ValidationError("请求体必须是合法 JSON。"));
  }

  let input: SearchRequest;

  try {
    input = parseSearchRequest(body);
  } catch (error) {
    return apiError(error);
  }

  try {
    const result = await retrieveKnowledge({
      query: input.query,
      topK: input.topK ?? SEARCH_DEFAULT_TOP_K,
      userId: currentUser.id,
      requestId
    });

    return apiSuccess<RetrieveKnowledgeResponse>(result);
  } catch (error) {
    return apiError(error);
  }
}
