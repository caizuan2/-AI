import "server-only";

import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { getOrganizationPermissions } from "@/apps/team-os/features/organization/services/organization-permissions";
import type {
  AddMemberInput,
  CreateInvitationInput,
  CreateTeamInput,
  InvitationRecord,
  MemberListData,
  OrganizationMember,
  OrganizationOverview,
  OrganizationTeam,
  TeamRole,
  UpdateTeamInput
} from "@/apps/team-os/features/organization/types";

async function getCompanyKey(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tenantId: true }
  });

  if (!user) {
    throw new NotFoundError("当前用户不存在。");
  }

  return user.tenantId || `team-os:${userId}`;
}

async function lockTransaction(transaction: Prisma.TransactionClient, key: string) {
  await transaction.$queryRaw`SELECT 1::int AS "locked" FROM pg_advisory_xact_lock(hashtext(${key}))`;
}

async function getActiveMemberships(userId: string) {
  return prisma.teamMember.findMany({
    where: {
      userId,
      status: "ACTIVE",
      team: { status: "ACTIVE" }
    },
    select: {
      id: true,
      role: true,
      teamId: true,
      team: {
        select: {
          id: true,
          companyId: true,
          status: true
        }
      }
    },
    orderBy: { createdAt: "asc" }
  });
}

export async function getOrganizationOverview(userId: string, requestedCompanyId?: string): Promise<OrganizationOverview> {
  const [memberships, anyMembershipCount, companyKey] = await Promise.all([
    getActiveMemberships(userId),
    prisma.teamMember.count({ where: { userId } }),
    getCompanyKey(userId)
  ]);
  const ownerCompanyIds = Array.from(new Set(
    memberships.filter((membership) => membership.role === "TEAM_OWNER").map((membership) => membership.team.companyId)
  ));
  const availableCompanyIds = Array.from(new Set(
    memberships.map((membership) => membership.team.companyId)
  ));
  if (requestedCompanyId && !availableCompanyIds.includes(requestedCompanyId)) {
    throw new ForbiddenError("当前账号无权访问所选企业。");
  }
  const selectedCompanyId = requestedCompanyId || availableCompanyIds[0] || companyKey;
  const directTeamIds = memberships
    .filter((membership) => membership.team.companyId === selectedCompanyId)
    .map((membership) => membership.teamId);
  const directRoleByTeam = new Map(memberships.map((membership) => [membership.teamId, membership.role]));
  const ownsSelectedCompany = ownerCompanyIds.includes(selectedCompanyId);
  const [teams, bootstrapCompanyTeamCount, tenants, companyTeams] = await Promise.all([
    ownsSelectedCompany || directTeamIds.length > 0
      ? prisma.teamOrganization.findMany({
          where: ownsSelectedCompany
            ? { companyId: selectedCompanyId }
            : { id: { in: directTeamIds } },
          include: {
            _count: {
              select: {
                members: { where: { status: "ACTIVE" } }
              }
            }
          },
          orderBy: [
            { status: "asc" },
            { createdAt: "asc" }
          ]
        })
      : Promise.resolve([]),
    prisma.teamOrganization.count({ where: { companyId: companyKey } }),
    availableCompanyIds.length > 0
      ? prisma.tenant.findMany({
          where: { id: { in: availableCompanyIds } },
          select: { id: true, name: true }
        })
      : Promise.resolve([]),
    availableCompanyIds.length > 0
      ? prisma.teamOrganization.findMany({
          where: { companyId: { in: availableCompanyIds } },
          select: { companyId: true, name: true },
          orderBy: { createdAt: "asc" }
        })
      : Promise.resolve([])
  ]);
  const tenantNameById = new Map(tenants.map((tenant) => [tenant.id, tenant.name]));
  const fallbackCompanyNameById = new Map<string, string>();
  for (const team of companyTeams) {
    if (!fallbackCompanyNameById.has(team.companyId)) {
      fallbackCompanyNameById.set(team.companyId, team.name);
    }
  }
  const companies = availableCompanyIds.map((companyId) => ({
    id: companyId,
    name: tenantNameById.get(companyId) ?? fallbackCompanyNameById.get(companyId) ?? companyId
  }));
  const serializedTeams: OrganizationTeam[] = teams.map((team) => {
    const role: TeamRole | null = ownsSelectedCompany
      ? "TEAM_OWNER"
      : directRoleByTeam.get(team.id) ?? null;

    const permissions = team.status === "ACTIVE"
      ? getOrganizationPermissions(role)
      : getOrganizationPermissions(null);

    return {
      id: team.id,
      companyId: team.companyId,
      name: team.name,
      description: permissions.canViewMembers ? team.description : null,
      status: team.status,
      memberCount: permissions.canViewMembers ? team._count.members : null,
      currentUserRole: role,
      permissions,
      createdAt: team.createdAt.toISOString(),
      updatedAt: team.updatedAt.toISOString()
    };
  });
  const canBootstrap = anyMembershipCount === 0 && bootstrapCompanyTeamCount === 0;

  return {
    companyId: availableCompanyIds.length > 0 ? selectedCompanyId : canBootstrap ? companyKey : null,
    companyName: companies.find((company) => company.id === selectedCompanyId)?.name ?? null,
    companyIds: availableCompanyIds,
    companies,
    ownerCompanyIds,
    teams: serializedTeams,
    canBootstrap,
    canCreateTeam: canBootstrap || ownsSelectedCompany,
    accessState: memberships.length > 0 ? "ACTIVE" : anyMembershipCount > 0 ? "INACTIVE" : "UNASSIGNED"
  };
}

export async function createOrganizationTeam(userId: string, input: CreateTeamInput): Promise<OrganizationTeam> {
  const companyKey = await getCompanyKey(userId);
  let team: Awaited<ReturnType<typeof prisma.teamOrganization.create>> | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      team = await prisma.$transaction(async (transaction) => {
        await lockTransaction(transaction, `team-os:company:${companyKey}`);
        const memberships = await transaction.teamMember.findMany({
          where: {
            userId,
            status: "ACTIVE",
            team: { status: "ACTIVE" }
          },
          select: {
            role: true,
            team: { select: { companyId: true } }
          },
          orderBy: { createdAt: "asc" }
        });
        const ownerCompanyIds = Array.from(new Set(
          memberships.filter((membership) => membership.role === "TEAM_OWNER").map((membership) => membership.team.companyId)
        ));
        const anyMembershipCount = await transaction.teamMember.count({ where: { userId } });
        let companyId: string;

        if (ownerCompanyIds.length > 0) {
          if (input.companyId && !ownerCompanyIds.includes(input.companyId)) {
            throw new ForbiddenError("当前账号不是所选企业的负责人。");
          }
          if (!input.companyId && ownerCompanyIds.length > 1) {
            throw new ValidationError("请选择新团队所属企业。");
          }
          companyId = input.companyId || ownerCompanyIds[0];
          await lockTransaction(transaction, `team-os:company:${companyId}`);
        } else {
          if (anyMembershipCount > 0) {
            throw new ForbiddenError("只有企业负责人可以创建新团队。");
          }
          const existingCompanyTeams = await transaction.teamOrganization.count({ where: { companyId: companyKey } });
          if (existingCompanyTeams > 0) {
            throw new ForbiddenError("当前企业已经存在团队，请联系负责人发送邀请。");
          }
          companyId = companyKey;
        }

        const created = await transaction.teamOrganization.create({
          data: {
            companyId,
            name: input.name,
            description: input.description,
            ownerId: userId,
            status: "ACTIVE"
          }
        });

        await transaction.teamMember.create({
          data: {
            teamId: created.id,
            userId,
            role: "TEAM_OWNER",
            status: "ACTIVE"
          }
        });

        return created;
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      });
      break;
    } catch (error) {
      const shouldRetry = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!shouldRetry || attempt === 2) {
        throw error;
      }
    }
  }

  if (!team) {
    throw new Error("团队创建事务未完成。");
  }

  return {
    id: team.id,
    companyId: team.companyId,
    name: team.name,
    description: team.description,
    status: team.status,
    memberCount: 1,
    currentUserRole: "TEAM_OWNER",
    permissions: getOrganizationPermissions("TEAM_OWNER"),
    createdAt: team.createdAt.toISOString(),
    updatedAt: team.updatedAt.toISOString()
  };
}

async function getTeamAuthority(userId: string, teamId: string) {
  const team = await prisma.teamOrganization.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      companyId: true,
      status: true
    }
  });

  if (!team) {
    throw new NotFoundError("团队不存在。");
  }

  const [ownerMembership, directMembership] = await Promise.all([
    prisma.teamMember.findFirst({
      where: {
        userId,
        role: "TEAM_OWNER",
        status: "ACTIVE",
        team: { companyId: team.companyId, status: "ACTIVE" }
      },
      select: { id: true }
    }),
    prisma.teamMember.findUnique({
      where: {
        teamId_userId: { teamId, userId }
      },
      select: { role: true, status: true }
    })
  ]);
  const role: TeamRole | null = team.status !== "ACTIVE"
    ? null
    : ownerMembership
      ? "TEAM_OWNER"
      : directMembership?.status === "ACTIVE"
        ? directMembership.role
        : null;

  return { team, role, permissions: getOrganizationPermissions(role) };
}

export async function updateOrganizationTeam(userId: string, input: UpdateTeamInput) {
  const authority = await getTeamAuthority(userId, input.teamId);
  if (!authority.permissions.canManageTeam) {
    throw new ForbiddenError("当前账号无权编辑该团队。");
  }

  const team = await prisma.teamOrganization.update({
    where: { id: input.teamId },
    data: {
      name: input.name,
      description: input.description
    }
  });

  return {
    id: team.id,
    name: team.name,
    description: team.description,
    status: team.status,
    updatedAt: team.updatedAt.toISOString()
  };
}

export async function listOrganizationMembers(userId: string, requestedCompanyId?: string): Promise<MemberListData> {
  const overview = await getOrganizationOverview(userId, requestedCompanyId);
  const visibleTeamIds = overview.teams
    .filter((team) => team.permissions.canViewMembers)
    .map((team) => team.id);
  const selfOnlyTeamIds = overview.teams
    .filter((team) => !team.permissions.canViewMembers && team.permissions.canViewSelf)
    .map((team) => team.id);
  const filters = [
    ...(visibleTeamIds.length > 0 ? [{ teamId: { in: visibleTeamIds } }] : []),
    ...(selfOnlyTeamIds.length > 0 ? [{ teamId: { in: selfOnlyTeamIds }, userId }] : [])
  ];
  const memberships = filters.length > 0
    ? await prisma.teamMember.findMany({
        where: { OR: filters },
        include: {
          team: { select: { name: true } }
        },
        orderBy: [
          { teamId: "asc" },
          { createdAt: "asc" }
        ]
      })
    : [];
  const users = memberships.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: Array.from(new Set(memberships.map((membership) => membership.userId))) } },
        select: { id: true, name: true, email: true, phone: true }
      })
    : [];
  const userById = new Map(users.map((user) => [user.id, user]));
  const members: OrganizationMember[] = memberships.map((membership) => {
    const user = userById.get(membership.userId);
    return {
      id: membership.id,
      teamId: membership.teamId,
      teamName: membership.team.name,
      userId: membership.userId,
      name: user?.name || user?.email || user?.phone || membership.userId,
      email: user?.email ?? null,
      role: membership.role,
      status: membership.status,
      joinedAt: membership.createdAt.toISOString(),
      updatedAt: membership.updatedAt.toISOString(),
      isSelf: membership.userId === userId
    };
  });

  return {
    companyId: overview.companyId,
    companyName: overview.companyName,
    companyIds: overview.companyIds,
    companies: overview.companies,
    members,
    teams: overview.teams
      .filter((team) => team.permissions.canViewSelf)
      .map((team) => ({
        id: team.id,
        name: team.name,
        role: team.currentUserRole || "TEAM_MEMBER",
        canManageMembers: team.permissions.canManageMembers && team.status === "ACTIVE"
      }))
  };
}

async function requireOwnerInTransaction(
  transaction: Prisma.TransactionClient,
  userId: string,
  teamId: string
) {
  const team = await transaction.teamOrganization.findUnique({
    where: { id: teamId },
    select: { id: true, companyId: true, status: true }
  });
  if (!team) {
    throw new NotFoundError("团队不存在。");
  }
  if (team.status !== "ACTIVE") {
    throw new ValidationError("团队已停用，不能管理成员。");
  }

  const ownerMembership = await transaction.teamMember.findFirst({
    where: {
      userId,
      role: "TEAM_OWNER",
      status: "ACTIVE",
      team: {
        companyId: team.companyId,
        status: "ACTIVE"
      }
    },
    select: { id: true }
  });
  if (!ownerMembership) {
    throw new ForbiddenError("只有企业负责人可以管理成员。");
  }

  return team;
}

export async function addOrganizationMember(userId: string, input: AddMemberInput): Promise<OrganizationMember> {
  const result = await prisma.$transaction(async (transaction) => {
    await lockTransaction(transaction, `team-os:membership:${input.teamId}:${input.email}`);
    const team = await requireOwnerInTransaction(transaction, userId, input.teamId);
    await lockTransaction(transaction, `team-os:company:${team.companyId}`);
    const user = await transaction.user.findFirst({
      where: {
        email: { equals: input.email, mode: "insensitive" },
        isActive: true
      },
      select: { id: true, name: true, email: true, phone: true }
    });
    const now = new Date();
    await transaction.teamInvitation.updateMany({
      where: {
        teamId: input.teamId,
        email: input.email,
        status: "PENDING",
        expiresAt: { lte: now }
      },
      data: { status: "EXPIRED" }
    });
    if (!user) {
      throw new NotFoundError("未找到该邮箱对应的已注册用户，请先创建邀请。");
    }
    const pendingInvitation = await transaction.teamInvitation.findFirst({
      where: {
        teamId: input.teamId,
        email: input.email,
        status: "PENDING",
        expiresAt: { gt: now }
      },
      select: { id: true, role: true }
    });
    if (!pendingInvitation) {
      throw new ForbiddenError("添加成员前必须先创建有效邀请，并保持邀请角色一致。");
    }
    if (pendingInvitation.role !== input.role) {
      throw new ValidationError("添加角色必须与有效邀请中指定的角色一致。");
    }

    const [company, subscription, otherCompanyMembership] = await Promise.all([
      transaction.tenantCompany.findFirst({
        where: { id: team.companyId, status: "ACTIVE" },
        select: { id: true }
      }),
      transaction.tenantSubscription.findFirst({
        where: {
          companyId: team.companyId,
          status: "ACTIVE",
          startDate: { lte: now },
          endDate: { gt: now },
          plan: { status: "ACTIVE" }
        },
        select: { plan: { select: { maxUsers: true } } },
        orderBy: [{ endDate: "desc" }, { createdAt: "desc" }]
      }),
      transaction.teamMember.findFirst({
        where: {
          userId: user.id,
          status: "ACTIVE",
          team: { status: "ACTIVE", companyId: { not: team.companyId } }
        },
        select: { id: true }
      })
    ]);
    if (!company) {
      throw new ForbiddenError("当前企业尚未开通或已停用，不能添加成员。");
    }
    if (!subscription) {
      throw new ForbiddenError("当前企业套餐尚未生效或已经到期，不能添加成员。");
    }
    if (otherCompanyMembership) {
      throw new ForbiddenError("该账号已经加入其他企业，不能跨企业添加成员。");
    }

    const existing = await transaction.teamMember.findUnique({
      where: {
        teamId_userId: { teamId: input.teamId, userId: user.id }
      }
    });
    if (existing?.status === "ACTIVE") {
      throw new ValidationError("该用户已经是团队成员。");
    }

    const activeCompanyMembers = await transaction.teamMember.findMany({
      where: {
        status: "ACTIVE",
        team: { companyId: team.companyId, status: "ACTIVE" }
      },
      distinct: ["userId"],
      select: { userId: true }
    });
    const alreadyOccupiesSeat = activeCompanyMembers.some((membership) => membership.userId === user.id);
    if (!alreadyOccupiesSeat && activeCompanyMembers.length >= subscription.plan.maxUsers) {
      throw new ForbiddenError("企业成员数量已达到当前套餐上限。");
    }

    const membership = existing
      ? await transaction.teamMember.update({
          where: { id: existing.id },
          data: { role: input.role, status: "ACTIVE" },
          include: { team: { select: { name: true } } }
        })
      : await transaction.teamMember.create({
          data: {
            teamId: input.teamId,
            userId: user.id,
            role: input.role,
            status: "ACTIVE"
          },
        include: { team: { select: { name: true } } }
      });

    if (pendingInvitation) {
      await transaction.teamInvitation.updateMany({
        where: {
          teamId: input.teamId,
          email: input.email,
          status: "PENDING",
          expiresAt: { gt: now }
        },
        data: { status: "ACCEPTED" }
      });
    }

    return { membership, user };
  });
  const { membership, user } = result;

  return {
    id: membership.id,
    teamId: membership.teamId,
    teamName: membership.team.name,
    userId: membership.userId,
    name: user.name || user.email || user.phone || user.id,
    email: user.email,
    role: membership.role,
    status: membership.status,
    joinedAt: membership.createdAt.toISOString(),
    updatedAt: membership.updatedAt.toISOString(),
    isSelf: membership.userId === userId
  };
}

export async function createTeamInvitation(
  userId: string,
  input: CreateInvitationInput
): Promise<InvitationRecord> {
  const invitation = await prisma.$transaction(async (transaction) => {
    await lockTransaction(transaction, `team-os:membership:${input.teamId}:${input.email}`);
    const team = await requireOwnerInTransaction(transaction, userId, input.teamId);
    const now = new Date();
    const [actor, targetUser] = await Promise.all([
      transaction.user.findUnique({ where: { id: userId }, select: { tenantId: true } }),
      transaction.user.findFirst({
        where: { email: { equals: input.email, mode: "insensitive" } },
        select: { id: true, tenantId: true, isActive: true }
      })
    ]);
    if (targetUser) {
      if (!targetUser.isActive) {
        throw new ValidationError("该邮箱对应账号已停用，无法创建邀请。");
      }
      const sameTenant = Boolean(
        actor?.tenantId &&
        team.companyId === actor.tenantId &&
        targetUser.tenantId === actor.tenantId
      );
      const standaloneCompatible = Boolean(
        !actor?.tenantId &&
        !targetUser.tenantId &&
        team.companyId === `team-os:${userId}`
      );
      if (!sameTenant && !standaloneCompatible) {
        throw new ForbiddenError("该邮箱属于其他企业，不能加入当前团队。");
      }
      const activeMembership = await transaction.teamMember.findUnique({
        where: {
          teamId_userId: { teamId: input.teamId, userId: targetUser.id }
        },
        select: { status: true }
      });
      if (activeMembership?.status === "ACTIVE") {
        throw new ValidationError("该邮箱对应用户已经是团队成员。");
      }
    }

    await transaction.teamInvitation.updateMany({
      where: {
        teamId: input.teamId,
        status: "PENDING",
        expiresAt: { lte: now }
      },
      data: { status: "EXPIRED" }
    });
    const existing = await transaction.teamInvitation.findFirst({
      where: {
        teamId: input.teamId,
        email: input.email,
        status: "PENDING",
        expiresAt: { gt: now }
      }
    });
    if (existing) {
      throw new ValidationError("该邮箱已有有效邀请，请勿重复创建。");
    }

    return transaction.teamInvitation.create({
      data: {
        teamId: input.teamId,
        email: input.email,
        role: input.role,
        inviteCode: randomBytes(24).toString("base64url"),
        status: "PENDING",
        expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      }
    });
  });

  return {
    id: invitation.id,
    teamId: invitation.teamId,
    email: invitation.email,
    role: invitation.role as InvitationRecord["role"],
    inviteCode: invitation.inviteCode,
    status: invitation.status,
    expiresAt: invitation.expiresAt.toISOString(),
    createdAt: invitation.createdAt.toISOString()
  };
}
