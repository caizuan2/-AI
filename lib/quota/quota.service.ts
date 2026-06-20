import { getQuotaPolicy } from "@/lib/quota/quota.policy";
import { getSubscriptionByTenant, getSubscriptionByUser } from "@/lib/subscription/subscription.service";
import { getTenantUsage } from "@/lib/usage/usage.service";
import type { QuotaAction, QuotaCheckResult, QuotaLimit, QuotaUsage } from "@/types/quota";
import type { PlanType } from "@/types/subscription";

function buildResult(input: {
  allowed: boolean;
  reason?: string;
  plan: PlanType;
  limit?: QuotaLimit;
  used?: number;
}): QuotaCheckResult {
  const remaining =
    input.limit === undefined
      ? undefined
      : input.limit === "unlimited"
        ? "unlimited"
        : Math.max(0, input.limit - (input.used ?? 0));

  return {
    allowed: input.allowed,
    reason: input.reason,
    plan: input.plan,
    limit: input.limit,
    used: input.used,
    remaining
  };
}

function checkLimit(plan: PlanType, limit: QuotaLimit, used: number, reason: string): QuotaCheckResult {
  if (limit === "unlimited") {
    return buildResult({
      allowed: true,
      plan,
      limit,
      used,
      reason: "quota_unlimited"
    });
  }

  return buildResult({
    allowed: used < limit,
    plan,
    limit,
    used,
    reason: used < limit ? "quota_available" : reason
  });
}

export async function getQuotaUsage(tenantId: string): Promise<QuotaUsage> {
  const usage = await getTenantUsage(tenantId);

  return {
    tenantId,
    dailyAiRequests: usage.dailyAiRequests,
    monthlyAiRequests: usage.monthlyAiRequests,
    userCount: usage.userCount,
    knowledgeDocuments: usage.knowledgeDocuments,
    uploadCount: usage.uploadCount
  };
}

export async function checkTenantQuota(tenantId: string, action: QuotaAction): Promise<QuotaCheckResult> {
  if (action === "unknown") {
    return buildResult({
      allowed: true,
      reason: "unknown_action_allowed",
      plan: "free"
    });
  }

  const subscription = await getSubscriptionByTenant(tenantId);
  const policy = getQuotaPolicy(subscription.plan);
  const usage = await getQuotaUsage(tenantId);

  if (action === "ai_request") {
    return checkLimit(subscription.plan, policy.dailyAiRequests, usage.dailyAiRequests, "daily_ai_quota_exceeded");
  }

  if (action === "add_user") {
    return checkLimit(subscription.plan, policy.maxUsers, usage.userCount, "max_users_exceeded");
  }

  if (action === "add_knowledge") {
    return checkLimit(subscription.plan, policy.maxKnowledgeDocuments, usage.knowledgeDocuments, "max_knowledge_documents_exceeded");
  }

  return buildResult({
    allowed: true,
    reason: "action_allowed",
    plan: subscription.plan
  });
}

export async function checkUserQuota(userId: string, action: QuotaAction): Promise<QuotaCheckResult> {
  const subscription = await getSubscriptionByUser(userId);

  if (!subscription.tenantId) {
    return buildResult({
      allowed: false,
      reason: "tenant_not_found",
      plan: subscription.plan
    });
  }

  return checkTenantQuota(subscription.tenantId, action);
}

export function canUseAI(tenantId: string, userId: string): Promise<QuotaCheckResult> {
  void userId;

  return checkTenantQuota(tenantId, "ai_request");
}

export async function canUploadDocument(tenantId: string, fileSizeMB: number): Promise<QuotaCheckResult> {
  const subscription = await getSubscriptionByTenant(tenantId);
  const policy = getQuotaPolicy(subscription.plan);

  if (policy.maxUploadSizeMB === "unlimited") {
    return buildResult({
      allowed: true,
      plan: subscription.plan,
      limit: policy.maxUploadSizeMB,
      used: fileSizeMB,
      reason: "quota_unlimited"
    });
  }

  return buildResult({
    allowed: fileSizeMB <= policy.maxUploadSizeMB,
    plan: subscription.plan,
    limit: policy.maxUploadSizeMB,
    used: fileSizeMB,
    reason: fileSizeMB <= policy.maxUploadSizeMB ? "quota_available" : "upload_size_exceeded"
  });
}

export function canAddUser(tenantId: string): Promise<QuotaCheckResult> {
  return checkTenantQuota(tenantId, "add_user");
}

export function canAddKnowledge(tenantId: string): Promise<QuotaCheckResult> {
  return checkTenantQuota(tenantId, "add_knowledge");
}
