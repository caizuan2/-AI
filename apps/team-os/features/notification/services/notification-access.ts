import "server-only";

import { prisma } from "@/lib/prisma";
import { ForbiddenError } from "@/lib/errors";
import type {
  NotificationCompanyOption,
  NotificationScope
} from "@/apps/team-os/features/notification/types";
import {
  normalizeIdentifier,
  normalizeNotificationScope
} from "@/apps/team-os/features/notification/utils/notification-input";

type TeamRole = "TEAM_OWNER" | "TEAM_MANAGER" | "TRAINER" | "TEAM_MEMBER";

export interface NotificationAccessState {
  companyId: string;
  companies: NotificationCompanyOption[];
  roles: TeamRole[];
  canViewTeamNotifications: boolean;
  canManageIntegrations: boolean;
  visibleUserIds: string[];
  visibleTeamIds: string[] | null;
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

export async function resolveNotificationAccess(input: {
  userId: string;
  requestedCompanyId?: string;
  requestedTeamId?: string;
  scope?: NotificationScope;
  ownerCompaniesOnly?: boolean;
}): Promise<NotificationAccessState> {
  const userId = normalizeIdentifier(input.userId, "用户 ID");
  const user = await prisma.user.findFirst({ where: { id: userId, isActive: true }, select: { id: true } });
  if (!user) throw new ForbiddenError("当前账号不可用，无法访问企业消息中心。");

  const memberships = await prisma.teamMember.findMany({
    where: { userId, status: "ACTIVE", team: { status: "ACTIVE" } },
    select: {
      role: true,
      teamId: true,
      team: { select: { companyId: true, name: true } }
    },
    orderBy: { createdAt: "asc" }
  });
  if (memberships.length === 0) {
    throw new ForbiddenError("当前账号尚未加入有效企业团队，无法访问企业消息中心。");
  }

  const allCompanyIds = unique(memberships.map((membership) => membership.team.companyId));
  const ownerCompanyIds = unique(
    memberships
      .filter((membership) => membership.role === "TEAM_OWNER")
      .map((membership) => membership.team.companyId)
  );
  const companyIds = input.ownerCompaniesOnly ? ownerCompanyIds : allCompanyIds;
  if (input.ownerCompaniesOnly && companyIds.length === 0) {
    throw new ForbiddenError("只有企业负责人可以查看和管理企业连接。");
  }
  const requestedCompanyId = input.requestedCompanyId === undefined
    ? undefined
    : normalizeIdentifier(input.requestedCompanyId, "企业 ID");
  if (requestedCompanyId && !companyIds.includes(requestedCompanyId)) {
    throw new ForbiddenError("当前账号无权访问所选企业的消息。");
  }
  const companyId = requestedCompanyId ?? companyIds[0];
  const selectedMemberships = memberships.filter((membership) => membership.team.companyId === companyId);
  const roles = unique(selectedMemberships.map((membership) => membership.role)) as TeamRole[];
  const isOwner = roles.includes("TEAM_OWNER");
  const requestedTeamId = input.requestedTeamId === undefined
    ? undefined
    : normalizeIdentifier(input.requestedTeamId, "团队 ID");
  const requestedTeam = requestedTeamId
    ? await prisma.teamOrganization.findFirst({
        where: { id: requestedTeamId, companyId, status: "ACTIVE" },
        select: { id: true }
      })
    : null;
  if (requestedTeamId && !requestedTeam) {
    throw new ForbiddenError("消息对应团队不属于当前企业或当前不可用。");
  }
  if (
    requestedTeamId
    && !isOwner
    && !selectedMemberships.some((membership) => membership.teamId === requestedTeamId)
  ) {
    throw new ForbiddenError("通知收件人不属于消息对应团队。");
  }
  const managedTeamIds = selectedMemberships
    .filter((membership) => membership.role === "TEAM_MANAGER")
    .map((membership) => membership.teamId);
  const canViewTeamNotifications = isOwner || managedTeamIds.length > 0;
  const scope = input.scope === undefined ? "MINE" : normalizeNotificationScope(input.scope);
  if (scope === "TEAM" && !canViewTeamNotifications) {
    throw new ForbiddenError("当前角色只能查看个人通知。");
  }

  let visibleUserIds = [userId];
  let visibleTeamIds: string[] | null = null;
  if (scope === "TEAM") {
    visibleTeamIds = isOwner ? null : unique(managedTeamIds);
    const teamMembers = await prisma.teamMember.findMany({
      where: {
        status: "ACTIVE",
        team: {
          companyId,
          status: "ACTIVE",
          ...(isOwner ? {} : { id: { in: managedTeamIds } })
        }
      },
      select: { userId: true }
    });
    const candidateUserIds = unique(teamMembers.map((member) => member.userId));
    const activeUsers = candidateUserIds.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: candidateUserIds }, isActive: true },
          select: { id: true }
        });
    visibleUserIds = activeUsers.map((activeUser) => activeUser.id);
  }

  const companyNameById = new Map<string, string>();
  for (const membership of memberships) {
    if (!companyNameById.has(membership.team.companyId)) {
      companyNameById.set(membership.team.companyId, membership.team.name);
    }
  }
  const tenantCompanies = await prisma.tenantCompany.findMany({
    where: { id: { in: companyIds } },
    select: { id: true, name: true }
  });
  for (const company of tenantCompanies) {
    companyNameById.set(company.id, company.name);
  }

  return {
    companyId,
    companies: companyIds.map((id) => ({ id, name: companyNameById.get(id) ?? id })),
    roles,
    canViewTeamNotifications,
    canManageIntegrations: isOwner,
    visibleUserIds,
    visibleTeamIds
  };
}

export function assertCanManageIntegrations(access: NotificationAccessState) {
  if (!access.canManageIntegrations) {
    throw new ForbiddenError("只有企业负责人可以管理企业连接。");
  }
}
