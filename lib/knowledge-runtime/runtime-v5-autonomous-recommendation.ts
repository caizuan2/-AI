import type { RuntimeV2DealSignal } from "./runtime-v2-sales-loop-types";
import type { RuntimeV3CustomerSegment } from "./runtime-v3-sales-learning-types";
import type { RuntimeV4MetricsSummary, RuntimeV4ScriptScore } from "./runtime-v4-growth-types";
import type {
  RuntimeV5AutonomousRecommendation,
  RuntimeV5ConversionTrend,
  RuntimeV5ROISignals,
  RuntimeV5StrategyCandidate,
} from "./runtime-v5-strategy-types";

function signalText(signals?: RuntimeV2DealSignal[] | null) {
  return (signals ?? [])
    .flatMap((signal) => [signal.key, signal.label, signal.evidence])
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function findCandidate(
  candidates: RuntimeV5StrategyCandidate[],
  ids: string[],
) {
  return candidates.find((candidate) =>
    candidate.status !== "retired" &&
    candidate.complianceRisk !== "high" &&
    ids.some((id) => candidate.id.includes(id) || candidate.type === id)
  );
}

export function buildRuntimeV5AutonomousRecommendation(input: {
  strategyCandidates: RuntimeV5StrategyCandidate[];
  scriptScoreboard?: RuntimeV4ScriptScore[] | null;
  roiSignals: RuntimeV5ROISignals;
  conversionTrend: RuntimeV5ConversionTrend;
  customerSegment?: RuntimeV3CustomerSegment | string | null;
  dealSignals?: RuntimeV2DealSignal[] | null;
  growthMetricsSummary?: RuntimeV4MetricsSummary | null;
}): RuntimeV5AutonomousRecommendation {
  const candidates = input.strategyCandidates
    .filter((candidate) => candidate.status !== "retired" && candidate.complianceRisk !== "high")
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const text = `${input.customerSegment ?? ""} ${signalText(input.dealSignals)}`;
  const hasSamples = (input.scriptScoreboard ?? []).some((score) =>
    score.copyCount + score.likeCount + score.dislikeCount + score.editCount + score.continueCount + score.wonCount + score.lostCount > 0
  ) || input.roiSignals.highROI.length + input.roiSignals.lowROI.length > 0;

  let selected =
    (/拒绝|停止|stop|lost/.test(text) && findCandidate(candidates, ["respectful_stop", "respectful-stop"])) ||
    (/沉默|不回复|silent/.test(text) && findCandidate(candidates, ["followup_recovery", "respectful_stop"])) ||
    (/33|77|周期|选择|cycle/.test(text) && findCandidate(candidates, ["cycle_choice_guidance", "decision_guiding"])) ||
    (/贵|价格|预算|price|cost/.test(text) && findCandidate(candidates, ["value_explanation"])) ||
    (/效果|怀疑|担心|考虑|doubt/.test(text) && findCandidate(candidates, ["objection_handling", "trust_building"])) ||
    (input.customerSegment === "high_intent_lead" && findCandidate(candidates, ["soft_closing", "decision_guiding"])) ||
    candidates[0];

  if (!selected && candidates.length > 0) {
    selected = candidates[0];
  }

  if (!selected) {
    return {
      recommendation: "继续收集客户反馈后再生成策略推荐。",
      reason: "当前没有可用的低风险策略候选。",
      caution: "仅做推荐，不自动发送消息。",
    };
  }

  const keepTesting = !hasSamples || input.roiSignals.highROI.length + input.roiSignals.lowROI.length < 3;
  const trendText = input.conversionTrend.trend === "down"
    ? "当前趋势偏弱，建议降低推进强度。"
    : input.conversionTrend.trend === "up"
      ? "当前采纳趋势较好，可以继续测试该方向。"
      : "当前趋势不够明确，继续保持低压力测试。";

  return {
    primaryStrategyId: selected.id,
    recommendation: `优先使用「${selected.label}」策略。${selected.messagePattern}`,
    reason: keepTesting
      ? `样本不足，先作为 keep_testing 策略继续观察。${trendText}`
      : `${selected.reason ?? selected.bestFor} ${input.growthMetricsSummary?.recommendation ?? trendText}`,
    caution: "策略仅用于辅助推荐，不自动发送、不承诺成交结果、不夸大健康或控体效果。",
  };
}
