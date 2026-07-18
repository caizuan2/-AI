import "server-only";

import { readKnowledgeGovernanceMetadata } from "@/lib/enterprise/knowledge-governance";
import { analyzeKnowledgeOptimization } from "@/lib/enterprise/knowledge-self-optimization-engine";
import { evaluateKnowledgePolicy } from "@/lib/enterprise/knowledge-policy-engine";
import type {
  KnowledgeReleaseDistribution,
  KnowledgeReleaseHealthTarget,
  KnowledgeReleaseRiskLevel,
  KnowledgeReleaseSystemAggregation
} from "@/lib/enterprise/knowledge-release-types";
import type {
  KnowledgePolicyDecision,
  KnowledgePolicySignal
} from "@/lib/enterprise/knowledge-policy-types";

export type KnowledgeReleaseChunkRecord = {
  id?: string;
  knowledgeItemId?: string;
  chunkText?: string | null;
  contentHash?: string | null;
  metadata?: unknown;
  createdAt?: string | Date | null;
  knowledgeItem?: {
    title?: string | null;
    status?: string | null;
    sourceType?: string | null;
    sourceTitle?: string | null;
    expiresAt?: string | Date | null;
    createdAt?: string | Date | null;
    updatedAt?: string | Date | null;
  } | null;
};

export type KnowledgeSystemAggregationInput = {
  chunks: KnowledgeReleaseChunkRecord[];
  fallbackScope?: {
    agentId?: string | null;
    knowledgeBaseId?: string | null;
    namespace?: string | null;
  } | null;
};

type ScopeKey = {
  agentId: string;
  knowledgeBaseId: string;
  namespace: string;
};

type GroupAccumulator = ScopeKey & {
  id: string;
  name: string;
  chunkCount: number;
  healthTotal: number;
  riskTotal: number;
  highRiskCount: number;
  criticalRiskCount: number;
  reviewRequiredCount: number;
  lowQualityCount: number;
  highValueCount: number;
  unknownMetadataCount: number;
  latestUpdatedAt: string | null;
  policyDistribution: KnowledgeReleaseDistribution;
  lifecycleDistribution: KnowledgeReleaseDistribution;
};

const KNOWN_POLICY_DECISIONS: KnowledgePolicyDecision[] = [
  "boost",
  "keep",
  "monitor",
  "decay",
  "review_required",
  "merge_candidate",
  "archive_candidate",
  "blocked_auto_action",
  "unknown"
];

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

function roundSigned4(value: number) {
  return Math.round(clampSigned(value) * 10000) / 10000;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNestedRecord(record: Record<string, unknown>, key: string) {
  return readRecord(record[key]);
}

function readNumberFromRecords(records: Record<string, unknown>[], keys: string[], fallback: number) {
  for (const record of records) {
    for (const key of keys) {
      const value = record[key];
      const numeric = typeof value === "number" ? value : Number(value);

      if (Number.isFinite(numeric)) {
        return numeric;
      }
    }
  }

  return fallback;
}

function readBooleanFromRecords(records: Record<string, unknown>[], keys: string[], fallback = false) {
  for (const record of records) {
    for (const key of keys) {
      const value = record[key];

      if (value === true || value === "true" || value === 1 || value === "1") {
        return true;
      }

      if (value === false || value === "false" || value === 0 || value === "0") {
        return false;
      }
    }
  }

  return fallback;
}

function toIso(value: string | Date | null | undefined) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  const date = typeof value === "string" && value.trim() ? new Date(value) : null;

  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function distributionInc(distribution: KnowledgeReleaseDistribution, key: string) {
  distribution[key] = (distribution[key] ?? 0) + 1;
}

function avg(total: number, count: number, fallback = 0.5) {
  return count > 0 ? total / count : fallback;
}

function normalizedSigned(value: number) {
  return clamp01((clampSigned(value, 0) + 1) / 2, 0.5);
}

function riskWeight(level: KnowledgeReleaseRiskLevel) {
  if (level === "critical") return 1;
  if (level === "high") return 0.78;
  if (level === "medium") return 0.45;
  if (level === "low") return 0.12;

  return 0.35;
}

function readinessFromHealth(healthScore: number, riskIndex: number, criticalRiskCount: number) {
  if (criticalRiskCount > 0 || riskIndex >= 0.7 || healthScore < 0.45) {
    return "blocked" as const;
  }

  if (riskIndex >= 0.35 || healthScore < 0.72) {
    return "warning" as const;
  }

  return "ready" as const;
}

function riskLevelFromIndex(riskIndex: number): KnowledgeReleaseRiskLevel {
  if (riskIndex >= 0.7) return "critical";
  if (riskIndex >= 0.45) return "high";
  if (riskIndex >= 0.25) return "medium";

  return "low";
}

function scopeFromMetadata(metadata: unknown, fallbackScope?: KnowledgeSystemAggregationInput["fallbackScope"]): ScopeKey {
  const record = readRecord(metadata);

  return {
    agentId: readString(record, "agentId") ?? fallbackScope?.agentId ?? "unknown",
    knowledgeBaseId: readString(record, "knowledgeBaseId") ?? fallbackScope?.knowledgeBaseId ?? "unknown",
    namespace: readString(record, "namespace") ?? fallbackScope?.namespace ?? "default"
  };
}

function groupKey(scope: ScopeKey, mode: "agent" | "knowledgeBase") {
  return mode === "agent"
    ? scope.agentId
    : `${scope.knowledgeBaseId}|${scope.namespace}`;
}

function groupName(scope: ScopeKey) {
  return scope.agentId === "unknown" ? "Unknown Agent" : scope.agentId;
}

function knowledgeBaseGroupName(scope: ScopeKey) {
  return scope.knowledgeBaseId === "unknown" ? "Unknown Knowledge Base" : scope.knowledgeBaseId;
}

function makeGroup(scope: ScopeKey, mode: "agent" | "knowledgeBase"): GroupAccumulator {
  return {
    ...scope,
    id: groupKey(scope, mode),
    name: mode === "agent" ? groupName(scope) : knowledgeBaseGroupName(scope),
    chunkCount: 0,
    healthTotal: 0,
    riskTotal: 0,
    highRiskCount: 0,
    criticalRiskCount: 0,
    reviewRequiredCount: 0,
    lowQualityCount: 0,
    highValueCount: 0,
    unknownMetadataCount: 0,
    latestUpdatedAt: null,
    policyDistribution: {},
    lifecycleDistribution: {}
  };
}

function updateGroup(group: GroupAccumulator, input: {
  healthScore: number;
  riskIndex: number;
  riskLevel: KnowledgeReleaseRiskLevel;
  policy: KnowledgePolicySignal;
  lifecycleStage: string;
  lowQuality: boolean;
  highValue: boolean;
  unknownMetadata: boolean;
  updatedAt: string | null;
}) {
  group.chunkCount += 1;
  group.healthTotal += input.healthScore;
  group.riskTotal += input.riskIndex;

  if (input.riskLevel === "high") {
    group.highRiskCount += 1;
  }

  if (input.riskLevel === "critical") {
    group.criticalRiskCount += 1;
  }

  if (input.policy.requiresHumanReview || input.policy.decision === "review_required") {
    group.reviewRequiredCount += 1;
  }

  if (input.lowQuality) {
    group.lowQualityCount += 1;
  }

  if (input.highValue) {
    group.highValueCount += 1;
  }

  if (input.unknownMetadata) {
    group.unknownMetadataCount += 1;
  }

  if (input.updatedAt && (!group.latestUpdatedAt || input.updatedAt > group.latestUpdatedAt)) {
    group.latestUpdatedAt = input.updatedAt;
  }

  distributionInc(group.policyDistribution, input.policy.decision);
  distributionInc(group.lifecycleDistribution, input.lifecycleStage);
}

function finalizeGroup(group: GroupAccumulator): KnowledgeReleaseHealthTarget {
  const healthScore = round4(avg(group.healthTotal, group.chunkCount));
  const riskIndex = round4(avg(group.riskTotal, group.chunkCount, 0.25));

  return {
    id: group.id,
    name: group.name,
    agentId: group.agentId,
    knowledgeBaseId: group.knowledgeBaseId,
    namespace: group.namespace,
    chunkCount: group.chunkCount,
    healthScore,
    riskIndex,
    riskLevel: riskLevelFromIndex(riskIndex),
    readiness: readinessFromHealth(healthScore, riskIndex, group.criticalRiskCount),
    highRiskCount: group.highRiskCount,
    reviewRequiredCount: group.reviewRequiredCount,
    lowQualityCount: group.lowQualityCount,
    highValueCount: group.highValueCount,
    unknownMetadataCount: group.unknownMetadataCount,
    latestUpdatedAt: group.latestUpdatedAt,
    policyDistribution: group.policyDistribution,
    lifecycleDistribution: group.lifecycleDistribution
  };
}

export function aggregateKnowledgeSystemState(input: KnowledgeSystemAggregationInput): KnowledgeReleaseSystemAggregation {
  const chunks = input.chunks ?? [];
  const agentGroups = new Map<string, GroupAccumulator>();
  const knowledgeBaseGroups = new Map<string, GroupAccumulator>();
  const policyDistribution: KnowledgeReleaseDistribution = {};
  const lifecycleDistribution: KnowledgeReleaseDistribution = {};
  const trendDistribution: KnowledgeReleaseDistribution = {};

  let scoredChunks = 0;
  let unknownMetadataCount = 0;
  let lowQualityCount = 0;
  let highValueCount = 0;
  let crossScopeRiskCount = 0;
  let qualityTotal = 0;
  let stableOptimizationTotal = 0;
  let policyScoreTotal = 0;
  let policyConfidenceTotal = 0;
  let lifecycleScoreTotal = 0;
  let lifecycleConfidenceTotal = 0;
  let trendScoreTotal = 0;
  let trendConfidenceTotal = 0;
  let feedbackScoreTotal = 0;
  let behaviorScoreTotal = 0;
  let positiveCount = 0;
  let negativeCount = 0;
  let sampleCount = 0;
  let behaviorEventCount = 0;
  let suspectedGamingCount = 0;

  let boostCount = 0;
  let keepCount = 0;
  let monitorCount = 0;
  let decayCount = 0;
  let reviewRequiredCount = 0;
  let mergeCandidateCount = 0;
  let archiveCandidateCount = 0;
  let blockedAutoActionCount = 0;
  let policyUnknownCount = 0;
  let highRiskCount = 0;
  let criticalRiskCount = 0;

  let lifecycleNewCount = 0;
  let lifecycleGrowingCount = 0;
  let lifecycleStableCount = 0;
  let lifecycleDecliningCount = 0;
  let lifecycleArchiveCandidateCount = 0;
  let lifecycleUnknownCount = 0;

  let fastRisingCount = 0;
  let staleHighScoreCount = 0;
  let decliningTrendCount = 0;
  let evergreenCount = 0;
  let trendUnknownCount = 0;

  for (const chunk of chunks) {
    const metadata = readRecord(chunk.metadata);
    const governanceRecord = readNestedRecord(metadata, "governance");
    const qualityComponents = readNestedRecord(governanceRecord, "qualityComponents");
    const governance = readKnowledgeGovernanceMetadata(chunk.metadata);
    const scope = scopeFromMetadata(chunk.metadata, input.fallbackScope);
    const missingScope = scope.agentId === "unknown" || scope.knowledgeBaseId === "unknown" || scope.namespace === "default";
    const unknownMetadata = !governance;
    const createdAt = chunk.createdAt ?? chunk.knowledgeItem?.createdAt ?? governance?.ingestTimestamp ?? null;
    const updatedAt = toIso(chunk.knowledgeItem?.updatedAt ?? chunk.createdAt ?? governance?.ingestTimestamp ?? null);
    const qualityScore = governance?.qualityScore ?? clamp01(readNumberFromRecords([metadata, governanceRecord], ["qualityScore"], 0.5), 0.5);
    const feedbackScore = governance?.feedbackScore ?? roundSigned4(readNumberFromRecords([metadata, governanceRecord], ["feedbackScore"], 0));
    const behaviorScore = governance?.behaviorScore ?? roundSigned4(readNumberFromRecords([metadata, governanceRecord], ["behaviorScore"], 0));
    const positive = governance?.positiveCount ?? Math.max(0, Math.round(readNumberFromRecords([metadata, governanceRecord], ["positiveCount"], 0)));
    const negative = governance?.negativeCount ?? Math.max(0, Math.round(readNumberFromRecords([metadata, governanceRecord], ["negativeCount"], 0)));
    const samples = governance?.sampleCount ?? Math.max(0, Math.round(readNumberFromRecords([metadata, governanceRecord], ["sampleCount", "hitCount"], positive + negative)));
    const behaviorEvents = governance?.behaviorEventCount ?? Math.max(0, Math.round(readNumberFromRecords([metadata, governanceRecord], ["behaviorEventCount"], 0)));
    const analysis = analyzeKnowledgeOptimization({
      baseScore: qualityScore,
      qualityScore,
      feedbackScore,
      behaviorScore,
      usageScore: governance?.usageScore ?? readNumberFromRecords([metadata, governanceRecord], ["usageScore"], 0),
      freshnessScore: governance?.qualityComponents.freshness ?? readNumberFromRecords([qualityComponents], ["freshness"], 1),
      stabilityScore: governance?.stabilityScore ?? null,
      confidenceWeight: governance?.confidenceWeight ?? null,
      trustWeight: governance?.trustWeight ?? null,
      volatilityPenalty: governance?.volatilityPenalty ?? null,
      stableOptimizationScore: governance?.stableOptimizationScore ?? null,
      trendScore: governance?.trendScore ?? null,
      trendConfidence: governance?.trendConfidence ?? null,
      trendLabel: governance?.trendLabel ?? null,
      staleRisk: governance?.staleRisk ?? null,
      fastRising: governance?.fastRising ?? null,
      staleHighScore: governance?.staleHighScore ?? null,
      decliningTrend: governance?.decliningTrend ?? null,
      evergreen: governance?.evergreen ?? null,
      sampleCount: samples,
      positiveCount: positive,
      negativeCount: negative,
      suspectedGaming: governance?.suspectedGaming ?? null,
      metadata: chunk.metadata,
      title: chunk.knowledgeItem?.title ?? "",
      content: chunk.chunkText ?? "",
      contentHash: chunk.contentHash ?? "",
      createdAt,
      updatedAt,
      expiresAt: chunk.knowledgeItem?.expiresAt ?? null,
      sourceType: chunk.knowledgeItem?.sourceType ?? governance?.sourceType ?? "admin_ingest",
      status: chunk.knowledgeItem?.status ?? "active",
      knowledgeVersion: governance?.version,
      agentId: scope.agentId,
      knowledgeBaseId: scope.knowledgeBaseId,
      namespace: scope.namespace
    });
    const lowQuality = governance?.lowQuality ?? analysis.lowQuality ?? readBooleanFromRecords([metadata, governanceRecord], ["lowQuality"], false);
    const highValue = governance?.highValue ?? analysis.highValue ?? readBooleanFromRecords([metadata, governanceRecord], ["highValue"], false);
    const policy = evaluateKnowledgePolicy({
      qualityScore,
      feedbackScore,
      behaviorScore,
      optimizationScore: analysis.optimizationScore,
      stableOptimizationScore: analysis.stableOptimizationScore,
      trendScore: analysis.trendScore,
      lifecycleScore: analysis.lifecycleScore,
      lifecycleStage: analysis.lifecycleStage,
      highValue,
      lowQuality,
      fastRising: analysis.fastRising,
      decliningTrend: analysis.decliningTrend,
      staleHighScore: analysis.staleHighScore,
      archiveCandidate: analysis.shouldArchiveCandidate,
      duplicateLikely: analysis.duplicateLikely,
      conflictLikely: analysis.conflictLikely,
      coldKnowledge: analysis.coldKnowledge,
      confidence: analysis.lifecycleConfidence,
      volatilityPenalty: analysis.volatilityPenalty,
      trustWeight: analysis.trustWeight,
      scopeMissing: missingScope
    });
    const stableOptimizationScore = analysis.stableOptimizationScore;
    const trendLabel = analysis.trendLabel ?? governance?.trendLabel ?? "neutral";
    const lifecycleStage = analysis.lifecycleStage ?? governance?.lifecycleStage ?? "unknown";
    const riskIndex = clamp01(
      (riskWeight(policy.riskLevel) * 0.42)
      + ((1 - policy.policyScore) * 0.22)
      + ((1 - analysis.lifecycleScore) * 0.16)
      + (lowQuality ? 0.1 : 0)
      + (missingScope ? 0.1 : 0),
      0.35
    );
    const itemHealthScore = round4(
      (stableOptimizationScore * 0.3)
      + (analysis.lifecycleScore * 0.18)
      + (analysis.trendScore * 0.16)
      + (policy.policyScore * 0.18)
      + (normalizedSigned(feedbackScore) * 0.08)
      + (normalizedSigned(behaviorScore) * 0.06)
      + (qualityScore * 0.04)
      - (missingScope ? 0.08 : 0)
    );
    const riskLevel = riskLevelFromIndex(riskIndex);
    const agentGroupKey = groupKey(scope, "agent");
    const knowledgeBaseGroupKey = groupKey(scope, "knowledgeBase");
    const agentGroup = agentGroups.get(agentGroupKey) ?? makeGroup(scope, "agent");
    const knowledgeBaseGroup = knowledgeBaseGroups.get(knowledgeBaseGroupKey) ?? makeGroup(scope, "knowledgeBase");

    agentGroups.set(agentGroupKey, agentGroup);
    knowledgeBaseGroups.set(knowledgeBaseGroupKey, knowledgeBaseGroup);
    updateGroup(agentGroup, {
      healthScore: itemHealthScore,
      riskIndex,
      riskLevel,
      policy,
      lifecycleStage,
      lowQuality,
      highValue,
      unknownMetadata,
      updatedAt
    });
    updateGroup(knowledgeBaseGroup, {
      healthScore: itemHealthScore,
      riskIndex,
      riskLevel,
      policy,
      lifecycleStage,
      lowQuality,
      highValue,
      unknownMetadata,
      updatedAt
    });

    if (!unknownMetadata) {
      scoredChunks += 1;
    } else {
      unknownMetadataCount += 1;
    }

    if (lowQuality) lowQualityCount += 1;
    if (highValue) highValueCount += 1;
    if (missingScope) crossScopeRiskCount += 1;

    qualityTotal += qualityScore;
    stableOptimizationTotal += stableOptimizationScore;
    policyScoreTotal += policy.policyScore;
    policyConfidenceTotal += policy.confidence;
    lifecycleScoreTotal += analysis.lifecycleScore;
    lifecycleConfidenceTotal += analysis.lifecycleConfidence;
    trendScoreTotal += analysis.trendScore;
    trendConfidenceTotal += analysis.trendConfidence;
    feedbackScoreTotal += feedbackScore;
    behaviorScoreTotal += behaviorScore;
    positiveCount += positive;
    negativeCount += negative;
    sampleCount += samples;
    behaviorEventCount += behaviorEvents;
    if (analysis.suspectedGaming) suspectedGamingCount += 1;

    distributionInc(policyDistribution, policy.decision);
    distributionInc(lifecycleDistribution, lifecycleStage);
    distributionInc(trendDistribution, trendLabel);

    if (policy.decision === "boost") boostCount += 1;
    if (policy.decision === "keep") keepCount += 1;
    if (policy.decision === "monitor") monitorCount += 1;
    if (policy.decision === "decay") decayCount += 1;
    if (policy.decision === "review_required" || policy.requiresHumanReview) reviewRequiredCount += 1;
    if (policy.decision === "merge_candidate") mergeCandidateCount += 1;
    if (policy.decision === "archive_candidate") archiveCandidateCount += 1;
    if (policy.decision === "blocked_auto_action") blockedAutoActionCount += 1;
    if (policy.decision === "unknown") policyUnknownCount += 1;
    if (policy.riskLevel === "high") highRiskCount += 1;
    if (policy.riskLevel === "critical") criticalRiskCount += 1;

    if (lifecycleStage === "new") lifecycleNewCount += 1;
    else if (lifecycleStage === "growing") lifecycleGrowingCount += 1;
    else if (lifecycleStage === "stable") lifecycleStableCount += 1;
    else if (lifecycleStage === "declining") lifecycleDecliningCount += 1;
    else if (lifecycleStage === "archive_candidate") lifecycleArchiveCandidateCount += 1;
    else lifecycleUnknownCount += 1;

    if (analysis.fastRising) fastRisingCount += 1;
    if (analysis.staleHighScore) staleHighScoreCount += 1;
    if (analysis.decliningTrend) decliningTrendCount += 1;
    if (analysis.evergreen) evergreenCount += 1;
    if (unknownMetadata) trendUnknownCount += 1;
  }

  const totalChunks = chunks.length;
  const agents = Array.from(agentGroups.values())
    .map(finalizeGroup)
    .sort((a, b) => a.healthScore - b.healthScore || b.chunkCount - a.chunkCount);
  const knowledgeBases = Array.from(knowledgeBaseGroups.values())
    .map(finalizeGroup)
    .sort((a, b) => a.healthScore - b.healthScore || b.chunkCount - a.chunkCount);

  return {
    ragSummary: {
      totalChunks,
      scoredChunks,
      unknownMetadataCount,
      lowQualityCount,
      highValueCount,
      avgQualityScore: round4(avg(qualityTotal, totalChunks)),
      avgStableOptimizationScore: round4(avg(stableOptimizationTotal, totalChunks)),
      crossScopeRiskCount
    },
    policySummary: {
      totalChunks,
      boostCount,
      keepCount,
      monitorCount,
      decayCount,
      reviewRequiredCount,
      mergeCandidateCount,
      archiveCandidateCount,
      blockedAutoActionCount,
      unknownCount: policyUnknownCount,
      highRiskCount,
      criticalRiskCount,
      avgPolicyScore: round4(avg(policyScoreTotal, totalChunks)),
      avgPolicyConfidence: round4(avg(policyConfidenceTotal, totalChunks, 0.25)),
      shadowMode: true
    },
    lifecycleSummary: {
      totalChunks,
      newCount: lifecycleNewCount,
      growingCount: lifecycleGrowingCount,
      stableCount: lifecycleStableCount,
      decliningCount: lifecycleDecliningCount,
      archiveCandidateCount: lifecycleArchiveCandidateCount,
      unknownCount: lifecycleUnknownCount,
      avgLifecycleScore: round4(avg(lifecycleScoreTotal, totalChunks)),
      avgLifecycleConfidence: round4(avg(lifecycleConfidenceTotal, totalChunks, 0.25))
    },
    trendSummary: {
      totalChunks,
      fastRisingCount,
      staleHighScoreCount,
      decliningTrendCount,
      evergreenCount,
      unknownCount: trendUnknownCount,
      avgTrendScore: round4(avg(trendScoreTotal, totalChunks)),
      avgTrendConfidence: round4(avg(trendConfidenceTotal, totalChunks, 0.25)),
      distribution: trendDistribution
    },
    feedbackSummary: {
      totalChunks,
      avgFeedbackScore: roundSigned4(avg(feedbackScoreTotal, totalChunks, 0)),
      positiveCount,
      negativeCount,
      sampleCount
    },
    behaviorSummary: {
      totalChunks,
      avgBehaviorScore: roundSigned4(avg(behaviorScoreTotal, totalChunks, 0)),
      behaviorEventCount,
      suspectedGamingCount
    },
    agentSummary: {
      totalAgents: agents.length,
      agents
    },
    knowledgeBaseSummary: {
      totalKnowledgeBases: knowledgeBases.length,
      knowledgeBases
    },
    distributions: {
      policy: policyDistribution,
      lifecycle: lifecycleDistribution,
      trend: trendDistribution
    },
    diagnostics: {
      totalChunks,
      fallbackUnknownMetadata: unknownMetadataCount > 0,
      oldMetadataFallback: "neutral",
      policyDecisions: KNOWN_POLICY_DECISIONS
    }
  };
}
