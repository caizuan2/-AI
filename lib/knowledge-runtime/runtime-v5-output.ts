import type { RuntimeV2DealSignal, RuntimeV2SilenceRisk } from "./runtime-v2-sales-loop-types";
import type { RuntimeV2Input, RuntimeV2MemoryTraceItem, RuntimeV2Source } from "./runtime-v2-types";
import type { RuntimeV3ConversionScore, RuntimeV3GrowthOutput } from "./runtime-v3-sales-learning-types";
import type { RuntimeV4FeedbackRecord, RuntimeV4GrowthFlywheelOutput } from "./runtime-v4-growth-types";
import {
  buildRuntimeV4ScopeKey,
  hasCompleteRuntimeV4Scope,
  listRuntimeV4FeedbackEvents,
} from "./runtime-v4-feedback-event-store";
import { buildRuntimeV5AutonomousRecommendation } from "./runtime-v5-autonomous-recommendation";
import { predictConversionTrend } from "./runtime-v5-conversion-trend-predictor";
import { assertRuntimeV5EvolutionSafe } from "./runtime-v5-evolution-guard";
import { detectLowPerformanceStrategies } from "./runtime-v5-low-performance-filter";
import { evolveCustomerPath } from "./runtime-v5-path-evolution-policy";
import { scoreRuntimeV5ROISignals } from "./runtime-v5-roi-signal-scorer";
import { evolveSegmentStrategy } from "./runtime-v5-segment-strategy-evolver";
import { buildRuntimeV5StrategyCandidatePool } from "./runtime-v5-strategy-candidate-pool";
import { summarizeRuntimeV5StrategyMemory } from "./runtime-v5-strategy-memory-store";
import type {
  RuntimeV5EvolutionOutput,
  RuntimeV5Scope,
  RuntimeV5StrategyCandidate,
} from "./runtime-v5-strategy-types";

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]));
}

function emptyRuntimeV5Output(warnings: string[] = []): RuntimeV5EvolutionOutput {
  return {
    enabled: false,
    scopeKey: "",
    strategyCandidates: [],
    promotedStrategies: [],
    reducedStrategies: [],
    retiredStrategies: [],
    roiSignals: {
      highROI: [],
      lowROI: [],
      score: 0,
      reason: "缺少完整隔离范围，暂不生成策略进化建议。",
    },
    conversionTrend: {
      trend: "unknown",
      confidence: 0,
      reason: "缺少完整隔离范围，暂不判断成交趋势。",
    },
    evolvedPath: {
      recommendedPath: "确认目标 → 低压力沟通 → 下一步建议",
      whyThisPath: "缺少完整知识库/专家隔离范围，先保持基础对话路径。",
      nextStep: "先确认客户当前真实目标。",
    },
    segmentStrategy: {
      segment: "unknown",
      recommendedStyle: "确认目标 + 轻建议",
      nextAction: "先问客户当前最想解决的问题。",
      avoidStrategy: "不要强行成交。",
      bestPath: "目标确认 → 背景补充 → 下一步",
      reason: "客户分层不明确时，先用稳妥低压力策略。",
    },
    autonomousRecommendation: {
      recommendation: "当前不生成自主策略推荐。",
      reason: "缺少 knowledgeBaseId/kbId 或 agentId/expertId，避免跨知识库学习。",
      caution: "v5 只推荐策略，不自动发送消息。",
    },
    warnings,
  };
}

function applyStrategyStatus(
  candidates: RuntimeV5StrategyCandidate[],
  input: {
    primaryStrategyId?: string;
    reduced: RuntimeV5StrategyCandidate[];
    retired: RuntimeV5StrategyCandidate[];
    sampleCount: number;
  },
) {
  const reducedIds = new Set(input.reduced.map((strategy) => strategy.id));
  const retiredIds = new Set(input.retired.map((strategy) => strategy.id));

  return candidates.map((candidate) => {
    if (retiredIds.has(candidate.id)) {
      const retired = input.retired.find((strategy) => strategy.id === candidate.id);
      return { ...candidate, status: "retired" as const, reason: retired?.reason ?? candidate.reason };
    }

    if (reducedIds.has(candidate.id)) {
      const reduced = input.reduced.find((strategy) => strategy.id === candidate.id);
      return { ...candidate, status: "reduced" as const, reason: reduced?.reason ?? candidate.reason };
    }

    if (candidate.id === input.primaryStrategyId && input.sampleCount >= 3) {
      return {
        ...candidate,
        status: "promoted" as const,
        reason: candidate.reason ?? "当前信号更适合优先测试该策略。",
      };
    }

    if (input.sampleCount < 3) {
      return {
        ...candidate,
        status: "testing" as const,
        reason: candidate.reason ?? "样本不足，先继续低风险测试。",
      };
    }

    return candidate;
  });
}

export function buildRuntimeV5EvolutionOutput(input: {
  scope?: RuntimeV2Input | RuntimeV5Scope | null;
  salesLearningV3?: RuntimeV3GrowthOutput | null;
  salesGrowthV4?: RuntimeV4GrowthFlywheelOutput | null;
  dealSignals?: RuntimeV2DealSignal[] | null;
  silenceRisk?: RuntimeV2SilenceRisk | null;
  currentConversionScore?: RuntimeV3ConversionScore | null;
  sources?: RuntimeV2Source[] | null;
  memoryTrace?: RuntimeV2MemoryTraceItem[] | null;
  feedbackEvents?: RuntimeV4FeedbackRecord[] | null;
  industryHint?: string | null;
}): RuntimeV5EvolutionOutput {
  const scope = input.scope ?? input.salesLearningV3?.isolationScope ?? null;

  if (!scope || !hasCompleteRuntimeV4Scope(scope)) {
    return emptyRuntimeV5Output([
      "缺少 knowledgeBaseId/kbId 或 agentId/expertId，v5 不执行跨域学习。",
    ]);
  }

  const scopeKey = buildRuntimeV4ScopeKey(scope);
  const feedbackEvents = input.feedbackEvents ?? listRuntimeV4FeedbackEvents(scope);
  const candidates = buildRuntimeV5StrategyCandidatePool({
    customerSegment: input.salesLearningV3?.customerSegment,
    dealSignals: input.dealSignals,
    salesGrowthV4: input.salesGrowthV4,
    memoryTrace: input.memoryTrace,
    sources: input.sources,
    industryHint: input.industryHint,
  });
  const lowPerformance = detectLowPerformanceStrategies({
    scriptScoreboard: input.salesGrowthV4?.scriptScoreboard,
    feedbackEvents,
    strategyCandidates: candidates,
  });
  const roiSignals = scoreRuntimeV5ROISignals({ feedbackEvents });
  const conversionTrend = predictConversionTrend({
    currentConversionScore: input.currentConversionScore ?? input.salesLearningV3?.conversionScore,
    feedbackEvents,
    customerSegment: input.salesLearningV3?.customerSegment,
    silenceRisk: input.silenceRisk,
    dealSignals: input.dealSignals,
  });
  const evolvedPath = evolveCustomerPath({
    customerSegment: input.salesLearningV3?.customerSegment,
    dealSignals: input.dealSignals,
    silenceRisk: input.silenceRisk,
  });
  const segmentStrategy = evolveSegmentStrategy({
    customerSegment: input.salesLearningV3?.customerSegment,
  });
  const recommendation = buildRuntimeV5AutonomousRecommendation({
    strategyCandidates: candidates,
    scriptScoreboard: input.salesGrowthV4?.scriptScoreboard,
    roiSignals,
    conversionTrend,
    customerSegment: input.salesLearningV3?.customerSegment,
    dealSignals: input.dealSignals,
    growthMetricsSummary: input.salesGrowthV4?.metricsSummary,
  });
  const withStatuses = applyStrategyStatus(candidates, {
    primaryStrategyId: recommendation.primaryStrategyId,
    reduced: lowPerformance.reducedStrategies,
    retired: lowPerformance.retiredStrategies,
    sampleCount: lowPerformance.sampleCount,
  });
  const guarded = assertRuntimeV5EvolutionSafe({
    scopeKey,
    strategyCandidates: withStatuses,
    sampleCount: lowPerformance.sampleCount,
    warnings: lowPerformance.reasons,
  });
  const memorySummary = summarizeRuntimeV5StrategyMemory(scope);
  const strategyCandidates = guarded.strategyCandidates;

  return {
    enabled: true,
    scopeKey,
    strategyCandidates,
    promotedStrategies: strategyCandidates.filter((strategy) => strategy.status === "promoted"),
    reducedStrategies: strategyCandidates.filter((strategy) => strategy.status === "reduced"),
    retiredStrategies: strategyCandidates.filter((strategy) => strategy.status === "retired"),
    roiSignals,
    conversionTrend,
    evolvedPath,
    segmentStrategy,
    autonomousRecommendation: recommendation,
    warnings: unique([
      ...guarded.warnings,
      memorySummary.count > 0 ? memorySummary.summary : null,
    ]),
  };
}
