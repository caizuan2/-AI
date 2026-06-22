export type PlanType = "free" | "pro" | "enterprise";

export type SubscriptionStatus = "active" | "expired" | "trialing" | "disabled" | "pending";

export type SubscriptionSource = "license";

export type Subscription = {
  tenantId: string;
  userId?: string;
  licenseId?: string;
  plan: PlanType;
  status: SubscriptionStatus;
  startedAt: string;
  expiresAt: string | null;
  source: SubscriptionSource;
  autoRenew: false;
};

export type ExpiringSubscription = Subscription & {
  daysUntilExpiry: number;
};
