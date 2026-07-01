import type { RuntimeV2DealSignal, RuntimeV2SilenceRisk } from "./runtime-v2-sales-loop-types";
import type { RuntimeV3ConversionScore, RuntimeV3CustomerSegment } from "./runtime-v3-sales-learning-types";
import type { RuntimeV4FeedbackRecord } from "./runtime-v4-growth-types";
import type { RuntimeV5ConversionTrend } from "./runtime-v5-strategy-types";

const POSITIVE_EVENTS = new Set(["copy_customer_copy", "copy_variant_a", "copy_variant_b", "copy_variant_c", "like_answer", "continue_thread", "save_response", "mark_deal_won"]);
const NEGATIVE_EVENTS = new Set(["dislike_answer", "edit_script", "mark_deal_lost", "mark_customer_silent", "mark_stop_followup"]);

function hasSignal(signals: RuntimeV2DealSignal[] = [], keys: string[]) {
  const value = signals.map((signal) => `${signal.key} ${signal.label} ${signal.evidence}`).join(" ").toLowerCase();
  return keys.some((key) => value.includes(key.toLowerCase()));
}

export function predictConversionTrend(input: {
  currentConversionScore?: RuntimeV3ConversionScore | null;
  feedbackEvents?: RuntimeV4FeedbackRecord[] | null;
  customerSegment?: RuntimeV3CustomerSegment | string | null;
  silenceRisk?: RuntimeV2SilenceRisk | null;
  dealSignals?: RuntimeV2DealSignal[] | null;
}): RuntimeV5ConversionTrend {
  const events = input.feedbackEvents ?? [];
  const positive = events.filter((event) => POSITIVE_EVENTS.has(event.event)).length;
  const negative = events.filter((event) => NEGATIVE_EVENTS.has(event.event)).length;
  const baseScore = input.currentConversionScore?.score ?? 0.45;
  let score = baseScore + positive * 0.08 - negative * 0.1;

  if (input.silenceRisk?.silenceRisk === "high") score -= 0.18;
  if (hasSignal(input.dealSignals ?? [], ["怎么开始", "周期", "33", "77", "价格", "考虑"])) score += 0.08;
  if (input.customerSegment === "high_intent_lead" || input.customerSegment === "started_customer") score += 0.08;
  if (input.customerSegment === "lost_or_stop" || input.customerSegment === "silent_risk") score -= 0.16;

  score = Math.max(0, Math.min(1, score));

  if (events.length === 0 && !input.currentConversionScore) {
    return {
      trend: "unknown",
      confidence: 0.38,
      reason: "当前缺少足够反馈样本，先保持观察，不做强判断。",
    };
  }

  if (negative > positive + 1 || score < 0.35) {
    return {
      trend: "down",
      confidence: Math.max(0.45, Math.min(0.82, 0.5 + negative * 0.08)),
      reason: "负向采纳信号或沉默风险增加，下一轮应降低推进强度。",
    };
  }

  if (positive > negative || score >= 0.68) {
    return {
      trend: "up",
      confidence: Math.max(0.5, Math.min(0.86, 0.52 + positive * 0.07)),
      reason: "复制、追问或正向反馈增加，说明当前话术方向有继续测试价值。",
    };
  }

  return {
    trend: "flat",
    confidence: 0.56,
    reason: "当前正负信号接近，建议继续用低压力话术收集客户真实卡点。",
  };
}
