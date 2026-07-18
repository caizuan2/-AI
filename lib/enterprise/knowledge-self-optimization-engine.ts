import "server-only";

import { calculateFreshnessScore } from "@/lib/enterprise/knowledge-feedback-ranking";
import { buildStabilityDiagnostics } from "@/lib/enterprise/knowledge-stability-engine";
import { buildTrendDiagnosticsFromMetadata } from "@/lib/enterprise/knowledge-trend-learning-engine";
import type { KnowledgeTrendLabel } from "@/lib/enterprise/knowledge-trend-types";
import { classifyKnowledgeLifecycle } from "@/lib/enterprise/knowledge-lifecycle-engine";
import type { KnowledgeLifecycleStage } from "@/lib/enterprise/knowledge-lifecycle-types";

type MetadataRecord = Record<string, unknown>;

export interface KnowledgeOptimizationInput {
  baseScore?: number | null;
  qualityScore?: number | null;
  feedbackScore?: number | null;
  behaviorScore?: number | null;
  usageScore?: number | null;
  freshnessScore?: number | null;
  duplicatePenalty?: number | null;
  conflictPenalty?: number | null;
  lowQualityPenalty?: number | null;
  highValueBoost?: number | null;
  confidenceWeight?: number | null;
  trustWeight?: number | null;
  volatilityPenalty?: number | null;
  stabilityScore?: number | null;
  stableOptimizationScore?: number | null;
  trendScore?: number | null;
  trendConfidence?: number | null;
  trendLabel?: KnowledgeTrendLabel | string | null;
  staleRisk?: number | null;
  fastRising?: boolean | null;
  staleHighScore?: boolean | null;
  decliningTrend?: boolean | null;
  evergreen?: boolean | null;
  lifecycleScore?: number | null;
  lifecycleConfidence?: number | null;
  lifecycleStage?: KnowledgeLifecycleStage | string | null;
  sampleCount?: number | null;
  positiveCount?: number | null;
  negativeCount?: number | null;
  uniqueUserCount?: number | null;
  suspectedGaming?: boolean | null;
}

export interface KnowledgeOptimizationContext extends KnowledgeOptimizationInput {
  metadata?: unknown;
  title?: string | null;
  content?: string | null;
  contentHash?: string | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
  expiresAt?: string | Date | null;
  sourceType?: string | null;
  status?: string | null;
  knowledgeVersion?: string | number | null;
  latestVersion?: string | number | null;
  agentId?: string | null;
  knowledgeBaseId?: string | null;
  namespace?: string | null;
  hitCount?: number | null;
  downvoteRate?: number | null;
}

export interface DuplicateKnowledgeSignal {
  duplicateLikely: boolean;
  duplicateGroupKey?: string;
  duplicateScore: number;
}

export interface ConflictOrStaleSignal {
  conflictLikely: boolean;
  staleVersion: boolean;
  stale: boolean;
  reasons: string[];
}

export interface KnowledgeOptimizationAnalysis {
  optimizationScore: number;
  highValue: boolean;
  lowQuality: boolean;
  duplicateLikely: boolean;
  duplicateGroupKey?: string;
  duplicateScore: number;
  coldKnowledge: boolean;
  conflictLikely: boolean;
  staleVersion: boolean;
  stale: boolean;
  duplicatePenalty: number;
  conflictPenalty: number;
  lowQualityPenalty: number;
  coldKnowledgePenalty: number;
  stalePenalty: number;
  highValueBoost: number;
  stabilityScore: number;
  confidenceWeight: number;
  trustWeight: number;
  volatilityPenalty: number;
  stableOptimizationScore: number;
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
  sampleCount: number;
  suspectedGaming: boolean;
  optimizationReason: string;
  optimizationSuggestion: string;
  behaviorScore: number;
  reasons: string[];
}

function readRecord(value: unknown): MetadataRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as MetadataRecord
    : {};
}

function clamp01(value: unknown, fallback = 0) {
  const numberValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  if (numberValue > 1 && numberValue <= 5) {
    return Math.max(0, Math.min(1, numberValue / 5));
  }

  if (numberValue > 5 && numberValue <= 100) {
    return Math.max(0, Math.min(1, numberValue / 100));
  }

  return Math.max(0, Math.min(1, numberValue));
}

function round4(value: number) {
  return Math.round(clamp01(value) * 10000) / 10000;
}

function boolFromMetadata(record: MetadataRecord, keys: string[]) {
  return keys.some((key) => {
    const value = record[key];

    return value === true || value === "true" || value === 1 || value === "1";
  });
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^0-9a-zA-Z\u4e00-\u9fff]+/g, "")
    .slice(0, 180);
}

function normalizeVersion(value: string | number | null | undefined) {
  const text = typeof value === "number" ? `v${Math.max(1, Math.round(value))}` : String(value ?? "").trim();

  return text || null;
}

function normalizeDate(value: string | Date | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  return Number.isFinite(date.getTime()) ? date : null;
}

function isOlderThanDays(value: string | Date | null | undefined, days: number) {
  const date = normalizeDate(value);

  if (!date) {
    return false;
  }

  return Date.now() - date.getTime() > days * 24 * 60 * 60 * 1000;
}

function readFeedbackComponent(metadata: unknown) {
  const record = readRecord(metadata);
  const governance = readRecord(record.governance);
  const feedback = readRecord(governance.feedback);

  return clamp01(
    feedback.feedbackComponent ?? record.feedbackComponent,
    Number.NaN
  );
}

function normalizeFeedbackScore(value: unknown, metadata?: unknown) {
  const component = readFeedbackComponent(metadata);

  if (Number.isFinite(component)) {
    return component;
  }

  const numeric = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numeric)) {
    return 0.5;
  }

  if (numeric >= -1 && numeric <= 1) {
    return clamp01((numeric + 1) / 2, 0.5);
  }

  return clamp01(numeric, 0.5);
}

function normalizeBehaviorScore(value: unknown, metadata?: unknown) {
  const record = readRecord(metadata);
  const governance = readRecord(record.governance);
  const behavior = readRecord(governance.behavior);
  const raw = value ?? governance.behaviorScore ?? behavior.behaviorScore ?? record.behaviorScore;
  const numeric = typeof raw === "number" ? raw : Number(raw);

  if (!Number.isFinite(numeric)) {
    return 0.5;
  }

  return clamp01((Math.max(-1, Math.min(1, numeric)) + 1) / 2, 0.5);
}

function readDownvoteRate(metadata: unknown, fallback?: number | null) {
  if (typeof fallback === "number" && Number.isFinite(fallback)) {
    return clamp01(fallback);
  }

  const record = readRecord(metadata);
  const governance = readRecord(record.governance);
  const feedback = readRecord(governance.feedback);

  return clamp01(feedback.downvoteRate ?? record.downvoteRate, 0);
}

function readHitCount(metadata: unknown, fallback?: number | null) {
  if (typeof fallback === "number" && Number.isFinite(fallback)) {
    return Math.max(0, Math.round(fallback));
  }

  const record = readRecord(metadata);
  const governance = readRecord(record.governance);
  const feedback = readRecord(governance.feedback);
  const value = record.hitCount ?? governance.hitCount ?? feedback.hitCount ?? feedback.feedbackCount;
  const numeric = Number(value ?? 0);

  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : 0;
}

function readMetadataString(metadata: unknown, keys: string[]) {
  const record = readRecord(metadata);
  const governance = readRecord(record.governance);

  for (const key of keys) {
    const value = record[key] ?? governance[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

export function calculateOptimizationScore(input: KnowledgeOptimizationInput): number {
  const baseScore = clamp01(input.baseScore, 0.5);
  const qualityScore = clamp01(input.qualityScore, baseScore);
  const feedbackScore = normalizeFeedbackScore(input.feedbackScore);
  const behaviorScore = normalizeBehaviorScore(input.behaviorScore);
  const usageScore = clamp01(input.usageScore, 0);
  const freshnessScore = clamp01(input.freshnessScore, 1);
  const highValueBoost = clamp01(input.highValueBoost, 0);
  const duplicatePenalty = clamp01(input.duplicatePenalty, 0);
  const conflictPenalty = clamp01(input.conflictPenalty, 0);
  const lowQualityPenalty = clamp01(input.lowQualityPenalty, 0);
  const score = (
    (baseScore * 0.4)
    + (qualityScore * 0.17)
    + (feedbackScore * 0.14)
    + (behaviorScore * 0.12)
    + (usageScore * 0.08)
    + (freshnessScore * 0.04)
    + (highValueBoost * 0.05)
    - duplicatePenalty
    - conflictPenalty
    - lowQualityPenalty
  );

  return round4(score);
}

export function detectHighValueKnowledge(input: KnowledgeOptimizationContext): boolean {
  const record = readRecord(input.metadata);

  if (boolFromMetadata(record, ["highValue", "high_value"])) {
    return true;
  }

  const qualityScore = clamp01(input.qualityScore, clamp01(record.qualityScore, 0));
  const feedbackScore = normalizeFeedbackScore(input.feedbackScore, input.metadata);
  const behaviorScore = normalizeBehaviorScore(input.behaviorScore, input.metadata);
  const usageScore = clamp01(input.usageScore, clamp01(record.usageScore, 0));
  const lowQuality = boolFromMetadata(record, ["lowQuality", "low_quality"]);

  return qualityScore >= 0.75 && feedbackScore >= 0.65 && behaviorScore >= 0.62 && usageScore >= 0.5 && !lowQuality;
}

export function detectLowQualityKnowledge(input: KnowledgeOptimizationContext): boolean {
  const record = readRecord(input.metadata);

  if (boolFromMetadata(record, ["lowQuality", "low_quality"])) {
    return true;
  }

  const qualityScore = clamp01(input.qualityScore, clamp01(record.qualityScore, 1));
  const feedbackScore = normalizeFeedbackScore(input.feedbackScore, input.metadata);
  const behaviorScore = normalizeBehaviorScore(input.behaviorScore, input.metadata);
  const downvoteRate = readDownvoteRate(input.metadata, input.downvoteRate);

  return qualityScore < 0.4 || feedbackScore < 0.35 || behaviorScore < 0.35 || downvoteRate > 0.6;
}

export function detectDuplicateKnowledge(input: KnowledgeOptimizationContext): DuplicateKnowledgeSignal {
  const record = readRecord(input.metadata);
  const explicitGroupKey = readMetadataString(input.metadata, ["duplicateGroupKey", "duplicate_group_key"]);
  const explicitDuplicate = boolFromMetadata(record, ["duplicateLikely", "duplicate_likely"]);
  const titleKey = normalizeText(input.title);
  const contentHash = typeof input.contentHash === "string" && input.contentHash.trim()
    ? input.contentHash.trim().slice(0, 80)
    : readMetadataString(input.metadata, ["contentHash", "content_hash", "versionId"]);
  const contentKey = normalizeText(input.content).slice(0, 120);
  const duplicateGroupKey = explicitGroupKey
    ?? (contentHash ? `hash:${contentHash}` : null)
    ?? (titleKey && contentKey ? `title:${titleKey}:content:${contentKey}` : null)
    ?? (titleKey ? `title:${titleKey}` : undefined);
  const duplicateScore = duplicateGroupKey ? (contentHash ? 0.72 : titleKey && contentKey ? 0.58 : 0.35) : 0;

  return {
    duplicateLikely: explicitDuplicate || Boolean(explicitGroupKey),
    duplicateGroupKey,
    duplicateScore: round4(duplicateScore)
  };
}

export function detectColdKnowledge(input: KnowledgeOptimizationContext): boolean {
  const record = readRecord(input.metadata);

  if (boolFromMetadata(record, ["coldKnowledge", "cold_knowledge"])) {
    return true;
  }

  const usageScore = clamp01(input.usageScore, clamp01(record.usageScore, 0));
  const hitCount = readHitCount(input.metadata, input.hitCount);
  const feedbackScore = normalizeFeedbackScore(input.feedbackScore, input.metadata);
  const behaviorScore = normalizeBehaviorScore(input.behaviorScore, input.metadata);
  const oldEnough = isOlderThanDays(input.createdAt ?? input.updatedAt, 30);

  return usageScore < 0.1 && hitCount === 0 && oldEnough && feedbackScore < 0.58 && behaviorScore < 0.55;
}

export function detectConflictOrStaleKnowledge(input: KnowledgeOptimizationContext): ConflictOrStaleSignal {
  const record = readRecord(input.metadata);
  const reasons: string[] = [];
  const conflictLikely = boolFromMetadata(record, ["conflictLikely", "conflict_likely", "markedConflict"]);
  const markedDeprecated = boolFromMetadata(record, ["markedDeprecated", "deprecated", "stale"]);
  const sourceType = String(input.sourceType ?? record.sourceType ?? "").toLowerCase();
  const status = String(input.status ?? "").toLowerCase();
  const knowledgeVersion = normalizeVersion(input.knowledgeVersion ?? readMetadataString(input.metadata, ["knowledgeVersion", "version"]));
  const latestVersion = normalizeVersion(input.latestVersion);
  const staleVersion = boolFromMetadata(record, ["staleVersion", "stale_version"])
    || Boolean(knowledgeVersion && latestVersion && knowledgeVersion !== latestVersion);
  const expired = Boolean(input.expiresAt && normalizeDate(input.expiresAt) && normalizeDate(input.expiresAt)!.getTime() < Date.now());
  const stale = markedDeprecated || staleVersion || expired || status === "stale" || status === "archived" || sourceType.includes("deprecated");

  if (conflictLikely) {
    reasons.push("conflict_likely");
  }

  if (staleVersion) {
    reasons.push("stale_version");
  }

  if (markedDeprecated || sourceType.includes("deprecated")) {
    reasons.push("deprecated_source");
  }

  if (expired || status === "stale" || status === "archived") {
    reasons.push("expired_or_inactive");
  }

  return {
    conflictLikely,
    staleVersion,
    stale,
    reasons
  };
}

export function analyzeKnowledgeOptimization(input: KnowledgeOptimizationContext): KnowledgeOptimizationAnalysis {
  const highValue = detectHighValueKnowledge(input);
  const lowQuality = detectLowQualityKnowledge(input);
  const duplicate = detectDuplicateKnowledge(input);
  const coldKnowledge = detectColdKnowledge(input);
  const stale = detectConflictOrStaleKnowledge(input);
  const duplicatePenalty = duplicate.duplicateLikely ? 0.08 : 0;
  const conflictPenalty = stale.conflictLikely ? 0.14 : 0;
  const lowQualityPenalty = lowQuality ? 0.16 : 0;
  const coldKnowledgePenalty = coldKnowledge ? 0.05 : 0;
  const stalePenalty = stale.staleVersion ? 0.08 : stale.stale ? 0.06 : 0;
  const highValueBoost = highValue ? 0.12 : 0;
  const freshnessScore = input.freshnessScore ?? calculateFreshnessScore(input.updatedAt ?? input.createdAt);
  const optimizationScore = calculateOptimizationScore({
    baseScore: input.baseScore,
    qualityScore: input.qualityScore,
    feedbackScore: input.feedbackScore,
    behaviorScore: input.behaviorScore,
    usageScore: input.usageScore,
    freshnessScore,
    highValueBoost,
    duplicatePenalty,
    conflictPenalty: conflictPenalty + stalePenalty + coldKnowledgePenalty,
    lowQualityPenalty
  });
  const record = readRecord(input.metadata);
  const governance = readRecord(record.governance);
  const stabilityState = readRecord(governance.stability);
  const stabilityDiagnostics = buildStabilityDiagnostics({
    baseScore: input.baseScore ?? input.qualityScore ?? 0.5,
    qualityScore: input.qualityScore ?? governance.qualityScore as number | undefined,
    feedbackScore: input.feedbackScore ?? governance.feedbackScore as number | undefined,
    behaviorScore: input.behaviorScore ?? governance.behaviorScore as number | undefined,
    usageScore: input.usageScore ?? governance.usageScore as number | undefined,
    freshnessScore,
    optimizationScore,
    confidenceWeight: input.confidenceWeight ?? stabilityState.confidenceWeight as number | undefined,
    trustWeight: input.trustWeight ?? stabilityState.trustWeight as number | undefined,
    volatilityPenalty: input.volatilityPenalty ?? stabilityState.volatilityPenalty as number | undefined,
    sampleCount: input.sampleCount ?? stabilityState.sampleCount as number | undefined,
    positiveCount: input.positiveCount ?? stabilityState.positiveCount as number | undefined,
    negativeCount: input.negativeCount ?? stabilityState.negativeCount as number | undefined,
    uniqueUserCount: input.uniqueUserCount ?? stabilityState.uniqueUserCount as number | undefined,
    recentScores: Array.isArray(stabilityState.recentScores) ? stabilityState.recentScores.map(Number).filter(Number.isFinite) : []
  });
  const trendDiagnostics = buildTrendDiagnosticsFromMetadata(input.metadata, {
    stableOptimizationScore: input.stableOptimizationScore ?? stabilityDiagnostics.stableOptimizationScore,
    freshnessScore,
    feedbackScore: input.feedbackScore ?? governance.feedbackScore as number | undefined,
    behaviorScore: input.behaviorScore ?? governance.behaviorScore as number | undefined,
    usageScore: input.usageScore ?? governance.usageScore as number | undefined,
    createdAt: input.createdAt ?? governance.ingestTimestamp as string | undefined,
    updatedAt: input.updatedAt ?? governance.updatedAt as string | undefined,
    volatilityPenalty: input.volatilityPenalty ?? stabilityDiagnostics.volatilityPenalty,
    staleVersion: stale.staleVersion || stale.stale,
    latestVersion: input.latestVersion
  });
  const lifecycleDiagnostics = classifyKnowledgeLifecycle({
    createdAt: input.createdAt ?? governance.ingestTimestamp as string | undefined,
    updatedAt: input.updatedAt ?? governance.updatedAt as string | undefined,
    usageScore: input.usageScore ?? governance.usageScore as number | undefined,
    feedbackScore: input.feedbackScore ?? governance.feedbackScore as number | undefined,
    behaviorScore: input.behaviorScore ?? governance.behaviorScore as number | undefined,
    trendScore: trendDiagnostics.trendScore,
    stableOptimizationScore: stabilityDiagnostics.stableOptimizationScore,
    qualityScore: input.qualityScore ?? governance.qualityScore as number | undefined,
    freshnessScore,
    hitCount: input.hitCount,
    fastRising: trendDiagnostics.fastRising,
    staleHighScore: trendDiagnostics.staleHighScore,
    decliningTrend: trendDiagnostics.decliningTrend,
    evergreen: trendDiagnostics.evergreen,
    lowQuality,
    highValue,
    coldKnowledge,
    staleVersion: stale.staleVersion || stale.stale
  });
  const reasons = [
    highValue ? "high_feedback_and_usage" : null,
    lowQuality ? "low_feedback_or_quality" : null,
    duplicate.duplicateLikely ? "duplicate_likely" : null,
    coldKnowledge ? "cold_knowledge" : null,
    trendDiagnostics.fastRising ? "fast_rising_trend" : null,
    trendDiagnostics.staleHighScore ? "stale_high_score_trend" : null,
    trendDiagnostics.decliningTrend ? "declining_trend" : null,
    trendDiagnostics.evergreen ? "evergreen_knowledge" : null,
    lifecycleDiagnostics.lifecycleStage !== "unknown" ? `lifecycle_${lifecycleDiagnostics.lifecycleStage}` : null,
    stabilityDiagnostics.volatilityPenalty >= 0.08 ? "ranking_volatility" : null,
    stabilityDiagnostics.confidenceWeight < 0.45 ? "low_sample_confidence" : null,
    stabilityDiagnostics.suspectedGaming ? "suspected_feedback_gaming" : null,
    ...stale.reasons
  ].filter((reason): reason is string => Boolean(reason));
  const optimizationReason = reasons[0] ?? "runtime_quality_ranking";
  let optimizationSuggestion = "当前知识可按运行时评分参与排序。";

  if (lowQuality) {
    optimizationSuggestion = "建议人工复查低质量知识，补充来源、场景或标准答案。";
  } else if (duplicate.duplicateLikely) {
    optimizationSuggestion = "建议人工合并重复知识。";
  } else if (stale.conflictLikely || stale.staleVersion || stale.stale) {
    optimizationSuggestion = "建议人工复核冲突或过期知识。";
  } else if (trendDiagnostics.staleHighScore || trendDiagnostics.decliningTrend) {
    optimizationSuggestion = "趋势显示知识热度或反馈走弱，建议人工复核是否需要更新。";
  } else if (lifecycleDiagnostics.shouldArchiveCandidate || lifecycleDiagnostics.shouldReview) {
    optimizationSuggestion = lifecycleDiagnostics.lifecycleSuggestion;
  } else if (coldKnowledge) {
    optimizationSuggestion = "长期未命中，建议复查是否保留或补充触发场景。";
  } else if (stabilityDiagnostics.volatilityPenalty >= 0.08 || stabilityDiagnostics.suspectedGaming) {
    optimizationSuggestion = "近期反馈波动较大，建议暂缓自动提权并观察更多样本。";
  } else if (trendDiagnostics.fastRising) {
    optimizationSuggestion = "新知识近期上升明显，可提高展示优先级并观察更多样本。";
  } else if (trendDiagnostics.evergreen) {
    optimizationSuggestion = "长期稳定高价值知识，建议作为常青知识保留。";
  } else if (highValue) {
    optimizationSuggestion = "高价值知识建议优先保留并用于回答。";
  }

  return {
    optimizationScore,
    highValue,
    lowQuality,
    duplicateLikely: duplicate.duplicateLikely,
    duplicateGroupKey: duplicate.duplicateGroupKey,
    duplicateScore: duplicate.duplicateScore,
    coldKnowledge,
    conflictLikely: stale.conflictLikely,
    staleVersion: stale.staleVersion,
    stale: stale.stale,
    duplicatePenalty,
    conflictPenalty,
    lowQualityPenalty,
    coldKnowledgePenalty,
    stalePenalty,
    highValueBoost,
    stabilityScore: stabilityDiagnostics.stabilityScore,
    confidenceWeight: stabilityDiagnostics.confidenceWeight,
    trustWeight: stabilityDiagnostics.trustWeight,
    volatilityPenalty: stabilityDiagnostics.volatilityPenalty,
    stableOptimizationScore: stabilityDiagnostics.stableOptimizationScore,
    trendScore: trendDiagnostics.trendScore,
    trendLabel: trendDiagnostics.trendLabel,
    trendConfidence: trendDiagnostics.confidence,
    staleRisk: trendDiagnostics.staleRisk,
    fastRising: trendDiagnostics.fastRising,
    staleHighScore: trendDiagnostics.staleHighScore,
    decliningTrend: trendDiagnostics.decliningTrend,
    evergreen: trendDiagnostics.evergreen,
    trendReason: trendDiagnostics.trendReason,
    trendShadowMode: trendDiagnostics.shadowMode,
    lifecycleStage: lifecycleDiagnostics.lifecycleStage,
    lifecycleScore: lifecycleDiagnostics.lifecycleScore,
    lifecycleConfidence: lifecycleDiagnostics.lifecycleConfidence,
    lifecycleReason: lifecycleDiagnostics.lifecycleReason,
    lifecycleSuggestion: lifecycleDiagnostics.lifecycleSuggestion,
    shouldBoost: lifecycleDiagnostics.shouldBoost,
    shouldDecay: lifecycleDiagnostics.shouldDecay,
    shouldReview: lifecycleDiagnostics.shouldReview,
    shouldArchiveCandidate: lifecycleDiagnostics.shouldArchiveCandidate,
    sampleCount: stabilityDiagnostics.sampleCount,
    suspectedGaming: stabilityDiagnostics.suspectedGaming,
    optimizationReason,
    optimizationSuggestion,
    behaviorScore: Math.round(normalizeBehaviorScore(input.behaviorScore, input.metadata) * 10000) / 10000,
    reasons
  };
}
