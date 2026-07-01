"use client";

import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RuntimeV4OptimizedRecommendation } from "@/lib/knowledge-runtime/runtime-v4-growth-types";

export function StrategyOptimizerCard({
  recommendation,
  className,
}: {
  recommendation?: RuntimeV4OptimizedRecommendation | null;
  className?: string;
}) {
  if (!recommendation) return null;

  return (
    <div className={cn("rounded-2xl bg-white/85 px-3 py-3 text-xs leading-5 text-emerald-950 ring-1 ring-emerald-100", className)}>
      <div className="mb-2 inline-flex items-center gap-1.5 font-semibold">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        策略自动优化
      </div>
      <p><span className="font-semibold">推荐风格：</span>{recommendation.recommendedTone}</p>
      <p className="mt-1"><span className="font-semibold">下一轮动作：</span>{recommendation.recommendedAction}</p>
      <p className="mt-1 text-slate-600">{recommendation.reason}</p>
      {recommendation.avoidStrategy ? (
        <p className="mt-1 text-amber-700">避免：{recommendation.avoidStrategy}</p>
      ) : null}
    </div>
  );
}
