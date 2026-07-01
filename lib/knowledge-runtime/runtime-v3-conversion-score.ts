import type {
  RuntimeV3ConversionScore,
  RuntimeV3CustomerSegment,
  RuntimeV3LearningSignal,
} from "./runtime-v3-sales-learning-types";
import type {
  RuntimeV2DealProbability,
  RuntimeV2DealSignal,
  RuntimeV2SilenceRisk,
} from "./runtime-v2-sales-loop-types";

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function levelFromScore(score: number): RuntimeV3ConversionScore["level"] {
  if (score >= 0.68) return "high";
  if (score >= 0.42) return "medium";
  return "low";
}

export function scoreRuntimeV3Conversion(input: {
  customerSegment: RuntimeV3CustomerSegment;
  dealProbability?: RuntimeV2DealProbability | null;
  silenceRisk?: RuntimeV2SilenceRisk | null;
  dealSignals?: RuntimeV2DealSignal[] | null;
  sourceCount?: number;
  memoryCount?: number;
  learningSignals?: RuntimeV3LearningSignal[];
}) : RuntimeV3ConversionScore {
  let score = typeof input.dealProbability?.score === "number" ? input.dealProbability.score : 0.45;
  const reasons: string[] = [];
  const riskFactors: string[] = [];
  const opportunityFactors: string[] = [];

  const segmentBoost: Partial<Record<RuntimeV3CustomerSegment, number>> = {
    high_intent_lead: 0.25,
    warm_lead: 0.12,
    started_customer: 0.1,
    curious_lead: 0.02,
    price_sensitive_lead: -0.06,
    hesitating_lead: -0.04,
    effect_doubt: -0.08,
    silent_risk: -0.18,
    lost_or_stop: -0.35,
  };

  score += segmentBoost[input.customerSegment] ?? 0;
  reasons.push(`客户分层：${input.customerSegment}`);

  if ((input.sourceCount ?? 0) > 0 || (input.memoryCount ?? 0) > 0) {
    score += 0.05;
    opportunityFactors.push("已有知识库/记忆依据，可给出更贴近上下文的话术。");
  }

  if ((input.dealSignals?.length ?? 0) > 0) {
    score += Math.min(0.12, (input.dealSignals?.length ?? 0) * 0.04);
    opportunityFactors.push("检测到可推进的成交信号。");
  }

  if (input.silenceRisk?.silenceRisk === "high") {
    score -= 0.18;
    riskFactors.push("沉默风险较高，需要低压力收口。");
  } else if (input.silenceRisk?.silenceRisk === "medium") {
    score -= 0.08;
    riskFactors.push("存在一定沉默风险，跟进节奏要放轻。");
  }

  if ((input.learningSignals ?? []).some((signal) => signal.startsWith("copied_") || signal === "liked_answer")) {
    score += 0.06;
    opportunityFactors.push("本轮出现复制/点赞信号，说明话术可能可用。");
  }

  if ((input.learningSignals ?? []).some((signal) => signal === "disliked_answer" || signal === "manual_negative")) {
    score -= 0.1;
    riskFactors.push("出现负向反馈，需要换更短、更稳的话术。");
  }

  const finalScore = clamp(score);

  return {
    level: levelFromScore(finalScore),
    score: finalScore,
    reasons,
    confidence: clamp(0.55 + (input.sourceCount ?? 0) * 0.05 + (input.learningSignals?.length ?? 0) * 0.03),
    riskFactors,
    opportunityFactors,
  };
}
