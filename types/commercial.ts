import type { QuotaCheckResult, QuotaUsage } from "@/types/quota";
import type { ExpiringSubscription, PlanType, Subscription } from "@/types/subscription";

export type UsageMetricInput = {
  tenantId: string;
  userId?: string;
  tokens?: number;
  count?: number;
};

export type TenantUsage = QuotaUsage & {
  tokenUsage: number;
  licenseActivations: number;
};

export type UserUsage = {
  userId: string;
  tenantId: string;
  todayQuestions: number;
  monthlyQuestions: number;
  tokenUsage: number;
  lastUsedAt: string | null;
};

export type SystemUsageOverview = {
  totalTenants: number;
  activeTenants: number;
  totalAIRequests: number;
  totalTokenUsage: number;
  expiringTenants: number;
  abnormalTenants: number;
};

export type PlanDistribution = Record<PlanType, number>;

export type CommercialTenantSummary = {
  tenantId: string;
  tenantName: string;
  plan: PlanType;
  subscription: Subscription;
  usage: TenantUsage;
  quota: QuotaCheckResult;
};

export type CommercialOverview = {
  totals: {
    tenants: number;
    activeTenants: number;
    dailyAiRequests: number;
    monthlyAiRequests: number;
    tokenUsage: number;
    quotaWarnings: number;
  };
  planDistribution: PlanDistribution;
  expiring: {
    within7Days: number;
    within30Days: number;
    expired: number;
    items: ExpiringSubscription[];
  };
  rankings: {
    topAIRequests: CommercialTenantSummary[];
    topTokenUsage: CommercialTenantSummary[];
    topUsers: CommercialTenantSummary[];
    topKnowledge: CommercialTenantSummary[];
  };
  licenses: {
    activated: number;
    unused: number;
    expired: number;
    enterprise: number;
    trial: number;
  };
  cost: {
    estimatedTokenCost: number;
    estimatedModelCost: number;
  };
  quotaWarnings: CommercialTenantSummary[];
};
