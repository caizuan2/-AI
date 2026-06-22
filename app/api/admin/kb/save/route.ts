import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { requireKbAdmin } from "@/lib/auth/guards";
import { ValidationError } from "@/lib/errors";
import { hasDatabaseUrl } from "@/lib/server-config";
import { normalizeEnterpriseStructuredKnowledge } from "@/lib/enterprise/ingest-logger";
import {
  completeEnterpriseIngestSave,
  listEnterpriseTrainingRecords
} from "@/lib/enterprise/ingest-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readSaveRequest(body: unknown) {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const jobId = typeof body.jobId === "string" ? body.jobId.trim() : "";
  const originalInput = typeof body.originalInput === "string" ? body.originalInput : null;
  const sourceUrl = typeof body.sourceUrl === "string" && body.sourceUrl.trim() ? body.sourceUrl.trim() : null;
  const structured = normalizeEnterpriseStructuredKnowledge(body.structured);

  if (!jobId) {
    throw new ValidationError("训练记录 ID 不能为空。");
  }

  return {
    jobId,
    originalInput,
    sourceUrl,
    structured
  };
}

export async function POST(request: Request) {
  let actor: Awaited<ReturnType<typeof requireKbAdmin>>;

  try {
    actor = await requireKbAdmin(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "admin_kb_enterprise_save"
    });
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("保存管理员 AI 投喂知识"));
  }

  let input: ReturnType<typeof readSaveRequest>;

  try {
    input = readSaveRequest(await request.json());
  } catch (error) {
    return apiError(error instanceof Error ? error : new ValidationError("请求体必须是合法 JSON。"));
  }

  try {
    const result = await completeEnterpriseIngestSave(actor, input);
    const records = await listEnterpriseTrainingRecords(actor);

    return apiSuccess({
      ...result,
      records
    }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
