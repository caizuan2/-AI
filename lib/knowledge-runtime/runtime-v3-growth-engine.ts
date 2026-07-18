import { segmentCustomer } from "./runtime-v3-customer-segmenter";
import { extractLearningSignals } from "./runtime-v3-learning-signal-extractor";
import { assertRuntimeV3LearningSafe } from "./runtime-v3-learning-guard";
import { summarizeRuntimeV3Learning } from "./runtime-v3-local-learning-store";
import { optimizeScriptVariants } from "./runtime-v3-script-optimizer";
import { scoreRuntimeV3Conversion } from "./runtime-v3-conversion-score";
import { buildNextBestAction } from "./runtime-v3-next-best-action";
import type { RuntimeV3GrowthInput, RuntimeV3GrowthOutput } from "./runtime-v3-sales-learning-types";

export function buildRuntimeV3GrowthOutput(input: RuntimeV3GrowthInput): RuntimeV3GrowthOutput {
  const segment = segmentCustomer({
    query: input.scope.query,
    messages: input.scope.messages,
    customerStage: input.salesLoopPlan?.customerStage,
    salesLoopPlan: input.salesLoopPlan,
    dealSignals: input.dealSignals,
    dealProbability: input.dealProbability ?? input.salesLoopV2?.dealProbability,
    silenceRisk: input.silenceRisk ?? input.salesLoopV2?.silenceRisk,
    memoryTrace: input.memoryTrace,
    sources: input.sources,
  });
  const safety = assertRuntimeV3LearningSafe({
    scope: input.scope,
    messages: input.scope.messages?.map((message) => message.content),
    complianceWarnings: input.complianceWarnings,
  });
  const learningSummary = summarizeRuntimeV3Learning(safety.scope);
  const extracted = extractLearningSignals({
    query: input.scope.query,
    messages: input.scope.messages,
    userActions: input.userActions,
    responseMeta: input.responseMeta ?? input.rawValue,
  });
  const bestScriptRecommendation = optimizeScriptVariants({
    query: input.scope.query,
    customerSegment: segment.segment,
    learningSummary,
  });
  const conversionScore = scoreRuntimeV3Conversion({
    customerSegment: segment.segment,
    dealProbability: input.dealProbability ?? input.salesLoopV2?.dealProbability,
    silenceRisk: input.silenceRisk ?? input.salesLoopV2?.silenceRisk,
    dealSignals: input.dealSignals ?? input.salesLoopPlan?.dealSignals,
    sourceCount: input.sources?.length ?? 0,
    memoryCount: (input.memories?.length ?? 0) + (input.memoryTrace?.length ?? 0),
    learningSignals: extracted.signals,
  });
  const nextBestAction = buildNextBestAction({
    customerSegment: segment.segment,
    query: input.scope.query,
  });

  return {
    customerSegment: segment.segment,
    conversionScore,
    bestScriptRecommendation,
    nextBestAction,
    learningSignals: extracted.signals,
    optimizationReason: learningSummary.eventCount > 0
      ? `${learningSummary.summary} ${bestScriptRecommendation.reason}`
      : bestScriptRecommendation.reason,
    isolationScope: safety.scope,
    segmentReason: segment.reason,
    recommendedTone: segment.recommendedTone,
    learningSummary,
    safetyWarnings: safety.warnings,
  };
}
