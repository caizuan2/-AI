"use client";

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RuntimeV2SilenceRisk } from "@/lib/knowledge-runtime/runtime-v2-sales-loop-types";

const RISK_LABEL: Record<RuntimeV2SilenceRisk["silenceRisk"], string> = {
  low: "低",
  medium: "中",
  high: "高",
};

const RISK_TYPE_LABEL: Record<RuntimeV2SilenceRisk["riskType"], string> = {
  information_gap: "信息缺口",
  trust_gap: "信任缺口",
  price_pressure: "价格压力",
  effect_doubt: "效果怀疑",
  decision_fatigue: "决策疲劳",
  low_interest: "兴趣偏低",
  unknown: "待确认",
};

export function SilenceRiskCard({
  risk,
  className,
}: {
  risk?: RuntimeV2SilenceRisk | null;
  className?: string;
}) {
  if (!risk) {
    return null;
  }

  return (
    <div className={cn("rounded-2xl bg-white/80 px-3 py-3 text-sm text-emerald-950 ring-1 ring-emerald-100", className)}>
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-emerald-800">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        沉默风险
      </div>
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900 ring-1 ring-emerald-100">
          {RISK_LABEL[risk.silenceRisk]}
        </span>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-100">
          {RISK_TYPE_LABEL[risk.riskType]}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-600">{risk.recoveryStrategy}</p>
    </div>
  );
}
