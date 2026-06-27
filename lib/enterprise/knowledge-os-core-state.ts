import "server-only";

import { loadKnowledgeOSCoreData, type KnowledgeOSCoreDataSourceInput } from "@/lib/enterprise/knowledge-os-core-data-source";
import { normalizeKnowledgeOSChunks, normalizeKnowledgeOSItems } from "@/lib/enterprise/knowledge-os-core-normalizer";
import { aggregateKnowledgeSystemState } from "@/lib/enterprise/knowledge-system-aggregator";
import { aggregateKnowledgeOSCoreState } from "@/lib/enterprise/knowledge-os-core-aggregator";
import { calculateKnowledgeOSCoreHealth } from "@/lib/enterprise/knowledge-os-core-health";
import { calculateKnowledgeOSRisk } from "@/lib/enterprise/knowledge-os-core-risk";
import type { KnowledgeReleaseChunkRecord } from "@/lib/enterprise/knowledge-system-aggregator";
import type { KnowledgeOSCoreState, KnowledgeOSDataQuality } from "@/lib/enterprise/knowledge-os-core-types";

function round4(value: number) {
  return Math.round(Math.max(0, Math.min(1, value)) * 10000) / 10000;
}

function ratio(count: number, total: number) {
  return total > 0 ? round4(count / total) : 0;
}

function decideDataQuality(input: {
  totalKnowledgeItems: number;
  totalChunks: number;
  unknownMetadataCount: number;
  warnings: string[];
}): { dataQuality: KnowledgeOSDataQuality; fallbackReason: string | null; realDataUsed: boolean } {
  if (input.warnings.length > 0) {
    return {
      dataQuality: "shadow",
      fallbackReason: input.warnings[0] ?? "data_source_warning",
      realDataUsed: input.totalChunks > 0 || input.totalKnowledgeItems > 0
    };
  }

  if (input.totalChunks <= 0 && input.totalKnowledgeItems <= 0) {
    return {
      dataQuality: "insufficient_data",
      fallbackReason: "no_knowledge_items_or_chunks",
      realDataUsed: false
    };
  }

  if (input.totalChunks <= 0 || input.unknownMetadataCount > 0) {
    return {
      dataQuality: "partial",
      fallbackReason: "partial_or_missing_governance_metadata",
      realDataUsed: true
    };
  }

  return {
    dataQuality: "real",
    fallbackReason: null,
    realDataUsed: true
  };
}

export async function buildKnowledgeOSCoreState(input: KnowledgeOSCoreDataSourceInput): Promise<KnowledgeOSCoreState> {
  const data = await loadKnowledgeOSCoreData(input);
  const normalizedItems = normalizeKnowledgeOSItems(data.knowledgeItems, data.accessScope);
  const normalizedChunks = normalizeKnowledgeOSChunks(data.knowledgeChunks, data.accessScope);
  const releaseChunks: KnowledgeReleaseChunkRecord[] = data.knowledgeChunks.map((chunk) => ({
    id: chunk.id,
    knowledgeItemId: chunk.knowledgeItemId,
    chunkText: null,
    contentHash: chunk.contentHash,
    metadata: chunk.metadata,
    createdAt: chunk.createdAt,
    knowledgeItem: chunk.knowledgeItem
  }));
  const releaseAggregation = aggregateKnowledgeSystemState({
    chunks: releaseChunks,
    fallbackScope: data.accessScope
  });
  const health = calculateKnowledgeOSCoreHealth(releaseAggregation);
  const aggregated = aggregateKnowledgeOSCoreState({
    normalizedItems,
    normalizedChunks,
    releaseAggregation
  });
  const totalChunks = aggregated.summary.totalChunks;
  const unknownMetadataRatio = ratio(aggregated.summary.unknownMetadataCount, totalChunks);
  const calculatedRisk = calculateKnowledgeOSRisk({
    systemHealthScore: health.systemHealthScore,
    highRiskRatio: ratio(aggregated.summary.highRiskCount, totalChunks),
    criticalRiskRatio: ratio(aggregated.summary.criticalRiskCount, totalChunks),
    lowQualityRatio: ratio(aggregated.summary.lowQualityCount, totalChunks),
    unknownMetadataRatio,
    reviewRatio: ratio(aggregated.summary.reviewRequiredCount, totalChunks)
  });
  const quality = decideDataQuality({
    totalKnowledgeItems: aggregated.summary.totalKnowledgeItems,
    totalChunks,
    unknownMetadataCount: aggregated.summary.unknownMetadataCount,
    warnings: data.diagnostics.warnings
  });

  return {
    success: true,
    generatedAt: new Date().toISOString(),
    dataQuality: quality.dataQuality,
    releaseReadiness: health.releaseReadiness,
    riskLevel: calculatedRisk.riskLevel,
    systemHealthScore: health.systemHealthScore,
    ragHealthScore: health.ragHealthScore,
    agentHealthScore: health.agentHealthScore,
    knowledgeBaseHealthScore: health.knowledgeBaseHealthScore,
    policyHealthScore: health.policyHealthScore,
    lifecycleHealthScore: health.lifecycleHealthScore,
    trendHealthScore: health.trendHealthScore,
    feedbackHealthScore: health.feedbackHealthScore,
    behaviorHealthScore: health.behaviorHealthScore,
    riskIndex: calculatedRisk.riskIndex,
    summary: {
      ...aggregated.summary,
      shadowMode: true
    },
    agents: aggregated.agents,
    knowledgeBases: aggregated.knowledgeBases,
    distributions: aggregated.distributions,
    recommendations: aggregated.recommendations,
    diagnostics: {
      mode: "knowledge_os_data_core_v4",
      realDataUsed: quality.realDataUsed,
      shadowMode: true,
      fallbackReason: quality.fallbackReason,
      unknownMetadataRatio,
      metadataPersisted: false,
      autoDeleteEnabled: false,
      autoArchiveEnabled: false,
      autoMergeEnabled: false,
      autoPublishEnabled: false,
      sourceCounts: {
        knowledgeItems: data.knowledgeItems.length,
        knowledgeChunks: data.knowledgeChunks.length,
        feedbackEvents: data.feedbackEvents.length,
        behaviorEvents: data.behaviorEvents.length
      },
      scope: data.accessScope,
      warnings: data.diagnostics.warnings
    }
  };
}
