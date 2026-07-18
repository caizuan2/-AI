import { apiError } from "@/lib/api-response";
import { ValidationError } from "@/lib/errors";
import { hasDatabaseUrl } from "@/lib/server-config";
import { parseAdminIngestFile } from "@/lib/enterprise/ingest-file-parser";
import { requireAdminIngestActor } from "@/lib/enterprise/admin-ingest-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
