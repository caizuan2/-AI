import "server-only";

import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import type { TeamRole } from "@/apps/team-os/types";
import type {
  CrmContext,
  CrmOwnerOption,
  CrmTeamOption
} from "@/apps/team-os/features/crm/types";

const CRM_DIRECT_ROLES = new Set<TeamRole>(["TEAM_OWNER", "TEAM_MANAGER", "TEAM_MEMBER"]);

export function crmDisplayName(user: {
  id: string;
  name: string | null;
  email: string | null;
  phone: string;
}) {
  return user.name?.trim() || user.email?.trim() || user.phone || user.id;
}

async function getActiveMemberships(userId: string) {
  return prisma.teamMember.findMany({
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
          name: true,
          companyId: true
        }
      }
    },
    orderBy: { createdAt: "asc" }
  });
}

export async function resolveCrmListContext(
  userId: string,
  requestedCompanyId?: string,
  requestedTeamId?: string
): Promise<{
  context: CrmContext;
  selectedTeam: CrmTeamOption;
  viewMode: "TEAM" | "OWN";
}> {
  const memberships = await getActiveMemberships(userId);
  const ownerCompanyIds = Array.from(new Set(
    memberships
      .filter((membership) => membership.role === "TEAM_OWNER")
      .map((membership) => membership.team.companyId)
  ));
  const directMemberships = memberships.filter((membership) => CRM_DIRECT_ROLES.has(membership.role));
  const directByTeam = new Map(directMemberships.map((membership) => [membership.team.id, membership]));
  const directTeamIds = directMemberships.map((membership) => membership.team.id);

  if (ownerCompanyIds.length === 0 && directTeamIds.length === 0) {
    throw new ForbiddenError("当前角色没有 CRM 客户访问权限。");
  }

  const teams = await prisma.teamOrganization.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        ...(ownerCompanyIds.length > 0 ? [{ companyId: { in: ownerCompanyIds } }] : []),
        ...(directTeamIds.length > 0 ? [{ id: { in: directTeamIds } }] : [])
      ]
    },
    select: {
      id: true,
      name: true,
      companyId: true
    },
    orderBy: [{ companyId: "asc" }, { createdAt: "asc" }]
  });
  if (teams.length === 0) {
    throw new ForbiddenError("当前账号没有可访问的 CRM 团队。");
  }

  const teamOptions: CrmTeamOption[] = teams.map((team) => {
    const direct = directByTeam.get(team.id);
    const role: TeamRole = ownerCompanyIds.includes(team.companyId)
      ? "TEAM_OWNER"
      : direct?.role ?? "TEAM_MEMBER";
    return {
      id: team.id,
      companyId: team.companyId,
      name: team.name,
      role,
      canViewTeam: role === "TEAM_OWNER" || role === "TEAM_MANAGER",
      canCreateCustomer: role !== "TRAINER"
    };
  });
  const companyIds = Array.from(new Set(teamOptions.map((team) => team.companyId)));
  if (requestedCompanyId && !companyIds.includes(requestedCompanyId)) {
    throw new ForbiddenError("当前账号无权访问所选企业的 CRM。");
  }
  const companyId = requestedCompanyId ?? companyIds[0];
  const companyTeams = teamOptions.filter((team) => team.companyId === companyId);
  const selectedTeam = requestedTeamId
    ? companyTeams.find((team) => team.id === requestedTeamId)
    : companyTeams[0];
  if (!selectedTeam) {
    throw new ForbiddenError("当前账号无权访问所选团队的 CRM。");
  }

  const [tenants, ownerMemberships] = await Promise.all([
    prisma.tenant.findMany({
      where: { id: { in: companyIds } },
      select: { id: true, name: true }
    }),
    selectedTeam.canCreateCustomer
      ? prisma.teamMember.findMany({
          where: {
            teamId: selectedTeam.id,
            status: "ACTIVE",
            role: { in: ["TEAM_OWNER", "TEAM_MANAGER", "TEAM_MEMBER"] },
            ...(selectedTeam.role === "TEAM_MEMBER" ? { userId } : {})
          },
          select: { userId: true },
          orderBy: { createdAt: "asc" }
        })
      : []
  ]);
  const ownerUserIds = ownerMemberships.map((membership) => membership.userId);
  const ownerUsers = ownerUserIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: ownerUserIds }, isActive: true },
        select: { id: true, name: true, email: true, phone: true }
      })
    : [];
  const userById = new Map(ownerUsers.map((user) => [user.id, user]));
  const ownerOptions: CrmOwnerOption[] = ownerUserIds.flatMap((ownerId) => {
    const user = userById.get(ownerId);
    return user ? [{ id: ownerId, name: crmDisplayName(user) }] : [];
  });
  const tenantNames = new Map(tenants.map((tenant) => [tenant.id, tenant.name]));
  const fallbackNames = new Map<string, string>();
  for (const team of teamOptions) {
    if (!fallbackNames.has(team.companyId)) {
      fallbackNames.set(team.companyId, team.name);
    }
  }

  return {
    context: {
      companyId,
      companyName: tenantNames.get(companyId) ?? fallbackNames.get(companyId) ?? companyId,
      companies: companyIds.map((id) => ({
        id,
        name: tenantNames.get(id) ?? fallbackNames.get(id) ?? id
      })),
      teams: companyTeams,
      selectedTeamId: selectedTeam.id,
      ownerOptions,
      canCreateCustomer: selectedTeam.canCreateCustomer && ownerOptions.length > 0
    },
    selectedTeam,
    viewMode: selectedTeam.canViewTeam ? "TEAM" : "OWN"
  };
}

export async function authorizeCustomerAccess(
  userId: string,
  customer: {
    id: string;
    companyId: string;
    teamId: string;
    ownerId: string;
  }
): Promise<{
  role: "TEAM_OWNER" | "TEAM_MANAGER" | "TEAM_MEMBER";
  knowledgeAuthorizationTeamId: string;
}> {
  const memberships = await prisma.teamMember.findMany({
    where: {
      userId,
      status: "ACTIVE",
      team: {
        status: "ACTIVE",
        OR: [
          { id: customer.teamId },
          { companyId: customer.companyId }
        ]
      }
    },
    select: {
      role: true,
      team: {
        select: {
          id: true,
          companyId: true
        }
      }
    },
    orderBy: { createdAt: "asc" }
  });
  const ownerMembership = memberships.find((membership) => (
    membership.role === "TEAM_OWNER" &&
    membership.team.companyId === customer.companyId
  ));
  const directMembership = memberships.find((membership) => membership.team.id === customer.teamId);

  if (ownerMembership) {
    return {
      role: "TEAM_OWNER",
      knowledgeAuthorizationTeamId: directMembership?.role !== "TRAINER"
        ? directMembership?.team.id ?? ownerMembership.team.id
        : ownerMembership.team.id
    };
  }
  if (directMembership?.role === "TEAM_MANAGER") {
    return {
      role: "TEAM_MANAGER",
      knowledgeAuthorizationTeamId: customer.teamId
    };
  }
  if (directMembership?.role === "TEAM_MEMBER" && customer.ownerId === userId) {
    return {
      role: "TEAM_MEMBER",
      knowledgeAuthorizationTeamId: customer.teamId
    };
  }

  throw new NotFoundError("客户不存在或当前账号无权访问。");
}
