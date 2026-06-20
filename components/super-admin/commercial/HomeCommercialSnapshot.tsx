"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { ErrorState, LoadingState, UnauthorizedState } from "@/components/super-admin/common/ApiState";
import { fetchCommercialOverview, type SuperAdminClientResult } from "@/lib/super-admin/commercial-client";
import type { CommercialOverview } from "@/types/commercial";

function formatNumber(value: number) {
  return value.toLocaleString("zh-CN");
}

export function HomeCommercialSnapshot() {
  const [result, setResult] = useState<SuperAdminClientResult<CommercialOverview> | null>(null);

  useEffect(() => {
    let mounted = true;

    fetchCommercialOverview().then((nextResult) => {
      if (mounted) {
        setResult(nextResult);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  if (!result) {
    return <LoadingState title="正在加载商业化运营概览" />;
  }

  if (result.unauthorized) {
    return <UnauthorizedState />;
  }

  if (!result.ok || !result.data) {
    return <ErrorState message={result.error} />;
  }

  const overview = result.data;
  const metrics = [
    ["当前企业数", formatNumber(overview.totals.tenants)],
    ["Pro / Enterprise", `${overview.planDistribution.pro} / ${overview.planDistribution.enterprise}`],
    ["7天内到期", formatNumber(overview.expiring.within7Days)],
    ["今日 AI 调用", formatNumber(overview.totals.dailyAiRequests)],
    ["本月 Token", formatNumber(overview.totals.tokenUsage)],
    ["Quota 告警", formatNumber(overview.totals.quotaWarnings)],
    ["卡密激活数", formatNumber(overview.licenses.activated)]
  ];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-sm font-semibold text-teal-700">Commercial Operations</p>
          <h2 className="mt-2 text-xl font-semibold tracking-normal text-slate-950">商业化运营概览</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            基于卡密 license provider 的套餐、订阅、Quota 与用量聚合，只读展示，不接真实支付。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            ["/super-admin/commercial", "商业化概览"],
            ["/super-admin/subscriptions", "订阅与套餐"],
            ["/super-admin/quotas", "Quota 限额"],
            ["/super-admin/usage", "使用量统计"]
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50"
            >
              {label}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
        {metrics.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="truncate text-xs text-slate-500">{label}</p>
            <p className="mt-2 text-xl font-semibold tracking-normal text-slate-950">{value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
