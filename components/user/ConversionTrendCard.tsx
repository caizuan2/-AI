"use client";

import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RuntimeV5ConversionTrend } from "@/lib/knowledge-runtime/runtime-v5-strategy-types";

const TREND_LABEL: Record<RuntimeV5ConversionTrend["trend"], string> = {
  up: "上升",
  flat: "平稳",
  down: "下降",
  unknown: "待观察",
};

export function ConversionTrendCard({
  trend,
  className,
}: {
  trend?: RuntimeV5ConversionTrend | null;
  className?: string;
}) {
  if (!trend) return null;

  return (
    <div className={cn("rounded-2xl bg-white/85 px-3 py-3 text-xs leading-5 text-emerald-950 ring-1 ring-emerald-100", className)}>
      <div className="mb-2 inline-flex items-center gap-1.5 font-semibold">
        <Activity className="h-3.5 w-3.5" aria-hidden="true" />
        成交趋势
      </div>
      <p><span className="font-semibold">趋势：</span>{TREND_LABEL[trend.trend]} · {Math.round(trend.confidence * 100)}%</p>
      <p className="mt-1 text-slate-600">{trend.reason}</p>
    </div>
  );
}
