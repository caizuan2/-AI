import "server-only";

import { Prisma } from "@prisma/client";
import { AnalyticsEventType, recordAnalyticsEvent } from "@/lib/analytics";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { ResolvedKnowledgeAccessScope } from "@/lib/enterprise/knowledge-access-scope";
import { calculateBehaviorDecayWeight, calculateFeedbackDecayWeight } from "@/lib/enterprise/knowledge-feedback-decay";
import { calculateFreshnessScore } from "@/lib/enterprise/knowledge-feedback-ranking";
import { calculateBehaviorScoreSignal } from "@/lib/enterprise/knowledge-behavior-calibration";
import type { KnowledgeBehaviorSignalInput } from "@/lib/enterprise/knowledge-behavior-types";
import { calculateFeedbackTrustWeight } from "@/lib/enterprise/knowledge-anti-gaming";
import { buildStabilityDiagnostics } from "@/lib/enterprise/knowledge-stability-engine";
import { smoothScore, smoothSignedScore } from "@/lib/enterprise/knowledge-score-smoothing";
import { buildTrendDiagnosticsFromMetadata } from "@/lib/enterprise/knowledge-trend-learning-engine";
import type { KnowledgeTrendDiagnostics, KnowledgeTrendLabel } from "@/lib/enterprise/knowledge-trend-types";
import { classifyKnowledgeLifecycle } from "@/lib/enterprise/knowledge-lifecycle-engine";
import type { KnowledgeLifecycleSignal, KnowledgeLifecycleStage } from "@/lib/enterprise/knowledge-lifecycle-types";
import { evaluateKnowledgePolicy } from "@/lib/enterprise/knowledge-policy-engine";
import type { KnowledgePolicyDecision, KnowledgePolicyRiskLevel, KnowledgePolicySignal } from "@/lib/enterprise/knowledge-policy-types";

export const DEFAULT_KNOWLEDGE_VERSION = "v1";
export const LOW_QUALITY_THRESHOLD = 0.45;
export const HIGH_VALUE_THRESHOLD = 0.75;

export interface KnowledgeScoreInput {
  relevance?: number | null;
  usage?: number | null;
  feedback?: number | null;
  freshness?: number | null;
}

export interface KnowledgeGovernanceInput extends KnowledgeScoreInput {
  version?: string | number | null;
  sourceType?: string | null;
  ingestTimestamp?: string | Date | null;
  contentHash?: string | null;
}

export interface KnowledgeGovernanceControls {
  minQualityScore?: number | null;
  knowledgeVersion?: string | number | null;
  includeLowQuality?: boolean;
}

export interface KnowledgeGovernanceState {
  version: string;
  versionId: string | null;
  qualityScore: number;
  qualityComponents: Required<KnowledgeScoreInput>;
  feedbackScore: number;
  behaviorScore: number;
  behaviorEventCount: number;
  behaviorReasons: string[];
  stabilityScore: number;
  confidenceWeight: number;
  trustWeight: number;
  volatilityPenalty: number;
  stableOptimizationScore: number;
  sampleCount: number;
  positiveCount: number;
  negativeCount: number;
  uniqueUserCount: number;
  suspectedGaming: boolean;
  trendScore: number;
  trendLabel: KnowledgeTrendLabel;
  trendConfidence: number;
  staleRisk: number;
  fastRising: boolean;
  staleHighScore: boolean;
  decliningTrend: boolean;
  evergreen: boolean;
  trendReason: string;
  trendShadowMode: boolean;
  lifecycleStage: KnowledgeLifecycleStage;
  lifecycleScore: number;
  lifecycleConfidence: number;
  lifecycleReason: string;
  lifecycleSuggestion: string;
  shouldBoost: boolean;
  shouldDecay: boolean;
  shouldReview: boolean;
  shouldArchiveCandidate: boolean;
  policyDecision: KnowledgePolicyDecision;
  policyScore: number;
  policyRiskLevel: KnowledgePolicyRiskLevel;
  policyConfidence: number;
  policyReason: string;
  policySuggestion: string;
  policyAllowedActions: string[];
  policyBlockedActions: string[];
  policyRequiresHumanReview: boolean;
  policyShadowMode: boolean;
  usageScore: number;
  sourceType: string;
  ingestTimestamp: string;
  lowQuality: boolean;
  highValue: boolean;
  recommendedAction: "active" | "review";
}

export interface GovernanceHitResult {
  chunkId: string;
  knowledgeItemId: string;
  score?: number | null;
  qualityScore?: number | null;
  knowledgeVersion?: string | null;
  lowQuality?: boolean | null;
}

function clamp01(value: unknown, fallback = 0) {
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

function roundSigned4(value: number) {
  return Math.round(clampSigned(value) * 10000) / 10000;
}

function normalizeVersion(value: string | number | null | undefined) {
  const text = typeof value === "number" ? `v${Math.max(1, Math.round(value))}` : String(value ?? "").trim();

  return text || DEFAULT_KNOWLEDGE_VERSION;
}

function normalizeTimestamp(value: string | Date | null | undefined) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  const text = typeof value === "string" ? value.trim() : "";
  const date = text ? new Date(text) : new Date();

  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function trendFields(trend: KnowledgeTrendDiagnostics) {
  return {
    trendScore: trend.trendScore,
    trendLabel: trend.trendLabel,
    trendConfidence: trend.confidence,
    staleRisk: trend.staleRisk,
    fastRising: trend.fastRising,
    staleHighScore: trend.staleHighScore,
    decliningTrend: trend.decliningTrend,
    evergreen: trend.evergreen,
    trendReason: trend.trendReason,
    trendShadowMode: trend.shadowMode
  };
}

function trendState(trend: KnowledgeTrendDiagnostics) {
  return {
    ...trendFields(trend),
    usageDelta: trend.usageDelta,
    feedbackDelta: trend.feedbackDelta,
    behaviorDelta: trend.behaviorDelta,
    freshnessDelta: trend.freshnessDelta,
    usage7d: trend.usage7d,
    usage30d: trend.usage30d,
    feedback7d: trend.feedback7d,
    feedback30d: trend.feedback30d,
    behavior7d: trend.behavior7d,
    behavior30d: trend.behavior30d
  };
}

function withTrendDiagnostics<T extends Record<string, unknown>>(
  governance: T,
  trend: KnowledgeTrendDiagnostics
) {
  return {
    ...governance,
    ...trendFields(trend),
    trend: trendState(trend)
  };
}

function lifecycleFields(lifecycle: KnowledgeLifecycleSignal) {
  return {
    lifecycleStage: lifecycle.lifecycleStage,
    lifecycleScore: lifecycle.lifecycleScore,
    lifecycleConfidence: lifecycle.lifecycleConfidence,
    lifecycleReason: lifecycle.lifecycleReason,
    lifecycleSuggestion: lifecycle.lifecycleSuggestion,
    shouldBoost: lifecycle.shouldBoost,
    shouldDecay: lifecycle.shouldDecay,
    shouldReview: lifecycle.shouldReview,
    shouldArchiveCandidate: lifecycle.shouldArchiveCandidate
  };
}

function lifecycleState(lifecycle: KnowledgeLifecycleSignal) {
  return lifecycleFields(lifecycle);
}

function withLifecycleDiagnostics<T extends Record<string, unknown>>(
  governance: T,
  lifecycle: KnowledgeLifecycleSignal
) {
  return {
    ...governance,
    ...lifecycleFields(lifecycle),
    lifecycle: lifecycleState(lifecycle)
  };
}

function policyFields(policy: KnowledgePolicySignal) {
  return {
    policyDecision: policy.decision,
    policyScore: policy.policyScore,
    policyRiskLevel: policy.riskLevel,
    policyConfidence: policy.confidence,
    policyReason: policy.reason,
    policySuggestion: policy.suggestion,
    policyAllowedActions: policy.allowedActions,
    policyBlockedActions: policy.blockedActions,
    policyRequiresHumanReview: policy.requiresHumanReview,
    policyShadowMode: policy.shadowMode
  };
}

function policyState(policy: KnowledgePolicySignal) {
  return policyFields(policy);
}

function withPolicyDiagnostics<T extends Record<string, unknown>>(
  governance: T,
  policy: KnowledgePolicySignal
) {
  return {
    ...governance,
    ...policyFields(policy),
    policy: policyState(policy)
  };
}

function boolFromRecords(records: Record<string, unknown>[], keys: string[]) {
  return records.some((record) => keys.some((key) => {
    const value = record[key];

    return value === true || value === "true" || value === 1 || value === "1";
  }));
}

export function buildPolicyDiagnostics(input: {
  metadata?: unknown;
  qualityScore?: number | null;
  feedbackScore?: number | null;
  behaviorScore?: number | null;
  optimizationScore?: number | null;
  stableOptimizationScore?: number | null;
  trend?: Partial<KnowledgeTrendDiagnostics> | null;
  lifecycle?: Partial<KnowledgeLifecycleSignal> | null;
  highValue?: boolean | null;
  lowQuality?: boolean | null;
  duplicateLikely?: boolean | null;
  conflictLikely?: boolean | null;
  coldKnowledge?: boolean | null;
  confidence?: number | null;
  volatilityPenalty?: number | null;
  trustWeight?: number | null;
  scopeMissing?: boolean | null;
  crossAgentRisk?: boolean | null;
}) {
  const record = readRecord(input.metadata);
  const governance = readRecord(record.governance);
  const optimization = readRecord(governance.optimization);
  const trend = input.trend ?? {};
  const lifecycle = input.lifecycle ?? {};

  return evaluateKnowledgePolicy({
    qualityScore: input.qualityScore ?? governance.qualityScore as number | null | undefined ?? record.qualityScore as number | null | undefined,
    feedbackScore: input.feedbackScore ?? governance.feedbackScore as number | null | undefined ?? record.feedbackScore as number | null | undefined,
    behaviorScore: input.behaviorScore ?? governance.behaviorScore as number | null | undefined ?? record.behaviorScore as number | null | undefined,
    optimizationScore: input.optimizationScore ?? governance.optimizationScore as number | null | undefined ?? optimization.optimizationScore as number | null | undefined,
    stableOptimizationScore: input.stableOptimizationScore ?? governance.stableOptimizationScore as number | null | undefined ?? record.stableOptimizationScore as number | null | undefined,
    trendScore: trend.trendScore ?? governance.trendScore as number | null | undefined ?? record.trendScore as number | null | undefined,
    lifecycleScore: lifecycle.lifecycleScore ?? governance.lifecycleScore as number | null | undefined ?? record.lifecycleScore as number | null | undefined,
    lifecycleStage: lifecycle.lifecycleStage ?? governance.lifecycleStage as string | null | undefined ?? record.lifecycleStage as string | null | undefined,
    highValue: input.highValue ?? boolFromRecords([record, governance, optimization], ["highValue", "high_value"]),
    lowQuality: input.lowQuality ?? boolFromRecords([record, governance, optimization], ["lowQuality", "low_quality"]),
    fastRising: trend.fastRising ?? governance.fastRising as boolean | null | undefined ?? record.fastRising as boolean | null | undefined,
    decliningTrend: trend.decliningTrend ?? governance.decliningTrend as boolean | null | undefined ?? record.decliningTrend as boolean | null | undefined,
    staleHighScore: trend.staleHighScore ?? governance.staleHighScore as boolean | null | undefined ?? record.staleHighScore as boolean | null | undefined,
    archiveCandidate: input.lifecycle?.shouldArchiveCandidate
      ?? boolFromRecords([record, governance, optimization], ["archiveCandidate", "archive_candidate", "shouldArchiveCandidate"]),
    duplicateLikely: input.duplicateLikely ?? boolFromRecords([record, governance, optimization], ["duplicateLikely", "duplicate_likely"]),
    conflictLikely: input.conflictLikely ?? boolFromRecords([record, governance, optimization], ["conflictLikely", "conflict_likely", "markedConflict"]),
    coldKnowledge: input.coldKnowledge ?? boolFromRecords([record, governance, optimization], ["coldKnowledge", "cold_knowledge"]),
    confidence: input.confidence ?? lifecycle.lifecycleConfidence as number | null | undefined ?? trend.confidence as number | null | undefined ?? governance.confidenceWeight as number | null | undefined,
    volatilityPenalty: input.volatilityPenalty ?? governance.volatilityPenalty as number | null | undefined,
    trustWeight: input.trustWeight ?? governance.trustWeight as number | null | undefined,
    scopeMissing: input.scopeMissing,
    crossAgentRisk: input.crossAgentRisk
  });
}

export function calculatePolicyMetadata(input: Parameters<typeof buildPolicyDiagnostics>[0]) {
  return policyFields(buildPolicyDiagnostics(input));
}

export function applyPolicyRankingAdjustment(score: number, policy: KnowledgePolicySignal) {
  const baseScore = clamp01(score, 0);
  const blendedScore = clamp01((baseScore * 0.96) + (policy.policyScore * 0.04), baseScore);
  const adjusted = policy.decision === "boost"
    ? blendedScore + 0.035
    : policy.decision === "decay"
      ? blendedScore - 0.035
      : policy.decision === "review_required"
        ? blendedScore - 0.07
        : policy.decision === "merge_candidate"
          ? blendedScore - 0.04
          : policy.decision === "archive_candidate"
            ? blendedScore * 0.66
            : policy.decision === "blocked_auto_action"
              ? blendedScore * 0.88
              : policy.decision === "monitor"
                ? blendedScore * 0.98
                : blendedScore;

  return round4(adjusted);
}

function buildLifecycleDiagnostics(input: {
  metadata?: unknown;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
  usageScore?: number | null;
  feedbackScore?: number | null;
  behaviorScore?: number | null;
  trend: KnowledgeTrendDiagnostics;
  stableOptimizationScore?: number | null;
  qualityScore?: number | null;
  freshnessScore?: number | null;
  hitCount?: number | null;
  lowQuality?: boolean | null;
  highValue?: boolean | null;
  coldKnowledge?: boolean | null;
  staleVersion?: boolean | null;
}) {
  const record = readRecord(input.metadata);
  const governance = readRecord(record.governance);
  const optimization = readRecord(governance.optimization);

  return classifyKnowledgeLifecycle({
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    usageScore: input.usageScore,
    feedbackScore: input.feedbackScore,
    behaviorScore: input.behaviorScore,
    trendScore: input.trend.trendScore,
    stableOptimizationScore: input.stableOptimizationScore,
    qualityScore: input.qualityScore,
    freshnessScore: input.freshnessScore,
    hitCount: input.hitCount ?? governance.hitCount as number | null | undefined,
    fastRising: input.trend.fastRising,
    staleHighScore: input.trend.staleHighScore,
    decliningTrend: input.trend.decliningTrend,
    evergreen: input.trend.evergreen,
    lowQuality: input.lowQuality,
    highValue: input.highValue,
    coldKnowledge: input.coldKnowledge ?? optimization.coldKnowledge as boolean | null | undefined,
    staleVersion: input.staleVersion
  });
}

export function calculateKnowledgeScore(input: KnowledgeScoreInput = {}) {
  const components = {
    relevance: clamp01(input.relevance, 0.72),
    usage: clamp01(input.usage, 0),
    feedback: clamp01(input.feedback, 0.5),
    freshness: clamp01(input.freshness, 1)
  };
  const score = round4(
    (components.relevance * 0.4)
    + (components.usage * 0.2)
    + (components.feedback * 0.2)
    + (components.freshness * 0.2)
  );

  return {
    score,
    components
  };
}

export function buildKnowledgeGovernanceMetadata(input: KnowledgeGovernanceInput = {}): KnowledgeGovernanceState {
  const { score, components } = calculateKnowledgeScore(input);
  const lowQuality = score < LOW_QUALITY_THRESHOLD;

  return {
    version: normalizeVersion(input.version),
    versionId: typeof input.contentHash === "string" && input.contentHash.trim() ? input.contentHash.trim() : null,
    qualityScore: score,
    qualityComponents: components,
    feedbackScore: 0,
    behaviorScore: 0,
    behaviorEventCount: 0,
    behaviorReasons: [],
    stabilityScore: 0.5,
    confidenceWeight: 0.25,
    trustWeight: 1,
    volatilityPenalty: 0,
    stableOptimizationScore: score,
    sampleCount: 0,
    positiveCount: 0,
    negativeCount: 0,
    uniqueUserCount: 0,
    suspectedGaming: false,
    trendScore: 0.5,
    trendLabel: "neutral",
    trendConfidence: 0.25,
    staleRisk: 0,
    fastRising: false,
    staleHighScore: false,
    decliningTrend: false,
    evergreen: false,
    trendReason: "neutral_or_shadow_trend",
    trendShadowMode: true,
    lifecycleStage: "unknown",
    lifecycleScore: 0.5,
    lifecycleConfidence: 0.25,
    lifecycleReason: "insufficient_data",
    lifecycleSuggestion: "等待更多使用数据",
    shouldBoost: false,
    shouldDecay: false,
    shouldReview: false,
    shouldArchiveCandidate: false,
    policyDecision: "monitor",
    policyScore: 0.5,
    policyRiskLevel: "unknown",
    policyConfidence: 0.25,
    policyReason: "insufficient_data",
    policySuggestion: "策略数据不足，继续观察",
    policyAllowedActions: ["collect_more_feedback"],
    policyBlockedActions: ["auto_boost", "auto_decay", "auto_delete", "auto_archive", "auto_merge"],
    policyRequiresHumanReview: false,
    policyShadowMode: true,
    usageScore: components.usage,
    sourceType: typeof input.sourceType === "string" && input.sourceType.trim() ? input.sourceType.trim() : "admin_ingest",
    ingestTimestamp: normalizeTimestamp(input.ingestTimestamp),
    lowQuality,
    highValue: false,
    recommendedAction: lowQuality ? "review" : "active"
  };
}

export function mergeKnowledgeGovernanceMetadata(
  metadata: unknown,
  input: KnowledgeGovernanceInput = {}
): Prisma.InputJsonObject {
  const base = JSON.parse(JSON.stringify(readRecord(metadata))) as Record<string, unknown>;
  const existingGovernance = readRecord(base.governance);
  const existingComponents = readRecord(existingGovernance.qualityComponents);
  const governance = buildKnowledgeGovernanceMetadata({
    version: input.version ?? existingGovernance.version as string | number | null | undefined,
    sourceType: input.sourceType ?? existingGovernance.sourceType as string | null | undefined,
    ingestTimestamp: input.ingestTimestamp ?? existingGovernance.ingestTimestamp as string | null | undefined,
    contentHash: input.contentHash ?? existingGovernance.versionId as string | null | undefined,
    relevance: input.relevance ?? existingComponents.relevance as number | undefined,
    usage: input.usage ?? existingComponents.usage as number | undefined,
    feedback: input.feedback ?? existingComponents.feedback as number | undefined,
    freshness: input.freshness ?? existingComponents.freshness as number | undefined
  });
  const behaviorScore = typeof existingGovernance.behaviorScore === "number" ? existingGovernance.behaviorScore : 0;
  const behaviorEventCount = typeof existingGovernance.behaviorEventCount === "number" ? existingGovernance.behaviorEventCount : 0;
  const behaviorReasons = Array.isArray(existingGovernance.behaviorReasons) ? existingGovernance.behaviorReasons : [];
  const existingStability = readRecord(existingGovernance.stability);
  const stabilityDiagnostics = buildStabilityDiagnostics({
    baseScore: governance.qualityScore,
    qualityScore: governance.qualityScore,
    feedbackScore: typeof existingGovernance.feedbackScore === "number" ? existingGovernance.feedbackScore : 0,
    behaviorScore,
    usageScore: typeof existingGovernance.usageScore === "number" ? existingGovernance.usageScore : governance.qualityComponents.usage,
    freshnessScore: governance.qualityComponents.freshness,
    optimizationScore: governance.qualityScore,
    sampleCount: typeof existingStability.sampleCount === "number" ? existingStability.sampleCount : 0,
    positiveCount: typeof existingStability.positiveCount === "number" ? existingStability.positiveCount : 0,
    negativeCount: typeof existingStability.negativeCount === "number" ? existingStability.negativeCount : 0,
    uniqueUserCount: typeof existingStability.uniqueUserCount === "number" ? existingStability.uniqueUserCount : 0,
    trustWeight: typeof existingStability.trustWeight === "number" ? existingStability.trustWeight : 1
  });
  const nextGovernance = {
    ...governance,
    feedbackScore: typeof existingGovernance.feedbackScore === "number" ? existingGovernance.feedbackScore : 0,
    behaviorScore,
    behaviorEventCount,
    behaviorReasons,
    ...stabilityDiagnostics,
    usageScore: typeof existingGovernance.usageScore === "number" ? existingGovernance.usageScore : governance.qualityComponents.usage,
    highValue: typeof existingGovernance.highValue === "boolean" ? existingGovernance.highValue : false,
    behavior: readRecord(existingGovernance.behavior),
    stability: stabilityDiagnostics
  };
  const trendDiagnostics = buildTrendDiagnosticsFromMetadata({
    ...base,
    governance: nextGovernance
  }, {
    stableOptimizationScore: stabilityDiagnostics.stableOptimizationScore,
    freshnessScore: governance.qualityComponents.freshness,
    feedbackScore: nextGovernance.feedbackScore,
    behaviorScore,
    usageScore: nextGovernance.usageScore,
    createdAt: governance.ingestTimestamp,
    updatedAt: governance.ingestTimestamp,
    volatilityPenalty: stabilityDiagnostics.volatilityPenalty
  });
  const nextGovernanceWithTrend = withTrendDiagnostics(nextGovernance, trendDiagnostics);
  const lifecycleDiagnostics = buildLifecycleDiagnostics({
    metadata: {
      ...base,
      governance: nextGovernanceWithTrend
    },
    createdAt: governance.ingestTimestamp,
    updatedAt: governance.ingestTimestamp,
    usageScore: nextGovernance.usageScore,
    feedbackScore: nextGovernance.feedbackScore,
    behaviorScore,
    trend: trendDiagnostics,
    stableOptimizationScore: stabilityDiagnostics.stableOptimizationScore,
    qualityScore: governance.qualityScore,
    freshnessScore: governance.qualityComponents.freshness,
    lowQuality: governance.lowQuality,
    highValue: nextGovernance.highValue,
    staleVersion: governance.recommendedAction === "review"
  });
  const nextGovernanceWithLifecycle = withLifecycleDiagnostics(nextGovernanceWithTrend, lifecycleDiagnostics);
  const policyDiagnostics = buildPolicyDiagnostics({
    metadata: {
      ...base,
      governance: nextGovernanceWithLifecycle
    },
    qualityScore: governance.qualityScore,
    feedbackScore: nextGovernance.feedbackScore,
    behaviorScore,
    optimizationScore: governance.qualityScore,
    stableOptimizationScore: stabilityDiagnostics.stableOptimizationScore,
    trend: trendDiagnostics,
    lifecycle: lifecycleDiagnostics,
    highValue: nextGovernance.highValue,
    lowQuality: governance.lowQuality,
    confidence: lifecycleDiagnostics.lifecycleConfidence,
    volatilityPenalty: stabilityDiagnostics.volatilityPenalty,
    trustWeight: stabilityDiagnostics.trustWeight
  });
  const nextGovernanceWithPolicy = withPolicyDiagnostics(nextGovernanceWithLifecycle, policyDiagnostics);

  return {
    ...base,
    version: governance.version,
    knowledgeVersion: governance.version,
    qualityScore: governance.qualityScore,
    feedbackScore: nextGovernance.feedbackScore,
    behaviorScore,
    behaviorEventCount,
    behaviorReasons,
    stabilityScore: stabilityDiagnostics.stabilityScore,
    confidenceWeight: stabilityDiagnostics.confidenceWeight,
    trustWeight: stabilityDiagnostics.trustWeight,
    volatilityPenalty: stabilityDiagnostics.volatilityPenalty,
    stableOptimizationScore: stabilityDiagnostics.stableOptimizationScore,
    sampleCount: stabilityDiagnostics.sampleCount,
    positiveCount: stabilityDiagnostics.positiveCount,
    negativeCount: stabilityDiagnostics.negativeCount,
    uniqueUserCount: stabilityDiagnostics.uniqueUserCount,
    suspectedGaming: stabilityDiagnostics.suspectedGaming,
    ...trendFields(trendDiagnostics),
    ...lifecycleFields(lifecycleDiagnostics),
    ...policyFields(policyDiagnostics),
    usageScore: nextGovernance.usageScore,
    sourceType: governance.sourceType,
    ingestTimestamp: governance.ingestTimestamp,
    lowQuality: governance.lowQuality,
    highValue: nextGovernance.highValue,
    high_value: nextGovernance.highValue,
    low_quality: governance.lowQuality,
    recommendedAction: governance.recommendedAction,
    governance: nextGovernanceWithPolicy as unknown as Prisma.InputJsonObject
  };
}

export function readKnowledgeGovernanceMetadata(metadata: unknown): KnowledgeGovernanceState | null {
  const record = readRecord(metadata);
  const governance = readRecord(record.governance);
  const rawQualityScore = governance.qualityScore ?? record.qualityScore;
  const rawVersion = governance.version ?? record.knowledgeVersion ?? record.version;

  if (rawQualityScore === undefined && rawVersion === undefined && record.lowQuality === undefined) {
    return null;
  }

  const qualityScore = clamp01(rawQualityScore, 1);
  const qualityComponents = readRecord(governance.qualityComponents);
  const feedbackScore = clampSigned(governance.feedbackScore ?? record.feedbackScore, 0);
  const behaviorState = readRecord(governance.behavior);
  const behaviorScore = clampSigned(governance.behaviorScore ?? behaviorState.behaviorScore ?? record.behaviorScore, 0);
  const behaviorEventCount = Math.max(0, Math.round(Number(governance.behaviorEventCount ?? behaviorState.eventCount ?? record.behaviorEventCount ?? 0) || 0));
  const behaviorReasons = Array.isArray(governance.behaviorReasons)
    ? governance.behaviorReasons.map(String).filter(Boolean).slice(0, 8)
    : Array.isArray(behaviorState.reasons)
      ? behaviorState.reasons.map(String).filter(Boolean).slice(0, 8)
      : [];
  const stabilityState = readRecord(governance.stability);
  const stabilityDiagnostics = buildStabilityDiagnostics({
    baseScore: qualityScore,
    qualityScore,
    feedbackScore,
    behaviorScore,
    usageScore: governance.usageScore as number | undefined,
    freshnessScore: readRecord(governance.qualityComponents).freshness as number | undefined,
    optimizationScore: stabilityState.stableOptimizationScore as number | undefined,
    sampleCount: stabilityState.sampleCount as number | undefined,
    positiveCount: stabilityState.positiveCount as number | undefined,
    negativeCount: stabilityState.negativeCount as number | undefined,
    uniqueUserCount: stabilityState.uniqueUserCount as number | undefined,
    trustWeight: stabilityState.trustWeight as number | undefined,
    recentScores: Array.isArray(stabilityState.recentScores) ? stabilityState.recentScores.map(Number).filter(Number.isFinite) : []
  });
  const usageScore = clamp01(governance.usageScore ?? record.usageScore ?? qualityComponents.usage, 0);
  const highValue = governance.highValue === true || record.highValue === true || record.high_value === true;
  const lowQuality = typeof governance.lowQuality === "boolean" ? governance.lowQuality : record.lowQuality === true;
  const ingestTimestamp = normalizeTimestamp(governance.ingestTimestamp as string | null | undefined ?? record.ingestTimestamp as string | null | undefined);
  const trendDiagnostics = buildTrendDiagnosticsFromMetadata(record, {
    stableOptimizationScore: stabilityDiagnostics.stableOptimizationScore,
    freshnessScore: clamp01(qualityComponents.freshness, 1),
    feedbackScore,
    behaviorScore,
    usageScore,
    createdAt: ingestTimestamp,
    updatedAt: governance.updatedAt as string | null | undefined ?? governance.ingestTimestamp as string | null | undefined,
    volatilityPenalty: stabilityDiagnostics.volatilityPenalty,
    staleVersion: governance.recommendedAction === "review" || record.recommendedAction === "review"
  });
  const lifecycleDiagnostics = buildLifecycleDiagnostics({
    metadata: record,
    createdAt: ingestTimestamp,
    updatedAt: governance.updatedAt as string | null | undefined ?? ingestTimestamp,
    usageScore,
    feedbackScore,
    behaviorScore,
    trend: trendDiagnostics,
    stableOptimizationScore: stabilityDiagnostics.stableOptimizationScore,
    qualityScore,
    freshnessScore: clamp01(qualityComponents.freshness, 1),
    lowQuality,
    highValue,
    staleVersion: governance.recommendedAction === "review" || record.recommendedAction === "review"
  });
  const policyDiagnostics = buildPolicyDiagnostics({
    metadata: record,
    qualityScore,
    feedbackScore,
    behaviorScore,
    optimizationScore: stabilityDiagnostics.stableOptimizationScore,
    stableOptimizationScore: stabilityDiagnostics.stableOptimizationScore,
    trend: trendDiagnostics,
    lifecycle: lifecycleDiagnostics,
    highValue,
    lowQuality,
    confidence: lifecycleDiagnostics.lifecycleConfidence,
    volatilityPenalty: stabilityDiagnostics.volatilityPenalty,
    trustWeight: stabilityDiagnostics.trustWeight
  });

  return {
    version: normalizeVersion(rawVersion as string | number | null | undefined),
    versionId: typeof governance.versionId === "string" ? governance.versionId : null,
    qualityScore,
    qualityComponents: {
      relevance: clamp01(qualityComponents.relevance, qualityScore),
      usage: usageScore,
      feedback: clamp01(qualityComponents.feedback, 0.5),
      freshness: clamp01(qualityComponents.freshness, 1)
    },
    feedbackScore,
    behaviorScore,
    behaviorEventCount,
    behaviorReasons,
    stabilityScore: stabilityDiagnostics.stabilityScore,
    confidenceWeight: stabilityDiagnostics.confidenceWeight,
    trustWeight: stabilityDiagnostics.trustWeight,
    volatilityPenalty: stabilityDiagnostics.volatilityPenalty,
    stableOptimizationScore: stabilityDiagnostics.stableOptimizationScore,
    sampleCount: stabilityDiagnostics.sampleCount,
    positiveCount: stabilityDiagnostics.positiveCount,
    negativeCount: stabilityDiagnostics.negativeCount,
    uniqueUserCount: stabilityDiagnostics.uniqueUserCount,
    suspectedGaming: stabilityDiagnostics.suspectedGaming,
    ...trendFields(trendDiagnostics),
    ...lifecycleFields(lifecycleDiagnostics),
    ...policyFields(policyDiagnostics),
    usageScore,
    sourceType: typeof governance.sourceType === "string" ? governance.sourceType : typeof record.sourceType === "string" ? record.sourceType : "unknown",
    ingestTimestamp,
    lowQuality,
    highValue,
    recommendedAction: governance.recommendedAction === "review" || record.recommendedAction === "review" ? "review" : "active"
  };
}

export type AnswerFeedbackRating = "up" | "down";

export interface AnswerFeedbackInput {
  userId?: string | null;
  feedbackId?: string | null;
  messageId: string;
  agentId?: string | null;
  knowledgeBaseId?: string | null;
  namespace?: string | null;
  tenantId?: string | null;
  chunkIds?: string[];
  evidenceIds?: string[];
  rating: AnswerFeedbackRating;
  resolved?: boolean | null;
  question?: string | null;
  answerHash?: string | null;
  questionHash?: string | null;
  feedbackAt?: string | Date | null;
  source?: "admin_ingest" | "user_app" | string | null;
}

export function applyFeedbackDecay(input: {
  score: number;
  feedbackAt?: string | Date | null;
  now?: string | Date | null;
}) {
  return roundSigned4(input.score * calculateFeedbackDecayWeight({
    feedbackAt: input.feedbackAt,
    now: input.now
  }));
}

export function calculateFeedbackScore(input: {
  rating: AnswerFeedbackRating;
  resolved?: boolean | null;
  feedbackAt?: string | Date | null;
  now?: string | Date | null;
  decayWeight?: number | null;
}) {
  const ratingDelta = input.rating === "up" ? 0.05 : -0.1;
  const resolvedDelta = input.resolved === true ? 0.08 : input.resolved === false ? -0.08 : 0;
  const decayWeight = typeof input.decayWeight === "number"
    ? clamp01(input.decayWeight, 1)
    : calculateFeedbackDecayWeight({
      feedbackAt: input.feedbackAt,
      now: input.now
    });

  return roundSigned4((ratingDelta + resolvedDelta) * decayWeight);
}

export function updateScoreFromFeedback(currentFeedbackScore: unknown, scoreDelta: number) {
  return roundSigned4(clampSigned(currentFeedbackScore, 0) + scoreDelta);
}

export function calculateFeedbackComponent(input: {
  currentFeedbackComponent?: unknown;
  feedbackCount?: unknown;
  rating: AnswerFeedbackRating;
  resolved?: boolean | null;
}) {
  const count = Math.max(0, Math.round(Number(input.feedbackCount ?? 0) || 0));
  const current = clamp01(input.currentFeedbackComponent, 0.5);
  const signal = clamp01(
    (input.rating === "up" ? 0.78 : 0.22)
    + (input.resolved === true ? 0.16 : input.resolved === false ? -0.16 : 0),
    0.5
  );

  return round4(((current * count) + signal) / (count + 1));
}

export function buildChunkFeedbackSummary(input: {
  upCount?: unknown;
  downCount?: unknown;
  resolvedCount?: unknown;
  unresolvedCount?: unknown;
}) {
  const upCount = Math.max(0, Math.round(Number(input.upCount ?? 0) || 0));
  const downCount = Math.max(0, Math.round(Number(input.downCount ?? 0) || 0));
  const resolvedCount = Math.max(0, Math.round(Number(input.resolvedCount ?? 0) || 0));
  const unresolvedCount = Math.max(0, Math.round(Number(input.unresolvedCount ?? 0) || 0));
  const voteCount = upCount + downCount;
  const resolutionCount = resolvedCount + unresolvedCount;
  const ratingComponent = voteCount > 0 ? upCount / voteCount : 0.5;
  const resolutionComponent = resolutionCount > 0 ? resolvedCount / resolutionCount : 0.5;
  const feedbackComponent = round4((ratingComponent * 0.7) + (resolutionComponent * 0.3));
  const downvoteRate = voteCount > 0 ? round4(downCount / voteCount) : 0;

  return {
    feedbackComponent,
    downvoteRate,
    voteCount,
    resolutionCount,
    upCount,
    downCount,
    resolvedCount,
    unresolvedCount
  };
}

function feedbackSignalKey(input: { messageId?: string | null; userId?: string | null }) {
  const messageId = typeof input.messageId === "string" ? input.messageId.trim() : "";
  const userId = typeof input.userId === "string" ? input.userId.trim() : "anonymous";

  return messageId ? `${userId || "anonymous"}:${messageId}` : null;
}

function limitRecordEntries(record: Record<string, unknown>, maxEntries = 120) {
  const entries = Object.entries(record);

  if (entries.length <= maxEntries) {
    return record;
  }

  return Object.fromEntries(entries.slice(entries.length - maxEntries));
}

function readSignalEntries(...states: Record<string, unknown>[]) {
  return states.flatMap((state) => Object.values(readRecord(state.messageSignals)).map(readRecord));
}

function countSignalsForUser(signals: Record<string, unknown>[], userId?: string | null) {
  const normalizedUserId = typeof userId === "string" && userId.trim() ? userId.trim() : "anonymous";

  return signals.filter((signal) => {
    const signalUserId = typeof signal.userId === "string" && signal.userId.trim() ? signal.userId.trim() : "anonymous";

    return signalUserId === normalizedUserId;
  }).length;
}

function readSignalScore(signal: Record<string, unknown>) {
  const value = typeof signal.scoreDelta === "number"
    ? signal.scoreDelta
    : typeof signal.behaviorScoreDelta === "number"
      ? signal.behaviorScoreDelta
      : null;

  return value === null ? null : clampSigned(value, 0);
}

function buildStabilitySignalStats(feedbackState: Record<string, unknown>, behaviorState: Record<string, unknown>) {
  const feedbackSignals = readSignalEntries(feedbackState);
  const behaviorSignals = readSignalEntries(behaviorState);
  const allSignals = [...feedbackSignals, ...behaviorSignals];
  const feedbackSignalScores = feedbackSignals.map(readSignalScore).filter((value): value is number => value !== null);
  const behaviorSignalScores = behaviorSignals.map(readSignalScore).filter((value): value is number => value !== null);
  const recentScores = [...feedbackSignalScores, ...behaviorSignalScores].slice(-16);
  const upCount = Math.max(0, Math.round(Number(feedbackState.upCount ?? 0) || 0));
  const downCount = Math.max(0, Math.round(Number(feedbackState.downCount ?? 0) || 0));
  const feedbackCount = Math.max(0, Math.round(Number(feedbackState.feedbackCount ?? 0) || 0));
  const behaviorEventCount = Math.max(0, Math.round(Number(behaviorState.eventCount ?? 0) || 0));
  const positiveCount = Math.max(
    upCount + behaviorSignalScores.filter((score) => score > 0).length,
    [...feedbackSignalScores, ...behaviorSignalScores].filter((score) => score > 0).length
  );
  const negativeCount = Math.max(
    downCount + behaviorSignalScores.filter((score) => score < 0).length,
    [...feedbackSignalScores, ...behaviorSignalScores].filter((score) => score < 0).length
  );
  const userIds = new Set(
    allSignals
      .map((signal) => typeof signal.userId === "string" && signal.userId.trim() ? signal.userId.trim() : null)
      .filter((value): value is string => Boolean(value))
  );
  const sampleCount = Math.max(feedbackCount + behaviorEventCount, allSignals.length, positiveCount + negativeCount);

  return {
    sampleCount,
    positiveCount,
    negativeCount,
    uniqueUserCount: userIds.size || (sampleCount > 0 ? 1 : 0),
    recentScores
  };
}

export function applyFeedbackToKnowledgeScore(metadata: unknown, input: {
  rating: AnswerFeedbackRating;
  resolved?: boolean | null;
  userId?: string | null;
  feedbackId?: string | null;
  messageId?: string | null;
  feedbackAt?: string | Date | null;
}) {
  const base = JSON.parse(JSON.stringify(readRecord(metadata))) as Record<string, unknown>;
  const existing = readKnowledgeGovernanceMetadata(base);
  const governance = readRecord(base.governance);
  const qualityComponents = existing?.qualityComponents ?? {
    relevance: clamp01(readRecord(governance.qualityComponents).relevance, 0.72),
    usage: clamp01(readRecord(governance.qualityComponents).usage, 0),
    feedback: clamp01(readRecord(governance.qualityComponents).feedback, 0.5),
    freshness: clamp01(readRecord(governance.qualityComponents).freshness, 1)
  };
  const feedbackState = readRecord(governance.feedback);
  const signalKey = feedbackSignalKey(input);
  const messageSignals = readRecord(feedbackState.messageSignals);
  const previousSignal = signalKey ? readRecord(messageSignals[signalKey]) : {};
  const previousRating = previousSignal.rating === "up" || previousSignal.rating === "down"
    ? previousSignal.rating
    : null;
  const previousResolved = typeof previousSignal.resolved === "boolean" ? previousSignal.resolved : null;
  const previousScoreDelta = typeof previousSignal.scoreDelta === "number" ? previousSignal.scoreDelta : 0;
  const feedbackAt = normalizeTimestamp(input.feedbackAt as string | Date | null | undefined);
  const decayWeight = calculateFeedbackDecayWeight({ feedbackAt });
  const scoreDelta = calculateFeedbackScore({
    rating: input.rating,
    resolved: input.resolved,
    feedbackAt,
    decayWeight
  });
  const existingFeedbackSignals = readSignalEntries(feedbackState);
  const trustWeight = calculateFeedbackTrustWeight({
    userId: input.userId,
    messageId: input.messageId,
    eventType: input.rating === "up" ? "feedback_up" : "feedback_down",
    repeatedCount: previousRating ? 2 : 1,
    recentEventCount: countSignalsForUser(existingFeedbackSignals, input.userId) + 1
  });
  const trustedScoreDelta = roundSigned4(scoreDelta * trustWeight);
  const feedbackCount = Math.max(0, Math.round(Number(feedbackState.feedbackCount ?? 0) || 0));
  const nextUpCount = Math.max(0, Math.round(Number(feedbackState.upCount ?? 0) || 0) - (previousRating === "up" ? 1 : 0)) + (input.rating === "up" ? 1 : 0);
  const nextDownCount = Math.max(0, Math.round(Number(feedbackState.downCount ?? 0) || 0) - (previousRating === "down" ? 1 : 0)) + (input.rating === "down" ? 1 : 0);
  const nextResolvedCount = Math.max(0, Math.round(Number(feedbackState.resolvedCount ?? 0) || 0) - (previousResolved === true ? 1 : 0)) + (input.resolved === true ? 1 : 0);
  const nextUnresolvedCount = Math.max(0, Math.round(Number(feedbackState.unresolvedCount ?? 0) || 0) - (previousResolved === false ? 1 : 0)) + (input.resolved === false ? 1 : 0);
  const nextFeedbackCount = Math.max(0, feedbackCount - (previousRating ? 1 : 0)) + 1;
  const currentFeedbackScore = clampSigned(existing?.feedbackScore ?? governance.feedbackScore, 0);
  const incomingFeedbackScore = clampSigned(currentFeedbackScore - previousScoreDelta + trustedScoreDelta, currentFeedbackScore);
  const nextFeedbackScore = roundSigned4(smoothSignedScore({
    previousScore: currentFeedbackScore,
    incomingScore: incomingFeedbackScore,
    alpha: Math.max(0.08, 0.25 * trustWeight)
  }));
  const nextUsageScore = round4(clamp01(existing?.usageScore ?? qualityComponents.usage, 0) + (previousRating ? 0 : 0.03));
  const feedbackSummary = buildChunkFeedbackSummary({
    upCount: nextUpCount,
    downCount: nextDownCount,
    resolvedCount: nextResolvedCount,
    unresolvedCount: nextUnresolvedCount
  });
  const nextFeedbackComponent = round4(smoothScore({
    previousScore: clamp01(qualityComponents.feedback, 0.5),
    incomingScore: feedbackSummary.feedbackComponent,
    alpha: Math.max(0.08, 0.25 * trustWeight)
  }));
  const { score, components } = calculateKnowledgeScore({
    relevance: qualityComponents.relevance,
    usage: nextUsageScore,
    feedback: nextFeedbackComponent,
    freshness: qualityComponents.freshness
  });
  const lowQuality = score < 0.4 || feedbackSummary.feedbackComponent < 0.4 || feedbackSummary.downvoteRate > 0.6;
  const highValue = feedbackSummary.feedbackComponent > HIGH_VALUE_THRESHOLD && nextUsageScore > 0.5;
  const nextMessageSignals = signalKey
    ? limitRecordEntries({
      ...messageSignals,
      [signalKey]: {
        userId: input.userId ?? null,
        feedbackId: input.feedbackId ?? null,
        messageId: input.messageId ?? null,
        rating: input.rating,
        resolved: input.resolved ?? null,
        scoreDelta: trustedScoreDelta,
        rawScoreDelta: scoreDelta,
        trustWeight,
        feedbackAt
      }
    })
    : messageSignals;
  const nextFeedbackState = {
    ...feedbackState,
    feedbackCount: nextFeedbackCount,
    upCount: nextUpCount,
    downCount: nextDownCount,
    resolvedCount: nextResolvedCount,
    unresolvedCount: nextUnresolvedCount,
    downvoteRate: feedbackSummary.downvoteRate,
    feedbackComponent: nextFeedbackComponent,
    lastRating: input.rating,
    lastResolved: input.resolved ?? null,
    lastFeedbackAt: feedbackAt,
    lastDecayWeight: decayWeight,
    lastTrustWeight: trustWeight,
    rawScoreDelta: scoreDelta,
    messageSignals: nextMessageSignals
  };
  const behaviorState = readRecord(governance.behavior);
  const stabilityStats = buildStabilitySignalStats(nextFeedbackState, behaviorState);
  const stabilityDiagnostics = buildStabilityDiagnostics({
    baseScore: score,
    qualityScore: score,
    feedbackScore: nextFeedbackScore,
    behaviorScore: clampSigned(existing?.behaviorScore ?? governance.behaviorScore, 0),
    usageScore: nextUsageScore,
    freshnessScore: components.freshness,
    optimizationScore: score,
    trustWeight,
    ...stabilityStats
  });
  const nextGovernance = {
    ...(existing ?? buildKnowledgeGovernanceMetadata({})),
    ...governance,
    qualityScore: score,
    qualityComponents: components,
    feedbackScore: nextFeedbackScore,
    usageScore: nextUsageScore,
    ...stabilityDiagnostics,
    lowQuality,
    highValue,
    recommendedAction: lowQuality ? "review" : "active",
    feedback: nextFeedbackState,
    stability: {
      ...stabilityDiagnostics,
      recentScores: stabilityStats.recentScores,
      lastUpdatedAt: feedbackAt
    }
  };
  const trendDiagnostics = buildTrendDiagnosticsFromMetadata({
    ...base,
    governance: nextGovernance
  }, {
    stableOptimizationScore: stabilityDiagnostics.stableOptimizationScore,
    freshnessScore: components.freshness,
    feedbackScore: nextFeedbackScore,
    behaviorScore: clampSigned(existing?.behaviorScore ?? governance.behaviorScore, 0),
    usageScore: nextUsageScore,
    createdAt: nextGovernance.ingestTimestamp as string | null | undefined,
    updatedAt: feedbackAt,
    volatilityPenalty: stabilityDiagnostics.volatilityPenalty,
    staleVersion: lowQuality
  });
  const nextGovernanceWithTrend = withTrendDiagnostics(nextGovernance, trendDiagnostics);
  const lifecycleDiagnostics = buildLifecycleDiagnostics({
    metadata: {
      ...base,
      governance: nextGovernanceWithTrend
    },
    createdAt: nextGovernance.ingestTimestamp as string | null | undefined,
    updatedAt: feedbackAt,
    usageScore: nextUsageScore,
    feedbackScore: nextFeedbackScore,
    behaviorScore: clampSigned(existing?.behaviorScore ?? governance.behaviorScore, 0),
    trend: trendDiagnostics,
    stableOptimizationScore: stabilityDiagnostics.stableOptimizationScore,
    qualityScore: score,
    freshnessScore: components.freshness,
    hitCount: stabilityDiagnostics.sampleCount,
    lowQuality,
    highValue,
    staleVersion: lowQuality
  });
  const nextGovernanceWithLifecycle = withLifecycleDiagnostics(nextGovernanceWithTrend, lifecycleDiagnostics);
  const policyDiagnostics = buildPolicyDiagnostics({
    metadata: {
      ...base,
      governance: nextGovernanceWithLifecycle
    },
    qualityScore: score,
    feedbackScore: nextFeedbackScore,
    behaviorScore: clampSigned(existing?.behaviorScore ?? governance.behaviorScore, 0),
    optimizationScore: score,
    stableOptimizationScore: stabilityDiagnostics.stableOptimizationScore,
    trend: trendDiagnostics,
    lifecycle: lifecycleDiagnostics,
    highValue,
    lowQuality,
    confidence: lifecycleDiagnostics.lifecycleConfidence,
    volatilityPenalty: stabilityDiagnostics.volatilityPenalty,
    trustWeight
  });
  const nextGovernanceWithPolicy = withPolicyDiagnostics(nextGovernanceWithLifecycle, policyDiagnostics);

  return {
    metadata: {
      ...base,
      qualityScore: score,
      feedbackScore: nextFeedbackScore,
      stabilityScore: stabilityDiagnostics.stabilityScore,
      confidenceWeight: stabilityDiagnostics.confidenceWeight,
      trustWeight,
      volatilityPenalty: stabilityDiagnostics.volatilityPenalty,
      stableOptimizationScore: stabilityDiagnostics.stableOptimizationScore,
      sampleCount: stabilityDiagnostics.sampleCount,
      positiveCount: stabilityDiagnostics.positiveCount,
      negativeCount: stabilityDiagnostics.negativeCount,
      uniqueUserCount: stabilityDiagnostics.uniqueUserCount,
      suspectedGaming: stabilityDiagnostics.suspectedGaming,
      ...trendFields(trendDiagnostics),
      ...lifecycleFields(lifecycleDiagnostics),
      ...policyFields(policyDiagnostics),
      usageScore: nextUsageScore,
      lowQuality,
      low_quality: lowQuality,
      highValue,
      high_value: highValue,
      recommendedAction: nextGovernance.recommendedAction,
      governance: nextGovernanceWithPolicy as unknown as Prisma.InputJsonObject
    } as Prisma.InputJsonObject,
    scoreDelta,
    previousScoreDelta,
    trustedScoreDelta,
    trustWeight,
    netScoreDelta: roundSigned4(trustedScoreDelta - previousScoreDelta),
    decayWeight,
    nextQualityScore: score,
    nextFeedbackScore,
    nextUsageScore,
    stabilityScore: stabilityDiagnostics.stabilityScore,
    confidenceWeight: stabilityDiagnostics.confidenceWeight,
    volatilityPenalty: stabilityDiagnostics.volatilityPenalty,
    stableOptimizationScore: stabilityDiagnostics.stableOptimizationScore,
    sampleCount: stabilityDiagnostics.sampleCount,
    suspectedGaming: stabilityDiagnostics.suspectedGaming,
    ...trendFields(trendDiagnostics),
    ...lifecycleFields(lifecycleDiagnostics),
    ...policyFields(policyDiagnostics),
    lowQuality,
    highValue
  };
}

function behaviorSignalKey(input: {
  eventType?: string | null;
  messageId?: string | null;
  userId?: string | null;
  source?: string | null;
}) {
  const eventType = typeof input.eventType === "string" ? input.eventType.trim() : "";
  const messageId = typeof input.messageId === "string" ? input.messageId.trim() : "";
  const userId = typeof input.userId === "string" && input.userId.trim() ? input.userId.trim() : "anonymous";
  const source = typeof input.source === "string" && input.source.trim() ? input.source.trim() : "admin_ingest";

  return eventType && messageId ? `${source}:${userId}:${messageId}:${eventType}` : null;
}

export function calculateBehaviorScore(currentBehaviorScore: unknown, behaviorScoreDelta: number) {
  return roundSigned4(clampSigned(currentBehaviorScore, 0) + behaviorScoreDelta);
}

export function buildBehaviorSummary(metadata: unknown) {
  const governance = readKnowledgeGovernanceMetadata(metadata);

  return {
    behaviorScore: governance?.behaviorScore ?? 0,
    behaviorEventCount: governance?.behaviorEventCount ?? 0,
    behaviorReasons: governance?.behaviorReasons ?? []
  };
}

export function applyBehaviorCalibration(metadata: unknown, input: KnowledgeBehaviorSignalInput) {
  const base = JSON.parse(JSON.stringify(readRecord(metadata))) as Record<string, unknown>;
  const existing = readKnowledgeGovernanceMetadata(base);
  const governance = readRecord(base.governance);
  const qualityComponents = existing?.qualityComponents ?? {
    relevance: clamp01(readRecord(governance.qualityComponents).relevance, 0.72),
    usage: clamp01(readRecord(governance.qualityComponents).usage, 0),
    feedback: clamp01(readRecord(governance.qualityComponents).feedback, 0.5),
    freshness: clamp01(readRecord(governance.qualityComponents).freshness, 1)
  };
  const behaviorState = readRecord(governance.behavior);
  const eventAt = normalizeTimestamp(input.eventAt as string | Date | null | undefined);
  const signal = calculateBehaviorScoreSignal(input);
  const decayWeight = calculateBehaviorDecayWeight({ eventAt });
  const behaviorScoreDelta = roundSigned4(signal.behaviorScoreDelta * decayWeight);
  const signalKey = behaviorSignalKey({
    eventType: input.eventType,
    messageId: input.messageId,
    userId: input.userId,
    source: input.source
  });
  const messageSignals = readRecord(behaviorState.messageSignals);
  const previousSignal = signalKey ? readRecord(messageSignals[signalKey]) : {};
  const previousScoreDelta = typeof previousSignal.scoreDelta === "number" ? previousSignal.scoreDelta : 0;
  const currentBehaviorScore = existing?.behaviorScore ?? governance.behaviorScore ?? behaviorState.behaviorScore ?? 0;
  const existingBehaviorSignals = readSignalEntries(behaviorState);
  const trustWeight = calculateFeedbackTrustWeight({
    userId: input.userId,
    messageId: input.messageId,
    eventType: input.eventType,
    repeatedCount: previousSignal.scoreDelta !== undefined ? 2 : 1,
    recentEventCount: countSignalsForUser(existingBehaviorSignals, input.userId) + 1
  });
  const trustedBehaviorScoreDelta = roundSigned4(behaviorScoreDelta * trustWeight);
  const currentBehaviorScoreClamped = clampSigned(currentBehaviorScore, 0);
  const incomingBehaviorScore = clampSigned(currentBehaviorScoreClamped - previousScoreDelta + trustedBehaviorScoreDelta, currentBehaviorScoreClamped);
  const nextBehaviorScore = roundSigned4(smoothSignedScore({
    previousScore: currentBehaviorScoreClamped,
    incomingScore: incomingBehaviorScore,
    alpha: Math.max(0.08, 0.25 * trustWeight)
  }));
  const previousReason = typeof previousSignal.reason === "string" ? previousSignal.reason : null;
  const reasonSet = new Set([
    ...(existing?.behaviorReasons ?? []),
    ...(Array.isArray(behaviorState.reasons) ? behaviorState.reasons.map(String) : [])
  ].filter(Boolean));

  if (previousReason && previousReason !== signal.reason) {
    reasonSet.delete(previousReason);
  }

  if (signal.reason) {
    reasonSet.add(signal.reason);
  }

  const behaviorReasons = Array.from(reasonSet).slice(-8);
  const eventCount = Math.max(0, Math.round(Number(behaviorState.eventCount ?? existing?.behaviorEventCount ?? 0) || 0));
  const nextEventCount = Math.max(0, eventCount - (previousSignal.scoreDelta !== undefined ? 1 : 0)) + 1;
  const nextUsageScore = round4(clamp01(existing?.usageScore ?? qualityComponents.usage, 0) + (input.eventType === "answer_view" ? 0.01 : input.eventType === "source_click" ? 0.02 : 0));
  const currentFeedbackComponent = clamp01(qualityComponents.feedback, 0.5);
  const nextFeedbackComponent = clamp01(currentFeedbackComponent + (nextBehaviorScore * 0.08), currentFeedbackComponent);
  const { score, components } = calculateKnowledgeScore({
    relevance: qualityComponents.relevance,
    usage: nextUsageScore,
    feedback: nextFeedbackComponent,
    freshness: qualityComponents.freshness
  });
  const lowQuality = score < LOW_QUALITY_THRESHOLD || nextBehaviorScore < -0.35;
  const highValue = (existing?.highValue ?? false) || (score > HIGH_VALUE_THRESHOLD && nextBehaviorScore > 0.25);
  const nextMessageSignals = signalKey
    ? limitRecordEntries({
      ...messageSignals,
      [signalKey]: {
        userId: input.userId ?? null,
        messageId: input.messageId ?? null,
        conversationId: input.conversationId ?? null,
        eventType: input.eventType,
        behaviorScoreDelta: trustedBehaviorScoreDelta,
        rawBehaviorScoreDelta: signal.behaviorScoreDelta,
        scoreDelta: trustedBehaviorScoreDelta,
        decayWeight,
        trustWeight,
        reason: signal.reason,
        eventAt
      }
    })
    : messageSignals;
  const nextBehaviorState = {
    ...behaviorState,
    behaviorScore: nextBehaviorScore,
    eventCount: nextEventCount,
    reasons: behaviorReasons,
    lastEventType: input.eventType,
    lastEventAt: eventAt,
    lastDelta: trustedBehaviorScoreDelta,
    lastRawDelta: signal.behaviorScoreDelta,
    lastDecayWeight: decayWeight,
    lastTrustWeight: trustWeight,
    lastReason: signal.reason,
    messageSignals: nextMessageSignals
  };
  const feedbackState = readRecord(governance.feedback);
  const stabilityStats = buildStabilitySignalStats(feedbackState, nextBehaviorState);
  const stabilityDiagnostics = buildStabilityDiagnostics({
    baseScore: score,
    qualityScore: score,
    feedbackScore: clampSigned(existing?.feedbackScore ?? governance.feedbackScore, 0),
    behaviorScore: nextBehaviorScore,
    usageScore: nextUsageScore,
    freshnessScore: components.freshness,
    optimizationScore: score,
    trustWeight,
    ...stabilityStats
  });
  const nextGovernance = {
    ...(existing ?? buildKnowledgeGovernanceMetadata({})),
    ...governance,
    qualityScore: score,
    qualityComponents: components,
    feedbackScore: existing?.feedbackScore ?? clampSigned(governance.feedbackScore, 0),
    behaviorScore: nextBehaviorScore,
    behaviorEventCount: nextEventCount,
    behaviorReasons,
    usageScore: nextUsageScore,
    ...stabilityDiagnostics,
    lowQuality,
    highValue,
    recommendedAction: lowQuality ? "review" : "active",
    behavior: nextBehaviorState,
    stability: {
      ...stabilityDiagnostics,
      recentScores: stabilityStats.recentScores,
      lastUpdatedAt: eventAt
    }
  };
  const trendDiagnostics = buildTrendDiagnosticsFromMetadata({
    ...base,
    governance: nextGovernance
  }, {
    stableOptimizationScore: stabilityDiagnostics.stableOptimizationScore,
    freshnessScore: components.freshness,
    feedbackScore: nextGovernance.feedbackScore,
    behaviorScore: nextBehaviorScore,
    usageScore: nextUsageScore,
    createdAt: nextGovernance.ingestTimestamp as string | null | undefined,
    updatedAt: eventAt,
    volatilityPenalty: stabilityDiagnostics.volatilityPenalty,
    staleVersion: lowQuality
  });
  const nextGovernanceWithTrend = withTrendDiagnostics(nextGovernance, trendDiagnostics);
  const lifecycleDiagnostics = buildLifecycleDiagnostics({
    metadata: {
      ...base,
      governance: nextGovernanceWithTrend
    },
    createdAt: nextGovernance.ingestTimestamp as string | null | undefined,
    updatedAt: eventAt,
    usageScore: nextUsageScore,
    feedbackScore: nextGovernance.feedbackScore,
    behaviorScore: nextBehaviorScore,
    trend: trendDiagnostics,
    stableOptimizationScore: stabilityDiagnostics.stableOptimizationScore,
    qualityScore: score,
    freshnessScore: components.freshness,
    hitCount: stabilityDiagnostics.sampleCount,
    lowQuality,
    highValue,
    staleVersion: lowQuality
  });
  const nextGovernanceWithLifecycle = withLifecycleDiagnostics(nextGovernanceWithTrend, lifecycleDiagnostics);
  const policyDiagnostics = buildPolicyDiagnostics({
    metadata: {
      ...base,
      governance: nextGovernanceWithLifecycle
    },
    qualityScore: score,
    feedbackScore: nextGovernance.feedbackScore,
    behaviorScore: nextBehaviorScore,
    optimizationScore: score,
    stableOptimizationScore: stabilityDiagnostics.stableOptimizationScore,
    trend: trendDiagnostics,
    lifecycle: lifecycleDiagnostics,
    highValue,
    lowQuality,
    confidence: lifecycleDiagnostics.lifecycleConfidence,
    volatilityPenalty: stabilityDiagnostics.volatilityPenalty,
    trustWeight
  });
  const nextGovernanceWithPolicy = withPolicyDiagnostics(nextGovernanceWithLifecycle, policyDiagnostics);

  return {
    metadata: {
      ...base,
      qualityScore: score,
      feedbackScore: nextGovernance.feedbackScore,
      behaviorScore: nextBehaviorScore,
      behaviorEventCount: nextEventCount,
      behaviorReasons,
      stabilityScore: stabilityDiagnostics.stabilityScore,
      confidenceWeight: stabilityDiagnostics.confidenceWeight,
      trustWeight,
      volatilityPenalty: stabilityDiagnostics.volatilityPenalty,
      stableOptimizationScore: stabilityDiagnostics.stableOptimizationScore,
      sampleCount: stabilityDiagnostics.sampleCount,
      positiveCount: stabilityDiagnostics.positiveCount,
      negativeCount: stabilityDiagnostics.negativeCount,
      uniqueUserCount: stabilityDiagnostics.uniqueUserCount,
      suspectedGaming: stabilityDiagnostics.suspectedGaming,
      ...trendFields(trendDiagnostics),
      ...lifecycleFields(lifecycleDiagnostics),
      ...policyFields(policyDiagnostics),
      usageScore: nextUsageScore,
      lowQuality,
      low_quality: lowQuality,
      highValue,
      high_value: highValue,
      recommendedAction: nextGovernance.recommendedAction,
      governance: nextGovernanceWithPolicy as unknown as Prisma.InputJsonObject
    } as Prisma.InputJsonObject,
    behaviorScoreDelta: trustedBehaviorScoreDelta,
    rawBehaviorScoreDelta: signal.behaviorScoreDelta,
    previousScoreDelta,
    trustWeight,
    netBehaviorScoreDelta: roundSigned4(trustedBehaviorScoreDelta - previousScoreDelta),
    decayWeight,
    reason: signal.reason,
    nextBehaviorScore,
    nextBehaviorEventCount: nextEventCount,
    behaviorReasons,
    nextQualityScore: score,
    nextFeedbackScore: nextGovernance.feedbackScore,
    nextUsageScore,
    stabilityScore: stabilityDiagnostics.stabilityScore,
    confidenceWeight: stabilityDiagnostics.confidenceWeight,
    volatilityPenalty: stabilityDiagnostics.volatilityPenalty,
    stableOptimizationScore: stabilityDiagnostics.stableOptimizationScore,
    sampleCount: stabilityDiagnostics.sampleCount,
    suspectedGaming: stabilityDiagnostics.suspectedGaming,
    ...trendFields(trendDiagnostics),
    ...lifecycleFields(lifecycleDiagnostics),
    ...policyFields(policyDiagnostics),
    lowQuality,
    highValue
  };
}

export function buildFeedbackRankingBoost(metadata: unknown) {
  const governance = readKnowledgeGovernanceMetadata(metadata);
  const feedbackState = readRecord(readRecord(readRecord(metadata).governance).feedback);
  const behaviorState = readRecord(readRecord(readRecord(metadata).governance).behavior);
  const stabilityState = readRecord(readRecord(readRecord(metadata).governance).stability);
  const feedbackAt = typeof feedbackState.lastFeedbackAt === "string" ? feedbackState.lastFeedbackAt : governance?.ingestTimestamp;
  const behaviorAt = typeof behaviorState.lastEventAt === "string" ? behaviorState.lastEventAt : governance?.ingestTimestamp;
  const decayWeight = calculateFeedbackDecayWeight({ feedbackAt });
  const behaviorDecayWeight = calculateBehaviorDecayWeight({ eventAt: behaviorAt });
  const feedbackScore = applyFeedbackDecay({
    score: governance?.feedbackScore ?? 0,
    feedbackAt
  });
  const behaviorScore = roundSigned4((governance?.behaviorScore ?? 0) * behaviorDecayWeight);
  const stabilityStats = buildStabilitySignalStats(feedbackState, behaviorState);
  const stabilityDiagnostics = buildStabilityDiagnostics({
    baseScore: governance?.qualityScore ?? 0.5,
    qualityScore: governance?.qualityScore ?? 0.5,
    feedbackScore,
    behaviorScore,
    usageScore: governance?.usageScore ?? 0,
    freshnessScore: calculateFreshnessScore(governance?.ingestTimestamp),
    optimizationScore: typeof stabilityState.stableOptimizationScore === "number"
      ? stabilityState.stableOptimizationScore
      : governance?.stableOptimizationScore,
    trustWeight: typeof stabilityState.trustWeight === "number" ? stabilityState.trustWeight : governance?.trustWeight,
    ...stabilityStats
  });
  const freshnessScore = calculateFreshnessScore(governance?.ingestTimestamp);
  const trendDiagnostics = buildTrendDiagnosticsFromMetadata(metadata, {
    stableOptimizationScore: stabilityDiagnostics.stableOptimizationScore,
    freshnessScore,
    feedbackScore,
    behaviorScore,
    usageScore: governance?.usageScore ?? 0,
    createdAt: governance?.ingestTimestamp,
    updatedAt: behaviorAt ?? feedbackAt,
    volatilityPenalty: stabilityDiagnostics.volatilityPenalty,
    staleVersion: governance?.recommendedAction === "review"
  });
  const lifecycleDiagnostics = buildLifecycleDiagnostics({
    metadata,
    createdAt: governance?.ingestTimestamp,
    updatedAt: behaviorAt ?? feedbackAt,
    usageScore: governance?.usageScore ?? 0,
    feedbackScore,
    behaviorScore,
    trend: trendDiagnostics,
    stableOptimizationScore: stabilityDiagnostics.stableOptimizationScore,
    qualityScore: governance?.qualityScore ?? null,
    freshnessScore,
    hitCount: stabilityDiagnostics.sampleCount,
    lowQuality: governance?.lowQuality ?? false,
    highValue: governance?.highValue ?? false,
    staleVersion: governance?.recommendedAction === "review"
  });
  const policyDiagnostics = buildPolicyDiagnostics({
    metadata,
    qualityScore: governance?.qualityScore ?? null,
    feedbackScore,
    behaviorScore,
    optimizationScore: stabilityDiagnostics.stableOptimizationScore,
    stableOptimizationScore: stabilityDiagnostics.stableOptimizationScore,
    trend: trendDiagnostics,
    lifecycle: lifecycleDiagnostics,
    highValue: governance?.highValue ?? false,
    lowQuality: governance?.lowQuality ?? false,
    confidence: lifecycleDiagnostics.lifecycleConfidence,
    volatilityPenalty: stabilityDiagnostics.volatilityPenalty,
    trustWeight: stabilityDiagnostics.trustWeight
  });

  return {
    qualityScore: governance?.qualityScore ?? null,
    feedbackScore,
    rawFeedbackScore: governance?.feedbackScore ?? 0,
    behaviorScore,
    rawBehaviorScore: governance?.behaviorScore ?? 0,
    behaviorEventCount: governance?.behaviorEventCount ?? 0,
    behaviorReasons: governance?.behaviorReasons ?? [],
    usageScore: governance?.usageScore ?? 0,
    freshnessScore,
    stabilityScore: stabilityDiagnostics.stabilityScore,
    confidenceWeight: stabilityDiagnostics.confidenceWeight,
    trustWeight: stabilityDiagnostics.trustWeight,
    volatilityPenalty: stabilityDiagnostics.volatilityPenalty,
    stableOptimizationScore: stabilityDiagnostics.stableOptimizationScore,
    sampleCount: stabilityDiagnostics.sampleCount,
    positiveCount: stabilityDiagnostics.positiveCount,
    negativeCount: stabilityDiagnostics.negativeCount,
    uniqueUserCount: stabilityDiagnostics.uniqueUserCount,
    suspectedGaming: stabilityDiagnostics.suspectedGaming,
    ...trendFields(trendDiagnostics),
    ...lifecycleFields(lifecycleDiagnostics),
    ...policyFields(policyDiagnostics),
    decayWeight,
    behaviorDecayWeight,
    lowQuality: governance?.lowQuality ?? false,
    highValue: governance?.highValue ?? false
  };
}

function scopeMatches(metadata: unknown, input: Pick<AnswerFeedbackInput, "agentId" | "knowledgeBaseId" | "namespace" | "tenantId">) {
  const record = readRecord(metadata);

  if (!input.agentId && !input.knowledgeBaseId && !input.namespace) {
    return false;
  }

  return (!input.agentId || record.agentId === input.agentId)
    && (!input.knowledgeBaseId || record.knowledgeBaseId === input.knowledgeBaseId)
    && (!input.namespace || record.namespace === input.namespace)
    && (!input.tenantId || record.tenantId === input.tenantId);
}

export async function recordAnswerFeedback(input: AnswerFeedbackInput) {
  const scoreDelta = calculateFeedbackScore(input);
  const chunkIds = Array.from(new Set((input.chunkIds ?? []).map((id) => id.trim()).filter(Boolean))).slice(0, 30);
  const chunks = chunkIds.length > 0
    ? await prisma.knowledgeChunk.findMany({
      where: { id: { in: chunkIds } },
      select: {
        id: true,
        metadata: true
      }
    })
    : [];
  const updatedChunks = [];

  for (const chunk of chunks) {
    if (!scopeMatches(chunk.metadata, input)) {
      continue;
    }

    const update = applyFeedbackToKnowledgeScore(chunk.metadata, {
      rating: input.rating,
      resolved: input.resolved,
      userId: input.userId,
      feedbackId: input.feedbackId,
      messageId: input.messageId,
      feedbackAt: input.feedbackAt
    });

    await prisma.knowledgeChunk.update({
      where: { id: chunk.id },
      data: { metadata: update.metadata }
    });
    updatedChunks.push({
      chunkId: chunk.id,
      qualityScore: update.nextQualityScore,
      feedbackScore: update.nextFeedbackScore,
      usageScore: update.nextUsageScore,
      lowQuality: update.lowQuality,
      highValue: update.highValue,
      decayWeight: update.decayWeight,
      trustWeight: update.trustWeight,
      stabilityScore: update.stabilityScore,
      confidenceWeight: update.confidenceWeight,
      volatilityPenalty: update.volatilityPenalty,
      stableOptimizationScore: update.stableOptimizationScore,
      sampleCount: update.sampleCount,
      suspectedGaming: update.suspectedGaming,
      netScoreDelta: update.netScoreDelta
    });
  }
  const netScoreDelta = updatedChunks.length > 0
    ? roundSigned4(updatedChunks.reduce((sum, chunk) => sum + chunk.netScoreDelta, 0) / updatedChunks.length)
    : scoreDelta;

  await recordAnalyticsEvent({
    userId: input.userId,
    type: AnalyticsEventType.RAG_RETRIEVAL,
    numericValue: scoreDelta,
    metadata: {
      governanceEvent: "answer_feedback",
      feedbackId: input.feedbackId,
      messageId: input.messageId,
      agentId: input.agentId,
      knowledgeBaseId: input.knowledgeBaseId,
      namespace: input.namespace,
      rating: input.rating,
      resolved: input.resolved,
      scoreDelta: netScoreDelta,
      rawScoreDelta: scoreDelta,
      decayWeight: calculateFeedbackDecayWeight({ feedbackAt: input.feedbackAt }),
      avgTrustWeight: updatedChunks.length > 0
        ? round4(updatedChunks.reduce((sum, chunk) => sum + chunk.trustWeight, 0) / updatedChunks.length)
        : null,
      avgStabilityScore: updatedChunks.length > 0
        ? round4(updatedChunks.reduce((sum, chunk) => sum + chunk.stabilityScore, 0) / updatedChunks.length)
        : null,
      source: input.source ?? "admin_ingest",
      answerHash: input.answerHash,
      questionHash: input.questionHash,
      questionLength: input.question?.length ?? 0,
      chunkIds,
      evidenceIds: input.evidenceIds ?? [],
      updatedChunkCount: updatedChunks.length,
      updatedChunks
    }
  });

  return {
    status: "recorded" as const,
    scoreDelta: netScoreDelta,
    rawScoreDelta: scoreDelta,
    decayWeight: calculateFeedbackDecayWeight({ feedbackAt: input.feedbackAt }),
    avgTrustWeight: updatedChunks.length > 0
      ? round4(updatedChunks.reduce((sum, chunk) => sum + chunk.trustWeight, 0) / updatedChunks.length)
      : null,
    avgStabilityScore: updatedChunks.length > 0
      ? round4(updatedChunks.reduce((sum, chunk) => sum + chunk.stabilityScore, 0) / updatedChunks.length)
      : null,
    affectedChunkCount: updatedChunks.length,
    updatedChunkCount: updatedChunks.length,
    updatedChunks
  };
}

export async function recordBehaviorSignal(input: KnowledgeBehaviorSignalInput) {
  const signal = calculateBehaviorScoreSignal(input);
  const eventAt = normalizeTimestamp(input.eventAt as string | Date | null | undefined);
  const decayWeight = calculateBehaviorDecayWeight({ eventAt });
  const chunkIds = Array.from(new Set((input.chunkIds ?? []).map((id) => id.trim()).filter(Boolean))).slice(0, 30);
  const chunks = chunkIds.length > 0
    ? await prisma.knowledgeChunk.findMany({
      where: { id: { in: chunkIds } },
      select: {
        id: true,
        metadata: true
      }
    })
    : [];
  const updatedChunks = [];

  for (const chunk of chunks) {
    if (!scopeMatches(chunk.metadata, input)) {
      continue;
    }

    const update = applyBehaviorCalibration(chunk.metadata, {
      ...input,
      eventAt
    });

    await prisma.knowledgeChunk.update({
      where: { id: chunk.id },
      data: { metadata: update.metadata }
    });
    updatedChunks.push({
      chunkId: chunk.id,
      behaviorScore: update.nextBehaviorScore,
      behaviorEventCount: update.nextBehaviorEventCount,
      behaviorScoreDelta: update.netBehaviorScoreDelta,
      qualityScore: update.nextQualityScore,
      feedbackScore: update.nextFeedbackScore,
      usageScore: update.nextUsageScore,
      lowQuality: update.lowQuality,
      highValue: update.highValue,
      trustWeight: update.trustWeight,
      stabilityScore: update.stabilityScore,
      confidenceWeight: update.confidenceWeight,
      volatilityPenalty: update.volatilityPenalty,
      stableOptimizationScore: update.stableOptimizationScore,
      sampleCount: update.sampleCount,
      suspectedGaming: update.suspectedGaming
    });
  }

  const behaviorScoreDelta = updatedChunks.length > 0
    ? roundSigned4(updatedChunks.reduce((sum, chunk) => sum + chunk.behaviorScoreDelta, 0) / updatedChunks.length)
    : roundSigned4(signal.behaviorScoreDelta * decayWeight);

  await recordAnalyticsEvent({
    userId: input.userId,
    type: AnalyticsEventType.RAG_RETRIEVAL,
    numericValue: behaviorScoreDelta,
    metadata: {
      governanceEvent: "behavior_signal",
      eventType: input.eventType,
      messageId: input.messageId,
      conversationId: input.conversationId,
      agentId: input.agentId,
      knowledgeBaseId: input.knowledgeBaseId,
      namespace: input.namespace,
      behaviorScoreDelta,
      rawBehaviorScoreDelta: signal.behaviorScoreDelta,
      decayWeight,
      avgTrustWeight: updatedChunks.length > 0
        ? round4(updatedChunks.reduce((sum, chunk) => sum + chunk.trustWeight, 0) / updatedChunks.length)
        : null,
      avgStabilityScore: updatedChunks.length > 0
        ? round4(updatedChunks.reduce((sum, chunk) => sum + chunk.stabilityScore, 0) / updatedChunks.length)
        : null,
      behaviorReason: signal.reason,
      dwellMs: input.dwellMs,
      source: input.source ?? "admin_ingest",
      chunkIds,
      evidenceIds: input.evidenceIds ?? [],
      affectedChunkCount: updatedChunks.length,
      updatedChunkCount: updatedChunks.length,
      updatedChunks,
      eventAt,
      metadata: input.metadata ?? {}
    }
  });

  return {
    status: "recorded" as const,
    behaviorScoreDelta,
    rawBehaviorScoreDelta: signal.behaviorScoreDelta,
    decayWeight,
    avgTrustWeight: updatedChunks.length > 0
      ? round4(updatedChunks.reduce((sum, chunk) => sum + chunk.trustWeight, 0) / updatedChunks.length)
      : null,
    avgStabilityScore: updatedChunks.length > 0
      ? round4(updatedChunks.reduce((sum, chunk) => sum + chunk.stabilityScore, 0) / updatedChunks.length)
      : null,
    reason: signal.reason,
    affectedChunkCount: updatedChunks.length,
    updatedChunkCount: updatedChunks.length,
    updatedChunks
  };
}

export function normalizeGovernanceControls(input: KnowledgeGovernanceControls = {}) {
  return {
    minQualityScore: input.minQualityScore === null || input.minQualityScore === undefined
      ? null
      : clamp01(input.minQualityScore, 0),
    knowledgeVersion: input.knowledgeVersion === null || input.knowledgeVersion === undefined
      ? null
      : normalizeVersion(input.knowledgeVersion),
    includeLowQuality: input.includeLowQuality === true
  };
}

export function candidatePassesGovernance(metadata: unknown, controls: KnowledgeGovernanceControls = {}) {
  const normalized = normalizeGovernanceControls(controls);
  const governance = readKnowledgeGovernanceMetadata(metadata);

  if (!governance) {
    return true;
  }

  if (normalized.knowledgeVersion && governance.version !== normalized.knowledgeVersion) {
    return false;
  }

  if (normalized.minQualityScore !== null && governance.qualityScore < normalized.minQualityScore) {
    return false;
  }

  if (!normalized.includeLowQuality && normalized.minQualityScore !== null && governance.lowQuality) {
    return false;
  }

  return true;
}

export function buildGovernanceSqlFilter(controls: KnowledgeGovernanceControls = {}) {
  const normalized = normalizeGovernanceControls(controls);
  const filters: Prisma.Sql[] = [];

  if (normalized.knowledgeVersion) {
    filters.push(Prisma.sql`
      COALESCE(kc."metadata"->>'knowledgeVersion', kc."metadata"->>'version', kc."metadata"->'governance'->>'version') = ${normalized.knowledgeVersion}
    `);
  }

  if (normalized.minQualityScore !== null) {
    filters.push(Prisma.sql`
      COALESCE(
        CASE
          WHEN COALESCE(kc."metadata"->>'qualityScore', '') ~ '^[0-9]+(\\.[0-9]+)?$'
          THEN (kc."metadata"->>'qualityScore')::float
          ELSE NULL
        END,
        CASE
          WHEN COALESCE(kc."metadata"->'governance'->>'qualityScore', '') ~ '^[0-9]+(\\.[0-9]+)?$'
          THEN (kc."metadata"->'governance'->>'qualityScore')::float
          ELSE NULL
        END,
        1
      ) >= ${normalized.minQualityScore}
    `);

    if (!normalized.includeLowQuality) {
      filters.push(Prisma.sql`
        COALESCE(kc."metadata"->>'lowQuality', kc."metadata"->'governance'->>'lowQuality', 'false') <> 'true'
      `);
    }
  }

  if (filters.length === 0) {
    return Prisma.empty;
  }

  return Prisma.sql`AND ${Prisma.join(filters, " AND ")}`;
}

export async function trackHitRate(input: {
  userId?: string | null;
  requestId?: string;
  query: string;
  scope: ResolvedKnowledgeAccessScope;
  results: GovernanceHitResult[];
  controls?: KnowledgeGovernanceControls;
}) {
  const hitCount = input.results.length;
  const avgQualityScore = hitCount > 0
    ? Math.round((input.results.reduce((sum, result) => sum + (typeof result.qualityScore === "number" ? result.qualityScore : 1), 0) / hitCount) * 10000) / 10000
    : null;
  const lowQualityHitCount = input.results.filter((result) => result.lowQuality === true).length;

  await recordAnalyticsEvent({
    userId: input.userId,
    type: AnalyticsEventType.RAG_RETRIEVAL,
    numericValue: hitCount,
    metadata: {
      governanceEvent: "hit_tracking",
      requestId: input.requestId,
      queryLength: input.query.length,
      agentId: input.scope.agentId,
      knowledgeBaseId: input.scope.knowledgeBaseId,
      namespace: input.scope.namespace,
      hitCount,
      avgQualityScore,
      lowQualityHitCount,
      chunkIds: input.results.map((result) => result.chunkId).slice(0, 20),
      knowledgeItemIds: Array.from(new Set(input.results.map((result) => result.knowledgeItemId))).slice(0, 20),
      controls: normalizeGovernanceControls(input.controls)
    }
  });
}

export async function evaluateAgentQuality(input: {
  agentId: string;
  knowledgeBaseId?: string | null;
  namespace?: string | null;
  days?: number;
}) {
  const since = new Date(Date.now() - Math.max(1, input.days ?? 30) * 24 * 60 * 60 * 1000);
  const events = await prisma.analyticsEvent.findMany({
    where: {
      type: AnalyticsEventType.RAG_RETRIEVAL,
      occurredAt: { gte: since }
    },
    orderBy: { occurredAt: "desc" },
    take: 500
  });
  const scoped = events.filter((event) => {
    const metadata = readRecord(event.metadata);

    return metadata.agentId === input.agentId
      && (!input.knowledgeBaseId || metadata.knowledgeBaseId === input.knowledgeBaseId)
      && (!input.namespace || metadata.namespace === input.namespace);
  });
  const totalQueries = scoped.length;
  const totalHits = scoped.reduce((sum, event) => {
    const metadata = readRecord(event.metadata);
    const hitCount = typeof metadata.hitCount === "number" ? metadata.hitCount : Number(event.numericValue ?? 0);

    return sum + (Number.isFinite(hitCount) ? hitCount : 0);
  }, 0);
  const lowQualityHits = scoped.reduce((sum, event) => {
    const metadata = readRecord(event.metadata);
    const count = typeof metadata.lowQualityHitCount === "number" ? metadata.lowQualityHitCount : 0;

    return sum + count;
  }, 0);
  const avgHitsPerQuery = totalQueries > 0 ? Math.round((totalHits / totalQueries) * 10000) / 10000 : 0;
  const lowQualityRate = totalHits > 0 ? Math.round((lowQualityHits / totalHits) * 10000) / 10000 : 0;
  const qualityScore = round4((Math.min(avgHitsPerQuery / 3, 1) * 0.65) + ((1 - lowQualityRate) * 0.35));

  logger.info("rag.agent_quality", {
    agentId: input.agentId,
    knowledgeBaseId: input.knowledgeBaseId,
    namespace: input.namespace,
    totalQueries,
    totalHits,
    lowQualityHits,
    avgHitsPerQuery,
    lowQualityRate,
    qualityScore
  });

  return {
    agentId: input.agentId,
    knowledgeBaseId: input.knowledgeBaseId ?? null,
    namespace: input.namespace ?? null,
    totalQueries,
    totalHits,
    lowQualityHits,
    avgHitsPerQuery,
    lowQualityRate,
    qualityScore
  };
}
