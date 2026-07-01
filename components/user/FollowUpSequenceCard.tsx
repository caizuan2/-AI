"use client";

import { ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";

interface FollowUpStep {
  step: number;
  timing: string;
  goal: string;
  message: string;
  stopIf: string;
}

export function FollowUpSequenceCard({
  sequence,
  className,
}: {
  sequence?: FollowUpStep[] | null;
  className?: string;
}) {
  const steps = (sequence ?? []).slice(0, 3);

  if (steps.length === 0) {
    return null;
  }

  return (
    <details className={cn("rounded-2xl bg-white/80 px-3 py-3 text-sm text-slate-700 ring-1 ring-emerald-100", className)}>
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-emerald-800">
        <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
        跟进节奏
      </summary>
      <div className="mt-3 space-y-2">
        {steps.map((step) => (
          <div key={step.step} className="rounded-xl bg-emerald-50/60 px-3 py-2">
            <p className="text-xs font-semibold text-emerald-900">
              {step.step}. {step.timing} · {step.goal}
            </p>
            <p className="mt-1 leading-6">{step.message}</p>
            <p className="mt-1 text-xs text-slate-500">停止条件：{step.stopIf}</p>
          </div>
        ))}
      </div>
    </details>
  );
}
