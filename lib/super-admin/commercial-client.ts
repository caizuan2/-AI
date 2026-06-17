import type { CommercialOverview, CommercialTenantSummary, PlanDistribution, SystemUsageOverview } from "@/types/commercial";
import type { QuotaAction, QuotaCheckResult, QuotaPolicy } from "@/types/quota";
import type { ExpiringSubscription } from "@/types/subscription";

export type SuperAdminClientResult<T> = {
  ok: boolean;
  unauthorized?: boolean;
  data?: T;
  error?: string;
};

type SuperAdminApiPayload<T> = {
  success: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
  };
  timestamp?: number;
};

export type SubscriptionOverviewData = {
  total: number;
  active: number;
  expired: number;
  pending: number;
  items: Array<CommercialTenantSummary & { subscriptionDaysUntilExpiry: number | null }>;
  expiring: ExpiringSubscription[];
};

export type QuotasOverviewData = {
  policies: Record<string, QuotaPolicy>;
  warnings: CommercialTenantSummary[];
  planDistribution: PlanDistribution;
  tenants: CommercialTenantSummary[];
};

export type QuotaCheckInput = {
  tenantId: string;
  action: QuotaAction;
  fileSizeMB?: number;
};

async function readJson<T>(response: Response): Promise<SuperAdminApiPayload<T> | null> {
  try {
    return await response.json() as SuperAdminApiPayload<T>;
  } catch {
    return null;
  }
}

async function fetchSuperAdminApi<T>(path: string, init?: RequestInit): Promise<SuperAdminClientResult<T>> {
  try {
    const headers = new Headers(init?.headers);
    headers.set("Accept", "application/json");

    if (init?.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(path, {
      cache: "no-store",
      credentials: "same-origin",
      ...init,
      headers
    });
    const payload = await readJson<T>(response);

    if (response.status === 401) {
      return {
        ok: false,
        unauthorized: true,
        error: payload?.error?.message ?? "请使用超级管理员登录后查看商业化数据"
      };
    }

    if (!response.ok || !payload?.success) {
      return {
        ok: false,
        error: payload?.error?.message ?? "商业化数据加载失败"
      };
    }

    return {
      ok: true,
      data: payload.data as T
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "网络请求失败"
    };
  }
}

export function fetchCommercialOverview() {
  return fetchSuperAdminApi<CommercialOverview>("/api/super-admin/commercial/overview");
}

export function fetchCommercialPlans() {
  return fetchSuperAdminApi<PlanDistribution>("/api/super-admin/commercial/plans");
}

export function fetchCommercialExpiring(days = 30) {
  return fetchSuperAdminApi<ExpiringSubscription[]>(`/api/super-admin/commercial/expiring?days=${days}`);
}

export function fetchSubscriptionsOverview() {
  return fetchSuperAdminApi<SubscriptionOverviewData>("/api/super-admin/subscriptions/overview");
}

export function fetchSubscriptionsExpiring(days = 30) {
  return fetchSuperAdminApi<ExpiringSubscription[]>(`/api/super-admin/subscriptions/expiring?days=${days}`);
}

export function fetchQuotasOverview() {
  return fetchSuperAdminApi<QuotasOverviewData>("/api/super-admin/quotas/overview");
}

export function checkQuota(input: QuotaCheckInput) {
  return fetchSuperAdminApi<QuotaCheckResult>("/api/super-admin/quotas/check", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function fetchUsageOverview() {
  return fetchSuperAdminApi<SystemUsageOverview>("/api/super-admin/usage/overview");
}

export function fetchTenantUsage() {
  return fetchSuperAdminApi<CommercialTenantSummary[]>("/api/super-admin/usage/tenants");
}
