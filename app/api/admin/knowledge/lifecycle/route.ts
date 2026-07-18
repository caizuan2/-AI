import { NextResponse } from "next/server";
import { requireKbAdmin } from "@/lib/auth/guards";
import { apiError, databaseConfigError } from "@/lib/api-response";
import {
  buildKnowledgeChunkAccessWhere,
  resolveKnowledgeAccessScope
} from "@/lib/enterprise/knowledge-access-scope";
import { readKnowledgeGovernanceMetadata } from "@/lib/enterprise/knowledge-governance";
import { classifyKnowledgeLifecycle } from "@/lib/enterprise/knowledge-lifecycle-engine";
import {
  buildLifecycleRecommendations,
  summarizeKnowledgeLifecycle,
  type KnowledgeLifecycleReportItem
} from "@/lib/enterprise/knowledge-lifecycle-report";
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

function readLimit(value: string | null) {
  const numberValue = Number(value ?? 160);

  return Number.isFinite(numberValue)
    ? Math.max(1, Math.min(600, Math.round(numberValue)))
    : 160;
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

export async function GET(request: Request) {
  let actor: Awaited<ReturnType<typeof requireKbAdmin>>;

  try {
    actor = await requireKbAdmin(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "admin_knowledge_lifecycle"
    });
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("分析知识生命周期"));
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
        metadata: true,
        createdAt: true,
        knowledgeItem: {
          select: {
            title: true,
            status: true,
            sourceTitle: true,
            updatedAt: true
          }
        }
      }
    });
    const items: KnowledgeLifecycleReportItem[] = chunks.map((chunk) => {
      const governance = readKnowledgeGovernanceMetadata(chunk.metadata);
      const scoped = scopeKeyFromMetadata(chunk.metadata, accessScope);
      const lifecycle = governance
        ? classifyKnowledgeLifecycle({
          createdAt: governance.ingestTimestamp ?? chunk.createdAt,
          updatedAt: chunk.knowledgeItem.updatedAt,
          usageScore: governance.usageScore,
          feedbackScore: governance.feedbackScore,
          behaviorScore: governance.behaviorScore,
          trendScore: governance.trendScore,
          stableOptimizationScore: governance.stableOptimizationScore,
          qualityScore: governance.qualityScore,
          freshnessScore: governance.qualityComponents.freshness,
          hitCount: governance.sampleCount,
          fastRising: governance.fastRising,
          staleHighScore: governance.staleHighScore,
          decliningTrend: governance.decliningTrend,
          evergreen: governance.evergreen,
          lowQuality: governance.lowQuality,
          highValue: governance.highValue,
          staleVersion: governance.recommendedAction === "review" || chunk.knowledgeItem.status === "archived"
        })
        : classifyKnowledgeLifecycle({
          createdAt: chunk.createdAt,
          updatedAt: chunk.knowledgeItem.updatedAt,
          staleVersion: chunk.knowledgeItem.status === "archived"
        });

      return {
        chunkId: chunk.id,
        knowledgeItemId: chunk.knowledgeItemId,
        title: chunk.knowledgeItem.title,
        sourceTitle: chunk.knowledgeItem.sourceTitle,
        agentId: scoped.agentId,
        knowledgeBaseId: scoped.knowledgeBaseId,
        namespace: scoped.namespace,
        lifecycle
      };
    });
    const summary = summarizeKnowledgeLifecycle(items);
    const policyItems: KnowledgePolicyReportItem[] = chunks.map((chunk) => {
      const governance = readKnowledgeGovernanceMetadata(chunk.metadata);
      const scoped = scopeKeyFromMetadata(chunk.metadata, accessScope);
      const lifecycle = items.find((item) => item.chunkId === chunk.id)?.lifecycle;

      return {
        chunkId: chunk.id,
        knowledgeItemId: chunk.knowledgeItemId,
        title: chunk.knowledgeItem.title,
        sourceTitle: chunk.knowledgeItem.sourceTitle,
        agentId: scoped.agentId,
        knowledgeBaseId: scoped.knowledgeBaseId,
        namespace: scoped.namespace,
        policy: evaluateKnowledgePolicy({
          qualityScore: governance?.qualityScore ?? null,
          feedbackScore: governance?.feedbackScore ?? null,
          behaviorScore: governance?.behaviorScore ?? null,
          stableOptimizationScore: governance?.stableOptimizationScore ?? null,
          trendScore: governance?.trendScore ?? null,
          lifecycleScore: lifecycle?.lifecycleScore ?? null,
          lifecycleStage: lifecycle?.lifecycleStage ?? null,
          highValue: governance?.highValue ?? false,
          lowQuality: governance?.lowQuality ?? false,
          fastRising: governance?.fastRising ?? false,
          decliningTrend: governance?.decliningTrend ?? false,
          staleHighScore: governance?.staleHighScore ?? false,
          archiveCandidate: lifecycle?.shouldArchiveCandidate ?? false,
          confidence: lifecycle?.lifecycleConfidence ?? governance?.confidenceWeight ?? null,
          volatilityPenalty: governance?.volatilityPenalty ?? null,
          trustWeight: governance?.trustWeight ?? null,
          scopeMissing: !scoped.agentId || !scoped.knowledgeBaseId || !scoped.namespace
        })
      };
    });
    const policySummary = summarizeKnowledgePolicy(policyItems);
    const policyByChunkId = new Map(policyItems.map((item) => [item.chunkId, item.policy]));

    return NextResponse.json({
      ok: true,
      success: true,
      summary: {
        ...summary,
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
      recommendations: [
        ...buildLifecycleRecommendations(items),
        ...buildPolicyRecommendations(policyItems)
      ].slice(0, 120),
      shadowMode: summary.shadowMode,
      diagnostics: {
        mode: "read_only_lifecycle_analysis",
        dataCoreMode: coreState.diagnostics.mode,
        metadataPersisted: false,
        autoDeleteEnabled: false,
        autoArchiveEnabled: false,
        autoMergeEnabled: false,
        scope: {
          agentId: accessScope.agentId,
          knowledgeBaseId: accessScope.knowledgeBaseId,
          namespace: accessScope.namespace,
          includeShared: accessScope.includeShared,
          includePublished: accessScope.includePublished
        },
        sample: items.slice(0, 30).map((item) => ({
          chunkId: item.chunkId,
          knowledgeItemId: item.knowledgeItemId,
          title: item.title,
          agentId: item.agentId,
          knowledgeBaseId: item.knowledgeBaseId,
          namespace: item.namespace,
          lifecycleStage: item.lifecycle.lifecycleStage,
          lifecycleScore: item.lifecycle.lifecycleScore,
          lifecycleConfidence: item.lifecycle.lifecycleConfidence,
          lifecycleReason: item.lifecycle.lifecycleReason,
          lifecycleSuggestion: item.lifecycle.lifecycleSuggestion,
          shouldBoost: item.lifecycle.shouldBoost,
          shouldDecay: item.lifecycle.shouldDecay,
          shouldReview: item.lifecycle.shouldReview,
          shouldArchiveCandidate: item.lifecycle.shouldArchiveCandidate,
          policyDecision: policyByChunkId.get(item.chunkId)?.decision ?? "monitor",
          policyScore: policyByChunkId.get(item.chunkId)?.policyScore ?? 0.5,
          policyRiskLevel: policyByChunkId.get(item.chunkId)?.riskLevel ?? "unknown",
          policyConfidence: policyByChunkId.get(item.chunkId)?.confidence ?? 0.25,
          policySuggestion: policyByChunkId.get(item.chunkId)?.suggestion ?? "策略数据不足，继续观察"
        }))
      }
    });
  } catch (error) {
    return apiError(error);
  }
}
