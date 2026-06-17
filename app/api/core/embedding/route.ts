import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { requireKbAdmin } from "@/lib/auth/guards";
import { ValidationError } from "@/lib/errors";
import { hasDatabaseUrl } from "@/lib/server-config";
import { assertLicenseFeature } from "@/lib/core/license-gate";
import { resolveTenantContext } from "@/lib/core/tenant-context";
import { createCoreEmbedding, indexKnowledgeItemEmbedding } from "@/lib/core/embedding-service";
import { getCoreRequestId } from "@/lib/core/knowledge-core-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readRequest(body: unknown) {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const knowledgeItemId = typeof body.knowledgeItemId === "string" ? body.knowledgeItemId.trim() : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";

  if (!knowledgeItemId && !text) {
    throw new ValidationError("请提供 knowledgeItemId 或 text。");
  }

  return {
    knowledgeItemId,
    text
  };
}

export async function POST(request: Request) {
  let actor: Awaited<ReturnType<typeof requireKbAdmin>>;

  try {
    actor = await requireKbAdmin(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "core_embedding",
      requireLicense: false
    });
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("执行知识向量化"));
  }

  let input: ReturnType<typeof readRequest>;

  try {
    input = readRequest(await request.json());
  } catch (error) {
    return apiError(error instanceof Error ? error : new ValidationError("请求体必须是合法 JSON。"));
  }

  try {
    const tenant = await resolveTenantContext(actor, request);
    await assertLicenseFeature(actor, tenant, "embedding");

    const result = input.knowledgeItemId
      ? await indexKnowledgeItemEmbedding({
        knowledgeItemId: input.knowledgeItemId,
        tenantId: tenant.tenantId,
        userId: actor.id,
        requestId: getCoreRequestId(request)
      })
      : await createCoreEmbedding(input.text, {
        userId: actor.id,
        requestId: getCoreRequestId(request),
        operation: "core_manual_embedding"
      });

    return apiSuccess({
      tenant,
      result
    });
  } catch (error) {
    return apiError(error);
  }
}
