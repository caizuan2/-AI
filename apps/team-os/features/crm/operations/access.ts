import "server-only";

import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import {
  authorizeCustomerAccess,
  resolveCrmListContext
} from "@/apps/team-os/features/crm/services/crm-access";

export type CrmOperationsScope = {
  companyId: string;
  teamId: string;
  role: "TEAM_OWNER" | "TEAM_MANAGER" | "TEAM_MEMBER";
  viewMode: "TEAM" | "OWN";
  userId: string;
};

export async function resolveCrmOperationsScope(
  userId: string,
  requestedTeamId?: string
): Promise<CrmOperationsScope> {
  const { context, selectedTeam, viewMode } = await resolveCrmListContext(
    userId,
    undefined,
    requestedTeamId
  );
  if (selectedTeam.role === "TRAINER") {
    throw new ForbiddenError("培训师角色没有 CRM 过程管理权限。");
  }
  return {
    companyId: context.companyId,
    teamId: selectedTeam.id,
    role: selectedTeam.role,
    viewMode,
    userId
  };
}

export async function resolveCustomerOperationsScope(
  userId: string,
  customerId: string,
  requestedTeamId?: string
) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      companyId: true,
      teamId: true,
      ownerId: true
    }
  });
  if (!customer) {
    throw new NotFoundError("客户不存在或当前账号无权访问。");
  }

  await authorizeCustomerAccess(userId, customer);
  if (requestedTeamId && requestedTeamId !== customer.teamId) {
    throw new ValidationError("所选团队与客户所属团队不一致。");
  }
  const scope = await resolveCrmListContext(userId, customer.companyId, customer.teamId);
  if (scope.selectedTeam.role === "TRAINER") {
    throw new ForbiddenError("培训师角色没有 CRM 过程管理权限。");
  }

  return {
    customer,
    scope: {
      companyId: customer.companyId,
      teamId: customer.teamId,
      role: scope.selectedTeam.role,
      viewMode: scope.viewMode,
      userId
    } satisfies CrmOperationsScope
  };
}

export function assertCrmManagementRole(scope: CrmOperationsScope, action: string) {
  if (scope.role !== "TEAM_OWNER" && scope.role !== "TEAM_MANAGER") {
    throw new ForbiddenError(`只有企业老板或团队主管可以${action}。`);
  }
}

export async function assertActiveTargetMember(
  scope: CrmOperationsScope,
  targetUserId: string
) {
  if (scope.viewMode !== "TEAM" && targetUserId !== scope.userId) {
    throw new ForbiddenError("员工只能管理自己的 CRM 目标。");
  }
  const membership = await prisma.teamMember.findFirst({
    where: {
      teamId: scope.teamId,
      userId: targetUserId,
      status: "ACTIVE",
      role: { in: ["TEAM_OWNER", "TEAM_MANAGER", "TEAM_MEMBER"] },
      team: {
        companyId: scope.companyId,
        status: "ACTIVE"
      }
    },
    select: { userId: true }
  });
  if (!membership) {
    throw new ValidationError("目标成员不属于当前 CRM 团队或成员状态不可用。");
  }
}
