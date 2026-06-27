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

  const readString = (value: unknown) => typeof value === "string" ? value.trim() : "";
  const readRecord = (value: unknown) => isPlainObject(value) ? value : {};
  const activeKnowledgeBase = readRecord(body.activeKnowledgeBase);
  const kbId =
    readString(body.kb_id) ||
    readString(body.kbId) ||
    readString(body.knowledgeBaseId) ||
    readString(activeKnowledgeBase.kb_id) ||
    readString(activeKnowledgeBase.kbId) ||
    readString(activeKnowledgeBase.knowledgeBaseId);
  const expertId =
    readString(body.expert_id) ||
    readString(body.expertId) ||
    readString(activeKnowledgeBase.expert_id) ||
    readString(activeKnowledgeBase.expertId);
  const tenantId =
    readString(body.tenant_id) ||
    readString(body.tenantId) ||
    readString(activeKnowledgeBase.tenant_id) ||
    readString(activeKnowledgeBase.tenantId) ||
    "default";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const content = typeof body.content === "string" ? body.content : "";
  const requestedSourceType = readString(body.sourceType) || readString(body.source_type);
  const ingestSourceType: "chat" | "text" = requestedSourceType.toLowerCase().includes("chat") ? "chat" : "text";
  const categoryId = typeof body.category_id === "string"
    ? body.category_id.trim()
    : typeof body.categoryId === "string"
      ? body.categoryId.trim()
      : "";

  return {
    title,
    content,
    sourceType: ingestSourceType,
    categoryId,
    tags: body.tags,
    metadata: {
      ...readRecord(body.metadata),
      source: "admin_ingest",
      requestedSourceType: requestedSourceType || ingestSourceType,
      sourceApp: "ingest_admin",
      appType: "knowledge_base",
      visibility: "published",
      published: true,
      enabled: true,
      shared: true,
      sharedToUserApp: true,
      ...(kbId ? { kb_id: kbId, kbId, knowledgeBaseId: kbId } : {}),
      ...(expertId ? { expert_id: expertId, expertId, agentId: readString(body.agentId) || expertId } : {}),
      tenant_id: tenantId,
      tenantId
    }
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
