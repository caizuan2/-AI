import {
  enforceSuperAdminApiAccess,
  superAdminError,
  superAdminSuccess
} from "@/app/api/super-admin/_shared";
import { writeAuditLog } from "@/lib/audit-log";
import {
  archiveExpertCatalogAgent,
  updateExpertCatalogAgent
} from "@/lib/super-admin/services/expert-catalog.service";
import type { UpdateExpertCatalogAgentInput } from "@/types/super-admin-expert-catalog";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    agentKey: string;
  };
};

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const user = await enforceSuperAdminApiAccess(request);
    const input = await request.json() as UpdateExpertCatalogAgentInput & Record<string, unknown>;
    const agent = await updateExpertCatalogAgent(params.agentKey, input);

    await writeAuditLog({
      userId: user.id,
      role: user.role,
      action: "expert_catalog.agent.update",
      targetType: "expert_catalog_agent",
      targetId: agent.agentKey,
      request,
      metadata: {
        displayName: agent.displayName,
        zoneKey: agent.zoneKey,
        status: agent.status,
        protectedBinding: agent.protectedBinding
      }
    });

    return superAdminSuccess(agent);
  } catch (error) {
    return superAdminError(error);
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const user = await enforceSuperAdminApiAccess(request);
    const agent = await archiveExpertCatalogAgent(params.agentKey);

    await writeAuditLog({
      userId: user.id,
      role: user.role,
      action: "expert_catalog.agent.archive",
      targetType: "expert_catalog_agent",
      targetId: agent.agentKey,
      request,
      metadata: {
        knowledgeBaseId: agent.knowledgeBaseId,
        protectedBinding: agent.protectedBinding
      }
    });

    return superAdminSuccess(agent);
  } catch (error) {
    return superAdminError(error);
  }
}
