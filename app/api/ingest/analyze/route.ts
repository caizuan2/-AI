import { NextResponse } from "next/server";
import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { requireLicensedUser } from "@/lib/auth/guards";
import { AppError, InvalidInputError, RateLimitError, ValidationError, toAppError } from "@/lib/errors";
import { getPrismaErrorDiagnostics } from "@/lib/db/prisma-error-diagnostics";
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
import { getRequestIdFromHeaders, logger, REQUEST_ID_HEADER, toSafeErrorLog } from "@/lib/logger";
import { getOrCreateUserSettings } from "@/lib/settings";
import { fetchWebPageContent, isProbablyUrl } from "@/lib/web/page-fetcher";

export const runtime = "nodejs";
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

function ingestApiError(error: unknown, requestId: string, operation: string) {
  const appError = toAppError(error);
  const diagnostics = getPrismaErrorDiagnostics(error, operation);
  const message = appError.code === "DATABASE_SCHEMA_MISSING"
    ? "数据库表结构未就绪"
    : appError.message;

  logger[appError.statusCode >= 500 ? "error" : "warn"]("ingest.api_error", {
    requestId,
    code: appError.code,
    statusCode: appError.statusCode,
    prismaCode: diagnostics.prismaCode,
    missingTable: diagnostics.missingTable,
    missingColumn: diagnostics.missingColumn,
    model: diagnostics.model,
    operation,
    error: toSafeErrorLog(error)
  });

  return NextResponse.json(
    {
      ok: false,
      code: appError.code,
      message,
      requestId,
      prismaCode: diagnostics.prismaCode,
      safeErrorMessage: diagnostics.safeErrorMessage,
      missingTable: diagnostics.missingTable,
      missingColumn: diagnostics.missingColumn,
      model: diagnostics.model,
      operation: diagnostics.operation,
      success: false,
      error: {
        code: appError.code,
        message,
        requestId,
        prismaCode: diagnostics.prismaCode,
        safeErrorMessage: diagnostics.safeErrorMessage,
        missingTable: diagnostics.missingTable,
        missingColumn: diagnostics.missingColumn,
        model: diagnostics.model,
        operation: diagnostics.operation
      }
    },
    {
      status: appError.statusCode,
      headers: {
        [REQUEST_ID_HEADER]: requestId
      }
    }
  );
}

function isRequestBody(value: unknown): value is IngestAnalyzeRequest {
  return isPlainObject(value) && "content" in value;
}

export async function POST(request: Request) {
  const requestId = getRequestIdFromHeaders(request.headers);
  let currentUser: Awaited<ReturnType<typeof requireLicensedUser>>;
  let settings: Awaited<ReturnType<typeof getOrCreateUserSettings>>;
  let existingCategories: string[] = [];

  try {
    currentUser = await requireLicensedUser();
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

    try {
      settings = await getOrCreateUserSettings(currentUser.id);
    } catch (error) {
      logger.error("ingest.settings_failed", {
        requestId,
        userId: currentUser.id,
        diagnostics: getPrismaErrorDiagnostics(error, "UserSettings.upsert"),
        error: toSafeErrorLog(error)
      });
      return ingestApiError(error, requestId, "UserSettings.upsert");
    }

    try {
      existingCategories = await getExistingCategoryNames(currentUser.id);
    } catch (error) {
      logger.warn("ingest.categories_failed", {
        requestId,
        userId: currentUser.id,
        diagnostics: getPrismaErrorDiagnostics(error, "KnowledgeItem.groupBy"),
        error: toSafeErrorLog(error)
      });
      existingCategories = [];
    }
  } catch (error) {
    return ingestApiError(error, requestId, "Session.findUnique/User.findUnique");
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return apiError(new InvalidInputError("请求体必须是合法 JSON。"));
  }

  if (!isRequestBody(body) || typeof body.content !== "string" || body.content.trim().length === 0) {
    return apiError(new InvalidInputError("请输入要投喂的内容。"));
  }

  const rawContent = body.content.trim();

  if (rawContent.length < 2) {
    return apiError(new InvalidInputError("投喂内容太短，请补充更完整的知识内容。"));
  }

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
      return apiError(new AppError(
        "MISSING_AI_API_KEY",
        "Netlify 环境变量缺失：OPENAI_API_KEY。请配置后重新部署。",
        500
      ));
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
      const appError = toAppError(error);

      return apiError(
        appError.code === "APP_ERROR" || appError.code === "UNKNOWN_ERROR"
          ? new AppError("AI_REQUEST_FAILED", "AI 知识整理失败，请检查 OpenAI 配置或稍后重试。", 502)
          : appError
      );
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
