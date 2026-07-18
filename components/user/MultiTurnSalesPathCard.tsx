"use client";

import { Route } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RuntimeV2MultiTurnSalesPath } from "@/lib/knowledge-runtime/runtime-v2-sales-loop-types";

export function MultiTurnSalesPathCard({
  path,
  className,
}: {
  path?: RuntimeV2MultiTurnSalesPath | null;
  className?: string;
}) {
  const steps = (path?.path ?? []).slice(0, 4);

  if (!path || steps.length === 0) {
    return null;
  }

  return (
    <details className={cn("rounded-2xl bg-white/80 px-3 py-3 text-sm text-slate-700 ring-1 ring-emerald-100", className)}>
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-emerald-800">
        <Route className="h-3.5 w-3.5" aria-hidden="true" />
        多轮成交路径
      </summary>
      <p className="mt-2 text-xs leading-5 text-emerald-900">
        当前：{path.currentStep} · 下一步：{path.nextBestAction}
      </p>
      <div className="mt-3 space-y-2">
        {steps.map((step) => (
          <div key={step.step} className="rounded-xl bg-emerald-50/60 px-3 py-2">
            <p className="text-xs font-semibold text-emerald-900">{step.step}. {step.goal}</p>
            <p className="mt-1 text-xs leading-5">动作：{step.userAction}</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">接话：{step.nextReply}</p>
          </div>
        ))}
      </div>
    </details>
  );
}
