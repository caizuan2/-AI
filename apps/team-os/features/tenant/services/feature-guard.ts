import "server-only";

import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { resolveTenantAccess } from "@/apps/team-os/features/tenant/services/tenant-access";
import type {
  FeatureCheckData,
  FeatureCheckInput,
  FeatureCheckReason,
  TeamOsFeatureKey,
  TenantAccessState
} from "@/apps/team-os/features/tenant/types";

const subscriptionInclude = {
  plan: {
    select: {
      id: true,
      status: true,
      featurePermissions: {
        select: {
          featureKey: true,
          enabled: true
        }
      }
    }
  }
} as const;

function result(
  access: TenantAccessState,
  featureKey: TeamOsFeatureKey,
  reason: FeatureCheckReason,
  subscription?: {
    id: string;
    planId: string;
    endDate: Date;
  } | null
): FeatureCheckData {
  return {
    context: access.context,
    featureKey,
    enabled: reason === "ENABLED",
    reason,
    planId: subscription?.planId ?? null,
    subscriptionId: subscription?.id ?? null,
    expiresAt: subscription?.endDate.toISOString() ?? null
  };
}

export async function checkTenantFeatureForAccess(
  access: TenantAccessState,
  featureKey: TeamOsFeatureKey,
  now = new Date()
): Promise<FeatureCheckData> {
  const company = access.company;
  if (!company) {
    return result(access, featureKey, "COMPANY_NOT_PROVISIONED");
  }
  if (company.status === "DISABLED") {
    return result(access, featureKey, "COMPANY_DISABLED");
  }
  if (company.status === "EXPIRED") {
    return result(access, featureKey, "COMPANY_EXPIRED");
  }

  const activeSubscription = await prisma.tenantSubscription.findFirst({
    where: {
      companyId: access.context.companyId,
      status: "ACTIVE"
    },
    include: subscriptionInclude,
    orderBy: [{ endDate: "desc" }, { createdAt: "desc" }]
  });
  const subscription = activeSubscription ?? await prisma.tenantSubscription.findFirst({
    where: { companyId: access.context.companyId },
    include: subscriptionInclude,
    orderBy: { createdAt: "desc" }
  });

  if (!subscription) {
    return result(access, featureKey, "SUBSCRIPTION_MISSING");
  }
  if (subscription.status !== "ACTIVE" || subscription.startDate > now) {
    return result(access, featureKey, "SUBSCRIPTION_INACTIVE", subscription);
  }
  if (subscription.endDate <= now) {
    return result(access, featureKey, "SUBSCRIPTION_EXPIRED", subscription);
  }
  if (subscription.plan.status !== "ACTIVE") {
    return result(access, featureKey, "PLAN_DISABLED", subscription);
  }

  const permission = subscription.plan.featurePermissions.find((item) => item.featureKey === featureKey);
  if (!permission?.enabled) {
    return result(access, featureKey, "FEATURE_DISABLED", subscription);
  }

  return result(access, featureKey, "ENABLED", subscription);
}

export async function checkTenantFeature(userId: string, input: FeatureCheckInput) {
  const access = await resolveTenantAccess(userId, input.companyId);
  return checkTenantFeatureForAccess(access, input.featureKey);
}

export function assertTenantFeatureEnabled(check: FeatureCheckData) {
  if (!check.enabled) {
    throw new AppError(
      "FEATURE_DISABLED",
      "当前企业套餐未开通此功能，或套餐当前不可用。",
      403
    );
  }
  return check;
}

export async function requireTenantFeature(userId: string, input: FeatureCheckInput) {
  return assertTenantFeatureEnabled(await checkTenantFeature(userId, input));
}
