"use client";

import * as React from "react";
import { RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  RuntimeV2ABScripts,
  RuntimeV2DealSignal,
  RuntimeV2MultiTurnSalesPath,
} from "@/lib/knowledge-runtime/runtime-v2-sales-loop-types";
import type { RuntimeV3GrowthOutput } from "@/lib/knowledge-runtime/runtime-v3-sales-learning-types";
import type { RuntimeV4GrowthFlywheelOutput } from "@/lib/knowledge-runtime/runtime-v4-growth-types";
import { buildRuntimeV4GrowthFlywheel } from "@/lib/knowledge-runtime/runtime-v4-flywheel-engine";
import { RUNTIME_V4_FEEDBACK_UPDATED_EVENT } from "@/lib/knowledge-runtime/runtime-v4-feedback-event-store";
import { CustomerPathOptimizerCard } from "./CustomerPathOptimizerCard";
import { GrowthMetricsSummaryCard } from "./GrowthMetricsSummaryCard";
import { ScriptScoreboardCard } from "./ScriptScoreboardCard";
import { SegmentPlaybookCard } from "./SegmentPlaybookCard";
import { StrategyOptimizerCard } from "./StrategyOptimizerCard";

export function GrowthFlywheelPanel({
  output,
  salesLearningV3,
  abScripts,
  dealSignals,
  multiTurnPath,
  className,
}: {
  output?: RuntimeV4GrowthFlywheelOutput | null;
  salesLearningV3?: RuntimeV3GrowthOutput | null;
  abScripts?: RuntimeV2ABScripts | null;
  dealSignals?: RuntimeV2DealSignal[] | null;
  multiTurnPath?: RuntimeV2MultiTurnSalesPath | null;
  className?: string;
}) {
  const baseOutput = React.useMemo(() => (
    output ?? buildRuntimeV4GrowthFlywheel({
      scope: salesLearningV3?.isolationScope,
      salesLearningV3,
      abScripts,
      dealSignals,
      multiTurnPath,
    })
  ), [abScripts, dealSignals, multiTurnPath, output, salesLearningV3]);
  const [current, setCurrent] = React.useState(baseOutput);

  React.useEffect(() => {
    setCurrent(baseOutput);
  }, [baseOutput]);

  React.useEffect(() => {
    if (!salesLearningV3?.isolationScope) return;

    const refresh = () => {
      setCurrent(buildRuntimeV4GrowthFlywheel({
        scope: salesLearningV3.isolationScope,
        salesLearningV3,
        abScripts,
        dealSignals,
        multiTurnPath,
      }));
    };

    window.addEventListener(RUNTIME_V4_FEEDBACK_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(RUNTIME_V4_FEEDBACK_UPDATED_EVENT, refresh);
  }, [abScripts, dealSignals, multiTurnPath, salesLearningV3]);

  if (!current.enabled) return null;

  return (
    <details className={cn("rounded-2xl border border-emerald-200 bg-white/70 px-3 py-3 text-emerald-950", className)}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold text-emerald-900">
        <span className="inline-flex items-center gap-2">
          <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
          AI自动成交优化系统 v4
        </span>
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-800 ring-1 ring-emerald-100">
          商业增长飞轮
        </span>
      </summary>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <GrowthMetricsSummaryCard metrics={current.metricsSummary} />
        <StrategyOptimizerCard recommendation={current.optimizedRecommendation} />
        <CustomerPathOptimizerCard path={current.customerPathOptimization} />
        <SegmentPlaybookCard playbooks={current.segmentPlaybook} />
      </div>
      <ScriptScoreboardCard scores={current.scriptScoreboard} className="mt-3" />
      {current.warnings.length > 0 ? (
        <p className="mt-3 text-xs leading-5 text-amber-700">{current.warnings[0]}</p>
      ) : null}
    </details>
  );
}
