"use client";

import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RuntimeV5StrategyCandidate } from "@/lib/knowledge-runtime/runtime-v5-strategy-types";

const STATUS_LABEL: Record<RuntimeV5StrategyCandidate["status"], string> = {
  candidate: "候选",
  testing: "测试中",
  promoted: "提升",
  reduced: "降权",
  retired: "淘汰",
};

export function StrategyCandidatePoolCard({
  candidates,
  className,
}: {
  candidates?: RuntimeV5StrategyCandidate[] | null;
  className?: string;
}) {
  const visible = (candidates ?? []).slice(0, 4);

  if (visible.length === 0) return null;

  return (
    <div className={cn("rounded-2xl bg-white/85 px-3 py-3 text-xs leading-5 text-emerald-950 ring-1 ring-emerald-100", className)}>
      <div className="mb-2 inline-flex items-center gap-1.5 font-semibold">
        <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
        策略候选池
      </div>
      <div className="space-y-2">
        {visible.map((strategy) => (
          <div key={strategy.id} className="rounded-xl bg-emerald-50/70 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-emerald-950">{strategy.label}</p>
              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-emerald-700 ring-1 ring-emerald-100">
                {STATUS_LABEL[strategy.status]}
              </span>
            </div>
            <p className="mt-1 text-slate-600">{strategy.messagePattern}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
