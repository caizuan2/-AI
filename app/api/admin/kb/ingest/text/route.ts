import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { requireKbAdmin } from "@/lib/auth/guards";
import { writeAuditLog } from "@/lib/audit-log";
import { createAdminKbTextIngestion } from "@/lib/admin-kb/ingestion";
import { ValidationError } from "@/lib/errors";
import { hasDatabaseUrl } from "@/lib/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AdminKbTextIngestResponse {
  job: {
    id: string;
    sourceType: string;
    status: string;
    progress: number;
    knowledgeItemId: string | null;
  };
  knowledgeItem: {
    id: string;
    title: string;
    chunkCount: number;
  };
}

function readTextRequest(body: unknown) {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const content = typeof body.content === "string" ? body.content : "";
  const categoryId = typeof body.category_id === "string"
    ? body.category_id.trim()
    : typeof body.categoryId === "string"
      ? body.categoryId.trim()
      : "";

  return {
    title,
    content,
    categoryId,
    tags: body.tags,
    metadata: body.metadata
  };
}

export async function POST(request: Request) {
  let actor: Awaited<ReturnType<typeof requireKbAdmin>>;

  try {
    actor = await requireKbAdmin(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "admin_kb_ingest_text",
      requiredAppType: "ingest_admin"
    });
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("管理员文字投喂"));
  }

  let input: ReturnType<typeof readTextRequest>;

  try {
    input = readTextRequest(await request.json());
  } catch (error) {
    await writeAuditLog({
      userId: actor.id,
      role: actor.role,
      action: "INGEST_JOB_FAILED",
      targetType: "ingestion_job",
      request,
      metadata: {
        sourceType: "text",
        reason: error instanceof Error ? error.message : "invalid_json"
      }
    });

    return apiError(error instanceof Error ? error : new ValidationError("请求体必须是合法 JSON。"));
  }

  try {
    const result = await createAdminKbTextIngestion(actor, {
      ...input,
      sourceType: "text",
      auditAction: "INGEST_TEXT_CREATE"
    });

    return apiSuccess<AdminKbTextIngestResponse>({
      job: {
        id: result.job.id,
        sourceType: result.job.sourceType,
        status: result.job.status,
        progress: result.job.progress,
        knowledgeItemId: result.job.knowledgeItemId
      },
      knowledgeItem: result.knowledgeItem
    }, { status: 201 });
  } catch (error) {
    await writeAuditLog({
      userId: actor.id,
      role: actor.role,
      action: "INGEST_JOB_FAILED",
      targetType: "ingestion_job",
      request,
      metadata: {
        sourceType: "text",
        reason: error instanceof Error ? error.message : "ingest_failed"
      }
    });

    return apiError(error);
  }
}
