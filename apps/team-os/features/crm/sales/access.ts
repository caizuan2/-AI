import "server-only";

import type { Prisma } from "@prisma/client";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import type {
  CrmSalesActor,
  CrmSalesScope
} from "@/apps/team-os/features/crm/sales/types";

type SalesScopeClient = Pick<
  Prisma.TransactionClient,
  "teamMember" | "teamOrganization"
>;

type CrmSalesScopeWhere = {
  companyId: string;
  OR?: Array<{
    teamId: { in: string[] };
    ownerId?: string;
  }>;
};

export async function resolveCrmSalesScope(
  actor: CrmSalesActor,
  client: SalesScopeClient = prisma
): Promise<CrmSalesScope> {
  const memberships = await client.teamMember.findMany({
    where: {
      userId: actor.userId,
      status: "ACTIVE",
      team: {
        companyId: actor.companyId,
        status: "ACTIVE"
      }
    },
    select: {
      role: true,
      teamId: true
    },
    orderBy: { createdAt: "asc" }
  });
  const companyOwner = memberships.some((membership) => membership.role === "TEAM_OWNER");
  const managerTeamIds = Array.from(new Set(
    memberships
      .filter((membership) => membership.role === "TEAM_MANAGER")
      .map((membership) => membership.teamId)
  ));
  const memberTeamIds = Array.from(new Set(
    memberships
      .filter((membership) => membership.role === "TEAM_MEMBER")
      .map((membership) => membership.teamId)
  ));

  if (!companyOwner && managerTeamIds.length === 0 && memberTeamIds.length === 0) {
    throw new ForbiddenError("当前角色没有 CRM 销售链路访问权限。");
  }

  const visibleTeamIds = companyOwner
    ? (await client.teamOrganization.findMany({
        where: {
          companyId: actor.companyId,
          status: "ACTIVE"
        },
        select: { id: true },
        orderBy: { createdAt: "asc" }
      })).map((team) => team.id)
    : Array.from(new Set([...managerTeamIds, ...memberTeamIds]));

  return {
    companyId: actor.companyId,
    mode: companyOwner ? "COMPANY" : managerTeamIds.length > 0 ? "TEAMS" : "OWN",
    companyOwner,
    managerTeamIds,
    memberTeamIds,
    visibleTeamIds
  };
}

export function crmSalesScopeWhere(
  scope: CrmSalesScope,
  actorUserId: string
): CrmSalesScopeWhere {
  if (scope.companyOwner) {
    return { companyId: scope.companyId };
  }
  const branches: CrmSalesScopeWhere["OR"] = [];
  if (scope.managerTeamIds.length > 0) {
    branches.push({ teamId: { in: scope.managerTeamIds } });
  }
  if (scope.memberTeamIds.length > 0) {
    branches.push({
      teamId: { in: scope.memberTeamIds },
      ownerId: actorUserId
    });
  }
  return {
    companyId: scope.companyId,
    OR: branches
  };
}

export function assertVisibleTeamFilter(scope: CrmSalesScope, teamId?: string) {
  if (!teamId) return;
  if (!scope.visibleTeamIds.includes(teamId)) {
    throw new NotFoundError("团队不存在或当前账号无权访问。");
  }
}

export async function resolveCrmSalesAssignment(
  client: SalesScopeClient,
  scope: CrmSalesScope,
  actorUserId: string,
  requestedTeamId: string | undefined,
  requestedOwnerId: string | undefined,
  options: { allowUnassigned?: boolean } = {}
) {
  if (!requestedTeamId) {
    if (!scope.companyOwner || requestedOwnerId || !options.allowUnassigned) {
      throw new ValidationError("必须选择当前账号有权访问的团队。");
    }
    return { teamId: null, ownerId: null };
  }
  assertVisibleTeamFilter(scope, requestedTeamId);
  const canManageTeam = scope.companyOwner || scope.managerTeamIds.includes(requestedTeamId);
  const isOwnMemberTeam = scope.memberTeamIds.includes(requestedTeamId);

  if (!requestedOwnerId) {
    if (options.allowUnassigned && canManageTeam) {
      return { teamId: requestedTeamId, ownerId: null };
    }
    if (isOwnMemberTeam) {
      return { teamId: requestedTeamId, ownerId: actorUserId };
    }
    throw new ValidationError("必须选择负责人。");
  }
  if (isOwnMemberTeam && !canManageTeam && requestedOwnerId !== actorUserId) {
    throw new ForbiddenError("团队成员只能把 CRM 数据分配给自己。");
  }

  const membership = await client.teamMember.findFirst({
    where: {
      teamId: requestedTeamId,
      userId: requestedOwnerId,
      status: "ACTIVE",
      role: { in: ["TEAM_OWNER", "TEAM_MANAGER", "TEAM_MEMBER"] },
      team: {
        companyId: scope.companyId,
        status: "ACTIVE"
      }
    },
    select: { id: true }
  });
  if (!membership) {
    throw new ValidationError("负责人不是所选团队的有效 CRM 成员。");
  }
  return { teamId: requestedTeamId, ownerId: requestedOwnerId };
}

export function assertRecordInCrmSalesScope(
  scope: CrmSalesScope,
  actorUserId: string,
  record: { companyId: string; teamId: string | null; ownerId: string | null }
) {
  if (record.companyId !== scope.companyId) {
    throw new NotFoundError("数据不存在或当前账号无权访问。");
  }
  if (scope.companyOwner) return;
  if (record.teamId && scope.managerTeamIds.includes(record.teamId)) return;
  if (
    record.teamId &&
    scope.memberTeamIds.includes(record.teamId) &&
    record.ownerId === actorUserId
  ) {
    return;
  }
  throw new NotFoundError("数据不存在或当前账号无权访问。");
}
