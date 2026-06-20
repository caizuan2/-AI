export type BillingProviderType = "license" | "stripe" | "alipay" | "wechat";

export type PlanType = "free" | "pro" | "enterprise";

export type QuotaType = "ai_request" | "knowledge_item" | "user_seat" | "storage";

export type BillingErrorCode = "billing_limit" | "subscription_inactive" | "provider_unavailable";

export type BillingUser = {
  id: string;
  tenantId?: string;
  role?: string;
  licenseActivated?: boolean;
  plan?: PlanType;
  quotaUsage?: Partial<Record<QuotaType, number>>;
};

export type BillingResource = {
  key: string;
  action: string;
  quotaType?: QuotaType;
};

export type Plan = {
  type: PlanType;
  label: string;
  quotas: Record<QuotaType, number>;
};

export type SubscriptionStatus = {
  active: boolean;
  provider: BillingProviderType;
  plan: PlanType;
  expiresAt?: string | null;
  reason?: string;
};

export type AccessResult = {
  allowed: boolean;
  provider: BillingProviderType;
  plan: PlanType;
  resource: BillingResource;
  quota?: {
    type: QuotaType;
    limit: number;
    used: number;
  };
  error?: BillingErrorCode;
  reason?: string;
};

export type QuotaCheckResult = {
  allowed: boolean;
  quota?: {
    type: QuotaType;
    limit: number;
    used: number;
  };
  reason?: string;
};
