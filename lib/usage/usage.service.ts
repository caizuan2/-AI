import { readSystemUsageSnapshot, readTenantUsageSnapshot, readUserUsageSnapshot, recordUsageMetric } from "@/lib/usage/usage.repository";
import type { SystemUsageOverview, TenantUsage, UsageMetricInput, UserUsage } from "@/types/commercial";

export async function getTenantUsage(tenantId: string): Promise<TenantUsage> {
  const snapshot = await readTenantUsageSnapshot(tenantId);
  const tokenUsage = snapshot.aiStats.totalTokens;

  return {
    tenantId,
    dailyAiRequests: snapshot.aiStats.totalRequests,
    monthlyAiRequests: snapshot.aiStats.totalRequests,
    tokenUsage,
    knowledgeDocuments: snapshot.knowledge.length,
    userCount: snapshot.users.length,
    uploadCount: snapshot.knowledge.length,
    licenseActivations: snapshot.licenses.filter((license) => license.status === "active").length
  };
}

export async function getUserUsage(userId: string): Promise<UserUsage> {
  const snapshot = await readUserUsageSnapshot(userId);

  return {
    userId,
    tenantId: snapshot.user?.tenantId ?? "",
    todayQuestions: snapshot.aiStats?.totalRequests ?? 0,
    monthlyQuestions: snapshot.aiStats?.totalRequests ?? 0,
    tokenUsage: snapshot.aiStats?.totalTokens ?? 0,
    lastUsedAt: snapshot.user?.lastActiveAt ?? null
  };
}

export async function getSystemUsageOverview(): Promise<SystemUsageOverview> {
  const snapshot = await readSystemUsageSnapshot();
  const totalAIRequests = snapshot.tenantSnapshots.reduce((sum, item) => sum + item.usage.aiStats.totalRequests, 0);
  const totalTokenUsage = snapshot.tenantSnapshots.reduce((sum, item) => sum + item.usage.aiStats.totalTokens, 0);
  const expiringTenants = snapshot.tenantSnapshots.filter((item) =>
    item.usage.licenses.some((license) => license.expiresAt && new Date(license.expiresAt) <= new Date(Date.now() + 30 * 86400000))
  ).length;
  const abnormalTenants = snapshot.tenantSnapshots.filter((item) => item.usage.aiStats.errorCount > 0).length;

  return {
    totalTenants: snapshot.tenants.length,
    activeTenants: snapshot.tenants.filter((tenant) => tenant.status === "active").length,
    totalAIRequests,
    totalTokenUsage,
    expiringTenants,
    abnormalTenants
  };
}

export function recordAIUsage(input: UsageMetricInput) {
  return recordUsageMetric({ ...input, type: "ai" });
}

export function recordUploadUsage(input: UsageMetricInput) {
  return recordUsageMetric({ ...input, type: "upload" });
}

export function recordKnowledgeUsage(input: UsageMetricInput) {
  return recordUsageMetric({ ...input, type: "knowledge" });
}
