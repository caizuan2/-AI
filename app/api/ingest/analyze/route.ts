import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { requireBetaAccess } from "@/lib/beta";
import { AIError, RateLimitError, ValidationError } from "@/lib/errors";
import {
  mockAnalyzeKnowledge,
  toAnalyzeDraft,
  withSaveStrategy,
  type AnalyzeDraft,
  type AnalyzeResponse
} from "@/lib/knowledge/analyze";
import { getExistingCategoryNames } from "@/lib/knowledge/categories";
import { hasDatabaseUrl, hasUsableOpenAIKey, isAIFallbackAllowed } from "@/lib/server-config";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { getRequestIdFromHeaders } from "@/lib/logger";
import { getOrCreateUserSettings } from "@/lib/settings";
import { fetchWebPageContent, isProbablyUrl } from "@/lib/web/page-fetcher";

export const dynamic = "force-dynamic";

interface IngestAnalyzeRequest {
  content: string;
}

interface IngestAnalyzeResponse extends AnalyzeResponse {
  content: string;
  sourceType: "chat_input" | "web_url";
  sourceTitle: string | null;
  sourceUrl: string | null;
  fetchedFromUrl: boolean;
}

const MAX_INGEST_CONTENT_CHARS = 50_000;
const INGEST_RATE_LIMIT = {
  limit: 10,
  windowMs: 60_000
};

function isRequestBody(value: unknown): value is IngestAnalyzeRequest {
  return isPlainObject(value) && "content" in value;
}

export async function POST(request: Request) {
  const requestId = getRequestIdFromHeaders(request.headers);
  let currentUser: Awaited<ReturnType<typeof requireBetaAccess>>;
  let settings: Awaited<ReturnType<typeof getOrCreateUserSettings>>;
  let existingCategories: string[] = [];

  try {
    currentUser = await requireBetaAccess();
    const rateLimit = checkRateLimit(request, {
      namespace: "api:ingest:analyze",
      userId: currentUser.id,
      ...INGEST_RATE_LIMIT
    });

    if (!rateLimit.allowed) {
      return apiError(
        new RateLimitError(`知识整理请求过于频繁，请 ${rateLimit.retryAfterSeconds} 秒后再试。`),
        { headers: rateLimitHeaders(rateLimit) }
      );
    }

    if (!hasDatabaseUrl()) {
      return apiError(databaseConfigError("读取知识保存策略"));
    }

    settings = await getOrCreateUserSettings(currentUser.id);
    existingCategories = await getExistingCategoryNames(currentUser.id);
  } catch (error) {
    return apiError(error);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return apiError(new ValidationError("请求体必须是合法 JSON。"));
  }

  if (!isRequestBody(body) || typeof body.content !== "string" || body.content.trim().length === 0) {
    return apiError(new ValidationError("请输入要投喂的内容。"));
  }

  const rawContent = body.content.trim();

  if (rawContent.length > MAX_INGEST_CONTENT_CHARS) {
    return apiError(new ValidationError(`投喂内容过长，请控制在 ${MAX_INGEST_CONTENT_CHARS} 字以内。`));
  }

  let content = rawContent;
  let analysisContent = rawContent;
  let sourceType: IngestAnalyzeResponse["sourceType"] = "chat_input";
  let sourceTitle: string | null = null;
  let sourceUrl: string | null = null;

  if (isProbablyUrl(rawContent)) {
    try {
      const page = await fetchWebPageContent(rawContent);

      content = page.content;
      analysisContent = [
        `网页标题：${page.title}`,
        `来源链接：${page.url}`,
        "",
        "网页正文：",
        page.content
      ].join("\n");
      sourceType = "web_url";
      sourceTitle = page.title;
      sourceUrl = page.url;
    } catch (error) {
      return apiError(error);
    }
  }

  function withSourceMetadata(draft: AnalyzeResponse): IngestAnalyzeResponse {
    return {
      ...draft,
      content,
      sourceType,
      sourceTitle,
      sourceUrl,
      fetchedFromUrl: sourceType === "web_url"
    };
  }

  function buildFallbackDraft(): AnalyzeDraft {
    const draft = mockAnalyzeKnowledge(analysisContent);

    if (sourceType !== "web_url" || !sourceTitle) {
      return draft;
    }

    return {
      ...draft,
      title: sourceTitle,
      summary: `${content.slice(0, 140)}${content.length > 140 ? "..." : ""}`,
      tags: Array.from(new Set([...draft.tags, "网页"])),
      category: draft.category === "未分类" ? "网页资料" : draft.category
    };
  }

  function preferExistingCategory(draft: AnalyzeDraft): AnalyzeDraft {
    if (existingCategories.length === 0 || existingCategories.includes(draft.category)) {
      return draft;
    }

    const matchedCategory = existingCategories.find((category) => analysisContent.includes(category));

    return matchedCategory ? { ...draft, category: matchedCategory } : draft;
  }

  if (!hasUsableOpenAIKey()) {
    if (!isAIFallbackAllowed()) {
      return apiError(new AIError("生产环境必须配置真实 OPENAI_API_KEY，不能使用本地知识整理 fallback。"));
    }

    return apiSuccess<IngestAnalyzeResponse>(
      withSourceMetadata(withSaveStrategy(preferExistingCategory(buildFallbackDraft()), settings.saveStrategy))
    );
  }

  try {
    const { structureKnowledge } = await import("@/lib/ai/knowledge-structurer");
    const result = await structureKnowledge({
      content: analysisContent,
      existingCategories,
      requestId,
      userId: currentUser.id
    });

    return apiSuccess<IngestAnalyzeResponse>(
      withSourceMetadata(withSaveStrategy(preferExistingCategory(toAnalyzeDraft(result.knowledge)), settings.saveStrategy))
    );
  } catch (error) {
    if (!isAIFallbackAllowed()) {
      return apiError(error);
    }

    const fallback = preferExistingCategory(buildFallbackDraft());

    return apiSuccess<IngestAnalyzeResponse>(
      withSourceMetadata(withSaveStrategy({
        ...fallback,
        reason: `${fallback.reason} AI 分析暂不可用，已返回本地整理结果。`
      }, settings.saveStrategy))
    );
  }
}
