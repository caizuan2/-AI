"use client";

import { Gauge } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RuntimeV3ConversionScore } from "@/lib/knowledge-runtime/runtime-v3-sales-learning-types";

const LEVEL_LABEL: Record<RuntimeV3ConversionScore["level"], string> = {
  low: "低",
  medium: "中",
  high: "高",
};

export function ConversionScoreCard({
  score,
  className,
}: {
  score?: RuntimeV3ConversionScore | null;
  className?: string;
}) {
  if (!score) return null;

  const percent = Math.round(score.score * 100);

  return (
    <div className={cn("rounded-2xl bg-white/85 px-3 py-3 text-xs text-emerald-900 ring-1 ring-emerald-100", className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
          成交概率
        </span>
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">
          {LEVEL_LABEL[score.level]} · {percent}%
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-emerald-100">
        <div className="h-full rounded-full bg-emerald-600" style={{ width: `${percent}%` }} />
      </div>
      {(score.opportunityFactors?.length ?? 0) > 0 ? (
        <p className="mt-2 leading-5 text-emerald-800">{score.opportunityFactors[0]}</p>
      ) : null}
      {(score.riskFactors?.length ?? 0) > 0 ? (
        <p className="mt-1 leading-5 text-amber-700">风险：{score.riskFactors[0]}</p>
      ) : null}
    </div>
  );
}
