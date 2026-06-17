import { checkTenantQuota } from "@/lib/quota/quota.service";
import { getTenantLicenses } from "@/lib/saas-core/license.service";
import { getTenants } from "@/lib/saas-core/tenant.service";
import { getSubscriptionByTenant, listExpiringSubscriptions } from "@/lib/subscription/subscription.service";
import { getSystemUsageOverview, getTenantUsage } from "@/lib/usage/usage.service";
import type { CommercialOverview, CommercialTenantSummary, PlanDistribution } from "@/types/commercial";

async function buildTenantSummary(tenantId: string, tenantName: string): Promise<CommercialTenantSummary> {
  const [subscription, usage, quota] = await Promise.all([
    getSubscriptionByTenant(tenantId),
    getTenantUsage(tenantId),
    checkTenantQuota(tenantId, "ai_request")
  ]);

  return {
    tenantId,
    tenantName,
    plan: subscription.plan,
    subscription,
    usage,
    quota
  };
}

function sortTop<T>(items: T[], score: (item: T) => number, count = 5) {
  return [...items].sort((a, b) => score(b) - score(a)).slice(0, count);
}

export async function getCommercialTenantSummaries(): Promise<CommercialTenantSummary[]> {
  const tenants = await getTenants(undefined, { page: 1, pageSize: 100000 });

  return Promise.all(tenants.map((tenant) => buildTenantSummary(tenant.id, tenant.name)));
}

export async function getPlanDistribution(): Promise<PlanDistribution> {
  const summaries = await getCommercialTenantSummaries();

  return summaries.reduce<PlanDistribution>(
    (distribution, item) => ({
      ...distribution,
      [item.plan]: distribution[item.plan] + 1
    }),
    {
      free: 0,
      pro: 0,
      enterprise: 0
    }
  );
}

export async function getCommercialOverview(): Promise<CommercialOverview> {
  const [summaries, licenses, expiring, usageOverview] = await Promise.all([
    getCommercialTenantSummaries(),
    getTenantLicenses(undefined, { page: 1, pageSize: 100000 }),
    listExpiringSubscriptions(30),
    getSystemUsageOverview()
  ]);
  const planDistribution = summaries.reduce<PlanDistribution>(
    (distribution, item) => {
      distribution[item.plan] += 1;

      return distribution;
    },
    {
      free: 0,
      pro: 0,
      enterprise: 0
    }
  );
  const expired = expiring.filter((item) => item.daysUntilExpiry < 0);
  const within7Days = expiring.filter((item) => item.daysUntilExpiry >= 0 && item.daysUntilExpiry <= 7);
  const within30Days = expiring.filter((item) => item.daysUntilExpiry >= 0 && item.daysUntilExpiry <= 30);
  const tokenCost = Number((usageOverview.totalTokenUsage * 0.000002).toFixed(4));

  return {
    planDistribution,
    expiring: {
      within7Days: within7Days.length,
      within30Days: within30Days.length,
      expired: expired.length,
      items: expiring
    },
    rankings: {
      topAIRequests: sortTop(summaries, (item) => item.usage.monthlyAiRequests),
      topTokenUsage: sortTop(summaries, (item) => item.usage.tokenUsage),
      topUsers: sortTop(summaries, (item) => item.usage.userCount),
      topKnowledge: sortTop(summaries, (item) => item.usage.knowledgeDocuments)
    },
    licenses: {
      activated: licenses.filter((license) => license.status === "active").length,
      unused: licenses.filter((license) => license.status === "inactive").length,
      expired: licenses.filter((license) => license.status === "expired").length,
      enterprise: licenses.filter((license) => license.plan === "enterprise").length,
      trial: licenses.filter((license) => license.plan === "trial" || license.plan === "free").length
    },
    cost: {
      estimatedTokenCost: tokenCost,
      estimatedModelCost: tokenCost
    },
    quotaWarnings: summaries.filter((item) => !item.quota.allowed)
  };
}

export function getCommercialExpiringSubscriptions(days = 30) {
  return listExpiringSubscriptions(days);
}
