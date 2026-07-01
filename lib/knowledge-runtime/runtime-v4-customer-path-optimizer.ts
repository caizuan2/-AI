import type { RuntimeV2DealSignal, RuntimeV2MultiTurnSalesPath } from "./runtime-v2-sales-loop-types";
import type { RuntimeV3CustomerSegment } from "./runtime-v3-sales-learning-types";
import type {
  RuntimeV4CustomerPathOptimization,
  RuntimeV4OptimizedRecommendation,
  RuntimeV4ScriptScore,
} from "./runtime-v4-growth-types";

function inferBottleneck(segment?: RuntimeV3CustomerSegment | string | null, signals?: RuntimeV2DealSignal[] | null) {
  if (segment === "price_sensitive_lead") return "客户对价值和价格边界还没有形成稳定判断。";
  if (segment === "effect_doubt") return "客户对效果依据仍有疑虑，需要先补信任。";
  if (segment === "silent_risk") return "客户可能进入沉默风险，需要降低追问压力。";
  if (segment === "high_intent_lead") return "客户已经接近行动，过多解释会拖慢成交。";
  const lowConfidence = (signals ?? []).some((signal) => signal.confidence < 0.45);
  return lowConfidence ? "当前成交信号不够稳定，需要先补充客户真实情况。" : "当前路径可继续优化下一步行动清晰度。";
}

export function optimizeRuntimeV4CustomerPath(input: {
  customerSegment?: RuntimeV3CustomerSegment | string | null;
  dealSignals?: RuntimeV2DealSignal[] | null;
  multiTurnPath?: RuntimeV2MultiTurnSalesPath | null;
  optimizedRecommendation: RuntimeV4OptimizedRecommendation;
  scriptScoreboard: RuntimeV4ScriptScore[];
}): RuntimeV4CustomerPathOptimization {
  const avoidCount = input.scriptScoreboard.filter((score) => score.recommendation === "avoid").length;

  return {
    currentPath: input.multiTurnPath?.currentStep || "确认客户真实状态 → 补充价值依据 → 推进下一步",
    bottleneck: inferBottleneck(input.customerSegment, input.dealSignals),
    nextOptimization: input.optimizedRecommendation.recommendedAction,
    stopCondition: avoidCount >= 2
      ? "多个话术版本出现负向信号时，下一轮先降低推进强度。"
      : "客户明确拒绝或要求停止时，立即停止跟进。",
  };
}

export const optimizeCustomerPath = optimizeRuntimeV4CustomerPath;
