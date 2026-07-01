"use client";

import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RuntimeV4MetricsSummary } from "@/lib/knowledge-runtime/runtime-v4-growth-types";

export function GrowthMetricsSummaryCard({
  metrics,
  className,
}: {
  metrics?: RuntimeV4MetricsSummary | null;
  className?: string;
}) {
  if (!metrics) return null;

  return (
    <div className={cn("rounded-2xl bg-white/85 px-3 py-3 text-xs leading-5 text-emerald-950 ring-1 ring-emerald-100", className)}>
      <div className="mb-2 inline-flex items-center gap-1.5 font-semibold">
        <Activity className="h-3.5 w-3.5" aria-hidden="true" />
        增长信号
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-emerald-50 px-2 py-2">
          <p className="font-semibold">{metrics.totalEvents}</p>
          <p className="text-[11px] text-slate-500">反馈</p>
        </div>
        <div className="rounded-xl bg-emerald-50 px-2 py-2">
          <p className="font-semibold">{metrics.copyRateSignal}</p>
          <p className="text-[11px] text-slate-500">复制</p>
        </div>
        <div className="rounded-xl bg-emerald-50 px-2 py-2">
          <p className="font-semibold">{metrics.positiveSignalRate}</p>
          <p className="text-[11px] text-slate-500">正向</p>
        </div>
      </div>
      <p className="mt-2 text-slate-600">{metrics.recommendation}</p>
    </div>
  );
}
