import "server-only";

import { readKnowledgeGovernanceMetadata } from "@/lib/enterprise/knowledge-governance";
import { analyzeKnowledgeOptimization } from "@/lib/enterprise/knowledge-self-optimization-engine";
import { evaluateKnowledgePolicy } from "@/lib/enterprise/knowledge-policy-engine";
import type { ResolvedKnowledgeAccessScope } from "@/lib/enterprise/knowledge-access-scope";
import type {
  KnowledgeOSCoreNormalizedChunk,
  KnowledgeOSCoreNormalizedItem,
  KnowledgeOSRiskLevel
} from "@/lib/enterprise/knowledge-os-core-types";
import type { KnowledgeOSCoreDataSource } from "@/lib/enterprise/knowledge-os-core-data-source";

function clamp01(value: unknown, fallback = 0.5) {
  const numeric = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numeric)) return fallback;
  if (numeric > 1 && numeric <= 5) return Math.max(0, Math.min(1, numeric / 5));
  if (numeric > 5 && numeric <= 100) return Math.max(0, Math.min(1, numeric / 100));

  return Math.max(0, Math.min(1, numeric));
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

function toIso(value: string | Date | null | undefined) {
  if (value instanceof Date) return value.toISOString();

  const date = typeof value === "string" && value.trim() ? new Date(value) : null;

  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function scopeFromMetadata(metadata: unknown, fallback: ResolvedKnowledgeAccessScope) {
  const record = readRecord(metadata);

  return {
    agentId: readString(record, "agentId") ?? fallback.agentId,
    knowledgeBaseId: readString(record, "knowledgeBaseId") ?? fallback.knowledgeBaseId,
    namespace: readString(record, "namespace") ?? fallback.namespace
  };
}

function normalizeRiskLevel(value: string): KnowledgeOSRiskLevel {
  if (value === "low" || value === "medium" || value === "high" || value === "critical") {
    return value;
  }

  return "unknown";
}

export function normalizeKnowledgeOSItems(
  items: KnowledgeOSCoreDataSource["knowledgeItems"],
  scope: ResolvedKnowledgeAccessScope
): KnowledgeOSCoreNormalizedItem[] {
  return items.map((item) => ({
    id: item.id,
    title: item.title,
    status: item.status,
    sourceType: item.sourceType,
    sourceTitle: item.sourceTitle,
    agentId: scope.agentId,
    knowledgeBaseId: scope.knowledgeBaseId,
    namespace: scope.namespace,
    chunkCount: item._count.chunks,
    qualityScore: clamp01(
      (item.clarityScore + item.completenessScore + item.usefulnessScore + item.confidenceScore) / 4,
      0.5
    ),
    updatedAt: item.updatedAt.toISOString()
  }));
}

export function normalizeKnowledgeOSChunks(
  chunks: KnowledgeOSCoreDataSource["knowledgeChunks"],
  scope: ResolvedKnowledgeAccessScope
): KnowledgeOSCoreNormalizedChunk[] {
  return chunks.map((chunk) => {
    const governance = readKnowledgeGovernanceMetadata(chunk.metadata);
    const scoped = scopeFromMetadata(chunk.metadata, scope);
    const analysis = analyzeKnowledgeOptimization({
      baseScore: governance?.qualityScore ?? 0.5,
      qualityScore: governance?.qualityScore ?? null,
      feedbackScore: governance?.feedbackScore ?? null,
      behaviorScore: governance?.behaviorScore ?? null,
      usageScore: governance?.usageScore ?? null,
      freshnessScore: governance?.qualityComponents.freshness ?? null,
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
      sampleCount: governance?.sampleCount ?? null,
      suspectedGaming: governance?.suspectedGaming ?? null,
      metadata: chunk.metadata,
      title: chunk.knowledgeItem.title,
      content: "",
      contentHash: chunk.contentHash,
      createdAt: chunk.createdAt,
      updatedAt: chunk.knowledgeItem.updatedAt,
      expiresAt: chunk.knowledgeItem.expiresAt,
      sourceType: chunk.knowledgeItem.sourceType,
      status: chunk.knowledgeItem.status,
      knowledgeVersion: governance?.version,
      agentId: scoped.agentId,
      knowledgeBaseId: scoped.knowledgeBaseId,
      namespace: scoped.namespace
    });
    const policy = evaluateKnowledgePolicy({
      qualityScore: governance?.qualityScore ?? null,
      feedbackScore: governance?.feedbackScore ?? null,
      behaviorScore: governance?.behaviorScore ?? null,
      optimizationScore: analysis.optimizationScore,
      stableOptimizationScore: analysis.stableOptimizationScore,
      trendScore: analysis.trendScore,
      lifecycleScore: analysis.lifecycleScore,
      lifecycleStage: analysis.lifecycleStage,
      highValue: analysis.highValue,
      lowQuality: analysis.lowQuality,
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
      scopeMissing: !scoped.agentId || !scoped.knowledgeBaseId || !scoped.namespace
    });

    return {
      id: chunk.id,
      knowledgeItemId: chunk.knowledgeItemId,
      title: chunk.knowledgeItem.title,
      sourceTitle: chunk.knowledgeItem.sourceTitle,
      agentId: scoped.agentId,
      knowledgeBaseId: scoped.knowledgeBaseId,
      namespace: scoped.namespace,
      version: governance?.version ?? "v1",
      qualityScore: governance?.qualityScore ?? 0.5,
      stableOptimizationScore: analysis.stableOptimizationScore,
      feedbackScore: governance?.feedbackScore ?? 0,
      behaviorScore: governance?.behaviorScore ?? 0,
      trendScore: analysis.trendScore,
      lifecycleScore: analysis.lifecycleScore,
      policyScore: policy.policyScore,
      policyDecision: policy.decision,
      policyRiskLevel: normalizeRiskLevel(policy.riskLevel),
      lowQuality: analysis.lowQuality,
      highValue: analysis.highValue,
      unknownMetadata: !governance,
      updatedAt: toIso(chunk.knowledgeItem.updatedAt ?? chunk.createdAt)
    };
  });
}
