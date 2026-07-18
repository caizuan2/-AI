import "server-only";

import { ForbiddenError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import {
  resolveAnalyticsAccess,
  type AnalyticsAccessState
} from "@/apps/team-os/features/analytics/services/analytics-access";
import type {
  CopilotAccessContext,
  CopilotAssistantRole
} from "@/apps/team-os/features/copilot/types";
import {
  availableCopilotRoles,
  copilotTeamIdsForRole
} from "@/apps/team-os/features/copilot/utils/copilot-permissions";

export { availableCopilotRoles } from "@/apps/team-os/features/copilot/utils/copilot-permissions";

export interface CopilotAccessScope {
  userId: string;
  context: CopilotAccessContext;
  analyticsAccess: AnalyticsAccessState;
}

export async function resolveCopilotAccess(
  userId: string,
  assistantRole: CopilotAssistantRole,
  requestedCompanyId?: string
): Promise<CopilotAccessScope> {
  const access = await resolveAnalyticsAccess(userId, requestedCompanyId);
  const managerMemberships = await prisma.teamMember.findMany({
    where: {
      userId,
      role: "TEAM_MANAGER",
      status: "ACTIVE",
      team: {
        companyId: access.context.companyId,
        status: "ACTIVE"
      }
    },
    select: { teamId: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });
  const managerTeamIds = managerMemberships.map((membership) => membership.teamId);
  const availableRoles = availableCopilotRoles({
    hasPersonalScope: access.personalTeamIds.length > 0,
    hasManagerScope: managerTeamIds.length > 0,
    hasOwnerScope: access.isCompanyOwner
  });
  if (!availableRoles.includes(assistantRole)) {
    const message = assistantRole === "OWNER_ASSISTANT"
      ? "只有当前企业负责人可以使用老板助手。"
      : assistantRole === "MANAGER_ASSISTANT"
        ? "只有当前企业的团队主管可以使用主管助手。"
        : "当前账号没有可用的个人团队数据。";
    throw new ForbiddenError(message);
  }

  const teamIds = copilotTeamIdsForRole({
    personalTeamIds: access.personalTeamIds,
    managerTeamIds,
    companyTeamIds: access.companyTeamIds
  }, assistantRole);
  if (teamIds.length === 0) {
    throw new ForbiddenError("当前助手没有可读取的数据范围。");
  }

  return {
    userId,
    analyticsAccess: access,
    context: {
      companyId: access.context.companyId,
      companyName: access.context.companyName,
      companies: access.context.companies,
      assistantRole,
      scopeMode: assistantRole === "OWNER_ASSISTANT"
        ? "COMPANY"
        : assistantRole === "MANAGER_ASSISTANT"
          ? "TEAM"
          : "SELF",
      teamIds,
      availableRoles
    }
  };
}
