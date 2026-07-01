"use client";

import { Gauge } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RuntimeV2DealProbability } from "@/lib/knowledge-runtime/runtime-v2-sales-loop-types";

const PROBABILITY_LABEL: Record<RuntimeV2DealProbability["probability"], string> = {
  low: "低",
  medium: "中",
  high: "高",
};

export function DealProbabilityCard({
  probability,
  className,
}: {
  probability?: RuntimeV2DealProbability | null;
  className?: string;
}) {
  if (!probability) {
    return null;
  }

  const score = Math.round(probability.score * 100);

  return (
    <div className={cn("rounded-2xl bg-white/80 px-3 py-3 text-sm text-emerald-950 ring-1 ring-emerald-100", className)}>
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-emerald-800">
        <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
        成交概率
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900 ring-1 ring-emerald-100">
          {PROBABILITY_LABEL[probability.probability]} · {score}分
        </span>
        <span className="text-xs text-emerald-700">{probability.recommendedFocus}</span>
      </div>
      {probability.reasons.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-600">
          {probability.reasons.slice(0, 2).map((reason) => (
            <li key={reason}>· {reason}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
