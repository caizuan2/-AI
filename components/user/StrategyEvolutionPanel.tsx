"use client";

import * as React from "react";
import { Network } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildRuntimeV5EvolutionOutput } from "@/lib/knowledge-runtime/runtime-v5-output";
import { RUNTIME_V4_FEEDBACK_UPDATED_EVENT } from "@/lib/knowledge-runtime/runtime-v4-feedback-event-store";
import type { RuntimeV2DealSignal, RuntimeV2SilenceRisk } from "@/lib/knowledge-runtime/runtime-v2-sales-loop-types";
import type { RuntimeV3GrowthOutput } from "@/lib/knowledge-runtime/runtime-v3-sales-learning-types";
import type { RuntimeV4GrowthFlywheelOutput } from "@/lib/knowledge-runtime/runtime-v4-growth-types";
import type { RuntimeV5EvolutionOutput } from "@/lib/knowledge-runtime/runtime-v5-strategy-types";
import { AutonomousRecommendationCard } from "./AutonomousRecommendationCard";
import { ConversionTrendCard } from "./ConversionTrendCard";
import { EvolvedPathCard } from "./EvolvedPathCard";
import { LowPerformanceStrategyCard } from "./LowPerformanceStrategyCard";
import { ROISignalCard } from "./ROISignalCard";
import { StrategyCandidatePoolCard } from "./StrategyCandidatePoolCard";

export function StrategyEvolutionPanel({
  output,
  salesLearningV3,
  salesGrowthV4,
  dealSignals,
  silenceRisk,
  className,
}: {
  output?: RuntimeV5EvolutionOutput | null;
  salesLearningV3?: RuntimeV3GrowthOutput | null;
  salesGrowthV4?: RuntimeV4GrowthFlywheelOutput | null;
  dealSignals?: RuntimeV2DealSignal[] | null;
  silenceRisk?: RuntimeV2SilenceRisk | null;
  className?: string;
}) {
  const computeOutput = React.useCallback(() => (
    output ?? buildRuntimeV5EvolutionOutput({
      scope: salesLearningV3?.isolationScope,
      salesLearningV3,
      salesGrowthV4,
      dealSignals,
      silenceRisk,
      currentConversionScore: salesLearningV3?.conversionScore,
    })
  ), [dealSignals, output, salesGrowthV4, salesLearningV3, silenceRisk]);
  const [current, setCurrent] = React.useState<RuntimeV5EvolutionOutput>(() => computeOutput());

  React.useEffect(() => {
    setCurrent(computeOutput());
  }, [computeOutput]);

  React.useEffect(() => {
    if (!salesLearningV3?.isolationScope) return;

    const refresh = () => setCurrent(buildRuntimeV5EvolutionOutput({
      scope: salesLearningV3.isolationScope,
      salesLearningV3,
      salesGrowthV4,
      dealSignals,
      silenceRisk,
      currentConversionScore: salesLearningV3.conversionScore,
    }));

    window.addEventListener(RUNTIME_V4_FEEDBACK_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(RUNTIME_V4_FEEDBACK_UPDATED_EVENT, refresh);
  }, [dealSignals, salesGrowthV4, salesLearningV3, silenceRisk]);

  if (!current.enabled) return null;

  return (
    <details className={cn("rounded-2xl border border-emerald-200 bg-white/70 px-3 py-3 text-emerald-950", className)}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold text-emerald-900">
        <span className="inline-flex items-center gap-2">
          <Network className="h-3.5 w-3.5" aria-hidden="true" />
          AI销售策略自主进化系统 v5
        </span>
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-800 ring-1 ring-emerald-100">
          策略候选池
        </span>
      </summary>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <AutonomousRecommendationCard recommendation={current.autonomousRecommendation} />
        <ROISignalCard roiSignals={current.roiSignals} />
        <ConversionTrendCard trend={current.conversionTrend} />
        <EvolvedPathCard path={current.evolvedPath} />
        <StrategyCandidatePoolCard candidates={current.strategyCandidates} />
        <LowPerformanceStrategyCard reduced={current.reducedStrategies} retired={current.retiredStrategies} />
      </div>
      {current.warnings.length > 0 ? (
        <p className="mt-3 text-xs leading-5 text-amber-700">{current.warnings[0]}</p>
      ) : null}
    </details>
  );
}
