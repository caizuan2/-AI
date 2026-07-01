"use client";

import { ArrowRightCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RuntimeV3NextBestAction } from "@/lib/knowledge-runtime/runtime-v3-sales-learning-types";

export function NextBestActionCard({
  action,
  className,
}: {
  action?: RuntimeV3NextBestAction | null;
  className?: string;
}) {
  if (!action) return null;

  return (
    <div className={cn("rounded-2xl bg-white/85 px-3 py-3 text-xs leading-5 text-emerald-900 ring-1 ring-emerald-100", className)}>
      <div className="mb-1.5 flex items-center gap-2 font-semibold">
        <ArrowRightCircle className="h-3.5 w-3.5" aria-hidden="true" />
        下一步最优动作
      </div>
      <p>{action.message}</p>
      {action.question ? <p className="mt-1 text-emerald-800">追问：{action.question}</p> : null}
      {action.timing ? <p className="mt-1 text-emerald-700">节奏：{action.timing}</p> : null}
      {action.stopIf ? <p className="mt-1 text-amber-700">停止条件：{action.stopIf}</p> : null}
    </div>
  );
}
