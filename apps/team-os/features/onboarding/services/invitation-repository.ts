import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";
import type {
  AcceptTeamOsInvitationResult,
  TeamOsInvitationDetails,
  TeamOsInvitationRole
} from "@/apps/team-os/features/onboarding/types";
import { TEAM_OS_INVITATION_ROLES } from "@/apps/team-os/features/onboarding/types";
import {
  maskInvitationEmail,
  normalizeTeamOsEmail
} from "@/apps/team-os/features/onboarding/utils/onboarding-input";

const SERIALIZABLE_RETRY_LIMIT = 3;

function isInvitationRole(value: string): value is TeamOsInvitationRole {
  return TEAM_OS_INVITATION_ROLES.includes(value as TeamOsInvitationRole);
}

async function advisoryLock(transaction: Prisma.TransactionClient, key: string) {
  await transaction.$queryRaw`SELECT 1::int AS "locked" FROM pg_advisory_xact_lock(hashtext(${key}))`;
}

function invitationState(invitation: { status: string; expiresAt: Date }, now: Date) {
  if (invitation.status === "ACCEPTED") return "ACCEPTED" as const;
  if (invitation.status === "EXPIRED" || invitation.expiresAt <= now) return "EXPIRED" as const;
  return invitation.status === "PENDING" ? "PENDING" as const : "UNAVAILABLE" as const;
}

export async function getTeamOsInvitationDetails(
  code: string,
  now = new Date()
): Promise<TeamOsInvitationDetails> {
  const invitation = await prisma.teamInvitation.findUnique({
    where: { inviteCode: code },
    select: {
      email: true,
      role: true,
      status: true,
      expiresAt: true,
      team: {
        select: {
          name: true,
          companyId: true,
          status: true
        }
      }
    }
  });
  if (!invitation) {
    throw new NotFoundError("邀请链接不存在或已失效。");
  }
  if (!isInvitationRole(invitation.role)) {
    throw new ForbiddenError("邀请角色不受支持，请联系企业负责人重新邀请。");
  }

  const company = await prisma.tenantCompany.findUnique({
    where: { id: invitation.team.companyId },
    select: { name: true, status: true }
  });
  const state = invitationState(invitation, now);
  const available = state === "PENDING" && invitation.team.status === "ACTIVE" && company?.status === "ACTIVE";

  return {
    teamName: invitation.team.name,
    companyName: company?.name ?? invitation.team.name,
    emailMasked: maskInvitationEmail(invitation.email),
    role: invitation.role,
    status: available ? "PENDING" : state === "PENDING" ? "UNAVAILABLE" : state,
    expiresAt: invitation.expiresAt.toISOString(),
    canAccept: available
  };
}

type InvitationTransactionResult = AcceptTeamOsInvitationResult | { error: "EXPIRED" };

async function acceptInvitationTransaction(
  userId: string,
  code: string,
  now: Date
): Promise<InvitationTransactionResult> {
  return prisma.$transaction(async (transaction) => {
    await advisoryLock(transaction, `team-os:user:${userId}`);
    await advisoryLock(transaction, `team-os:invitation:${code}`);

    const invitation = await transaction.teamInvitation.findUnique({
      where: { inviteCode: code },
      include: {
        team: {
          select: {
            id: true,
            companyId: true,
            name: true,
            status: true
          }
        }
      }
    });
    if (!invitation) {
      throw new NotFoundError("邀请链接不存在或已失效。");
    }
    if (!isInvitationRole(invitation.role)) {
      throw new ForbiddenError("邀请角色不受支持，请联系企业负责人重新邀请。");
    }

    await advisoryLock(transaction, `team-os:company:${invitation.team.companyId}`);
    await advisoryLock(transaction, `team-os:email:${normalizeTeamOsEmail(invitation.email)}`);

    const user = await transaction.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, isActive: true }
    });
    if (!user || !user.isActive) {
      throw new ForbiddenError("当前账号不存在或已停用。");
    }

    const existingCompanyMemberships = await transaction.teamMember.findMany({
      where: {
        userId,
        status: "ACTIVE",
        team: { status: "ACTIVE" }
      },
      select: { team: { select: { companyId: true } } }
    });
    if (existingCompanyMemberships.some((membership) => membership.team.companyId !== invitation.team.companyId)) {
      throw new ForbiddenError("当前账号已加入其他企业，不能接受跨企业邀请。");
    }

    const normalizedInvitationEmail = normalizeTeamOsEmail(invitation.email);
    const normalizedUserEmail = user.email ? normalizeTeamOsEmail(user.email) : null;
    const existingMembership = await transaction.teamMember.findUnique({
      where: { teamId_userId: { teamId: invitation.team.id, userId } }
    });

    if (invitation.status === "ACCEPTED") {
      if (
        existingMembership?.status === "ACTIVE" &&
        normalizedUserEmail === normalizedInvitationEmail
      ) {
        const company = await transaction.tenantCompany.findUnique({
          where: { id: invitation.team.companyId },
          select: { name: true }
        });
        return {
          companyId: invitation.team.companyId,
          companyName: company?.name ?? invitation.team.name,
          teamId: invitation.team.id,
          teamName: invitation.team.name,
          membershipId: existingMembership.id,
          role: invitation.role,
          emailBound: false,
          idempotent: true,
          nextPath: "/team-os/onboarding"
        };
      }
      throw new AppError("VALIDATION_ERROR", "该邀请已经被其他账号接受。", 409);
    }

    if (invitation.status === "EXPIRED" || invitation.expiresAt <= now) {
      if (invitation.status !== "EXPIRED") {
        await transaction.teamInvitation.update({
          where: { id: invitation.id },
          data: { status: "EXPIRED" }
        });
      }
      return { error: "EXPIRED" };
    }
    if (invitation.status !== "PENDING") {
      throw new AppError("VALIDATION_ERROR", "该邀请当前不可使用。", 409);
    }
    if (invitation.team.status !== "ACTIVE") {
      throw new ForbiddenError("受邀团队已经停用。");
    }

    const company = await transaction.tenantCompany.findUnique({
      where: { id: invitation.team.companyId },
      select: { id: true, name: true, status: true }
    });
    if (!company || company.status !== "ACTIVE") {
      throw new ForbiddenError("受邀企业当前不可用。");
    }

    const subscription = await transaction.tenantSubscription.findFirst({
      where: {
        companyId: company.id,
        status: "ACTIVE",
        startDate: { lte: now },
        endDate: { gt: now },
        plan: { status: "ACTIVE" }
      },
      select: {
        id: true,
        plan: { select: { maxUsers: true } }
      },
      orderBy: [{ endDate: "desc" }, { createdAt: "desc" }]
    });
    if (!subscription) {
      throw new ForbiddenError("企业套餐尚未生效或已经到期，请联系企业负责人。");
    }
    if (subscription.plan.maxUsers < 1) {
      throw new ForbiddenError("企业套餐没有可用成员名额，请联系超级管理员。");
    }

    let emailBound = false;
    if (normalizedUserEmail && normalizedUserEmail !== normalizedInvitationEmail) {
      throw new ForbiddenError("当前账号邮箱与邀请邮箱不一致。");
    }
    if (!normalizedUserEmail) {
      const emailOwner = await transaction.user.findFirst({
        where: {
          email: { equals: normalizedInvitationEmail, mode: "insensitive" },
          id: { not: userId }
        },
        select: { id: true }
      });
      if (emailOwner) {
        throw new ForbiddenError("邀请邮箱已经绑定其他账号，请使用对应账号登录。");
      }
      await transaction.user.update({
        where: { id: userId },
        data: { email: normalizedInvitationEmail }
      });
      emailBound = true;
    }

    const activeCompanyMemberships = await transaction.teamMember.findMany({
      where: {
        status: "ACTIVE",
        team: { companyId: company.id, status: "ACTIVE" }
      },
      distinct: ["userId"],
      select: { userId: true }
    });
    const alreadyOccupiesSeat = activeCompanyMemberships.some((membership) => membership.userId === userId);
    if (!alreadyOccupiesSeat && activeCompanyMemberships.length >= subscription.plan.maxUsers) {
      throw new ForbiddenError("企业成员数量已达到当前套餐上限。");
    }

    const membership = existingMembership
      ? await transaction.teamMember.update({
          where: { id: existingMembership.id },
          data: { role: invitation.role, status: "ACTIVE" }
        })
      : await transaction.teamMember.create({
          data: {
            teamId: invitation.team.id,
            userId,
            role: invitation.role,
            status: "ACTIVE"
          }
        });

    await transaction.teamInvitation.update({
      where: { id: invitation.id },
      data: { status: "ACCEPTED" }
    });

    return {
      companyId: company.id,
      companyName: company.name,
      teamId: invitation.team.id,
      teamName: invitation.team.name,
      membershipId: membership.id,
      role: invitation.role,
      emailBound,
      idempotent: false,
      nextPath: "/team-os/onboarding"
    };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable
  });
}

export async function acceptTeamOsInvitation(
  userId: string,
  code: string,
  now = new Date()
): Promise<AcceptTeamOsInvitationResult> {
  for (let attempt = 0; attempt < SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
    try {
      const result = await acceptInvitationTransaction(userId, code, now);
      if ("error" in result) {
        throw new AppError("VALIDATION_ERROR", "邀请已经过期，请联系企业负责人重新邀请。", 410);
      }
      return result;
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!retryable || attempt === SERIALIZABLE_RETRY_LIMIT - 1) throw error;
    }
  }
  throw new AppError("UNKNOWN_ERROR", "接受邀请失败，请稍后重试。", 500);
}
