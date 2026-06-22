"use client";

import { useEffect, useState } from "react";
import { EmptyState, ErrorState, LoadingState, UnauthorizedState } from "@/components/super-admin/common/ApiState";
import { TenantUsageRanking } from "@/components/super-admin/usage/TenantUsageRanking";
import { UsageOverviewCards } from "@/components/super-admin/usage/UsageOverviewCards";
import {
  fetchTenantUsage,
  fetchUsageOverview,
  type SuperAdminClientResult
} from "@/lib/super-admin/commercial-client";
import type { CommercialTenantSummary, SystemUsageOverview } from "@/types/commercial";

type UsageState = {
  overview: SystemUsageOverview;
  tenants: CommercialTenantSummary[];
};

export function UsageDashboard() {
  const [result, setResult] = useState<SuperAdminClientResult<UsageState> | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const [overview, tenants] = await Promise.all([
        fetchUsageOverview(),
        fetchTenantUsage()
      ]);
      const firstError = [overview, tenants].find((item) => !item.ok);

      if (!mounted) {
        return;
      }

      if (firstError) {
        setResult({
          ok: false,
          unauthorized: firstError.unauthorized,
          error: firstError.error
        });
        return;
      }

      if (!overview.data || !tenants.data) {
        setResult({
          ok: false,
          error: "使用量数据为空"
        });
        return;
      }

      setResult({
        ok: true,
        data: {
          overview: overview.data,
          tenants: tenants.data
        }
      });
    }

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  if (!result) {
    return <LoadingState title="正在加载使用量统计" />;
  }

  if (result.unauthorized) {
    return <UnauthorizedState />;
  }

  if (!result.ok) {
    return <ErrorState message={result.error} />;
  }

  if (!result.data || result.data.tenants.length === 0) {
    return <EmptyState message="暂无使用量数据。" />;
  }

  return (
    <div className="space-y-6">
      <UsageOverviewCards overview={result.data.overview} />
      <TenantUsageRanking items={result.data.tenants} />
    </div>
  );
}
