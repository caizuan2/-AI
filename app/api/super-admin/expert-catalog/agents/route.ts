import {
  enforceSuperAdminApiAccess,
  superAdminError,
  superAdminSuccess
} from "@/app/api/super-admin/_shared";
import { writeAuditLog } from "@/lib/audit-log";
import { createExpertCatalogAgent } from "@/lib/super-admin/services/expert-catalog.service";
import type { CreateExpertCatalogAgentInput } from "@/types/super-admin-expert-catalog";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await enforceSuperAdminApiAccess(request);
    const input = await request.json() as CreateExpertCatalogAgentInput;
    const agent = await createExpertCatalogAgent(input);

    await writeAuditLog({
      userId: user.id,
      role: user.role,
      action: "expert_catalog.agent.create",
      targetType: "expert_catalog_agent",
      targetId: agent.agentKey,
      request,
      metadata: {
        zoneKey: agent.zoneKey,
        knowledgeBaseId: agent.knowledgeBaseId,
        status: agent.status
      }
    });

    return superAdminSuccess(agent);
  } catch (error) {
    return superAdminError(error);
  }
}
