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
      targetType: "admin_knowledge_policy"
    });
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("分析知识自治策略"));
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
            updatedAt: true
          }
        }
      }
    });
    const items: KnowledgePolicyReportItem[] = chunks.map((chunk) => {
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
        chunkId: chunk.id,
        knowledgeItemId: chunk.knowledgeItemId,
        title: chunk.knowledgeItem.title,
        sourceTitle: chunk.knowledgeItem.sourceTitle,
        agentId: scoped.agentId,
        knowledgeBaseId: scoped.knowledgeBaseId,
        namespace: scoped.namespace,
        policy
      };
    });
    const summary = summarizeKnowledgePolicy(items);

    return NextResponse.json({
      ok: true,
      success: true,
      summary,
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
      recommendations: buildPolicyRecommendations(items),
      shadowMode: true,
      diagnostics: {
        mode: "read_only_policy_analysis",
        dataCoreMode: coreState.diagnostics.mode,
        metadataPersisted: false,
        autoDeleteEnabled: false,
        autoArchiveEnabled: false,
        autoMergeEnabled: false,
        autoPublishEnabled: false,
        autoDisableEnabled: false,
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
          policyDecision: item.policy.decision,
          policyScore: item.policy.policyScore,
          policyRiskLevel: item.policy.riskLevel,
          policyConfidence: item.policy.confidence,
          policyReason: item.policy.reason,
          policySuggestion: item.policy.suggestion,
          allowedActions: item.policy.allowedActions,
          blockedActions: item.policy.blockedActions,
          requiresHumanReview: item.policy.requiresHumanReview,
          shadowMode: item.policy.shadowMode
        }))
      }
    });
  } catch (error) {
    return apiError(error);
  }
}
