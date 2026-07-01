"use client";

import { useMemo } from "react";
import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getScriptPerformanceSummary } from "@/lib/knowledge-runtime/runtime-v3-script-performance-store";
import type { RuntimeV3GrowthOutput } from "@/lib/knowledge-runtime/runtime-v3-sales-learning-types";

export function ScriptPerformancePanel({
  scope,
  className,
}: {
  scope?: RuntimeV3GrowthOutput["isolationScope"] | null;
  className?: string;
}) {
  const summary = useMemo(() => {
    if (!scope) return null;
    return getScriptPerformanceSummary(scope);
  }, [scope]);

  if (!summary) return null;

  return (
    <div className={cn("rounded-2xl bg-white/85 px-3 py-3 text-xs leading-5 text-emerald-900 ring-1 ring-emerald-100", className)}>
      <div className="mb-1.5 flex items-center gap-2 font-semibold">
        <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
        话术学习表现
      </div>
      <p>{summary.summary}</p>
      {summary.preferredVariantId ? (
        <p className="mt-1 text-emerald-800">偏好话术：{summary.preferredVariantId}</p>
      ) : null}
      {summary.preferredTone ? (
        <p className="mt-1 text-emerald-800">偏好语气：{summary.preferredTone}</p>
      ) : null}
    </div>
  );
}
