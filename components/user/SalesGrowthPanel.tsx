"use client";

import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  RuntimeV2DealSignal,
  RuntimeV2ABScripts,
  RuntimeV2DealProbability,
  RuntimeV2FollowupTiming,
  RuntimeV2MultiTurnSalesPath,
  RuntimeV2SalesLoopV2,
  RuntimeV2SilenceRisk,
  RuntimeV2StopPushPolicy,
} from "@/lib/knowledge-runtime/runtime-v2-sales-loop-types";
import type { RuntimeV3GrowthOutput } from "@/lib/knowledge-runtime/runtime-v3-sales-learning-types";
import type { RuntimeV4GrowthFlywheelOutput } from "@/lib/knowledge-runtime/runtime-v4-growth-types";
import type { RuntimeV5EvolutionOutput } from "@/lib/knowledge-runtime/runtime-v5-strategy-types";
import { ABScriptCard } from "./ABScriptCard";
import { CustomerStageBadge } from "./CustomerStageBadge";
import { DealProbabilityCard } from "./DealProbabilityCard";
import { DealSignalPanel } from "./DealSignalPanel";
import { FollowUpSequenceCard } from "./FollowUpSequenceCard";
import { GrowthFlywheelPanel } from "./GrowthFlywheelPanel";
import { MultiTurnSalesPathCard } from "./MultiTurnSalesPathCard";
import { NextQuestionCard } from "./NextQuestionCard";
import { SalesLearningPanel } from "./SalesLearningPanel";
import { SilenceRiskCard } from "./SilenceRiskCard";
import { StrategyEvolutionPanel } from "./StrategyEvolutionPanel";

interface SalesGrowthPanelProps {
  customerStage?: string | null;
  stageReason?: string | null;
  dealSignals?: RuntimeV2DealSignal[] | null;
  nextQuestion?: string | null;
  followupSequence?: Array<{ step: number; timing: string; goal: string; message: string; stopIf: string }> | null;
  stopRules?: string[] | null;
  salesLoopV2?: RuntimeV2SalesLoopV2 | null;
  dealProbability?: RuntimeV2DealProbability | null;
  silenceRisk?: RuntimeV2SilenceRisk | null;
  abScripts?: RuntimeV2ABScripts | null;
  multiTurnPath?: RuntimeV2MultiTurnSalesPath | null;
  followupTiming?: RuntimeV2FollowupTiming | null;
  stopPush?: RuntimeV2StopPushPolicy | null;
  recommendedAction?: string | null;
  salesLearningV3?: RuntimeV3GrowthOutput | null;
  salesGrowthV4?: RuntimeV4GrowthFlywheelOutput | null;
  salesEvolutionV5?: RuntimeV5EvolutionOutput | null;
  className?: string;
}

export function SalesGrowthPanel({
  customerStage,
  stageReason,
  dealSignals,
  nextQuestion,
  followupSequence,
  stopRules,
  salesLoopV2,
  dealProbability,
  silenceRisk,
  abScripts,
  multiTurnPath,
  followupTiming,
  stopPush,
  recommendedAction,
  salesLearningV3,
  salesGrowthV4,
  salesEvolutionV5,
  className,
}: SalesGrowthPanelProps) {
  const probability = dealProbability ?? salesLoopV2?.dealProbability ?? null;
  const risk = silenceRisk ?? salesLoopV2?.silenceRisk ?? null;
  const scripts = abScripts ?? salesLoopV2?.abScripts ?? null;
  const path = multiTurnPath ?? salesLoopV2?.multiTurnPath ?? null;
  const timing = followupTiming ?? salesLoopV2?.followupTiming ?? null;
  const stopPolicy = stopPush ?? salesLoopV2?.stopPush ?? null;
  const action = recommendedAction ?? salesLoopV2?.recommendedAction ?? null;
  const hasContent = Boolean(
    customerStage ||
    nextQuestion ||
    (dealSignals?.length ?? 0) > 0 ||
    (followupSequence?.length ?? 0) > 0 ||
    probability ||
    risk ||
    scripts ||
    path ||
    timing ||
    stopPolicy ||
    action ||
    salesLearningV3 ||
    salesGrowthV4 ||
    salesEvolutionV5,
  );

  if (!hasContent) {
    return null;
  }

  return (
    <section className={cn("rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-950", className)}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
          <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
          成交闭环
        </span>
        <CustomerStageBadge stage={customerStage} />
      </div>
      {stageReason ? <p className="mb-3 text-xs leading-5 text-emerald-800">{stageReason}</p> : null}
      <SalesLearningPanel output={salesLearningV3} className="mb-3" />
      <GrowthFlywheelPanel
        output={salesGrowthV4}
        salesLearningV3={salesLearningV3}
        abScripts={scripts}
        dealSignals={dealSignals}
        multiTurnPath={path}
        className="mb-3"
      />
      <StrategyEvolutionPanel
        output={salesEvolutionV5}
        salesLearningV3={salesLearningV3}
        salesGrowthV4={salesGrowthV4}
        dealSignals={dealSignals}
        silenceRisk={risk}
        className="mb-3"
      />
      <div className="grid gap-3 lg:grid-cols-2">
        <DealProbabilityCard probability={probability} />
        <SilenceRiskCard risk={risk} />
        <DealSignalPanel signals={dealSignals} />
        <NextQuestionCard question={nextQuestion} />
      </div>
      <ABScriptCard scripts={scripts} scope={salesLearningV3?.isolationScope} className="mt-3" />
      <MultiTurnSalesPathCard path={path} className="mt-3" />
      {action || timing?.waitRecommendation || stopPolicy?.respectfulCloseMessage ? (
        <div className="mt-3 rounded-2xl bg-white/80 px-3 py-3 text-xs leading-5 text-emerald-900 ring-1 ring-emerald-100">
          {action ? <p><span className="font-semibold">下一轮最佳动作：</span>{action}</p> : null}
          {timing?.waitRecommendation ? <p className="mt-1"><span className="font-semibold">跟进节奏：</span>{timing.waitRecommendation}</p> : null}
          {stopPolicy?.shouldStop ? (
            <p className="mt-1"><span className="font-semibold">收口提醒：</span>{stopPolicy.respectfulCloseMessage}</p>
          ) : null}
        </div>
      ) : null}
      <FollowUpSequenceCard sequence={followupSequence} className="mt-3" />
      {(stopRules?.length ?? 0) > 0 ? (
        <p className="mt-3 text-xs leading-5 text-emerald-700">
          边界：{stopRules?.[0]}
        </p>
      ) : null}
    </section>
  );
}
