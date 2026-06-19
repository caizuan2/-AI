import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { requireKbAdmin } from "@/lib/auth/guards";
import { ValidationError } from "@/lib/errors";
import { getRequestIdFromHeaders } from "@/lib/logger";
import { hasDatabaseUrl } from "@/lib/server-config";
import {
  analyzeEnterpriseIngest,
  cleanEnterpriseIngestInput,
  type EnterpriseIngestSourceType
} from "@/lib/enterprise/ai-ingest-service";
import {
  createEnterpriseIngestLog,
  getEnterpriseKnowledgeCategories,
  listEnterpriseTrainingRecords
} from "@/lib/enterprise/ingest-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readSourceType(value: unknown): EnterpriseIngestSourceType {
  if (value === "chat" || value === "text" || value === "file" || value === "image" || value === "url") {
    return value;
  }

  return "chat";
}

function readIngestRequest(body: unknown) {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const sourceType = readSourceType(body.sourceType);
  const rawInput = typeof body.input === "string"
    ? body.input
    : typeof body.content === "string"
      ? body.content
      : "";
  const sourceUrl = typeof body.sourceUrl === "string" && body.sourceUrl.trim() ? body.sourceUrl.trim() : null;
  const input = cleanEnterpriseIngestInput(sourceType === "url" && !rawInput.trim() && sourceUrl ? sourceUrl : rawInput);

  if (!input) {
    throw new ValidationError("投喂内容不能为空。");
  }

  return {
    input,
    sourceType,
    sourceUrl,
    agentId: typeof body.agentId === "string" && body.agentId.trim() ? body.agentId.trim() : null,
    agentName: typeof body.agentName === "string" && body.agentName.trim() ? body.agentName.trim() : null
  };
}

export async function GET(request: Request) {
  let actor: Awaited<ReturnType<typeof requireKbAdmin>>;

  try {
    actor = await requireKbAdmin(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "admin_kb_enterprise_ingest"
    });
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("读取管理员 AI 投喂记录"));
  }

  try {
    const records = await listEnterpriseTrainingRecords(actor);

    return apiSuccess({ records });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  const requestId = getRequestIdFromHeaders(request.headers);
  let actor: Awaited<ReturnType<typeof requireKbAdmin>>;

  try {
    actor = await requireKbAdmin(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "admin_kb_enterprise_ingest"
    });
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("管理员 AI 投喂"));
  }

  let input: ReturnType<typeof readIngestRequest>;

  try {
    input = readIngestRequest(await request.json());
  } catch (error) {
    return apiError(error instanceof Error ? error : new ValidationError("请求体必须是合法 JSON。"));
  }

  try {
    const existingCategories = await getEnterpriseKnowledgeCategories(actor);
    const structured = await analyzeEnterpriseIngest({
      input: input.input,
      sourceType: input.sourceType,
      sourceUrl: input.sourceUrl,
      existingCategories,
      requestId,
      userId: actor.id
    });
    const log = await createEnterpriseIngestLog(actor, {
      ...input,
      structured
    });
    const records = await listEnterpriseTrainingRecords(actor);

    return apiSuccess({
      job: log.job,
      draft: {
        ...structured,
        jobId: log.job.id,
        saveStatus: "pending"
      },
      record: log.record,
      records
    }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
