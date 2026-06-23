import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { requireKbAdmin } from "@/lib/auth/guards";
import { ValidationError } from "@/lib/errors";
import { hasDatabaseUrl } from "@/lib/server-config";
import { assertLicenseFeature } from "@/lib/core/license-gate";
import { resolveTenantContext } from "@/lib/core/tenant-context";
import {
  getCoreRequestId,
  ingestKnowledgeCore,
  type CoreKnowledgeSource
} from "@/lib/core/knowledge-core-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readSource(value: unknown): CoreKnowledgeSource {
  if (value === "admin_ingest" || value === "file" || value === "chat" || value === "url") {
    return value;
  }

  return "admin_ingest";
}

function readRequest(body: unknown) {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const input = typeof body.input === "string"
    ? body.input.trim()
    : typeof body.content === "string"
      ? body.content.trim()
      : "";

  if (!input) {
    throw new ValidationError("投喂内容不能为空。");
  }

  return {
    input,
    source: readSource(body.source),
    sourceUrl: typeof body.sourceUrl === "string" && body.sourceUrl.trim() ? body.sourceUrl.trim() : null,
    agentId: typeof body.agentId === "string" && body.agentId.trim() ? body.agentId.trim() : null,
    agentName: typeof body.agentName === "string" && body.agentName.trim() ? body.agentName.trim() : null,
    autoSave: body.autoSave !== false
  };
}

export async function POST(request: Request) {
  let actor: Awaited<ReturnType<typeof requireKbAdmin>>;

  try {
    actor = await requireKbAdmin(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "core_ingest",
      requireLicense: true,
      requiredAppType: "ingest_admin"
    });
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("执行知识核心投喂"));
  }

  let input: ReturnType<typeof readRequest>;

  try {
    input = readRequest(await request.json());
  } catch (error) {
    return apiError(error instanceof Error ? error : new ValidationError("请求体必须是合法 JSON。"));
  }

  try {
    const tenant = await resolveTenantContext(actor, request);
    await assertLicenseFeature(actor, tenant, "ingest");

    const result = await ingestKnowledgeCore({
      ...actor,
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName,
      tenantPlan: tenant.tenantPlan,
      tenantStatus: tenant.tenantStatus
    }, {
      ...input,
      requestId: getCoreRequestId(request)
    });

    return apiSuccess(result, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
