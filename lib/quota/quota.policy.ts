import type { QuotaPolicy } from "@/types/quota";
import type { PlanType } from "@/types/subscription";

export const quotaPolicies: Record<PlanType, QuotaPolicy> = {
  free: {
    plan: "free",
    dailyAiRequests: 50,
    monthlyAiRequests: 1000,
    maxUsers: 5,
    maxKnowledgeDocuments: 100,
    maxUploadSizeMB: 20
  },
  pro: {
    plan: "pro",
    dailyAiRequests: 1000,
    monthlyAiRequests: 30000,
    maxUsers: 100,
    maxKnowledgeDocuments: 10000,
    maxUploadSizeMB: 200
  },
  enterprise: {
    plan: "enterprise",
    dailyAiRequests: 100000,
    monthlyAiRequests: 3000000,
    maxUsers: "unlimited",
    maxKnowledgeDocuments: "unlimited",
    maxUploadSizeMB: 2048
  }
};

export function getQuotaPolicy(plan: PlanType): QuotaPolicy {
  return quotaPolicies[plan];
}
