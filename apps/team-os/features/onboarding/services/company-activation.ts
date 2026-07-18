import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError, ForbiddenError } from "@/lib/errors";
import {
  attachTeamOsSubscriptionToLicense,
  consumeTeamOsLicenseGrantInTransaction,
  recordTeamOsLicenseActivationFailure
} from "@/apps/team-os/features/licensing/services/team-os-license-repository";
import type {
  ActivateTeamOsCompanyInput,
  ActivateTeamOsCompanyResult
} from "@/apps/team-os/features/onboarding/types";

const SERIALIZABLE_RETRY_LIMIT = 3;
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1_000;

async function advisoryLock(transaction: Prisma.TransactionClient, key: string) {
  await transaction.$queryRaw`SELECT 1::int AS "locked" FROM pg_advisory_xact_lock(hashtext(${key}))`;
}

async function readRedeemedCompany(
  transaction: Prisma.TransactionClient,
  input: {
    userId: string;
    companyId: string;
    teamId: string;
    planId: string;
    planName: string;
  }
): Promise<ActivateTeamOsCompanyResult> {
  const [company, team, membership, subscription] = await Promise.all([
    transaction.tenantCompany.findUnique({
      where: { id: input.companyId },
      select: { id: true, name: true, industry: true, ownerId: true }
    }),
    transaction.teamOrganization.findUnique({
      where: { id: input.teamId },
      select: { id: true, name: true, companyId: true }
    }),
    transaction.teamMember.findUnique({
      where: { teamId_userId: { teamId: input.teamId, userId: input.userId } },
      select: { role: true, status: true }
    }),
    transaction.tenantSubscription.findFirst({
      where: { companyId: input.companyId, planId: input.planId },
      select: { id: true, planId: true, startDate: true, endDate: true },
      orderBy: { createdAt: "desc" }
    })
  ]);

  if (
    !company ||
    company.ownerId !== input.userId ||
    !team ||
    team.companyId !== company.id ||
    membership?.role !== "TEAM_OWNER" ||
    membership.status !== "ACTIVE" ||
    !subscription
  ) {
    throw new AppError(
      "DATABASE_ERROR",
      "企业授权已使用，但企业初始化记录不完整，请联系超级管理员核对授权审计。",
      500
    );
  }

  return {
    company: { id: company.id, name: company.name, industry: company.industry },
    defaultTeam: { id: team.id, name: team.name },
    subscription: {
      id: subscription.id,
      planId: subscription.planId,
      planName: input.planName,
      startDate: subscription.startDate.toISOString(),
      endDate: subscription.endDate.toISOString()
    },
    role: "TEAM_OWNER",
    idempotent: true,
    nextPath: "/team-os/onboarding"
  };
}

export async function activateTeamOsCompany(
  userId: string,
  input: ActivateTeamOsCompanyInput,
  request?: Request,
  now = new Date()
): Promise<ActivateTeamOsCompanyResult> {
  const candidateCompanyId = `team-os:${userId}`;
  const candidateTeamId = randomUUID();

  for (let attempt = 0; attempt < SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
    try {
      return await prisma.$transaction(async (transaction) => {
        await advisoryLock(transaction, `team-os:user:${userId}`);

        const legacyOwnerMembership = await transaction.teamMember.findFirst({
          where: {
            userId,
            role: "TEAM_OWNER",
            status: "ACTIVE",
            team: {
              companyId: candidateCompanyId,
              status: "ACTIVE"
            }
          },
          select: {
            id: true,
            team: {
              select: {
                id: true,
                name: true
              }
            }
          },
          orderBy: { createdAt: "asc" }
        });
        const candidateOrLegacyTeamId = legacyOwnerMembership?.team.id ?? candidateTeamId;

        const grant = await consumeTeamOsLicenseGrantInTransaction(transaction, {
          code: input.code,
          userId,
          companyId: candidateCompanyId,
          teamId: candidateOrLegacyTeamId,
          request,
          now
        });
        const companyId = grant.companyId ?? candidateCompanyId;
        const teamId = grant.teamId ?? candidateTeamId;

        if (grant.alreadyRedeemed) {
          return readRedeemedCompany(transaction, {
            userId,
            companyId,
            teamId,
            planId: grant.planId,
            planName: grant.planName
          });
        }

        await advisoryLock(transaction, `team-os:company:${companyId}`);
        const [user, plan, existingCompany, existingTeam, otherMembership, activeCompanyMembers] = await Promise.all([
          transaction.user.findUnique({
            where: { id: userId },
            select: { id: true, isActive: true }
          }),
          transaction.subscriptionPlan.findFirst({
            where: { id: grant.planId, status: "ACTIVE" },
            select: { id: true, name: true, maxUsers: true }
          }),
          transaction.tenantCompany.findUnique({ where: { id: companyId }, select: { id: true } }),
          transaction.teamOrganization.findUnique({ where: { id: teamId }, select: { id: true } }),
          transaction.teamMember.findFirst({
            where: {
              userId,
              status: "ACTIVE",
              team: { status: "ACTIVE", companyId: { not: companyId } }
            },
            select: { id: true }
          }),
          transaction.teamMember.findMany({
            where: {
              status: "ACTIVE",
              team: { companyId, status: "ACTIVE" }
            },
            distinct: ["userId"],
            select: { userId: true }
          })
        ]);
        if (!user?.isActive) {
          throw new ForbiddenError("当前账号不存在或已停用。");
        }
        if (!plan) {
          throw new AppError("NOT_FOUND", "授权码绑定的企业套餐不存在或已停用。", 404);
        }
        if (plan.maxUsers < 1) {
          throw new AppError("VALIDATION_ERROR", "授权码绑定的套餐没有可用成员名额。", 409);
        }
        if (activeCompanyMembers.length > plan.maxUsers) {
          throw new AppError("VALIDATION_ERROR", "现有企业成员数量超过授权套餐上限，无法完成激活。", 409);
        }
        if (existingCompany || (existingTeam && existingTeam.id !== legacyOwnerMembership?.team.id)) {
          throw new AppError("DATABASE_ERROR", "生成的企业标识发生冲突，请重新提交激活。", 500);
        }
        if (otherMembership) {
          throw new ForbiddenError("当前账号已经加入其他企业，不能再开通新的企业。");
        }

        const startDate = now;
        const endDate = new Date(startDate.getTime() + grant.subscriptionDays * DAY_IN_MILLISECONDS);
        const company = await transaction.tenantCompany.create({
          data: {
            id: companyId,
            name: input.companyName,
            industry: input.industry,
            ownerId: userId,
            status: "ACTIVE"
          },
          select: { id: true, name: true, industry: true }
        });
        const team = legacyOwnerMembership
          ? legacyOwnerMembership.team
          : await transaction.teamOrganization.create({
              data: {
                id: teamId,
                companyId: company.id,
                name: "默认团队",
                description: `${company.name} 的默认协作团队`,
                ownerId: userId,
                status: "ACTIVE"
              },
              select: { id: true, name: true }
            });
        if (!legacyOwnerMembership) {
          await transaction.teamMember.create({
            data: {
              teamId: team.id,
              userId,
              role: "TEAM_OWNER",
              status: "ACTIVE"
            }
          });
        }
        const subscription = await transaction.tenantSubscription.create({
          data: {
            companyId: company.id,
            planId: plan.id,
            startDate,
            endDate,
            status: "ACTIVE"
          },
          select: { id: true, planId: true, startDate: true, endDate: true }
        });

        await attachTeamOsSubscriptionToLicense(transaction, {
          licenseId: grant.grantId,
          userId,
          companyId: company.id,
          teamId: team.id,
          subscriptionId: subscription.id,
          subscriptionEndsAt: subscription.endDate
        });

        return {
          company,
          defaultTeam: team,
          subscription: {
            id: subscription.id,
            planId: subscription.planId,
            planName: plan.name,
            startDate: subscription.startDate.toISOString(),
            endDate: subscription.endDate.toISOString()
          },
          role: "TEAM_OWNER",
          idempotent: false,
          nextPath: "/team-os/onboarding"
        };
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      });
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!retryable || attempt === SERIALIZABLE_RETRY_LIMIT - 1) {
        await recordTeamOsLicenseActivationFailure({ code: input.code, userId, error, request }).catch(() => undefined);
        throw error;
      }
    }
  }
  throw new AppError("UNKNOWN_ERROR", "企业激活失败，请稍后重试。", 500);
}
