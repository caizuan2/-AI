import "server-only";

import type { KnowledgeStabilityDiagnostics } from "@/lib/enterprise/knowledge-convergence-types";

function clamp01(value: unknown, fallback = 0) {
  const numeric = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, numeric));
}

function clampPenalty(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(0.18, value));
}

function round4(value: number) {
  return Math.round(clamp01(value) * 10000) / 10000;
}

function normalizeSignedSignal(value: unknown, fallback = 0.5) {
  const numeric = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  if (numeric < 0) {
    return clamp01((Math.max(-1, numeric) + 1) / 2, fallback);
  }

  if (numeric <= 1) {
    return clamp01((numeric + 1) / 2, fallback);
  }

  return clamp01(numeric, fallback);
}

export function calculateConfidenceWeight(input: {
  sampleCount?: number;
  uniqueUserCount?: number;
}): number {
  const sampleCount = Math.max(0, Math.round(Number(input.sampleCount ?? 0) || 0));
  const uniqueUserCount = Math.max(0, Math.round(Number(input.uniqueUserCount ?? 0) || 0));
  let weight = 0.25;

  if (sampleCount > 30) {
    weight = 1;
  } else if (sampleCount >= 11) {
    weight = 0.85;
  } else if (sampleCount >= 6) {
    weight = 0.65;
  } else if (sampleCount >= 3) {
    weight = 0.45;
  }

  if (sampleCount >= 3 && uniqueUserCount <= 1) {
    weight *= 0.65;
  } else if (sampleCount >= 8 && uniqueUserCount <= 2) {
    weight *= 0.8;
  }

  return Math.round(clamp01(weight, 0.25) * 10000) / 10000;
}

export function calculateVolatilityPenalty(input: {
  recentScores?: number[];
  recentPositiveCount?: number;
  recentNegativeCount?: number;
  recentWindowHours?: number;
}): number {
  const recentScores = (input.recentScores ?? [])
    .map((score) => Number(score))
    .filter((score) => Number.isFinite(score))
    .slice(-20);
  const recentPositiveCount = Math.max(0, Math.round(Number(input.recentPositiveCount ?? 0) || 0));
  const recentNegativeCount = Math.max(0, Math.round(Number(input.recentNegativeCount ?? 0) || 0));
  const totalDirectional = recentPositiveCount + recentNegativeCount;
  let penalty = 0;

  if (recentScores.length >= 3) {
    const average = recentScores.reduce((sum, score) => sum + score, 0) / recentScores.length;
    const variance = recentScores.reduce((sum, score) => sum + ((score - average) ** 2), 0) / recentScores.length;

    penalty += Math.min(0.1, Math.sqrt(variance) * 0.45);
  }

  if (totalDirectional >= 4) {
    const balance = Math.min(recentPositiveCount, recentNegativeCount) / totalDirectional;

    penalty += balance * 0.12;
  }

  if ((input.recentWindowHours ?? 24) <= 2 && totalDirectional >= 6) {
    penalty += 0.04;
  }

  return Math.round(clampPenalty(penalty) * 10000) / 10000;
}

export function calculateStabilityScore(input: {
  feedbackScore?: number;
  behaviorScore?: number;
  qualityScore?: number;
  usageScore?: number;
  sampleCount?: number;
  positiveCount?: number;
  negativeCount?: number;
  recentChangeRate?: number;
  volatilityScore?: number;
  lastUpdatedAt?: string | Date | null;
}): number {
  const confidenceWeight = calculateConfidenceWeight({ sampleCount: input.sampleCount });
  const feedbackSignal = normalizeSignedSignal(input.feedbackScore, 0.5);
  const behaviorSignal = normalizeSignedSignal(input.behaviorScore, 0.5);
  const qualityScore = clamp01(input.qualityScore ?? 0.5, 0.5);
  const usageScore = clamp01(input.usageScore ?? 0, 0);
  const volatilityScore = clamp01(input.volatilityScore ?? input.recentChangeRate ?? 0, 0);
  const directionalTotal = Math.max(0, (input.positiveCount ?? 0) + (input.negativeCount ?? 0));
  const positiveRate = directionalTotal > 0 ? (input.positiveCount ?? 0) / directionalTotal : 0.5;
  const stableSignal = (
    (qualityScore * 0.34)
    + (feedbackSignal * 0.18)
    + (behaviorSignal * 0.16)
    + (usageScore * 0.12)
    + (positiveRate * 0.1)
    + (confidenceWeight * 0.1)
    - (volatilityScore * 0.18)
  );

  return round4(stableSignal);
}

export function calculateStableOptimizationScore(input: {
  baseScore?: number;
  qualityScore?: number;
  feedbackScore?: number;
  behaviorScore?: number;
  usageScore?: number;
  freshnessScore?: number;
  optimizationScore?: number;
  confidenceWeight?: number;
  trustWeight?: number;
  volatilityPenalty?: number;
}): number {
  const baseScore = clamp01(input.baseScore ?? 0.5, 0.5);
  const qualityScore = clamp01(input.qualityScore ?? baseScore, baseScore);
  const feedbackScore = normalizeSignedSignal(input.feedbackScore, 0.5);
  const behaviorScore = normalizeSignedSignal(input.behaviorScore, 0.5);
  const usageScore = clamp01(input.usageScore ?? 0, 0);
  const freshnessScore = clamp01(input.freshnessScore ?? 1, 1);
  const optimizationScore = clamp01(input.optimizationScore ?? baseScore, baseScore);
  const confidenceWeight = clamp01(input.confidenceWeight ?? 0.25, 0.25);
  const trustWeight = clamp01(input.trustWeight ?? 1, 1);
  const volatilityPenalty = clampPenalty(input.volatilityPenalty ?? 0);
  const score = (
    (baseScore * 0.4)
    + (qualityScore * 0.14)
    + (feedbackScore * 0.1 * confidenceWeight * trustWeight)
    + (behaviorScore * 0.1 * confidenceWeight * trustWeight)
    + (usageScore * 0.08)
    + (freshnessScore * 0.05)
    + (optimizationScore * 0.13)
    - volatilityPenalty
  );

  return round4(score);
}

export function buildStabilityDiagnostics(input: {
  baseScore?: number;
  qualityScore?: number | null;
  feedbackScore?: number | null;
  behaviorScore?: number | null;
  usageScore?: number | null;
  freshnessScore?: number | null;
  optimizationScore?: number | null;
  sampleCount?: number;
  positiveCount?: number;
  negativeCount?: number;
  uniqueUserCount?: number;
  confidenceWeight?: number;
  trustWeight?: number;
  volatilityPenalty?: number;
  recentScores?: number[];
  recentWindowHours?: number;
}): KnowledgeStabilityDiagnostics {
  const sampleCount = Math.max(0, Math.round(Number(input.sampleCount ?? 0) || 0));
  const positiveCount = Math.max(0, Math.round(Number(input.positiveCount ?? 0) || 0));
  const negativeCount = Math.max(0, Math.round(Number(input.negativeCount ?? 0) || 0));
  const uniqueUserCount = Math.max(0, Math.round(Number(input.uniqueUserCount ?? 0) || 0));
  const confidenceWeight = clamp01(
    input.confidenceWeight,
    calculateConfidenceWeight({ sampleCount, uniqueUserCount })
  );
  const volatilityPenalty = input.volatilityPenalty === undefined
    ? calculateVolatilityPenalty({
      recentScores: input.recentScores,
      recentPositiveCount: positiveCount,
      recentNegativeCount: negativeCount,
      recentWindowHours: input.recentWindowHours
    })
    : clampPenalty(input.volatilityPenalty);
  const trustWeight = clamp01(input.trustWeight ?? 1, 1);
  const stabilityScore = calculateStabilityScore({
    feedbackScore: input.feedbackScore ?? undefined,
    behaviorScore: input.behaviorScore ?? undefined,
    qualityScore: input.qualityScore ?? undefined,
    usageScore: input.usageScore ?? undefined,
    sampleCount,
    positiveCount,
    negativeCount,
    volatilityScore: volatilityPenalty / 0.18
  });
  const stableOptimizationScore = calculateStableOptimizationScore({
    baseScore: input.baseScore,
    qualityScore: input.qualityScore ?? undefined,
    feedbackScore: input.feedbackScore ?? undefined,
    behaviorScore: input.behaviorScore ?? undefined,
    usageScore: input.usageScore ?? undefined,
    freshnessScore: input.freshnessScore ?? undefined,
    optimizationScore: input.optimizationScore ?? undefined,
    confidenceWeight,
    trustWeight,
    volatilityPenalty
  });

  return {
    stabilityScore,
    confidenceWeight,
    trustWeight,
    volatilityPenalty,
    stableOptimizationScore,
    sampleCount,
    positiveCount,
    negativeCount,
    uniqueUserCount,
    suspectedGaming: trustWeight < 0.55 || (sampleCount >= 6 && uniqueUserCount <= 1)
  };
}
