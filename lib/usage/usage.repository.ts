import { getAIGatewayStats } from "@/lib/saas-core/ai-gateway.service";
import { getTenantKnowledge } from "@/lib/saas-core/knowledge.service";
import { getTenantLicenses } from "@/lib/saas-core/license.service";
import { getTenantUsers, getSaaSUser } from "@/lib/saas-core/rbac.service";
import { getTenants } from "@/lib/saas-core/tenant.service";
import type { UsageMetricInput } from "@/types/commercial";

export async function readTenantUsageSnapshot(tenantId: string) {
  const [aiStats, knowledge, users, licenses] = await Promise.all([
    getAIGatewayStats({ tenantId }),
    getTenantKnowledge(tenantId, { page: 1, pageSize: 100000 }),
    getTenantUsers(tenantId, undefined, { page: 1, pageSize: 100000 }),
    getTenantLicenses(tenantId, { page: 1, pageSize: 100000 })
  ]);

  return {
    aiStats,
    knowledge,
    users,
    licenses
  };
}

export async function readUserUsageSnapshot(userId: string) {
  const user = await getSaaSUser(userId);
  const aiStats = user?.tenantId ? await getAIGatewayStats({ tenantId: user.tenantId }) : null;

  return {
    user,
    aiStats
  };
}

export async function readSystemUsageSnapshot() {
  const tenants = await getTenants(undefined, { page: 1, pageSize: 100000 });
  const tenantSnapshots = await Promise.all(
    tenants.map(async (tenant) => ({
      tenant,
      usage: await readTenantUsageSnapshot(tenant.id)
    }))
  );

  return {
    tenants,
    tenantSnapshots
  };
}

export async function recordUsageMetric(input: UsageMetricInput & { type: "ai" | "upload" | "knowledge" }) {
  return {
    recorded: true,
    mode: "service_only",
    input,
    recordedAt: new Date().toISOString()
  };
}
