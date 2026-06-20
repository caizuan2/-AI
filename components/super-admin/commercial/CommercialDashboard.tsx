"use client";

import { useEffect, useState } from "react";
import { CommercialExpiringList } from "@/components/super-admin/commercial/CommercialExpiringList";
import { CommercialOverviewCards } from "@/components/super-admin/commercial/CommercialOverviewCards";
import { CommercialPlanDistribution } from "@/components/super-admin/commercial/CommercialPlanDistribution";
import { EmptyState, ErrorState, LoadingState, UnauthorizedState } from "@/components/super-admin/common/ApiState";
import {
  fetchCommercialExpiring,
  fetchCommercialOverview,
  fetchCommercialPlans,
  type SuperAdminClientResult
} from "@/lib/super-admin/commercial-client";
import type { CommercialOverview, PlanDistribution } from "@/types/commercial";
import type { ExpiringSubscription } from "@/types/subscription";

type CommercialState = {
  overview: CommercialOverview;
  plans: PlanDistribution;
  expiring: ExpiringSubscription[];
};

export function CommercialDashboard() {
  const [result, setResult] = useState<SuperAdminClientResult<CommercialState> | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const [overview, plans, expiring] = await Promise.all([
        fetchCommercialOverview(),
        fetchCommercialPlans(),
        fetchCommercialExpiring()
      ]);
      const firstError = [overview, plans, expiring].find((item) => !item.ok);

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

      if (!overview.data || !plans.data || !expiring.data) {
        setResult({
          ok: false,
          error: "商业化概览数据为空"
        });
        return;
      }

      setResult({
        ok: true,
        data: {
          overview: overview.data,
          plans: plans.data,
          expiring: expiring.data
        }
      });
    }

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  if (!result) {
    return <LoadingState />;
  }

  if (result.unauthorized) {
    return <UnauthorizedState />;
  }

  if (!result.ok) {
    return <ErrorState message={result.error} />;
  }

  if (!result.data) {
    return <EmptyState message="商业化概览 API 暂无数据。" />;
  }

  return (
    <div className="space-y-6">
      <CommercialOverviewCards overview={result.data.overview} />

      <section className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <CommercialPlanDistribution plans={result.data.plans} />
        <CommercialExpiringList items={result.data.expiring} />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-xl font-semibold tracking-normal text-slate-950">商业化运营风险</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Quota 告警、到期客户和卡密状态只做只读展示，不触发续费、扣费或卡密变更。
        </p>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs text-slate-500">30天内到期</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{result.data.overview.expiring.within30Days}</p>
          </div>
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
            <p className="text-xs text-rose-700">已过期</p>
            <p className="mt-2 text-2xl font-semibold text-rose-900">{result.data.overview.expiring.expired}</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs text-amber-700">Quota 告警</p>
            <p className="mt-2 text-2xl font-semibold text-amber-900">{result.data.overview.totals.quotaWarnings}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
