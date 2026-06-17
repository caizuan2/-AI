import type { LicenseRecord, Tenant } from "@/types/saas-core";
import type { PlanType } from "@/types/subscription";

export function normalizePlan(plan: string | null | undefined): PlanType {
  if (plan === "enterprise") {
    return "enterprise";
  }

  if (plan === "pro" || plan === "business") {
    return "pro";
  }

  return "free";
}

export function resolvePlanFromLicense(license: Pick<LicenseRecord, "plan"> | null | undefined): PlanType {
  return normalizePlan(license?.plan);
}

export function resolvePlanFromTenant(tenant: Pick<Tenant, "plan"> | null | undefined): PlanType {
  return normalizePlan(tenant?.plan);
}
