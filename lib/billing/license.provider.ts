import { isPrivilegedBillingRole, resolvePlan, type BillingProvider } from "@/lib/billing/billing.provider";
import type { BillingResource, BillingUser, Plan, QuotaCheckResult, SubscriptionStatus } from "@/types/billing";

function getLicenseBackedPlan(user: BillingUser): Plan {
  if (user.plan) {
    return resolvePlan(user.plan);
  }

  if (isPrivilegedBillingRole(user.role)) {
    return resolvePlan("enterprise");
  }

  return resolvePlan(user.licenseActivated === true ? "pro" : "free");
}

export async function validateLicense(user: BillingUser): Promise<SubscriptionStatus> {
  const plan = getLicenseBackedPlan(user);

  if (isPrivilegedBillingRole(user.role)) {
    return {
      active: true,
      provider: "license",
      plan: plan.type,
      reason: "privileged_role"
    };
  }

  if (user.licenseActivated === false) {
    return {
      active: false,
      provider: "license",
      plan: plan.type,
      reason: "license_not_activated"
    };
  }

  return {
    active: true,
    provider: "license",
    plan: plan.type,
    reason: user.licenseActivated === true ? "license_activated" : "legacy_compatible"
  };
}

export async function getLicensePlan(user: BillingUser): Promise<Plan> {
  return getLicenseBackedPlan(user);
}

export async function checkLicenseStatus(user: BillingUser): Promise<SubscriptionStatus> {
  return validateLicense(user);
}

async function checkLicenseLimit(user: BillingUser, action: BillingResource): Promise<QuotaCheckResult> {
  const plan = getLicenseBackedPlan(user);

  if (!action.quotaType) {
    return { allowed: true };
  }

  const limit = plan.quotas[action.quotaType];
  const used = user.quotaUsage?.[action.quotaType] ?? 0;

  return {
    allowed: used < limit,
    quota: {
      type: action.quotaType,
      limit,
      used
    },
    reason: used < limit ? "within_license_quota" : "license_quota_exceeded"
  };
}

export const licenseProvider: BillingProvider = {
  type: "license",
  validate: validateLicense,
  getPlan: getLicensePlan,
  checkLimit: checkLicenseLimit
};
