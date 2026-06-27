import "server-only";

const FRESHNESS_HALF_LIFE_DAYS = 120;

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function normalizeDate(value: string | Date | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  return Number.isFinite(date.getTime()) ? date : null;
}

export function calculateFreshnessScore(value: string | Date | null | undefined) {
  const date = normalizeDate(value);

  if (!date) {
    return 1;
  }

  const ageDays = Math.max(0, (Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));

  return clamp01(Math.pow(0.5, ageDays / FRESHNESS_HALF_LIFE_DAYS));
}

export function calculateFeedbackAwareRankingScore(input: {
  baseScore: number;
  qualityScore?: number | null;
  feedbackScore?: number | null;
  behaviorScore?: number | null;
  usageScore?: number | null;
  freshnessScore?: number | null;
  optimizationScore?: number | null;
  confidenceWeight?: number | null;
  trustWeight?: number | null;
  volatilityPenalty?: number | null;
  stabilityScore?: number | null;
  stableOptimizationScore?: number | null;
  trendScore?: number | null;
  trendConfidence?: number | null;
  lifecycleScore?: number | null;
  lifecycleConfidence?: number | null;
  lifecycleStage?: string | null;
  sampleCount?: number | null;
  lowQuality?: boolean | null;
  highValue?: boolean | null;
}) {
  const baseScore = clamp01(input.baseScore);
  const qualityScore = clamp01(input.qualityScore ?? baseScore);
  const feedbackScore = Math.max(-1, Math.min(1, input.feedbackScore ?? 0));
  const behaviorScore = Math.max(-1, Math.min(1, input.behaviorScore ?? 0));
  const normalizedFeedbackScore = clamp01((feedbackScore + 1) / 2);
  const normalizedBehaviorScore = clamp01((behaviorScore + 1) / 2);
  const optimizationScore = clamp01(input.optimizationScore ?? baseScore);
  const freshnessScore = clamp01(input.freshnessScore ?? 1);
  const usageScore = clamp01(input.usageScore ?? 0);
  const confidenceWeight = clamp01(input.confidenceWeight ?? 1);
  const trustWeight = clamp01(input.trustWeight ?? 1);
  const volatilityPenalty = clamp01(input.volatilityPenalty ?? 0);
  const stabilityScore = clamp01(input.stabilityScore ?? 0.5);
  const stableOptimizationScore = typeof input.stableOptimizationScore === "number"
    ? clamp01(input.stableOptimizationScore)
    : null;
  const trendScore = clamp01(input.trendScore ?? 0.5);
  const trendConfidence = clamp01(input.trendConfidence ?? 0.25);
  const adjustedTrendScore = clamp01((trendScore * trendConfidence) + (0.5 * (1 - trendConfidence)));
  const lifecycleScore = clamp01(input.lifecycleScore ?? 0.5);
  const lifecycleConfidence = clamp01(input.lifecycleConfidence ?? 0.25);
  const adjustedLifecycleScore = clamp01((lifecycleScore * lifecycleConfidence) + (0.5 * (1 - lifecycleConfidence)));
  const weightedScore = stableOptimizationScore !== null
    ? (
      (baseScore * 0.42)
      + (stableOptimizationScore * 0.25)
      + (adjustedTrendScore * 0.1)
      + (adjustedLifecycleScore * 0.1)
      + (qualityScore * 0.06)
      + (normalizedFeedbackScore * 0.04)
      + (normalizedBehaviorScore * 0.03)
      - (volatilityPenalty * 0.08)
    )
    : (
      (baseScore * 0.4)
      + (qualityScore * 0.14)
      + (normalizedFeedbackScore * 0.1 * confidenceWeight * trustWeight)
      + (normalizedBehaviorScore * 0.1 * confidenceWeight * trustWeight)
      + (usageScore * 0.08)
      + (freshnessScore * 0.05)
      + (optimizationScore * 0.13)
      + (stabilityScore * 0.04)
      + (adjustedTrendScore * 0.04)
      + (adjustedLifecycleScore * 0.04)
      - volatilityPenalty
    );
  const lifecycleAdjustedScore = input.lifecycleStage === "growing"
    ? weightedScore + 0.035
    : input.lifecycleStage === "stable"
      ? weightedScore + 0.02
      : input.lifecycleStage === "new"
        ? Math.max(weightedScore, baseScore * 0.96)
        : input.lifecycleStage === "declining"
          ? weightedScore - 0.04
          : input.lifecycleStage === "archive_candidate"
            ? weightedScore * 0.78
            : weightedScore;
  const qualityAdjustedScore = input.lowQuality === true
    ? lifecycleAdjustedScore * 0.72
    : input.highValue === true
      ? lifecycleAdjustedScore + 0.04
      : lifecycleAdjustedScore;

  return Math.round(clamp01(qualityAdjustedScore) * 10000) / 10000;
}
