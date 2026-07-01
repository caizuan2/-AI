"use client";

import { WandSparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RuntimeV5AutonomousRecommendation } from "@/lib/knowledge-runtime/runtime-v5-strategy-types";

export function AutonomousRecommendationCard({
  recommendation,
  className,
}: {
  recommendation?: RuntimeV5AutonomousRecommendation | null;
  className?: string;
}) {
  if (!recommendation) return null;

  return (
    <div className={cn("rounded-2xl bg-white/85 px-3 py-3 text-xs leading-5 text-emerald-950 ring-1 ring-emerald-100", className)}>
      <div className="mb-2 inline-flex items-center gap-1.5 font-semibold">
        <WandSparkles className="h-3.5 w-3.5" aria-hidden="true" />
        自主策略推荐
      </div>
      <p>{recommendation.recommendation}</p>
      <p className="mt-1 text-slate-600">{recommendation.reason}</p>
      {recommendation.caution ? <p className="mt-1 text-amber-700">{recommendation.caution}</p> : null}
    </div>
  );
}
