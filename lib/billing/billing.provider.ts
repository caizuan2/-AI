import type { AccessResult, BillingResource, BillingUser, Plan, PlanType, QuotaCheckResult, SubscriptionStatus } from "@/types/billing";

export interface BillingProvider {
  readonly type: AccessResult["provider"];
  validate(user: BillingUser): Promise<SubscriptionStatus>;
  getPlan(user: BillingUser): Promise<Plan>;
  checkLimit(user: BillingUser, action: BillingResource): Promise<QuotaCheckResult>;
  charge?(user: BillingUser, amount: number): Promise<void>;
}

export const billingPlans: Record<PlanType, Plan> = {
  free: {
    type: "free",
    label: "Free",
    quotas: {
      ai_request: 100,
      knowledge_item: 50,
      user_seat: 1,
      storage: 512
    }
  },
  pro: {
    type: "pro",
    label: "Pro",
    quotas: {
      ai_request: 5000,
      knowledge_item: 2000,
      user_seat: 20,
      storage: 10240
    }
  },
  enterprise: {
    type: "enterprise",
    label: "Enterprise",
    quotas: {
      ai_request: 100000,
      knowledge_item: 100000,
      user_seat: 1000,
      storage: 1048576
    }
  }
};

export function resolvePlan(type: PlanType | undefined): Plan {
  return billingPlans[type ?? "free"];
}

export function isPrivilegedBillingRole(role: string | undefined): boolean {
  return role === "super_admin" || role === "enterprise_admin" || role === "ingest_admin";
}
