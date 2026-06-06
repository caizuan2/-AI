import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { requireKbAdmin } from "@/lib/auth/guards";
import { writeAuditLog } from "@/lib/audit-log";
import {
  buildChatIngestContent,
  cleanIngestText,
  createAdminKbTextIngestion
} from "@/lib/admin-kb/ingestion";
import { ValidationError } from "@/lib/errors";
import { hasDatabaseUrl } from "@/lib/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readChatRequest(body: unknown) {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const content = buildChatIngestContent({
    messages: body.messages,
    content: body.content
  });
  const confirmed = body.confirmed === true;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const categoryId = typeof body.category_id === "string"
    ? body.category_id.trim()
    : typeof body.categoryId === "string"
      ? body.categoryId.trim()
      : "";

  if (!content) {
    throw new ValidationError("对话投喂内容不能为空。");
  }

  return {
    title,
    content: cleanIngestText(content),
    confirmed,
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
      targetType: "admin_kb_ingest_chat"
    });
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("管理员对话投喂"));
  }

  let input: ReturnType<typeof readChatRequest>;

  try {
    input = readChatRequest(await request.json());
  } catch (error) {
    return apiError(error instanceof Error ? error : new ValidationError("请求体必须是合法 JSON。"));
  }

  if (!input.confirmed) {
    await writeAuditLog({
      userId: actor.id,
      role: actor.role,
      action: "INGEST_CHAT_PREVIEW",
      targetType: "ingestion_job",
      request,
      metadata: {
        sourceType: "chat",
        charLength: input.content.length
      }
    });

    return apiSuccess({
      confirmed: false,
      preview: {
        title: input.title || input.content.split("\n")[0]?.slice(0, 80) || "对话投喂预览",
        contentPreview: input.content.slice(0, 600),
        charLength: input.content.length
      }
    });
  }

  try {
    const result = await createAdminKbTextIngestion(actor, {
      title: input.title,
      content: input.content,
      categoryId: input.categoryId,
      tags: input.tags,
      metadata: input.metadata,
      sourceType: "chat",
      auditAction: "INGEST_CHAT_CONFIRM"
    });

    return apiSuccess({
      confirmed: true,
      job: result.job,
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
        sourceType: "chat",
        reason: error instanceof Error ? error.message : "ingest_failed"
      }
    });

    return apiError(error);
  }
}
