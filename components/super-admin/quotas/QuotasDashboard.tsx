"use client";

import { useEffect, useState } from "react";
import { ErrorState, LoadingState, UnauthorizedState } from "@/components/super-admin/common/ApiState";
import { QuotaPolicyCards } from "@/components/super-admin/quotas/QuotaPolicyCards";
import { QuotaUsageTable } from "@/components/super-admin/quotas/QuotaUsageTable";
import { fetchQuotasOverview, type QuotasOverviewData, type SuperAdminClientResult } from "@/lib/super-admin/commercial-client";

export function QuotasDashboard() {
  const [result, setResult] = useState<SuperAdminClientResult<QuotasOverviewData> | null>(null);

  useEffect(() => {
    let mounted = true;

    fetchQuotasOverview().then((nextResult) => {
      if (mounted) {
        setResult(nextResult);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  if (!result) {
    return <LoadingState title="正在加载 Quota 限额数据" />;
  }

  if (result.unauthorized) {
    return <UnauthorizedState />;
  }

  if (!result.ok || !result.data) {
    return <ErrorState message={result.error} />;
  }

  return (
    <div className="space-y-6">
      <QuotaPolicyCards policies={result.data.policies} />

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Quota 告警租户</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{result.data.warnings.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Pro 套餐企业</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{result.data.planDistribution.pro}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Enterprise 套餐企业</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{result.data.planDistribution.enterprise}</p>
        </div>
      </section>

      <QuotaUsageTable items={result.data.tenants} />
    </div>
  );
}
