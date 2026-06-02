import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { requireBetaAccess } from "@/lib/beta";
import { ValidationError } from "@/lib/errors";
import {
  addDuplicateTarget,
  createDuplicateIndex,
  createImportedKnowledgeItem,
  findDuplicateKnowledgeItem,
  parseKnowledgeImportPayload,
  type KnowledgeImportResult
} from "@/lib/knowledge/import-export";
import { calculateExpiresAt } from "@/lib/knowledge/status";
import { hasDatabaseUrl } from "@/lib/server-config";
import { getOrCreateUserSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const MAX_IMPORT_REQUEST_BYTES = 5 * 1024 * 1024;

function validateImportContentLength(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");

  if (Number.isFinite(contentLength) && contentLength > MAX_IMPORT_REQUEST_BYTES) {
    throw new ValidationError("导入文件过大，请上传不超过 5MB 的 JSON 文件。");
  }
}

export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof requireBetaAccess>>;

  try {
    user = await requireBetaAccess();
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("导入知识库"));
  }

  let body: unknown;

  try {
    validateImportContentLength(request);
    body = await request.json();
  } catch (error) {
    return apiError(error instanceof ValidationError ? error : new ValidationError("导入文件必须是合法 JSON。"));
  }

  let importItems: ReturnType<typeof parseKnowledgeImportPayload>;

  try {
    importItems = parseKnowledgeImportPayload(body);
  } catch (error) {
    return apiError(error);
  }

  try {
    const settings = await getOrCreateUserSettings(user.id);
    const fallbackExpiresAt = calculateExpiresAt(settings.defaultExpireDays);
    const existingItems = await prisma.knowledgeItem.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        title: true,
        summary: true,
        content: true,
        sourceUrl: true,
        sourceMessageId: true
      }
    });
    const duplicateIndex = createDuplicateIndex(existingItems);
    const result: KnowledgeImportResult = {
      imported: 0,
      skippedDuplicates: 0,
      failed: 0,
      createdItems: [],
      duplicates: [],
      errors: []
    };

    for (let index = 0; index < importItems.length; index += 1) {
      const item = importItems[index];
      const duplicate = findDuplicateKnowledgeItem(duplicateIndex, item);

      if (duplicate) {
        result.skippedDuplicates += 1;
        result.duplicates.push({
          index,
          title: item.title,
          reason: duplicate.reason,
          existingId: duplicate.target.id,
          existingTitle: duplicate.target.title
        });
        continue;
      }

      try {
        const created = await createImportedKnowledgeItem(user.id, item, fallbackExpiresAt);

        result.imported += 1;
        result.createdItems.push({
          id: created.id,
          title: created.title
        });
        addDuplicateTarget(duplicateIndex, {
          id: created.id,
          title: created.title,
          summary: created.summary,
          content: created.content,
          sourceUrl: created.sourceUrl,
          sourceMessageId: created.sourceMessageId
        });
      } catch (error) {
        result.failed += 1;
        result.errors.push({
          index,
          title: item.title,
          message: error instanceof Error ? error.message : "导入失败。"
        });
      }
    }

    return apiSuccess<KnowledgeImportResult>(result, {
      status: result.imported > 0 ? 201 : 200
    });
  } catch (error) {
    return apiError(error);
  }
}
