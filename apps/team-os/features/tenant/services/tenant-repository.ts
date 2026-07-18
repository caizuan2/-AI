import "server-only";

import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import {
  assertTenantUpgradeAccess,
  assertTenantUsageAccess,
  resolveTenantAccess
} from "@/apps/team-os/features/tenant/services/tenant-access";
import { getTenantAuthorizationCapabilities } from "@/apps/team-os/features/tenant/services/authorization-compat";
import type {
  SubscriptionPlanStatusValue,
  TenantCompanyData,
  TenantFeaturePermissionData,
  TenantPlanSummary,
  TenantSubscriptionData,
  TenantSubscriptionStatusValue,
  TenantSubscriptionSummary,
  TenantUsageData,
  TenantUsageMetric,
  UpgradeIntentInput,
  UpgradeIntentResult
} from "@/apps/team-os/features/tenant/types";

const featurePermissionSelect = {
  featureKey: true,
  enabled: true
} as const;

const planSelect = {
  id: true,
  name: true,
  description: true,
  maxUsers: true,
  maxStorage: true,
  price: true,
  status: true,
  featurePermissions: {
    select: featurePermissionSelect,
    orderBy: { featureKey: "asc" as const }
  }
} as const;

const subscriptionSelect = {
  id: true,
  companyId: true,
  planId: true,
  startDate: true,
  endDate: true,
  status: true,
  createdAt: true,
  plan: {
    select: planSelect
  }
} as const;

type PlanRecord = {
  id: string;
  name: string;
  description: string;
  maxUsers: number;
  maxStorage: number;
  price: { toString(): string };
  status: string;
  featurePermissions: Array<{
    featureKey: string;
    enabled: boolean;
  }>;
};

type SubscriptionRecord = {
  id: string;
  companyId: string;
  planId: string;
  startDate: Date;
  endDate: Date;
  status: string;
  createdAt: Date;
  plan: PlanRecord;
};

function toPlanStatus(value: string): SubscriptionPlanStatusValue {
  return value === "ACTIVE" ? "ACTIVE" : "DISABLED";
}

function toSubscriptionStatus(value: string): TenantSubscriptionStatusValue {
  if (value === "ACTIVE" || value === "EXPIRED" || value === "CANCELLED") {
    return value;
  }
  throw new Error("Unsupported tenant subscription status.");
}

function serializeFeaturePermissions(
  permissions: Array<{ featureKey: string; enabled: boolean }>
): TenantFeaturePermissionData[] {
  return permissions.map((permission) => ({
    featureKey: permission.featureKey,
    enabled: permission.enabled
  }));
}

function serializePlan(plan: PlanRecord): TenantPlanSummary {
  const permissions = serializeFeaturePermissions(plan.featurePermissions);
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    maxUsers: plan.maxUsers,
    maxStorage: plan.maxStorage,
    // FeaturePermission is the authorization source of truth. The plan JSON is
    // intentionally not used to grant or advertise an enabled capability.
    features: permissions.filter((permission) => permission.enabled).map((permission) => permission.featureKey),
    price: plan.price.toString(),
    status: toPlanStatus(plan.status)
  };
}

function isSubscriptionEffective(subscription: SubscriptionRecord, now = new Date()) {
  return subscription.status === "ACTIVE" &&
    subscription.plan.status === "ACTIVE" &&
    subscription.startDate <= now &&
    subscription.endDate > now;
}

function serializeSubscription(
  subscription: SubscriptionRecord,
  now = new Date()
): TenantSubscriptionSummary {
  return {
    id: subscription.id,
    companyId: subscription.companyId,
    status: toSubscriptionStatus(subscription.status),
    startDate: subscription.startDate.toISOString(),
    endDate: subscription.endDate.toISOString(),
    createdAt: subscription.createdAt.toISOString(),
    isEffective: isSubscriptionEffective(subscription, now),
    plan: serializePlan(subscription.plan),
    featurePermissions: serializeFeaturePermissions(subscription.plan.featurePermissions)
  };
}

async function findCurrentOrLatestSubscription(companyId: string): Promise<SubscriptionRecord | null> {
  const active = await prisma.tenantSubscription.findFirst({
    where: { companyId, status: "ACTIVE" },
    select: subscriptionSelect,
    orderBy: [{ endDate: "desc" }, { createdAt: "desc" }]
  });
  if (active) {
    return active;
  }
  return prisma.tenantSubscription.findFirst({
    where: { companyId },
    select: subscriptionSelect,
    orderBy: { createdAt: "desc" }
  });
}

async function findEffectiveSubscription(
  companyId: string,
  now = new Date()
): Promise<SubscriptionRecord | null> {
  return prisma.tenantSubscription.findFirst({
    where: {
      companyId,
      status: "ACTIVE",
      startDate: { lte: now },
      endDate: { gt: now },
      plan: { status: "ACTIVE" }
    },
    select: subscriptionSelect,
    orderBy: [{ endDate: "desc" }, { createdAt: "desc" }]
  });
}

async function countActiveCompanyUsers(companyId: string) {
  const memberships = await prisma.teamMember.findMany({
    where: {
      status: "ACTIVE",
      team: { companyId, status: "ACTIVE" }
    },
    distinct: ["userId"],
    select: { userId: true }
  });
  if (memberships.length === 0) {
    return 0;
  }
  return prisma.user.count({
    where: {
      id: { in: memberships.map((membership) => membership.userId) },
      isActive: true
    }
  });
}

function usageMetric(input: TenantUsageMetric): TenantUsageMetric {
  return input;
}

function shanghaiMonthStart(now: Date) {
  const date = new Date(now.getTime() + 8 * 60 * 60 * 1_000).toISOString().slice(0, 7);
  return new Date(`${date}-01T00:00:00+08:00`);
}

function usageWindow(now: Date, subscription: SubscriptionRecord | null) {
  const monthStart = shanghaiMonthStart(now);
  const start = subscription && subscription.startDate > monthStart
    ? subscription.startDate
    : monthStart;
  const candidateEnd = subscription && subscription.endDate < now
    ? subscription.endDate
    : now;
  const hasRange = candidateEnd > start;
  const end = hasRange ? candidateEnd : start;
  return {
    start,
    end,
    hasRange,
    label: subscription ? "本月（按当前套餐有效期截取）" : "本月"
  };
}

export async function getTenantCompanyData(
  userId: string,
  requestedCompanyId?: string
): Promise<TenantCompanyData> {
  const access = await resolveTenantAccess(userId, requestedCompanyId);
  const companyId = access.context.companyId;
  const [activeTeams, activeMemberCount, subscription] = await Promise.all([
    prisma.teamOrganization.count({
      where: { companyId, status: "ACTIVE" }
    }),
    countActiveCompanyUsers(companyId),
    access.company?.status === "ACTIVE"
      ? findEffectiveSubscription(companyId)
      : Promise.resolve(null)
  ]);
  const company = access.company;

  return {
    context: access.context,
    company: {
      id: companyId,
      name: company?.name ?? access.context.companyName,
      provisioned: Boolean(company),
      logo: company?.logo ?? null,
      industry: company?.industry ?? null,
      status: company?.status ?? "UNPROVISIONED",
      createdAt: company?.createdAt.toISOString() ?? null,
      updatedAt: company?.updatedAt.toISOString() ?? null,
      memberCount: activeMemberCount,
      teamCount: activeTeams,
      currentPlan: subscription ? serializePlan(subscription.plan) : null
    }
  };
}

export async function getTenantSubscriptionData(
  userId: string,
  requestedCompanyId?: string
): Promise<TenantSubscriptionData> {
  const access = await resolveTenantAccess(userId, requestedCompanyId);
  const [subscription, availablePlans] = await Promise.all([
    access.company
      ? findCurrentOrLatestSubscription(access.context.companyId)
      : Promise.resolve(null),
    prisma.subscriptionPlan.findMany({
      where: { status: "ACTIVE" },
      select: planSelect,
      orderBy: [{ price: "asc" }, { name: "asc" }]
    })
  ]);

  const rawSubscription = subscription ? serializeSubscription(subscription) : null;
  const serializedSubscription = rawSubscription
    ? {
        ...rawSubscription,
        isEffective: access.company?.status === "ACTIVE" && rawSubscription.isEffective
      }
    : null;
  const permissionsAreEffective = serializedSubscription?.isEffective === true;

  return {
    context: access.context,
    subscription: serializedSubscription,
    availablePlans: availablePlans.map(serializePlan),
    featurePermissions: subscription
      ? serializeFeaturePermissions(subscription.plan.featurePermissions).map((permission) => ({
          ...permission,
          enabled: permissionsAreEffective && permission.enabled
        }))
      : [],
    upgradeMode: "AUTHORIZATION_REQUIRED"
  };
}

export async function getTenantUsageData(
  userId: string,
  requestedCompanyId?: string,
  now = new Date()
): Promise<TenantUsageData> {
  const access = await resolveTenantAccess(userId, requestedCompanyId, {
    ownerCompaniesOnly: true,
    preferOwnerCompany: true
  });
  assertTenantUsageAccess(access);
  const companyId = access.context.companyId;
  const subscription = access.company?.status === "ACTIVE"
    ? await findEffectiveSubscription(companyId, now)
    : null;
  const window = usageWindow(now, subscription);
  const [activeMemberCount, crmCustomers, trainingAssignments, legacyTenant] = await Promise.all([
    countActiveCompanyUsers(companyId),
    prisma.customer.count({ where: { companyId } }),
    window.hasRange
      ? prisma.trainingAssignment.count({
          where: {
            companyId,
            status: { not: "CANCELLED" },
            createdAt: { gte: window.start, lt: window.end }
          }
        })
      : Promise.resolve(0),
    prisma.tenant.findUnique({
      where: { id: companyId },
      select: { id: true }
    })
  ]);
  const knowledgeItems = legacyTenant
    ? await prisma.knowledgeItem.count({
        where: {
          tenantId: companyId,
          deletedAt: null
        }
      })
    : null;
  const plan = subscription?.plan ?? null;

  return {
    context: access.context,
    period: {
      startDate: window.start.toISOString(),
      endDate: window.end.toISOString(),
      label: window.label
    },
    metrics: {
      users: usageMetric({
        value: activeMemberCount,
        available: true,
        definition: "当前企业有效团队中的有效成员按 userId 去重统计。",
        limit: plan?.maxUsers ?? null,
        unit: "人"
      }),
      aiCalls: usageMetric({
        value: null,
        available: false,
        definition: "当前 Team OS AI Provider 尚无可可靠按企业归因的调用审计，因此不展示推测值。",
        unit: "次"
      }),
      knowledgeItems: usageMetric({
        value: knowledgeItems,
        available: knowledgeItems !== null,
        definition: knowledgeItems === null
          ? "企业 ID 未与现有知识库 Tenant 建立可靠映射，知识用量不可归因。"
          : "只读统计同 tenantId 下未删除的 KnowledgeItem 数量，不读取知识正文。",
        unit: "条"
      }),
      crmCustomers: usageMetric({
        value: crmCustomers,
        available: true,
        definition: "当前企业 companyId 下的 CRM 客户总数。",
        unit: "个"
      }),
      trainingAssignments: usageMetric({
        value: trainingAssignments,
        available: true,
        definition: "计费区间内按 companyId 创建且未取消的培训安排次数。",
        unit: "次"
      })
    }
  };
}

export async function requestTenantSubscriptionUpgrade(
  userId: string,
  input: UpgradeIntentInput
): Promise<UpgradeIntentResult> {
  const access = await resolveTenantAccess(userId, input.companyId);
  assertTenantUpgradeAccess(access);
  if (access.company?.status === "DISABLED") {
    throw new ForbiddenError("企业已停用，请联系平台管理员处理套餐。");
  }

  const targetPlan = await prisma.subscriptionPlan.findFirst({
    where: {
      id: input.targetPlanId,
      status: "ACTIVE"
    },
    select: planSelect
  });
  if (!targetPlan) {
    throw new NotFoundError("目标套餐不存在或当前不可用。");
  }

  const authorization = getTenantAuthorizationCapabilities();
  return {
    status: "REQUIRES_AUTHORIZATION",
    mutationApplied: false,
    companyId: access.context.companyId,
    targetPlan: serializePlan(targetPlan),
    message: access.company
      ? "目标套餐需要平台签发的企业授权凭证；本次仅返回授权要求，没有提交申请或修改当前订阅。"
      : "企业商业化资料尚未初始化，目标套餐还需要平台签发的企业授权凭证；本次仅返回授权要求，没有提交申请或创建订阅。",
    authorization: {
      mode: authorization.mode,
      available: false
    }
  };
}
