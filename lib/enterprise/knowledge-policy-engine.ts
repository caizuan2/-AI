import "server-only";

import type {
  KnowledgePolicyDecision,
  KnowledgePolicyRiskLevel,
  KnowledgePolicySignal
} from "@/lib/enterprise/knowledge-policy-types";

export type KnowledgePolicyInput = {
  qualityScore?: number | null;
  feedbackScore?: number | null;
  behaviorScore?: number | null;
  optimizationScore?: number | null;
  stableOptimizationScore?: number | null;
  trendScore?: number | null;
  lifecycleScore?: number | null;
  lifecycleStage?: string | null;
  highValue?: boolean | null;
  lowQuality?: boolean | null;
  fastRising?: boolean | null;
  decliningTrend?: boolean | null;
  staleHighScore?: boolean | null;
  archiveCandidate?: boolean | null;
  duplicateLikely?: boolean | null;
  conflictLikely?: boolean | null;
  coldKnowledge?: boolean | null;
  confidence?: number | null;
  volatilityPenalty?: number | null;
  trustWeight?: number | null;
  scopeMissing?: boolean | null;
  crossAgentRisk?: boolean | null;
};

const DANGEROUS_AUTO_ACTIONS = ["auto_delete", "auto_archive", "auto_merge"];
const ALL_AUTO_ACTIONS = ["auto_boost", "auto_decay", ...DANGEROUS_AUTO_ACTIONS];

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

function normalizedSigned(value: unknown, fallback = 0.5) {
  const numeric = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  if (numeric >= -1 && numeric <= 1) {
    return clamp01((numeric + 1) / 2, fallback);
  }

  return clamp01(numeric, fallback);
}

function hasEvidence(input: KnowledgePolicyInput) {
  return [
    input.qualityScore,
    input.feedbackScore,
    input.behaviorScore,
    input.optimizationScore,
    input.stableOptimizationScore,
    input.trendScore,
    input.lifecycleScore,
    input.confidence,
    input.volatilityPenalty,
    input.trustWeight
  ].some((value) => typeof value === "number" && Number.isFinite(value))
    || [
      input.highValue,
      input.lowQuality,
      input.fastRising,
      input.decliningTrend,
      input.staleHighScore,
      input.archiveCandidate,
      input.duplicateLikely,
      input.conflictLikely,
      input.coldKnowledge,
      input.scopeMissing,
      input.crossAgentRisk
    ].some(Boolean)
    || Boolean(input.lifecycleStage && input.lifecycleStage !== "unknown");
}

function inferConfidence(input: KnowledgePolicyInput) {
  if (typeof input.confidence === "number" && Number.isFinite(input.confidence)) {
    return round4(input.confidence);
  }

  const evidenceCount = [
    input.qualityScore,
    input.feedbackScore,
    input.behaviorScore,
    input.optimizationScore,
    input.stableOptimizationScore,
    input.trendScore,
    input.lifecycleScore
  ].filter((value) => typeof value === "number" && Number.isFinite(value)).length;
  let confidence = 0.22 + Math.min(evidenceCount, 7) * 0.08;

  confidence += clamp01(input.trustWeight, 0.5) * 0.12;

  if (input.fastRising || input.decliningTrend || input.staleHighScore || input.archiveCandidate) {
    confidence += 0.08;
  }

  if (!hasEvidence(input)) {
    return 0.25;
  }

  return round4(confidence);
}

export function calculatePolicyScore(input: KnowledgePolicyInput): number {
  const score = (
    (clamp01(input.stableOptimizationScore, 0.5) * 0.30)
    + (clamp01(input.lifecycleScore, 0.5) * 0.22)
    + (clamp01(input.trendScore, 0.5) * 0.18)
    + (clamp01(input.qualityScore, 0.5) * 0.12)
    + (normalizedSigned(input.feedbackScore, 0.5) * 0.08)
    + (normalizedSigned(input.behaviorScore, 0.5) * 0.07)
    + (clamp01(input.trustWeight, 0.5) * 0.03)
  );

  return round4(score);
}

export function calculatePolicyRiskLevel(input: KnowledgePolicyInput): KnowledgePolicyRiskLevel {
  const confidence = inferConfidence(input);
  const policyScore = calculatePolicyScore(input);
  const feedbackScore = clampSigned(input.feedbackScore, 0);
  const behaviorScore = clampSigned(input.behaviorScore, 0);
  const volatilityPenalty = clamp01(input.volatilityPenalty, 0);

  if (input.scopeMissing || input.crossAgentRisk) {
    return "critical";
  }

  if (input.conflictLikely && input.lowQuality && confidence < 0.45) {
    return "critical";
  }

  if (
    input.conflictLikely
    || input.staleHighScore
    || input.duplicateLikely
    || input.archiveCandidate
    || input.lifecycleStage === "archive_candidate"
    || (input.lifecycleStage === "declining" && (feedbackScore < -0.15 || behaviorScore < -0.15))
  ) {
    return "high";
  }

  if (
    confidence < 0.48
    || input.decliningTrend
    || input.lowQuality
    || input.coldKnowledge
    || volatilityPenalty >= 0.08
    || policyScore < 0.45
  ) {
    return "medium";
  }

  if (policyScore >= 0.65 && confidence >= 0.55) {
    return "low";
  }

  return hasEvidence(input) ? "medium" : "unknown";
}

function signal(
  decision: KnowledgePolicyDecision,
  input: KnowledgePolicyInput,
  overrides: Partial<Omit<KnowledgePolicySignal, "decision" | "policyScore" | "confidence" | "shadowMode">>
): KnowledgePolicySignal {
  const policyScore = calculatePolicyScore(input);
  const confidence = inferConfidence(input);
  const riskLevel = overrides.riskLevel ?? calculatePolicyRiskLevel(input);

  return {
    decision,
    riskLevel,
    policyScore,
    confidence,
    reason: overrides.reason ?? "policy_runtime_decision",
    suggestion: overrides.suggestion ?? "保持观察，继续收集使用反馈",
    allowedActions: overrides.allowedActions ?? [],
    blockedActions: overrides.blockedActions ?? DANGEROUS_AUTO_ACTIONS,
    requiresHumanReview: overrides.requiresHumanReview ?? (riskLevel === "high" || riskLevel === "critical"),
    shadowMode: true
  };
}

export function evaluateKnowledgePolicy(input: KnowledgePolicyInput): KnowledgePolicySignal {
  const riskLevel = calculatePolicyRiskLevel(input);
  const policyScore = calculatePolicyScore(input);
  const confidence = inferConfidence(input);
  const feedbackScore = clampSigned(input.feedbackScore, 0);
  const behaviorScore = clampSigned(input.behaviorScore, 0);
  const lifecycleStage = input.lifecycleStage ?? "unknown";

  if (!hasEvidence(input)) {
    return signal("monitor", input, {
      riskLevel: "unknown",
      reason: "insufficient_data",
      suggestion: "策略数据不足，继续观察",
      allowedActions: ["collect_more_feedback"],
      blockedActions: ALL_AUTO_ACTIONS,
      requiresHumanReview: false
    });
  }

  if (input.confidence === 0 && lifecycleStage === "unknown") {
    return signal("unknown", input, {
      riskLevel: "unknown",
      reason: "unknown_policy_state",
      suggestion: "策略数据不足",
      allowedActions: ["collect_more_feedback"],
      blockedActions: ALL_AUTO_ACTIONS,
      requiresHumanReview: false
    });
  }

  if (riskLevel === "critical") {
    return signal("blocked_auto_action", input, {
      riskLevel,
      reason: input.scopeMissing ? "scope_missing" : input.crossAgentRisk ? "cross_agent_risk" : "critical_policy_risk",
      suggestion: "策略风险过高，禁止自动处理",
      allowedActions: [],
      blockedActions: ALL_AUTO_ACTIONS,
      requiresHumanReview: true
    });
  }

  if (input.duplicateLikely) {
    return signal("merge_candidate", input, {
      riskLevel,
      reason: "duplicate_likely",
      suggestion: "建议人工合并重复知识",
      allowedActions: ["manual_merge_review"],
      blockedActions: ["auto_merge", "auto_delete", "auto_archive"],
      requiresHumanReview: true
    });
  }

  if (
    input.archiveCandidate
    || lifecycleStage === "archive_candidate"
    || (input.lowQuality && input.coldKnowledge)
  ) {
    return signal("archive_candidate", input, {
      riskLevel,
      reason: "archive_candidate_review_only",
      suggestion: "归档候选，仅建议人工复核，不自动归档",
      allowedActions: ["manual_archive_review"],
      blockedActions: ["auto_delete", "auto_archive", "auto_merge"],
      requiresHumanReview: true
    });
  }

  if (
    input.conflictLikely
    || input.staleHighScore
    || (lifecycleStage === "declining" && (feedbackScore < -0.1 || behaviorScore < -0.1))
  ) {
    return signal("review_required", input, {
      riskLevel: riskLevel === "low" ? "medium" : riskLevel,
      reason: input.conflictLikely ? "conflict_likely" : input.staleHighScore ? "stale_high_score" : "declining_with_negative_signals",
      suggestion: "需要人工复核，避免错误知识继续影响回答",
      allowedActions: ["manual_review"],
      blockedActions: ["auto_boost", "auto_delete", "auto_archive", "auto_merge"],
      requiresHumanReview: true
    });
  }

  if (
    input.decliningTrend
    || lifecycleStage === "declining"
    || clamp01(input.trendScore, 0.5) <= 0.38
    || feedbackScore < -0.25
    || behaviorScore < -0.25
  ) {
    return signal("decay", input, {
      riskLevel: riskLevel === "low" ? "medium" : riskLevel,
      reason: "declining_policy_signal",
      suggestion: "知识表现下降，建议轻微降低检索权重",
      allowedActions: ["ranking_decay"],
      blockedActions: DANGEROUS_AUTO_ACTIONS,
      requiresHumanReview: false
    });
  }

  if (
    confidence < 0.42
    || lifecycleStage === "unknown"
    || riskLevel === "unknown"
  ) {
    return signal("monitor", input, {
      riskLevel,
      reason: "low_confidence_or_unknown_lifecycle",
      suggestion: "数据不足，继续收集使用反馈",
      allowedActions: ["collect_more_feedback"],
      blockedActions: ALL_AUTO_ACTIONS,
      requiresHumanReview: false
    });
  }

  if (
    input.highValue
    && clamp01(input.stableOptimizationScore, 0.5) >= 0.72
    && clamp01(input.trendScore, 0.5) >= 0.62
    && (lifecycleStage === "growing" || lifecycleStage === "stable")
    && confidence >= 0.55
    && riskLevel === "low"
  ) {
    return signal("boost", input, {
      riskLevel,
      reason: "stable_high_value_growth",
      suggestion: "该知识表现稳定且持续上升，可提高检索优先级",
      allowedActions: ["ranking_boost"],
      blockedActions: ["auto_delete", "auto_archive"],
      requiresHumanReview: false
    });
  }

  if (
    lifecycleStage === "stable"
    && policyScore >= 0.56
    && riskLevel !== "high"
  ) {
    return signal("keep", input, {
      riskLevel,
      reason: "stable_policy_state",
      suggestion: "保持当前权重，继续观察",
      allowedActions: ["keep_current_weight"],
      blockedActions: DANGEROUS_AUTO_ACTIONS,
      requiresHumanReview: false
    });
  }

  return signal("monitor", input, {
    riskLevel,
    reason: "default_monitor_policy",
    suggestion: "保持观察，继续收集使用反馈",
    allowedActions: ["collect_more_feedback"],
    blockedActions: DANGEROUS_AUTO_ACTIONS,
    requiresHumanReview: false
  });
}
