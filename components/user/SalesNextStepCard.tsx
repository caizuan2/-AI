"use client";

import { ArrowRight, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface SalesNextStepCardProps {
  salesIntent?: string | null;
  customerStage?: string | null;
  salesStrategy?: string | null;
  nextAction?: string | null;
  complianceWarnings?: string[] | null;
  className?: string;
}

const INTENT_LABELS: Record<string, string> = {
  considering: "客户正在考虑",
  price_objection: "价格顾虑",
  effect_doubt: "效果疑虑",
  trust_building: "建立信任",
  cycle_choice: "周期选择",
  usage_question: "使用咨询",
  weight_fluctuation: "控体反馈",
  followup: "继续跟进",
  wechat_short: "短话术",
  general: "业务沟通",
};

const STRATEGY_LABELS: Record<string, string> = {
  educate: "先教育，再判断",
  lower_pressure: "先降压，再追问",
  clarify_decision: "先给决策标准",
  build_trust: "先建立信任",
  guide_next_step: "推动下一步",
  risk_boundary: "保留合规边界",
};

const STAGE_LABELS: Record<string, string> = {
  cold: "初次了解",
  curious: "正在了解",
  interested: "已有兴趣",
  hesitating: "正在犹豫",
  price_sensitive: "价格顾虑",
  effect_doubt: "效果疑虑",
  ready_to_decide: "接近决策",
  after_start: "已开始使用",
  inactive: "低响应跟进",
};

function labelOf(value: string | null | undefined, labels: Record<string, string>) {
  if (!value) return "";
  return labels[value] ?? value;
}

export function SalesNextStepCard({
  salesIntent,
  customerStage,
  salesStrategy,
  nextAction,
  complianceWarnings,
  className,
}: SalesNextStepCardProps) {
  const intentLabel = labelOf(salesIntent, INTENT_LABELS);
  const strategyLabel = labelOf(salesStrategy, STRATEGY_LABELS);
  const stageLabel = labelOf(customerStage, STAGE_LABELS);
  const warnings = (complianceWarnings ?? []).filter(Boolean);

  if (!intentLabel && !strategyLabel && !nextAction && warnings.length === 0) {
    return null;
  }

  return (
    <section className={cn("rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-950", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {intentLabel ? (
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-100">
            {intentLabel}
          </span>
        ) : null}
        {strategyLabel ? (
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-100">
            {strategyLabel}
          </span>
        ) : null}
        {stageLabel ? (
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-100">
            {stageLabel}
          </span>
        ) : null}
      </div>
      {nextAction ? (
        <p className="mt-3 flex items-start gap-2 leading-6">
          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
          <span>{nextAction}</span>
        </p>
      ) : null}
      {warnings.length > 0 ? (
        <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-emerald-700">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{warnings[0]}</span>
        </p>
      ) : null}
    </section>
  );
}
