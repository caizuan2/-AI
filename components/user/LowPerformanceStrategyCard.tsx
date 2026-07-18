"use client";

import { ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RuntimeV5StrategyCandidate } from "@/lib/knowledge-runtime/runtime-v5-strategy-types";

export function LowPerformanceStrategyCard({
  reduced,
  retired,
  className,
}: {
  reduced?: RuntimeV5StrategyCandidate[] | null;
  retired?: RuntimeV5StrategyCandidate[] | null;
  className?: string;
}) {
  const reducedList = reduced ?? [];
  const retiredList = retired ?? [];

  if (reducedList.length === 0 && retiredList.length === 0) return null;

  return (
    <div className={cn("rounded-2xl bg-white/85 px-3 py-3 text-xs leading-5 text-emerald-950 ring-1 ring-emerald-100", className)}>
      <div className="mb-2 inline-flex items-center gap-1.5 font-semibold">
        <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
        低效话术处理
      </div>
      {reducedList.length > 0 ? (
        <p><span className="font-semibold">降权：</span>{reducedList.map((item) => item.label).join("、")}</p>
      ) : null}
      {retiredList.length > 0 ? (
        <p className="mt-1 text-amber-700"><span className="font-semibold">淘汰：</span>{retiredList.map((item) => item.label).join("、")}</p>
      ) : null}
    </div>
  );
}
