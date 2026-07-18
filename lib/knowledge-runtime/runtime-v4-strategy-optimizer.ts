import type { RuntimeV2DealSignal } from "./runtime-v2-sales-loop-types";
import type { RuntimeV3CustomerSegment, RuntimeV3GrowthOutput } from "./runtime-v3-sales-learning-types";
import type {
  RuntimeV4OptimizedRecommendation,
  RuntimeV4ScriptScore,
  RuntimeV4SegmentPlaybook,
} from "./runtime-v4-growth-types";
import { isRuntimeV4SampleEnough } from "./runtime-v4-learning-policy";

function defaultActionForSegment(segment?: RuntimeV3CustomerSegment | string | null) {
  if (segment === "high_intent_lead" || segment === "started_customer") return "确认当前状态，直接给下一步成交动作。";
  if (segment === "price_sensitive_lead") return "先解释价值边界，再问客户最在意哪一点。";
  if (segment === "effect_doubt") return "先补充案例或使用依据，再给低压力下一步。";
  if (segment === "silent_risk") return "降低压迫感，用一句轻量问题恢复对话。";
  if (segment === "lost_or_stop") return "停止推进，保留礼貌收口。";
  return "先确认客户真实目标，再给轻量下一步。";
}

function hasDealSignal(signals: RuntimeV2DealSignal[] | null | undefined, key: string) {
  return (signals ?? []).some((signal) => signal.key === key || signal.label.includes(key));
}

export function optimizeRuntimeV4SalesStrategy(input: {
  customerSegment?: RuntimeV3CustomerSegment | string | null;
  dealSignals?: RuntimeV2DealSignal[] | null;
  salesLearningV3?: RuntimeV3GrowthOutput | null;
  scriptScoreboard: RuntimeV4ScriptScore[];
  segmentPlaybook: RuntimeV4SegmentPlaybook[];
  totalEvents: number;
}): RuntimeV4OptimizedRecommendation {
  const promoted = input.scriptScoreboard.find((score) => score.recommendation === "promote")
    ?? input.scriptScoreboard[0];
  const playbook = input.segmentPlaybook.find((item) => item.customerSegment === input.customerSegment)
    ?? input.segmentPlaybook[0];
  const v3Recommendation = input.salesLearningV3?.bestScriptRecommendation;
  const recommendedVariantId = promoted?.variantId || v3Recommendation?.recommendedVariantId;
  const recommendedTone =
    promoted?.tone ||
    playbook?.bestTone ||
    input.salesLearningV3?.recommendedTone ||
    "warm";
  const sampleEnough = isRuntimeV4SampleEnough(input.totalEvents);
  const highIntent = hasDealSignal(input.dealSignals, "成交") || input.customerSegment === "high_intent_lead";

  return {
    recommendedVariantId,
    recommendedTone,
    recommendedAction: highIntent
      ? "用更明确的下一步引导客户行动，但保留选择空间。"
      : playbook?.bestNextAction || defaultActionForSegment(input.customerSegment),
    reason: sampleEnough
      ? "基于当前知识库/Agent 内的复制、点赞、追问和成交反馈，动态提升表现更好的话术路径。"
      : "当前样本不足，先沿用 v3 推荐并继续收集复制、追问和成交反馈。",
    avoidStrategy: playbook?.avoidStrategy,
  };
}

export const optimizeSalesStrategy = optimizeRuntimeV4SalesStrategy;
