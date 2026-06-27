import "server-only";

import type {
  KnowledgeLifecycleSignal,
  KnowledgeLifecycleStage
} from "@/lib/enterprise/knowledge-lifecycle-types";

type LifecycleInput = {
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
  usageScore?: number | null;
  feedbackScore?: number | null;
  behaviorScore?: number | null;
  trendScore?: number | null;
  stableOptimizationScore?: number | null;
  qualityScore?: number | null;
  freshnessScore?: number | null;
  hitCount?: number | null;
  fastRising?: boolean | null;
  staleHighScore?: boolean | null;
  decliningTrend?: boolean | null;
  evergreen?: boolean | null;
  lowQuality?: boolean | null;
  highValue?: boolean | null;
  coldKnowledge?: boolean | null;
  staleVersion?: boolean | null;
};

function clamp01(value: unknown, fallback = 0.5) {
  const numeric = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  if (numeric > 1 && numeric <= 5) {
    return Math.max(0, Math.min(1, numeric / 5));
  }

  if (numeric > 5 && numeric <= 100) {
    return Math.max(0, Math.min(1, numeric / 100));
  }

  return Math.max(0, Math.min(1, numeric));
}

function clampSigned(value: unknown, fallback = 0) {
  const numeric = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.max(-1, Math.min(1, numeric));
}

function round4(value: number) {
  return Math.round(clamp01(value) * 10000) / 10000;
}

function normalizeSignedScore(value: unknown, fallback = 0.5) {
  const numeric = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  if (numeric >= -1 && numeric <= 1) {
    return clamp01((numeric + 1) / 2, fallback);
  }

  return clamp01(numeric, fallback);
}

function normalizeDate(value: string | Date | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  return Number.isFinite(date.getTime()) ? date : null;
}

function ageDays(value: string | Date | null | undefined) {
  const date = normalizeDate(value);

  return date ? Math.max(0, (Date.now() - date.getTime()) / (24 * 60 * 60 * 1000)) : null;
}

function hasMetricEvidence(input: LifecycleInput) {
  return input.usageScore !== undefined
    || input.feedbackScore !== undefined
    || input.behaviorScore !== undefined
    || input.trendScore !== undefined
    || input.stableOptimizationScore !== undefined
    || input.qualityScore !== undefined
    || input.hitCount !== undefined
    || input.fastRising === true
    || input.staleHighScore === true
    || input.decliningTrend === true
    || input.evergreen === true
    || input.lowQuality === true
    || input.highValue === true
    || input.coldKnowledge === true
    || input.staleVersion === true;
}

function confidenceFor(input: LifecycleInput, stage: KnowledgeLifecycleStage) {
  if (stage === "unknown") {
    return 0.25;
  }

  const hitCount = Math.max(0, Math.round(Number(input.hitCount ?? 0) || 0));
  const evidenceCount = [
    input.usageScore,
    input.feedbackScore,
    input.behaviorScore,
    input.trendScore,
    input.stableOptimizationScore,
    input.qualityScore
  ].filter((value) => typeof value === "number" && Number.isFinite(value)).length;
  let confidence = 0.35 + (Math.min(evidenceCount, 6) * 0.08);

  if (hitCount >= 10) confidence += 0.18;
  else if (hitCount >= 3) confidence += 0.1;

  if (input.fastRising || input.staleHighScore || input.decliningTrend || input.evergreen) {
    confidence += 0.12;
  }

  return round4(confidence);
}

export function calculateLifecycleScore(input: LifecycleInput): number {
  const score = (
    (clamp01(input.stableOptimizationScore, 0.5) * 0.35)
    + (clamp01(input.trendScore, 0.5) * 0.25)
    + (clamp01(input.qualityScore, 0.5) * 0.15)
    + (normalizeSignedScore(input.feedbackScore, 0.5) * 0.1)
    + (normalizeSignedScore(input.behaviorScore, 0.5) * 0.1)
    + (clamp01(input.freshnessScore, 0.5) * 0.05)
  );

  return round4(score);
}

function stageSignal(stage: KnowledgeLifecycleStage, score: number, confidence: number): KnowledgeLifecycleSignal {
  const map: Record<KnowledgeLifecycleStage, Pick<KnowledgeLifecycleSignal, "lifecycleReason" | "lifecycleSuggestion" | "shouldBoost" | "shouldDecay" | "shouldReview" | "shouldArchiveCandidate">> = {
    new: {
      lifecycleReason: "new_knowledge_observation",
      lifecycleSuggestion: "新知识，建议继续观察使用表现",
      shouldBoost: false,
      shouldDecay: false,
      shouldReview: false,
      shouldArchiveCandidate: false
    },
    growing: {
      lifecycleReason: "fast_rising_growth",
      lifecycleSuggestion: "成长期知识，可适度提高检索优先级",
      shouldBoost: true,
      shouldDecay: false,
      shouldReview: false,
      shouldArchiveCandidate: false
    },
    stable: {
      lifecycleReason: "stable_high_value",
      lifecycleSuggestion: "稳定高价值知识，保持当前权重",
      shouldBoost: false,
      shouldDecay: false,
      shouldReview: false,
      shouldArchiveCandidate: false
    },
    declining: {
      lifecycleReason: "declining_usage_or_feedback",
      lifecycleSuggestion: "知识表现下降，建议人工复查内容是否过期或不完整",
      shouldBoost: false,
      shouldDecay: true,
      shouldReview: true,
      shouldArchiveCandidate: false
    },
    archive_candidate: {
      lifecycleReason: "archive_candidate_review_only",
      lifecycleSuggestion: "归档候选，仅建议人工复核，不自动归档",
      shouldBoost: false,
      shouldDecay: true,
      shouldReview: true,
      shouldArchiveCandidate: true
    },
    unknown: {
      lifecycleReason: "insufficient_data",
      lifecycleSuggestion: "等待更多使用数据",
      shouldBoost: false,
      shouldDecay: false,
      shouldReview: false,
      shouldArchiveCandidate: false
    }
  };

  return {
    lifecycleStage: stage,
    lifecycleScore: score,
    lifecycleConfidence: confidence,
    ...map[stage]
  };
}

export function classifyKnowledgeLifecycle(input: LifecycleInput): KnowledgeLifecycleSignal {
  const createdAgeDays = ageDays(input.createdAt);
  const usageScore = clamp01(input.usageScore, 0);
  const trendScore = clamp01(input.trendScore, 0.5);
  const stableOptimizationScore = clamp01(input.stableOptimizationScore, 0.5);
  const qualityScore = clamp01(input.qualityScore, 0.5);
  const feedbackScore = clampSigned(input.feedbackScore, 0);
  const behaviorScore = clampSigned(input.behaviorScore, 0);
  const hitCount = Math.max(0, Math.round(Number(input.hitCount ?? 0) || 0));
  const baseScore = calculateLifecycleScore(input);
  const newKnowledge = createdAgeDays !== null
    && createdAgeDays <= 30
    && feedbackScore > -0.25
    && behaviorScore > -0.25;

  if (!hasMetricEvidence(input) && !newKnowledge) {
    return stageSignal("unknown", 0.5, 0.25);
  }

  let stage: KnowledgeLifecycleStage = "unknown";
  let adjustedScore = baseScore;

  if (
    input.lowQuality === true
    && (input.coldKnowledge === true || input.staleVersion === true || input.staleHighScore === true || input.decliningTrend === true)
  ) {
    stage = "archive_candidate";
    adjustedScore -= 0.12;
  } else if (
    (input.coldKnowledge === true && input.staleVersion === true)
    || (input.decliningTrend === true && qualityScore < 0.45 && (feedbackScore < -0.15 || behaviorScore < -0.15))
  ) {
    stage = "archive_candidate";
    adjustedScore -= 0.1;
  } else if (
    input.fastRising === true
    || (trendScore >= 0.68 && usageScore >= 0.25 && feedbackScore >= 0 && behaviorScore >= -0.1)
  ) {
    stage = "growing";
    adjustedScore += 0.05;
  } else if (
    input.evergreen === true
    || (stableOptimizationScore >= 0.74 && qualityScore >= 0.68 && feedbackScore >= 0 && behaviorScore >= 0)
  ) {
    stage = "stable";
    adjustedScore += 0.03;
  } else if (
    input.decliningTrend === true
    || (trendScore <= 0.42 && (feedbackScore < -0.12 || behaviorScore < -0.12 || usageScore < 0.12) && hitCount > 0)
  ) {
    stage = "declining";
    adjustedScore -= 0.06;
  } else if (input.staleHighScore === true) {
    stage = "declining";
    adjustedScore -= 0.04;
  } else if (newKnowledge) {
    stage = "new";
    adjustedScore += 0.02;
  } else {
    stage = "unknown";
  }

  return stageSignal(stage, round4(adjustedScore), confidenceFor(input, stage));
}
