"use client";

import { useEffect, useState } from "react";
import { EmptyState, ErrorState, LoadingState, UnauthorizedState } from "@/components/super-admin/common/ApiState";
import { SubscriptionTable } from "@/components/super-admin/subscriptions/SubscriptionTable";
import {
  fetchSubscriptionsExpiring,
  fetchSubscriptionsOverview,
  type SubscriptionOverviewData,
  type SuperAdminClientResult
} from "@/lib/super-admin/commercial-client";
import type { ExpiringSubscription } from "@/types/subscription";

type SubscriptionState = {
  overview: SubscriptionOverviewData;
  expiring: ExpiringSubscription[];
};

export function SubscriptionsDashboard() {
  const [result, setResult] = useState<SuperAdminClientResult<SubscriptionState> | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const [overview, expiring] = await Promise.all([
        fetchSubscriptionsOverview(),
        fetchSubscriptionsExpiring()
      ]);
      const firstError = [overview, expiring].find((item) => !item.ok);

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

      if (!overview.data || !expiring.data) {
        setResult({
          ok: false,
          error: "订阅数据为空"
        });
        return;
      }

      setResult({
        ok: true,
        data: {
          overview: overview.data,
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
    return <LoadingState title="正在加载订阅与套餐数据" />;
  }

  if (result.unauthorized) {
    return <UnauthorizedState />;
  }

  if (!result.ok) {
    return <ErrorState message={result.error} />;
  }

  if (!result.data || result.data.overview.items.length === 0) {
    return <EmptyState message="暂无企业订阅数据。" />;
  }

  const { overview, expiring } = result.data;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["总订阅", overview.total],
          ["active", overview.active],
          ["expired", overview.expired],
          ["30天内到期", expiring.length]
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{Number(value).toLocaleString("zh-CN")}</p>
          </div>
        ))}
      </section>

      <SubscriptionTable items={overview.items} />
    </div>
  );
}
