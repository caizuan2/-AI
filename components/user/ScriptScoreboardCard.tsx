"use client";

import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RuntimeV4ScriptScore } from "@/lib/knowledge-runtime/runtime-v4-growth-types";

const RECOMMENDATION_LABEL: Record<RuntimeV4ScriptScore["recommendation"], string> = {
  promote: "提升使用",
  keep_testing: "继续测试",
  reduce: "降低权重",
  avoid: "暂停使用",
};

export function ScriptScoreboardCard({
  scores,
  className,
}: {
  scores?: RuntimeV4ScriptScore[] | null;
  className?: string;
}) {
  if (!scores || scores.length === 0) return null;

  return (
    <div className={cn("rounded-2xl bg-white/85 px-3 py-3 text-xs text-emerald-950 ring-1 ring-emerald-100", className)}>
      <div className="mb-2 inline-flex items-center gap-1.5 font-semibold">
        <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
        话术表现排行
      </div>
      <div className="space-y-2">
        {scores.slice(0, 3).map((score) => (
          <div key={score.variantId} className="rounded-xl bg-emerald-50/70 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">
                #{score.rank} {score.label || score.variantId}
              </span>
              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
                {RECOMMENDATION_LABEL[score.recommendation]}
              </span>
            </div>
            <p className="mt-1 text-emerald-800">分数 {score.score} · 复制 {score.copyCount} · 继续 {score.continueCount}</p>
            <p className="mt-1 leading-5 text-slate-600">{score.reason}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
