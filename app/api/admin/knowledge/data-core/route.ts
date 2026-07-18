import { NextResponse } from "next/server";
import { requireKbAdmin } from "@/lib/auth/guards";
import { apiError, databaseConfigError } from "@/lib/api-response";
import { buildKnowledgeOSCoreState } from "@/lib/enterprise/knowledge-os-core-state";
import { hasDatabaseUrl } from "@/lib/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readLimit(value: string | null) {
  const numberValue = Number(value ?? 300);

  return Number.isFinite(numberValue)
    ? Math.max(1, Math.min(1000, Math.round(numberValue)))
    : 300;
}

function readBoolean(value: string | null) {
  return value === "1" || value === "true" || value === "yes";
}

function readTenantId(actor: Awaited<ReturnType<typeof requireKbAdmin>>) {
  return "tenantId" in actor && typeof actor.tenantId === "string" ? actor.tenantId : null;
}

export async function GET(request: Request) {
  let actor: Awaited<ReturnType<typeof requireKbAdmin>>;

  try {
    actor = await requireKbAdmin(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "admin_knowledge_data_core"
    });
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("读取 Knowledge OS Data Core"));
  }

  try {
    const url = new URL(request.url);
    const core = await buildKnowledgeOSCoreState({
      actorUserId: actor.id,
      tenantId: readTenantId(actor),
      appType: "ingest_admin",
      agentId: url.searchParams.get("agentId"),
      knowledgeBaseId: url.searchParams.get("knowledgeBaseId"),
      namespace: url.searchParams.get("namespace"),
      includeShared: readBoolean(url.searchParams.get("includeShared")),
      includePublished: true,
      limit: readLimit(url.searchParams.get("limit"))
    });

    return NextResponse.json({
      ok: true,
      ...core
    });
  } catch (error) {
    return apiError(error);
  }
}
