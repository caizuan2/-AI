"use client";

import { BadgePercent } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RuntimeV5ROISignals } from "@/lib/knowledge-runtime/runtime-v5-strategy-types";

export function ROISignalCard({
  roiSignals,
  className,
}: {
  roiSignals?: RuntimeV5ROISignals | null;
  className?: string;
}) {
  if (!roiSignals) return null;

  return (
    <div className={cn("rounded-2xl bg-white/85 px-3 py-3 text-xs leading-5 text-emerald-950 ring-1 ring-emerald-100", className)}>
      <div className="mb-2 inline-flex items-center gap-1.5 font-semibold">
        <BadgePercent className="h-3.5 w-3.5" aria-hidden="true" />
        ROI信号
      </div>
      <p><span className="font-semibold">得分：</span>{Math.round(roiSignals.score * 100)}%</p>
      {roiSignals.highROI.length > 0 ? (
        <p className="mt-1 text-emerald-700">高回报：{roiSignals.highROI.slice(0, 2).join("、")}</p>
      ) : null}
      {roiSignals.lowROI.length > 0 ? (
        <p className="mt-1 text-amber-700">低回报：{roiSignals.lowROI.slice(0, 2).join("、")}</p>
      ) : null}
      <p className="mt-1 text-slate-600">{roiSignals.reason}</p>
    </div>
  );
}
