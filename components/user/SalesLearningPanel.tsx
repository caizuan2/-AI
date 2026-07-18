"use client";

import { BrainCircuit } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RuntimeV3GrowthOutput } from "@/lib/knowledge-runtime/runtime-v3-sales-learning-types";
import { BestScriptRecommendationCard } from "./BestScriptRecommendationCard";
import { ConversionScoreCard } from "./ConversionScoreCard";
import { CustomerSegmentCard } from "./CustomerSegmentCard";
import { LearningSignalsPanel } from "./LearningSignalsPanel";
import { NextBestActionCard } from "./NextBestActionCard";
import { ScriptPerformancePanel } from "./ScriptPerformancePanel";

export function SalesLearningPanel({
  output,
  className,
}: {
  output?: RuntimeV3GrowthOutput | null;
  className?: string;
}) {
  if (!output) return null;

  return (
    <div className={cn("rounded-2xl border border-emerald-200 bg-emerald-50/80 px-3 py-3", className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-900">
          <BrainCircuit className="h-3.5 w-3.5" aria-hidden="true" />
          AI自动成交学习系统 v3
        </div>
        <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-100">
          按知识库 / Agent 隔离学习
        </span>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <CustomerSegmentCard
          segment={output.customerSegment}
          reason={output.segmentReason}
          tone={output.recommendedTone}
        />
        <ConversionScoreCard score={output.conversionScore} />
        <NextBestActionCard action={output.nextBestAction} />
        <LearningSignalsPanel signals={output.learningSignals} reason={output.optimizationReason} />
      </div>
      <BestScriptRecommendationCard
        recommendation={output.bestScriptRecommendation}
        scope={output.isolationScope}
        className="mt-3"
      />
      <ScriptPerformancePanel scope={output.isolationScope} className="mt-3" />
    </div>
  );
}
