import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { requireUser } from "@/lib/auth";
import { ValidationError } from "@/lib/errors";
import { hasDatabaseUrl } from "@/lib/server-config";
import { assertLicenseFeature } from "@/lib/core/license-gate";
import { resolveTenantContext } from "@/lib/core/tenant-context";
import { getCoreRequestId } from "@/lib/core/knowledge-core-engine";
import { semanticSearch } from "@/lib/core/semantic-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readRequest(body: unknown) {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const query = typeof body.query === "string"
    ? body.query.trim()
    : typeof body.question === "string"
      ? body.question.trim()
      : "";

  if (!query) {
    throw new ValidationError("请输入语义搜索内容。");
  }

  return {
    query,
    topK: typeof body.topK === "number" ? body.topK : undefined,
    agentId: typeof body.agentId === "string" ? body.agentId.trim() || null : null,
    knowledgeBaseId: typeof body.knowledgeBaseId === "string" ? body.knowledgeBaseId.trim() || null : null,
    namespace: typeof body.namespace === "string" ? body.namespace.trim() || null : null
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
    return apiError(databaseConfigError("执行语义搜索"));
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
    await assertLicenseFeature({ id: actor.id }, tenant, "embedding");

    const result = await semanticSearch({
      tenantId: tenant.tenantId,
      userId: actor.id,
      query: input.query,
      topK: input.topK,
      agentId: input.agentId,
      knowledgeBaseId: input.knowledgeBaseId,
      namespace: input.namespace,
      requestId: getCoreRequestId(request)
    });

    return apiSuccess({
      tenant,
      ...result
    });
  } catch (error) {
    return apiError(error);
  }
}
