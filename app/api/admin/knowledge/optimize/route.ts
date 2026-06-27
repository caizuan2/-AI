import { NextResponse } from "next/server";
import { requireKbAdmin } from "@/lib/auth/guards";
import { apiError, databaseConfigError } from "@/lib/api-response";
import {
  buildKnowledgeChunkAccessWhere,
  resolveKnowledgeAccessScope
} from "@/lib/enterprise/knowledge-access-scope";
import { readKnowledgeGovernanceMetadata } from "@/lib/enterprise/knowledge-governance";
import { analyzeKnowledgeOptimization } from "@/lib/enterprise/knowledge-self-optimization-engine";
import { evaluateKnowledgePolicy } from "@/lib/enterprise/knowledge-policy-engine";
import {
  buildPolicyRecommendations,
  summarizeKnowledgePolicy,
  type KnowledgePolicyReportItem
} from "@/lib/enterprise/knowledge-policy-report";
import { buildKnowledgeOSCoreState } from "@/lib/enterprise/knowledge-os-core-state";
import { prisma } from "@/lib/prisma";
import { hasDatabaseUrl } from "@/lib/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OptimizationRecommendation = {
  type:
    | "duplicate_merge_suggestion"
    | "low_quality_review_suggestion"
    | "cold_knowledge_review_suggestion"
    | "conflict_review_suggestion"
    | "stale_version_review_suggestion"
    | "ranking_volatility_warning"
    | "fast_rising_boost"
    | "stale_high_score_review"
    | "declining_trend_review"
    | "lifecycle_review"
    | "archive_candidate_review"
    | "policy_review_required"
    | "policy_merge_candidate"
    | "policy_archive_candidate"
    | "policy_blocked_auto_action"
    | "policy_decay"
    | "policy_boost";
  agentId: string;
  knowledgeBaseId: string;
  namespace: string;
  chunkIds: string[];
  message: string;
  titles?: string[];
};

type OptimizationReportItem = {
  chunkId: string;
  knowledgeItemId: string;
  title: string;
  sourceTitle: string | null;
  agentId: string;
  knowledgeBaseId: string;
  namespace: string;
  analysis: ReturnType<typeof analyzeKnowledgeOptimization>;
};

function readLimit(value: string | null) {
  const numberValue = Number(value ?? 120);

  return Number.isFinite(numberValue)
    ? Math.max(1, Math.min(500, Math.round(numberValue)))
    : 120;
}

function readBoolean(value: string | null) {
  return value === "1" || value === "true" || value === "yes";
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readString(record: Record<string, unknown>, key: string) {
  return typeof record[key] === "string" && record[key].trim() ? record[key].trim() : null;
}

function readTenantId(actor: Awaited<ReturnType<typeof requireKbAdmin>>) {
  return "tenantId" in actor && typeof actor.tenantId === "string" ? actor.tenantId : null;
}

function scopeKeyFromMetadata(metadata: unknown, fallback: {
  agentId: string;
  knowledgeBaseId: string;
  namespace: string;
}) {
  const record = readRecord(metadata);

  return {
    agentId: readString(record, "agentId") ?? fallback.agentId,
    knowledgeBaseId: readString(record, "knowledgeBaseId") ?? fallback.knowledgeBaseId,
    namespace: readString(record, "namespace") ?? fallback.namespace
  };
}

function createRecommendation(
  input: OptimizationRecommendation
): OptimizationRecommendation {
  return {
    ...input,
    chunkIds: Array.from(new Set(input.chunkIds)).slice(0, 12),
    titles: input.titles ? Array.from(new Set(input.titles)).slice(0, 6) : undefined
  };
}

export async function GET(request: Request) {
  let actor: Awaited<ReturnType<typeof requireKbAdmin>>;

  try {
    actor = await requireKbAdmin(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "admin_knowledge_optimization"
    });
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("分析知识自动优化建议"));
  }

  try {
    const url = new URL(request.url);
    const limit = readLimit(url.searchParams.get("limit"));
    const accessScope = await resolveKnowledgeAccessScope({
      actorUserId: actor.id,
      tenantId: readTenantId(actor),
      appType: "ingest_admin",
      agentId: url.searchParams.get("agentId"),
      knowledgeBaseId: url.searchParams.get("knowledgeBaseId"),
      namespace: url.searchParams.get("namespace"),
      includeShared: readBoolean(url.searchParams.get("includeShared")),
      includePublished: true
    });
    const coreState = await buildKnowledgeOSCoreState({
      actorUserId: actor.id,
      tenantId: readTenantId(actor),
      appType: "ingest_admin",
      agentId: url.searchParams.get("agentId"),
      knowledgeBaseId: url.searchParams.get("knowledgeBaseId"),
      namespace: url.searchParams.get("namespace"),
      includeShared: readBoolean(url.searchParams.get("includeShared")),
      includePublished: true,
      limit
    });
    const chunks = await prisma.knowledgeChunk.findMany({
      where: buildKnowledgeChunkAccessWhere(accessScope),
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        knowledgeItemId: true,
        chunkText: true,
        contentHash: true,
        metadata: true,
        createdAt: true,
        knowledgeItem: {
          select: {
            title: true,
            status: true,
            sourceType: true,
            sourceTitle: true,
            expiresAt: true,
            createdAt: true,
            updatedAt: true
          }
        }
      }
    });
    const analyses: OptimizationReportItem[] = chunks.map((chunk) => {
      const governance = readKnowledgeGovernanceMetadata(chunk.metadata);
      const scoped = scopeKeyFromMetadata(chunk.metadata, accessScope);
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
        positiveCount: governance?.positiveCount ?? null,
        negativeCount: governance?.negativeCount ?? null,
        uniqueUserCount: governance?.uniqueUserCount ?? null,
        suspectedGaming: governance?.suspectedGaming ?? null,
        metadata: chunk.metadata,
        title: chunk.knowledgeItem.title,
        content: chunk.chunkText,
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

      return {
        chunkId: chunk.id,
        knowledgeItemId: chunk.knowledgeItemId,
        title: chunk.knowledgeItem.title,
        sourceTitle: chunk.knowledgeItem.sourceTitle,
        agentId: scoped.agentId,
        knowledgeBaseId: scoped.knowledgeBaseId,
        namespace: scoped.namespace,
        analysis
      };
    });
    const duplicateGroups = new Map<string, OptimizationReportItem[]>();

    for (const item of analyses) {
      if (!item.analysis.duplicateGroupKey) {
        continue;
      }

      const key = [
        item.agentId,
        item.knowledgeBaseId,
        item.namespace,
        item.analysis.duplicateGroupKey
      ].join("|");
      const group = duplicateGroups.get(key) ?? [];

      group.push(item);
      duplicateGroups.set(key, group);
    }

    const duplicateChunkIds = new Set<string>();
    const recommendations: OptimizationRecommendation[] = [];

    for (const group of Array.from(duplicateGroups.values())) {
      if (group.length <= 1) {
        continue;
      }

      for (const item of group) {
        duplicateChunkIds.add(item.chunkId);
      }

      const first = group[0];

      recommendations.push(createRecommendation({
        type: "duplicate_merge_suggestion",
        agentId: first.agentId,
        knowledgeBaseId: first.knowledgeBaseId,
        namespace: first.namespace,
        chunkIds: group.map((item) => item.chunkId),
        titles: group.map((item) => item.title),
        message: "建议人工合并重复知识"
      }));

      const hasHighValue = group.some((item) => item.analysis.highValue);
      const hasLowQuality = group.some((item) => item.analysis.lowQuality || item.analysis.conflictLikely);

      if (hasHighValue && hasLowQuality) {
        recommendations.push(createRecommendation({
          type: "conflict_review_suggestion",
          agentId: first.agentId,
          knowledgeBaseId: first.knowledgeBaseId,
          namespace: first.namespace,
          chunkIds: group.map((item) => item.chunkId),
          titles: group.map((item) => item.title),
          message: "同组知识质量信号不一致，建议人工复核是否冲突"
        }));
      }
    }

    for (const item of analyses) {
      if (item.analysis.lowQuality) {
        recommendations.push(createRecommendation({
          type: "low_quality_review_suggestion",
          agentId: item.agentId,
          knowledgeBaseId: item.knowledgeBaseId,
          namespace: item.namespace,
          chunkIds: [item.chunkId],
          titles: [item.title],
          message: "建议人工复查低质量知识"
        }));
      }

      if (item.analysis.coldKnowledge) {
        recommendations.push(createRecommendation({
          type: "cold_knowledge_review_suggestion",
          agentId: item.agentId,
          knowledgeBaseId: item.knowledgeBaseId,
          namespace: item.namespace,
          chunkIds: [item.chunkId],
          titles: [item.title],
          message: "长期未命中，建议复查是否保留或补充触发场景"
        }));
      }

      if (item.analysis.conflictLikely) {
        recommendations.push(createRecommendation({
          type: "conflict_review_suggestion",
          agentId: item.agentId,
          knowledgeBaseId: item.knowledgeBaseId,
          namespace: item.namespace,
          chunkIds: [item.chunkId],
          titles: [item.title],
          message: "建议人工复核冲突知识"
        }));
      }

      if (item.analysis.staleVersion || item.analysis.stale) {
        recommendations.push(createRecommendation({
          type: "stale_version_review_suggestion",
          agentId: item.agentId,
          knowledgeBaseId: item.knowledgeBaseId,
          namespace: item.namespace,
          chunkIds: [item.chunkId],
          titles: [item.title],
          message: "建议人工复核过期或旧版本知识"
        }));
      }

      if (item.analysis.volatilityPenalty >= 0.08 || item.analysis.confidenceWeight < 0.45 || item.analysis.suspectedGaming) {
        recommendations.push(createRecommendation({
          type: "ranking_volatility_warning",
          agentId: item.agentId,
          knowledgeBaseId: item.knowledgeBaseId,
          namespace: item.namespace,
          chunkIds: [item.chunkId],
          titles: [item.title],
          message: "近期反馈样本不足或波动偏大，建议暂缓自动提权"
        }));
      }

      if (item.analysis.fastRising) {
        recommendations.push(createRecommendation({
          type: "fast_rising_boost",
          agentId: item.agentId,
          knowledgeBaseId: item.knowledgeBaseId,
          namespace: item.namespace,
          chunkIds: [item.chunkId],
          titles: [item.title],
          message: "新知识近期上升明显，可提高优先级并继续观察"
        }));
      }

      if (item.analysis.staleHighScore) {
        recommendations.push(createRecommendation({
          type: "stale_high_score_review",
          agentId: item.agentId,
          knowledgeBaseId: item.knowledgeBaseId,
          namespace: item.namespace,
          chunkIds: [item.chunkId],
          titles: [item.title],
          message: "历史高分知识近期走弱，建议人工复核是否需要更新"
        }));
      }

      if (item.analysis.decliningTrend) {
        recommendations.push(createRecommendation({
          type: "declining_trend_review",
          agentId: item.agentId,
          knowledgeBaseId: item.knowledgeBaseId,
          namespace: item.namespace,
          chunkIds: [item.chunkId],
          titles: [item.title],
          message: "知识近期命中或反馈趋势下降，建议复查内容适用性"
        }));
      }

      if (item.analysis.shouldArchiveCandidate) {
        recommendations.push(createRecommendation({
          type: "archive_candidate_review",
          agentId: item.agentId,
          knowledgeBaseId: item.knowledgeBaseId,
          namespace: item.namespace,
          chunkIds: [item.chunkId],
          titles: [item.title],
          message: "该知识进入归档候选阶段，仅建议人工复核，不自动归档"
        }));
      } else if (item.analysis.lifecycleStage === "declining" || item.analysis.shouldReview) {
        recommendations.push(createRecommendation({
          type: "lifecycle_review",
          agentId: item.agentId,
          knowledgeBaseId: item.knowledgeBaseId,
          namespace: item.namespace,
          chunkIds: [item.chunkId],
          titles: [item.title],
          message: "部分知识进入衰退期，建议人工复核"
        }));
      }
    }

    const policyItems: KnowledgePolicyReportItem[] = analyses.map((item) => ({
      chunkId: item.chunkId,
      knowledgeItemId: item.knowledgeItemId,
      title: item.title,
      sourceTitle: item.sourceTitle,
      agentId: item.agentId,
      knowledgeBaseId: item.knowledgeBaseId,
      namespace: item.namespace,
      policy: evaluateKnowledgePolicy({
        qualityScore: item.analysis.stableOptimizationScore,
        feedbackScore: null,
        behaviorScore: item.analysis.behaviorScore,
        optimizationScore: item.analysis.optimizationScore,
        stableOptimizationScore: item.analysis.stableOptimizationScore,
        trendScore: item.analysis.trendScore,
        lifecycleScore: item.analysis.lifecycleScore,
        lifecycleStage: item.analysis.lifecycleStage,
        highValue: item.analysis.highValue,
        lowQuality: item.analysis.lowQuality,
        fastRising: item.analysis.fastRising,
        decliningTrend: item.analysis.decliningTrend,
        staleHighScore: item.analysis.staleHighScore,
        archiveCandidate: item.analysis.shouldArchiveCandidate,
        duplicateLikely: item.analysis.duplicateLikely || duplicateChunkIds.has(item.chunkId),
        conflictLikely: item.analysis.conflictLikely,
        coldKnowledge: item.analysis.coldKnowledge,
        confidence: item.analysis.lifecycleConfidence,
        volatilityPenalty: item.analysis.volatilityPenalty,
        trustWeight: item.analysis.trustWeight,
        scopeMissing: !item.agentId || !item.knowledgeBaseId || !item.namespace
      })
    }));
    const policySummary = summarizeKnowledgePolicy(policyItems);

    for (const recommendation of buildPolicyRecommendations(policyItems)) {
      recommendations.push(createRecommendation({
        type: recommendation.type,
        agentId: recommendation.agentId,
        knowledgeBaseId: recommendation.knowledgeBaseId,
        namespace: recommendation.namespace,
        chunkIds: [recommendation.chunkId],
        titles: [recommendation.title],
        message: recommendation.message
      }));
    }

    const stableCount = analyses.filter((item) => item.analysis.stabilityScore >= 0.65 && item.analysis.volatilityPenalty < 0.06).length;
    const volatileCount = analyses.filter((item) => item.analysis.volatilityPenalty >= 0.08).length;
    const lowConfidenceCount = analyses.filter((item) => item.analysis.confidenceWeight < 0.45).length;
    const suspectedGamingCount = analyses.filter((item) => item.analysis.suspectedGaming).length;
    const fastRisingCount = analyses.filter((item) => item.analysis.fastRising).length;
    const decliningTrendCount = analyses.filter((item) => item.analysis.decliningTrend).length;
    const staleHighScoreCount = analyses.filter((item) => item.analysis.staleHighScore).length;
    const evergreenCount = analyses.filter((item) => item.analysis.evergreen).length;
    const lifecycleNewCount = analyses.filter((item) => item.analysis.lifecycleStage === "new").length;
    const lifecycleGrowingCount = analyses.filter((item) => item.analysis.lifecycleStage === "growing").length;
    const lifecycleStableCount = analyses.filter((item) => item.analysis.lifecycleStage === "stable").length;
    const lifecycleDecliningCount = analyses.filter((item) => item.analysis.lifecycleStage === "declining").length;
    const lifecycleArchiveCandidateCount = analyses.filter((item) => item.analysis.lifecycleStage === "archive_candidate").length;
    const lifecycleUnknownCount = analyses.filter((item) => item.analysis.lifecycleStage === "unknown").length;

    return NextResponse.json({
      ok: true,
      success: true,
      summary: {
        analyzedChunkCount: analyses.length,
        highValueCount: analyses.filter((item) => item.analysis.highValue).length,
        lowQualityCount: analyses.filter((item) => item.analysis.lowQuality).length,
        duplicateLikelyCount: duplicateChunkIds.size,
        coldKnowledgeCount: analyses.filter((item) => item.analysis.coldKnowledge).length,
        conflictLikelyCount: analyses.filter((item) => item.analysis.conflictLikely).length,
        staleVersionCount: analyses.filter((item) => item.analysis.staleVersion || item.analysis.stale).length,
        stability: {
          stableCount,
          volatileCount,
          lowConfidenceCount,
          suspectedGamingCount
        },
        trend: {
          fastRisingCount,
          decliningTrendCount,
          staleHighScoreCount,
          evergreenCount,
          shadowModeCount: analyses.filter((item) => item.analysis.trendShadowMode).length
        },
        lifecycle: {
          newCount: lifecycleNewCount,
          growingCount: lifecycleGrowingCount,
          stableCount: lifecycleStableCount,
          decliningCount: lifecycleDecliningCount,
          archiveCandidateCount: lifecycleArchiveCandidateCount,
          unknownCount: lifecycleUnknownCount
        },
        policy: {
          boostCount: policySummary.boostCount,
          keepCount: policySummary.keepCount,
          monitorCount: policySummary.monitorCount,
          decayCount: policySummary.decayCount,
          reviewRequiredCount: policySummary.reviewRequiredCount,
          mergeCandidateCount: policySummary.mergeCandidateCount,
          archiveCandidateCount: policySummary.archiveCandidateCount,
          blockedAutoActionCount: policySummary.blockedAutoActionCount,
          unknownCount: policySummary.unknownCount,
          shadowMode: policySummary.shadowMode
        }
      },
      release: {
        releaseReadiness: coreState.releaseReadiness,
        systemHealthScore: coreState.systemHealthScore,
        ragHealthScore: coreState.ragHealthScore,
        agentHealthScore: coreState.agentHealthScore,
        knowledgeBaseHealthScore: coreState.knowledgeBaseHealthScore,
        riskIndex: coreState.riskIndex,
        riskLevel: coreState.riskLevel,
        shadowMode: coreState.diagnostics.shadowMode
      },
      core: {
        dataQuality: coreState.dataQuality,
        realDataUsed: coreState.diagnostics.realDataUsed,
        summary: coreState.summary,
        distributions: coreState.distributions
      },
      recommendations: recommendations.slice(0, 50),
      diagnostics: {
        mode: "read_only_runtime_analysis",
        dataCoreMode: coreState.diagnostics.mode,
        metadataPersisted: false,
        autoDeleteEnabled: false,
        autoMergeEnabled: false,
        scope: {
          agentId: accessScope.agentId,
          knowledgeBaseId: accessScope.knowledgeBaseId,
          namespace: accessScope.namespace,
          includeShared: accessScope.includeShared,
          includePublished: accessScope.includePublished
        },
        sample: analyses.slice(0, 20).map((item) => ({
          chunkId: item.chunkId,
          knowledgeItemId: item.knowledgeItemId,
          title: item.title,
          agentId: item.agentId,
          knowledgeBaseId: item.knowledgeBaseId,
          namespace: item.namespace,
          optimizationScore: item.analysis.optimizationScore,
          stabilityScore: item.analysis.stabilityScore,
          confidenceWeight: item.analysis.confidenceWeight,
          trustWeight: item.analysis.trustWeight,
          volatilityPenalty: item.analysis.volatilityPenalty,
          stableOptimizationScore: item.analysis.stableOptimizationScore,
          trendScore: item.analysis.trendScore,
          trendLabel: item.analysis.trendLabel,
          trendConfidence: item.analysis.trendConfidence,
          staleRisk: item.analysis.staleRisk,
          fastRising: item.analysis.fastRising,
          staleHighScore: item.analysis.staleHighScore,
          decliningTrend: item.analysis.decliningTrend,
          evergreen: item.analysis.evergreen,
          trendReason: item.analysis.trendReason,
          trendShadowMode: item.analysis.trendShadowMode,
          lifecycleStage: item.analysis.lifecycleStage,
          lifecycleScore: item.analysis.lifecycleScore,
          lifecycleConfidence: item.analysis.lifecycleConfidence,
          lifecycleReason: item.analysis.lifecycleReason,
          lifecycleSuggestion: item.analysis.lifecycleSuggestion,
          policyDecision: policyItems.find((policyItem) => policyItem.chunkId === item.chunkId)?.policy.decision ?? "monitor",
          policyScore: policyItems.find((policyItem) => policyItem.chunkId === item.chunkId)?.policy.policyScore ?? 0.5,
          policyRiskLevel: policyItems.find((policyItem) => policyItem.chunkId === item.chunkId)?.policy.riskLevel ?? "unknown",
          policyConfidence: policyItems.find((policyItem) => policyItem.chunkId === item.chunkId)?.policy.confidence ?? 0.25,
          policySuggestion: policyItems.find((policyItem) => policyItem.chunkId === item.chunkId)?.policy.suggestion ?? "策略数据不足，继续观察",
          shouldBoost: item.analysis.shouldBoost,
          shouldDecay: item.analysis.shouldDecay,
          shouldReview: item.analysis.shouldReview,
          shouldArchiveCandidate: item.analysis.shouldArchiveCandidate,
          sampleCount: item.analysis.sampleCount,
          suspectedGaming: item.analysis.suspectedGaming,
          highValue: item.analysis.highValue,
          lowQuality: item.analysis.lowQuality,
          duplicateLikely: item.analysis.duplicateLikely || duplicateChunkIds.has(item.chunkId),
          duplicateGroupKey: item.analysis.duplicateGroupKey,
          coldKnowledge: item.analysis.coldKnowledge,
          conflictLikely: item.analysis.conflictLikely,
          staleVersion: item.analysis.staleVersion,
          optimizationReason: item.analysis.optimizationReason,
          optimizationSuggestion: item.analysis.optimizationSuggestion
        }))
      }
    });
  } catch (error) {
    return apiError(error);
  }
}
