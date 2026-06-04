import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { AnalyticsEventType, recordAnalyticsEvent } from "@/lib/analytics";
import { requireLicensedUser } from "@/lib/auth/guards";
import { AIError, ValidationError } from "@/lib/errors";
import {
  buildUploadAnalysisText,
  extractTextFromUpload,
  uploadMaxFileSizeBytes,
  uploadMaxFileSizeLabel,
  uploadSupportedExtensions,
  type UploadedTextSegment
} from "@/lib/upload/file-text";
import {
  mockAnalyzeKnowledge,
  toAnalyzeDraft,
  withSaveStrategy,
  type AnalyzeResponse
} from "@/lib/knowledge/analyze";
import { getExistingCategoryNames } from "@/lib/knowledge/categories";
import { getRequestIdFromHeaders } from "@/lib/logger";
import { hasDatabaseUrl, hasUsableChatProvider, isAIFallbackAllowed } from "@/lib/server-config";
import { getOrCreateUserSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface UploadAnalyzeResponse extends AnalyzeResponse {
  file: {
    name: string;
    type: string;
    extension: string;
    size: number;
    maxSize: number;
  };
  content: string;
  charLength: number;
  segmentCount: number;
  segments: UploadedTextSegment[];
  sourceType: "document";
  sourceTitle: string;
}

function getUploadedFile(formData: FormData) {
  const file = formData.get("file");

  if (!(file instanceof File)) {
    throw new ValidationError("请选择要上传的文件。");
  }

  return file;
}

function validateUploadContentLength(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  const maxRequestSizeBytes = uploadMaxFileSizeBytes + 2 * 1024 * 1024;

  if (Number.isFinite(contentLength) && contentLength > maxRequestSizeBytes) {
    throw new ValidationError(`上传请求过大，请选择不超过 ${uploadMaxFileSizeLabel} 的文件。`);
  }
}

export async function POST(request: Request) {
  const requestId = getRequestIdFromHeaders(request.headers);
  let currentUser: Awaited<ReturnType<typeof requireLicensedUser>>;
  let settings: Awaited<ReturnType<typeof getOrCreateUserSettings>>;
  let existingCategories: string[] = [];

  try {
    currentUser = await requireLicensedUser();

    if (!hasDatabaseUrl()) {
      return apiError(databaseConfigError("分析上传文件"));
    }

    settings = await getOrCreateUserSettings(currentUser.id);
    existingCategories = await getExistingCategoryNames(currentUser.id);
  } catch (error) {
    return apiError(error);
  }

  let file: File;

  try {
    validateUploadContentLength(request);
    const formData = await request.formData();

    file = getUploadedFile(formData);
  } catch (error) {
    return apiError(error instanceof ValidationError ? error : new ValidationError("上传请求格式不正确。"));
  }

  try {
    const extracted = await extractTextFromUpload(file);
    const analysisText = buildUploadAnalysisText(extracted.content, extracted.segments);
    const preferExistingCategory = <T extends { category: string }>(draft: T): T => {
      if (existingCategories.length === 0 || existingCategories.includes(draft.category)) {
        return draft;
      }

      const matchedCategory = existingCategories.find((category) => analysisText.includes(category));

      return matchedCategory ? { ...draft, category: matchedCategory } : draft;
    };

    if (!hasUsableChatProvider() && !isAIFallbackAllowed()) {
      return apiError(new AIError("生产环境必须配置真实 AI 生成模型，不能使用本地文件整理 fallback。"));
    }

    let analysis = preferExistingCategory(mockAnalyzeKnowledge(analysisText));

    if (hasUsableChatProvider()) {
      try {
        const { structureKnowledge } = await import("@/lib/ai/knowledge-structurer");
        const result = await structureKnowledge({
          content: analysisText,
          sourceType: "document",
          sourceId: extracted.fileName,
          existingCategories,
          requestId,
          userId: currentUser.id
        });

        analysis = preferExistingCategory(toAnalyzeDraft(result.knowledge));
      } catch (error) {
        if (!isAIFallbackAllowed()) {
          return apiError(error);
        }

        analysis = {
          ...analysis,
          reason: `${analysis.reason} AI 分析暂不可用，已返回本地整理结果。`
        };
      }
    }

    await recordAnalyticsEvent({
      userId: currentUser.id,
      type: AnalyticsEventType.FILE_UPLOAD,
      numericValue: 1,
      metadata: {
        requestId,
        extension: extracted.extension,
        size: extracted.size,
        charLength: extracted.charLength,
        segmentCount: extracted.segments.length
      }
    });

    return apiSuccess<UploadAnalyzeResponse>({
      ...withSaveStrategy(analysis, settings.saveStrategy),
      file: {
        name: extracted.fileName,
        type: extracted.mimeType,
        extension: extracted.extension,
        size: extracted.size,
        maxSize: uploadMaxFileSizeBytes
      },
      content: extracted.content,
      charLength: extracted.charLength,
      segmentCount: extracted.segments.length,
      segments: extracted.segments,
      sourceType: "document",
      sourceTitle: extracted.fileName
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return apiError(error);
    }

    return apiError(new ValidationError(
      `文件解析失败。请确认文件类型为 ${uploadSupportedExtensions.join("、")}，大小不超过 ${uploadMaxFileSizeLabel}。`
    ));
  }
}
