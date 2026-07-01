import type { RuntimeV2ABScripts, RuntimeV2DealSignal, RuntimeV2MultiTurnSalesPath } from "./runtime-v2-sales-loop-types";
import type { RuntimeV3GrowthOutput, RuntimeV3ScriptVariant } from "./runtime-v3-sales-learning-types";
import type {
  RuntimeV4FeedbackRecord,
  RuntimeV4GrowthFlywheelOutput,
  RuntimeV4Scope,
} from "./runtime-v4-growth-types";
import {
  buildRuntimeV4ScopeKey,
  hasCompleteRuntimeV4Scope,
  listRuntimeV4FeedbackEvents,
} from "./runtime-v4-feedback-event-store";
import { buildRuntimeV4ScriptScoreboard } from "./runtime-v4-script-scoreboard";
import { buildRuntimeV4SegmentPlaybook } from "./runtime-v4-segment-playbook";
import { optimizeRuntimeV4SalesStrategy } from "./runtime-v4-strategy-optimizer";
import { optimizeRuntimeV4CustomerPath } from "./runtime-v4-customer-path-optimizer";
import { buildGrowthMetricsSummary } from "./runtime-v4-metrics-summary";
import { assertRuntimeV4GrowthSafe } from "./runtime-v4-growth-guard";

function variantFromAB(id: "A" | "B", scripts?: RuntimeV2ABScripts | null): RuntimeV3ScriptVariant | null {
  const source = id === "A" ? scripts?.variantA : scripts?.variantB;
  if (!source) return null;

  return {
    id,
    label: source.label,
    tone: id === "A" ? "trust_building" : "closing_soft",
    message: source.message,
    bestFor: source.bestFor,
    riskLevel: "low",
  };
}

function fallbackVariants(scripts?: RuntimeV2ABScripts | null): RuntimeV3ScriptVariant[] {
  return [
    variantFromAB("A", scripts),
    variantFromAB("B", scripts),
  ].filter((variant): variant is RuntimeV3ScriptVariant => Boolean(variant));
}

function defaultOutput(scope?: RuntimeV4Scope | null): RuntimeV4GrowthFlywheelOutput {
  const scopeKey = scope && hasCompleteRuntimeV4Scope(scope) ? buildRuntimeV4ScopeKey(scope) : "";

  return {
    enabled: Boolean(scopeKey),
    scopeKey,
    scriptScoreboard: buildRuntimeV4ScriptScoreboard({ variants: [], events: [] }),
    segmentPlaybook: buildRuntimeV4SegmentPlaybook(),
    optimizedRecommendation: {
      recommendedTone: "warm",
      recommendedAction: "先确认客户真实目标，再给低压力下一步。",
      reason: "当前还没有足够成交反馈，保持稳妥默认策略。",
    },
    customerPathOptimization: {
      currentPath: "确认客户状态 → 补充价值依据 → 推进下一步",
      bottleneck: "样本不足，暂不做强优化。",
      nextOptimization: "继续收集复制、追问、成交和流失反馈。",
      stopCondition: "客户明确拒绝或要求停止时，立即停止跟进。",
    },
    metricsSummary: {
      totalEvents: 0,
      copyRateSignal: "0%",
      positiveSignalRate: "0%",
      negativeSignalRate: "0%",
      recommendation: "样本不足，先继续收集用户复制、追问和成交反馈。",
    },
    warnings: scopeKey ? ["样本不足，当前仅作为建议，不自动替换正式话术。"] : ["缺少知识库/Agent 隔离范围，v4 不写入学习。"],
  };
}

export function buildRuntimeV4GrowthFlywheel(input: {
  scope?: RuntimeV4Scope | null;
  salesLearningV3?: RuntimeV3GrowthOutput | null;
  abScripts?: RuntimeV2ABScripts | null;
  dealSignals?: RuntimeV2DealSignal[] | null;
  multiTurnPath?: RuntimeV2MultiTurnSalesPath | null;
  feedbackEvents?: RuntimeV4FeedbackRecord[];
}): RuntimeV4GrowthFlywheelOutput {
  const scope = input.scope ?? input.salesLearningV3?.isolationScope;
  const enabled = hasCompleteRuntimeV4Scope(scope);
  const scopeKey = enabled && scope ? buildRuntimeV4ScopeKey(scope) : "";
  const feedbackEvents = input.feedbackEvents ?? (scope && enabled ? listRuntimeV4FeedbackEvents(scope) : []);
  const variants = input.salesLearningV3?.bestScriptRecommendation?.alternatives?.length
    ? input.salesLearningV3.bestScriptRecommendation.alternatives
    : fallbackVariants(input.abScripts);

  if (!enabled) {
    return defaultOutput(scope);
  }

  const scriptScoreboard = buildRuntimeV4ScriptScoreboard({ variants, events: feedbackEvents });
  const segmentPlaybook = buildRuntimeV4SegmentPlaybook(input.salesLearningV3?.customerSegment);
  const optimizedRecommendation = optimizeRuntimeV4SalesStrategy({
    customerSegment: input.salesLearningV3?.customerSegment,
    dealSignals: input.dealSignals,
    salesLearningV3: input.salesLearningV3,
    scriptScoreboard,
    segmentPlaybook,
    totalEvents: feedbackEvents.length,
  });
  const customerPathOptimization = optimizeRuntimeV4CustomerPath({
    customerSegment: input.salesLearningV3?.customerSegment,
    dealSignals: input.dealSignals,
    multiTurnPath: input.multiTurnPath,
    optimizedRecommendation,
    scriptScoreboard,
  });
  const metricsSummary = buildGrowthMetricsSummary({ events: feedbackEvents, scriptScoreboard });
  const warnings = assertRuntimeV4GrowthSafe({
    enabled,
    scopeKey,
    totalEvents: feedbackEvents.length,
    optimizedRecommendation,
    customerPathOptimization,
  });

  return {
    enabled,
    scopeKey,
    scriptScoreboard,
    segmentPlaybook,
    optimizedRecommendation,
    customerPathOptimization,
    metricsSummary,
    warnings,
  };
}
