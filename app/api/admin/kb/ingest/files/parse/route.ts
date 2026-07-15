import { apiError } from "@/lib/api-response";
import { ValidationError } from "@/lib/errors";
import { hasDatabaseUrl } from "@/lib/server-config";
import { parseAdminIngestFile } from "@/lib/enterprise/ingest-file-parser";
import { requireAdminIngestActor } from "@/lib/enterprise/admin-ingest-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_MAX_PARSE_BYTES = 50 * 1024 * 1024;

function readMaxParseBytes() {
  const configured = Number(process.env.ADMIN_INGEST_PARSE_MAX_BYTES);

  return Number.isFinite(configured) && configured > 0
    ? Math.min(100 * 1024 * 1024, Math.max(1024 * 1024, Math.floor(configured)))
    : DEFAULT_MAX_PARSE_BYTES;
}

function jsonUtf8(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function isLocalDevWithoutDatabase(request: Request) {
  if (process.env.NODE_ENV === "production" || hasDatabaseUrl()) {
    return false;
  }

  const hostname = new URL(request.url).hostname;

  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    await requireAdminIngestActor(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "admin_kb_ingest_file_parse"
    });
  } catch (error) {
    if (!isLocalDevWithoutDatabase(request)) {
      return apiError(error);
    }
  }

  const maxParseBytes = readMaxParseBytes();
  const contentLength = Number(request.headers.get("content-length"));

  if (Number.isFinite(contentLength) && contentLength > maxParseBytes + 1024 * 1024) {
    return apiError(new ValidationError(`附件超过解析安全上限（${Math.floor(maxParseBytes / 1024 / 1024)} MB）。`));
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return apiError(new ValidationError("文件解析接口需要 multipart/form-data。"));
  }

  const file = formData.get("file");

  if (!(file instanceof File)) {
    return apiError(new ValidationError("缺少要解析的文件。"));
  }

  if (file.size > maxParseBytes) {
    return apiError(new ValidationError(`附件超过解析安全上限（${Math.floor(maxParseBytes / 1024 / 1024)} MB）。`));
  }

  const fileName = readString(formData.get("fileName")) || file.name;
  const mimeType = readString(formData.get("mimeType")) || file.type || "application/octet-stream";
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const parsed = await parseAdminIngestFile({
    fileName,
    mimeType,
    sizeBytes: file.size || buffer.byteLength,
    buffer
  });

  return jsonUtf8({
    data: parsed,
    ...parsed
  });
}
