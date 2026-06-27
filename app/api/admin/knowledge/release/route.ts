import { NextResponse } from "next/server";
import { requireKbAdmin } from "@/lib/auth/guards";
import { apiError, databaseConfigError } from "@/lib/api-response";
import { buildKnowledgeOSCoreState } from "@/lib/enterprise/knowledge-os-core-state";
import { hasDatabaseUrl } from "@/lib/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readLimit(value: string | null) {
  const numberValue = Number(value ?? 240);

  return Number.isFinite(numberValue)
    ? Math.max(1, Math.min(1000, Math.round(numberValue)))
    : 240;
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
      targetType: "admin_knowledge_release"
    });
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("分析知识系统发布健康度"));
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
      success: true,
      releaseReadiness: core.releaseReadiness,
      systemHealthScore: core.systemHealthScore,
      ragHealthScore: core.ragHealthScore,
      agentHealthScore: core.agentHealthScore,
      knowledgeBaseHealthScore: core.knowledgeBaseHealthScore,
      policyHealthScore: core.policyHealthScore,
      lifecycleHealthScore: core.lifecycleHealthScore,
      trendHealthScore: core.trendHealthScore,
      feedbackHealthScore: core.feedbackHealthScore,
      behaviorHealthScore: core.behaviorHealthScore,
      riskIndex: core.riskIndex,
      riskLevel: core.riskLevel,
      summary: core.summary,
      agents: core.agents,
      knowledgeBases: core.knowledgeBases,
      distributions: core.distributions,
      recommendations: core.recommendations,
      shadowMode: core.diagnostics.shadowMode,
      dataQuality: core.dataQuality,
      diagnostics: {
        ...core.diagnostics,
        mode: "knowledge_os_data_core_v4_release_compat"
      }
    });
  } catch (error) {
    return apiError(error);
  }
}
