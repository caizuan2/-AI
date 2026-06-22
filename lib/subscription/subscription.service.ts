import { getTenantLicenses } from "@/lib/saas-core/license.service";
import { getSaaSUser } from "@/lib/saas-core/rbac.service";
import { getTenant, getTenants } from "@/lib/saas-core/tenant.service";
import { normalizePlan, resolvePlanFromLicense } from "@/lib/subscription/plan.service";
import type { LicenseRecord } from "@/types/saas-core";
import type { ExpiringSubscription, Subscription, SubscriptionStatus } from "@/types/subscription";

function now() {
  return new Date();
}

function daysBetween(from: Date, to: Date) {
  return Math.ceil((to.getTime() - from.getTime()) / 86400000);
}

function pickPrimaryLicense(licenses: LicenseRecord[]) {
  const active = licenses.find((license) => license.status === "active");

  return active ?? licenses[0] ?? null;
}

export function getSubscriptionStatus(subscription: Subscription): SubscriptionStatus {
  if (subscription.status === "disabled") {
    return "disabled";
  }

  if (subscription.expiresAt && new Date(subscription.expiresAt) <= now()) {
    return "expired";
  }

  return subscription.status;
}

export function isSubscriptionActive(subscription: Subscription): boolean {
  return getSubscriptionStatus(subscription) === "active" || getSubscriptionStatus(subscription) === "trialing";
}

export function buildSubscriptionFromLicense(input: {
  tenantId: string;
  userId?: string;
  license: LicenseRecord | null;
  tenantPlan?: string;
}): Subscription {
  const license = input.license;
  const status: SubscriptionStatus = license
    ? license.status === "active"
      ? license.expiresAt && new Date(license.expiresAt) <= now()
        ? "expired"
        : "active"
      : license.status === "expired"
        ? "expired"
        : "disabled"
    : "pending";

  return {
    tenantId: input.tenantId,
    userId: input.userId,
    licenseId: license?.id,
    plan: license ? resolvePlanFromLicense(license) : normalizePlan(input.tenantPlan),
    status,
    startedAt: license?.createdAt ?? now().toISOString(),
    expiresAt: license?.expiresAt ?? null,
    source: "license",
    autoRenew: false
  };
}

export async function getSubscriptionByTenant(tenantId: string): Promise<Subscription> {
  const [tenant, licenses] = await Promise.all([
    getTenant(tenantId),
    getTenantLicenses(tenantId)
  ]);

  return buildSubscriptionFromLicense({
    tenantId,
    license: pickPrimaryLicense(licenses),
    tenantPlan: tenant?.plan
  });
}

export async function getSubscriptionByUser(userId: string): Promise<Subscription> {
  const user = await getSaaSUser(userId);

  if (!user?.tenantId) {
    return buildSubscriptionFromLicense({
      tenantId: "",
      userId,
      license: null
    });
  }

  const subscription = await getSubscriptionByTenant(user.tenantId);

  return {
    ...subscription,
    userId
  };
}

export async function listExpiringSubscriptions(days: number): Promise<ExpiringSubscription[]> {
  const tenants = await getTenants(undefined, { page: 1, pageSize: 1000 });
  const today = now();
  const subscriptions = await Promise.all(tenants.map((tenant) => getSubscriptionByTenant(tenant.id)));

  return subscriptions
    .filter((subscription) => subscription.expiresAt)
    .map((subscription) => ({
      ...subscription,
      daysUntilExpiry: daysBetween(today, new Date(subscription.expiresAt as string))
    }))
    .filter((subscription) => subscription.daysUntilExpiry <= days)
    .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
}
