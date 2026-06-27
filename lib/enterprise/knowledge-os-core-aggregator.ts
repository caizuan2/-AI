import "server-only";

import { buildReleaseDashboard } from "@/lib/enterprise/knowledge-release-dashboard";
import type {
  KnowledgeReleaseHealthTarget,
  KnowledgeReleaseSystemAggregation
} from "@/lib/enterprise/knowledge-release-types";
import type {
  KnowledgeOSCoreHealthTarget,
  KnowledgeOSCoreNormalizedChunk,
  KnowledgeOSCoreNormalizedItem,
  KnowledgeOSCoreRecommendation
} from "@/lib/enterprise/knowledge-os-core-types";

function toCoreTarget(target: KnowledgeReleaseHealthTarget): KnowledgeOSCoreHealthTarget {
  return {
    id: target.id,
    name: target.name,
    agentId: target.agentId,
    knowledgeBaseId: target.knowledgeBaseId,
    namespace: target.namespace,
    chunkCount: target.chunkCount,
    healthScore: target.healthScore,
    riskIndex: target.riskIndex,
    riskLevel: target.riskLevel,
    readiness: target.readiness,
    highRiskCount: target.highRiskCount,
    reviewRequiredCount: target.reviewRequiredCount,
    lowQualityCount: target.lowQualityCount,
    highValueCount: target.highValueCount,
    unknownMetadataCount: target.unknownMetadataCount,
    latestUpdatedAt: target.latestUpdatedAt
  };
}

export function aggregateKnowledgeOSCoreState(input: {
  normalizedItems: KnowledgeOSCoreNormalizedItem[];
  normalizedChunks: KnowledgeOSCoreNormalizedChunk[];
  releaseAggregation: KnowledgeReleaseSystemAggregation;
}) {
  const dashboard = buildReleaseDashboard(input.releaseAggregation);
  const highValueCount = input.normalizedChunks.filter((chunk) => chunk.highValue).length;

  return {
    summary: {
      ...dashboard.summary,
      totalKnowledgeItems: input.normalizedItems.length,
      highValueCount
    },
    agents: dashboard.agents.map(toCoreTarget),
    knowledgeBases: dashboard.knowledgeBases.map(toCoreTarget),
    distributions: dashboard.distributions,
    recommendations: dashboard.recommendations.map((item): KnowledgeOSCoreRecommendation => ({
      type: item.type,
      severity: item.severity,
      message: item.message,
      agentId: item.agentId,
      knowledgeBaseId: item.knowledgeBaseId,
      namespace: item.namespace,
      score: item.score
    })),
    releaseDashboard: dashboard
  };
}
