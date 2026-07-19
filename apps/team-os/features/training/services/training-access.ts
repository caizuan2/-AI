import "server-only";

import { ForbiddenError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import type {
  TrainingContext,
  TrainingMemberOption,
  TrainingTeamOption
} from "@/apps/team-os/features/training/types";

export function trainingDisplayName(user: {
  id: string;
  name: string | null;
  email: string | null;
  phone: string;
}) {
  return user.name?.trim() || user.email?.trim() || user.phone || user.id;
}

export interface TrainingAccessState {
  context: TrainingContext;
  isCompanyOwner: boolean;
  managedTeamIds: string[];
  resultTeamIds: string[];
  directTeamIds: string[];
  crmTeamIds: string[];
}

export async function resolveTrainingAccess(
  userId: string,
  requestedCompanyId?: string
): Promise<TrainingAccessState> {
  const memberships = await prisma.teamMember.findMany({
    where: {
      userId,
      status: "ACTIVE",
      team: { status: "ACTIVE" }
    },
    select: {
      role: true,
      team: {
        select: {
          id: true,
          companyId: true,
          name: true,
          createdAt: true
        }
      }
    },
    orderBy: { createdAt: "asc" }
  });
  if (memberships.length === 0) {
    throw new ForbiddenError("当前账号尚未加入有效企业团队，无法访问培训中心。");
  }

  const companyIds = Array.from(new Set(memberships.map((membership) => membership.team.companyId)));
  if (requestedCompanyId && !companyIds.includes(requestedCompanyId)) {
    throw new ForbiddenError("当前账号无权访问所选企业的培训中心。");
  }
  const companyId = requestedCompanyId ?? companyIds[0];
  const companyMemberships = memberships.filter((membership) => membership.team.companyId === companyId);
  const currentRoles = Array.from(new Set(companyMemberships.map((membership) => membership.role)));
  const isCompanyOwner = currentRoles.includes("TEAM_OWNER");
  const directTeamIds = companyMemberships.map((membership) => membership.team.id);

  const teams = isCompanyOwner
    ? await prisma.teamOrganization.findMany({
        where: { companyId, status: "ACTIVE" },
        select: { id: true, companyId: true, name: true },
        orderBy: { createdAt: "asc" }
      })
    : companyMemberships.map((membership) => membership.team);
  const directRoleByTeam = new Map(
    companyMemberships.map((membership) => [membership.team.id, membership.role])
  );
  const teamOptions: TrainingTeamOption[] = teams.map((team) => ({
    id: team.id,
    companyId: team.companyId,
    name: team.name,
    role: isCompanyOwner ? "TEAM_OWNER" : directRoleByTeam.get(team.id) ?? "TEAM_MEMBER"
  }));
  const managerTeamIds = companyMemberships
    .filter((membership) => membership.role === "TEAM_MANAGER")
    .map((membership) => membership.team.id);
  const trainerTeamIds = companyMemberships
    .filter((membership) => membership.role === "TRAINER")
    .map((membership) => membership.team.id);
  const managedTeamIds = isCompanyOwner ? teamOptions.map((team) => team.id) : managerTeamIds;
  const resultTeamIds = isCompanyOwner
    ? teamOptions.map((team) => team.id)
    : Array.from(new Set([...managerTeamIds, ...trainerTeamIds]));
  const crmTeamIds = isCompanyOwner
    ? teamOptions.map((team) => team.id)
    : companyMemberships
        .filter((membership) => membership.role !== "TRAINER")
        .map((membership) => membership.team.id);

  const tenants = await prisma.tenant.findMany({
    where: { id: { in: companyIds } },
    select: { id: true, name: true }
  });
  const tenantNameById = new Map(tenants.map((tenant) => [tenant.id, tenant.name]));
  const fallbackNameByCompany = new Map<string, string>();
  for (const membership of memberships) {
    if (!fallbackNameByCompany.has(membership.team.companyId)) {
      fallbackNameByCompany.set(membership.team.companyId, membership.team.name);
    }
  }

  const canCreateCourse = isCompanyOwner || currentRoles.includes("TRAINER");
  const canAssignTraining = isCompanyOwner || managerTeamIds.length > 0;
  const canViewTeamProgress = isCompanyOwner || resultTeamIds.length > 0;

  return {
    context: {
      companyId,
      companyName: tenantNameById.get(companyId) ?? fallbackNameByCompany.get(companyId) ?? companyId,
      companies: companyIds.map((id) => ({
        id,
        name: tenantNameById.get(id) ?? fallbackNameByCompany.get(id) ?? id
      })),
      teams: teamOptions,
      currentRoles,
      permissions: {
        canCreateCourse,
        canEditCourse: canCreateCourse,
        canAssignTraining,
        canViewTeamProgress,
        canLearn: true,
        canSimulate: true
      }
    },
    isCompanyOwner,
    managedTeamIds,
    resultTeamIds,
    directTeamIds,
    crmTeamIds
  };
}

export async function getAssignableTrainingMembers(
  access: TrainingAccessState
): Promise<TrainingMemberOption[]> {
  if (!access.context.permissions.canAssignTraining || access.managedTeamIds.length === 0) {
    return [];
  }
  const memberships = await prisma.teamMember.findMany({
    where: {
      teamId: { in: access.managedTeamIds },
      status: "ACTIVE",
      team: { status: "ACTIVE", companyId: access.context.companyId }
    },
    select: {
      userId: true,
      role: true,
      team: { select: { id: true, name: true } }
    },
    orderBy: { createdAt: "asc" }
  });
  const userIds = Array.from(new Set(memberships.map((membership) => membership.userId)));
  const users = userIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: userIds }, isActive: true },
        select: { id: true, name: true, email: true, phone: true }
      })
    : [];
  const userById = new Map(users.map((user) => [user.id, user]));
  return memberships.flatMap((membership) => {
    const user = userById.get(membership.userId);
    if (!user) return [];
    return [{
      id: user.id,
      name: trainingDisplayName(user),
      teamId: membership.team.id,
      teamName: membership.team.name,
      role: membership.role
    }];
  });
}

export function assertTrainingManager(access: TrainingAccessState) {
  if (!access.context.permissions.canAssignTraining) {
    throw new ForbiddenError("当前角色无权安排员工培训。");
  }
}

export function assertTrainingCourseEditor(access: TrainingAccessState) {
  if (!access.context.permissions.canCreateCourse) {
    throw new ForbiddenError("当前角色无权创建或编辑企业课程。");
  }
}
