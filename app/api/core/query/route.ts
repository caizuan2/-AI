import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { requireUser } from "@/lib/auth";
import { ValidationError } from "@/lib/errors";
import { hasDatabaseUrl } from "@/lib/server-config";
import { assertLicenseFeature } from "@/lib/core/license-gate";
import { resolveTenantContext } from "@/lib/core/tenant-context";
import {
  getCoreRequestId,
  queryKnowledgeCore
} from "@/lib/core/knowledge-core-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readRequest(body: unknown) {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const question = typeof body.question === "string"
    ? body.question.trim()
    : typeof body.query === "string"
      ? body.query.trim()
      : "";

  if (!question) {
    throw new ValidationError("请输入问题。");
  }

  const topK = typeof body.topK === "number" ? body.topK : undefined;
  const semantic = typeof body.semantic === "boolean" ? body.semantic : undefined;

  return {
    question,
    topK,
    semantic
  };
}

export async function POST(request: Request) {
  let actor: Awaited<ReturnType<typeof requireUser>>;

  try {
    actor = await requireUser();
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("执行知识核心查询"));
  }

  let input: ReturnType<typeof readRequest>;

  try {
    input = readRequest(await request.json());
  } catch (error) {
    return apiError(error instanceof Error ? error : new ValidationError("请求体必须是合法 JSON。"));
  }

  try {
    const tenant = await resolveTenantContext({
      id: actor.id,
      role: "user"
    }, request);
    await assertLicenseFeature({ id: actor.id }, tenant, "chat");

    const result = await queryKnowledgeCore({
      id: actor.id,
      role: "user",
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName,
      tenantPlan: tenant.tenantPlan,
      tenantStatus: tenant.tenantStatus
    }, {
      ...input,
      requestId: getCoreRequestId(request)
    });

    return apiSuccess(result);
  } catch (error) {
    return apiError(error);
  }
}
