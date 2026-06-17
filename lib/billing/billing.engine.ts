import { alipayProvider } from "@/lib/billing/alipay.provider";
import { resolvePlan, type BillingProvider } from "@/lib/billing/billing.provider";
import { licenseProvider } from "@/lib/billing/license.provider";
import { stripeProvider } from "@/lib/billing/stripe.provider";
import { wechatProvider } from "@/lib/billing/wechat.provider";
import { getQuotaPolicy } from "@/lib/quota/quota.policy";
import { getQuotaUsage } from "@/lib/quota/quota.service";
import { getSubscriptionByTenant } from "@/lib/subscription/subscription.service";
import type { AccessResult, BillingProviderType, BillingResource, BillingUser, Plan, QuotaCheckResult, SubscriptionStatus } from "@/types/billing";

const providers: Record<BillingProviderType, BillingProvider> = {
  license: licenseProvider,
  stripe: stripeProvider,
  alipay: alipayProvider,
  wechat: wechatProvider
};

function getConfiguredProviderType(): BillingProviderType {
  const provider = process.env.BILLING_PROVIDER;

  return provider === "stripe" || provider === "alipay" || provider === "wechat" ? provider : "license";
}

export function getBillingProvider(type: BillingProviderType = getConfiguredProviderType()): BillingProvider {
  return providers[type] ?? licenseProvider;
}

export async function validateSubscription(user: BillingUser, providerType = getConfiguredProviderType()): Promise<SubscriptionStatus> {
  return getBillingProvider(providerType).validate(user);
}

export async function getUserPlan(user: BillingUser, providerType = getConfiguredProviderType()): Promise<Plan> {
  return getBillingProvider(providerType).getPlan(user);
}

export async function getPlan(userOrTenant: BillingUser | { tenantId: string }, providerType = getConfiguredProviderType()): Promise<Plan> {
  if ("id" in userOrTenant) {
    return getUserPlan(userOrTenant, providerType);
  }

  const subscription = await getSubscriptionByTenant(userOrTenant.tenantId);

  return resolvePlan(subscription.plan);
}

export async function checkQuota(
  user: BillingUser,
  resource: BillingResource,
  providerType = getConfiguredProviderType()
): Promise<QuotaCheckResult> {
  return getBillingProvider(providerType).checkLimit(user, resource);
}

export async function checkAccess(
  user: BillingUser,
  resource: BillingResource,
  providerType = getConfiguredProviderType()
): Promise<AccessResult> {
  const provider = getBillingProvider(providerType);
  const [subscription, plan] = await Promise.all([
    provider.validate(user),
    provider.getPlan(user)
  ]);

  if (!subscription.active) {
    return {
      allowed: false,
      provider: provider.type,
      plan: plan.type,
      resource,
      error: "subscription_inactive",
      reason: subscription.reason ?? "subscription_inactive"
    };
  }

  const quota = await provider.checkLimit(user, resource);

  if (!quota.allowed) {
    return {
      allowed: false,
      provider: provider.type,
      plan: plan.type,
      resource,
      quota: quota.quota,
      error: "billing_limit",
      reason: quota.reason ?? "billing_limit"
    };
  }

  return {
    allowed: true,
    provider: provider.type,
    plan: plan.type,
    resource,
    quota: quota.quota,
    reason: subscription.reason ?? "billing_allowed"
  };
}

export async function getBillingProviderStatus(user: BillingUser, providerType = getConfiguredProviderType()) {
  const provider = getBillingProvider(providerType);
  const [subscription, plan] = await Promise.all([
    provider.validate(user),
    provider.getPlan(user)
  ]);

  return {
    provider: provider.type,
    subscription,
    plan
  };
}

export async function getBillingSummary(tenantId: string) {
  const [subscription, usage] = await Promise.all([
    getSubscriptionByTenant(tenantId),
    getQuotaUsage(tenantId)
  ]);
  const policy = getQuotaPolicy(subscription.plan);

  return {
    tenantId,
    provider: getConfiguredProviderType(),
    subscription,
    plan: subscription.plan,
    policy,
    usage
  };
}

export const billingEngine = {
  checkAccess,
  checkQuota,
  getPlan,
  getUserPlan,
  validateSubscription,
  getBillingProviderStatus,
  getBillingSummary
};
