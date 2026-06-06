import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { requireKbAdmin } from "@/lib/auth/guards";
import { writeAuditLog } from "@/lib/audit-log";
import {
  adminKbUploadLimits,
  createAdminKbFileIngestion
} from "@/lib/admin-kb/ingestion";
import { ValidationError } from "@/lib/errors";
import { hasDatabaseUrl } from "@/lib/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readFormString(formData: FormData, name: string) {
  const value = formData.get(name);

  return typeof value === "string" ? value.trim() : "";
}

function parseTags(value: string) {
  if (!value) {
    return [];
  }

  if (value.startsWith("[")) {
    try {
      const parsed = JSON.parse(value);

      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return value.split(",").map((tag) => tag.trim()).filter(Boolean);
}

function parseMetadata(value: string) {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value);

    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function validateContentLength(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  const maxRequestSizeBytes = adminKbUploadLimits.maxFileSizeBytes + 2 * 1024 * 1024;

  if (Number.isFinite(contentLength) && contentLength > maxRequestSizeBytes) {
    throw new ValidationError("上传请求过大，请选择不超过 10MB 的文件。");
  }
}

export async function POST(request: Request) {
  let actor: Awaited<ReturnType<typeof requireKbAdmin>>;

  try {
    actor = await requireKbAdmin(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "admin_kb_ingest_file"
    });
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("管理员文件投喂"));
  }

  let file: File;
  let categoryId = "";
  let tags: unknown[] = [];
  let metadata: unknown;

  try {
    validateContentLength(request);
    const formData = await request.formData();
    const value = formData.get("file");

    if (!(value instanceof File)) {
      throw new ValidationError("请选择要投喂的文件。");
    }

    file = value;
    categoryId = readFormString(formData, "category_id") || readFormString(formData, "categoryId");
    tags = parseTags(readFormString(formData, "tags"));
    metadata = parseMetadata(readFormString(formData, "metadata"));
  } catch (error) {
    await writeAuditLog({
      userId: actor.id,
      role: actor.role,
      action: "INGEST_JOB_FAILED",
      targetType: "knowledge_file",
      request,
      metadata: {
        sourceType: "file",
        reason: error instanceof Error ? error.message : "invalid_upload"
      }
    });

    return apiError(error);
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await createAdminKbFileIngestion(actor, {
      originalName: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      bytes,
      categoryId,
      tags,
      metadata
    });

    return apiSuccess(result, { status: 201 });
  } catch (error) {
    await writeAuditLog({
      userId: actor.id,
      role: actor.role,
      action: "INGEST_JOB_FAILED",
      targetType: "knowledge_file",
      request,
      metadata: {
        sourceType: "file",
        fileName: file.name,
        fileSize: file.size,
        reason: error instanceof Error ? error.message : "file_ingest_failed"
      }
    });

    return apiError(error);
  }
}
