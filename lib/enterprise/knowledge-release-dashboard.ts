import "server-only";

import { calculateReleaseHealth } from "@/lib/enterprise/knowledge-release-health-engine";
import type {
  KnowledgeReleaseDashboard,
  KnowledgeReleaseRecommendation,
  KnowledgeReleaseSystemAggregation
} from "@/lib/enterprise/knowledge-release-types";

function buildReleaseRecommendations(input: KnowledgeReleaseSystemAggregation): KnowledgeReleaseRecommendation[] {
  const release = calculateReleaseHealth(input);
  const recommendations: KnowledgeReleaseRecommendation[] = [];

  if (release.releaseReadiness === "blocked") {
    recommendations.push({
      type: "release_blocked",
      severity: "critical",
      message: "Release is blocked by critical policy or knowledge-health risk.",
      score: release.systemHealthScore
    });
  } else if (release.releaseReadiness === "warning") {
    recommendations.push({
      type: "release_warning",
      severity: "warning",
      message: "Release can continue only after manual review of warning signals.",
      score: release.systemHealthScore
    });
  } else if (release.releaseReadiness === "ready") {
    recommendations.push({
      type: "release_ready",
      severity: "info",
      message: "Release health is acceptable. Keep shadow-mode governance monitoring enabled.",
      score: release.systemHealthScore
    });
  }

  if (input.ragSummary.lowQualityCount > 0) {
    recommendations.push({
      type: "rag_quality_review",
      severity: "warning",
      message: "Low-quality chunks are present. Review or improve them before promotion.",
      score: input.ragSummary.avgQualityScore
    });
  }

  if (input.ragSummary.unknownMetadataCount > 0) {
    recommendations.push({
      type: "metadata_backfill",
      severity: "warning",
      message: "Some chunks lack governance metadata and are using neutral fallback signals.",
      score: 1 - (input.ragSummary.unknownMetadataCount / Math.max(1, input.ragSummary.totalChunks))
    });
  }

  for (const agent of input.agentSummary.agents.filter((item) => item.readiness !== "ready").slice(0, 12)) {
    recommendations.push({
      type: "agent_quality_review",
      severity: agent.readiness === "blocked" ? "critical" : "warning",
      message: `Agent ${agent.name} needs release-health review.`,
      agentId: agent.agentId,
      knowledgeBaseId: agent.knowledgeBaseId,
      namespace: agent.namespace,
      score: agent.healthScore
    });
  }

  for (const kb of input.knowledgeBaseSummary.knowledgeBases.filter((item) => item.readiness !== "ready").slice(0, 12)) {
    recommendations.push({
      type: "knowledge_base_review",
      severity: kb.readiness === "blocked" ? "critical" : "warning",
      message: `Knowledge base ${kb.name} needs release-health review.`,
      agentId: kb.agentId,
      knowledgeBaseId: kb.knowledgeBaseId,
      namespace: kb.namespace,
      score: kb.healthScore
    });
  }

  if (input.policySummary.reviewRequiredCount > 0 || input.policySummary.blockedAutoActionCount > 0) {
    recommendations.push({
      type: "policy_review",
      severity: input.policySummary.blockedAutoActionCount > 0 ? "critical" : "warning",
      message: "Policy engine found review-required or auto-action-blocked knowledge.",
      score: input.policySummary.avgPolicyScore
    });
  }

  return recommendations.slice(0, 60);
}

export function buildReleaseDashboard(input: KnowledgeReleaseSystemAggregation): KnowledgeReleaseDashboard {
  const release = calculateReleaseHealth(input);

  return {
    ...release,
    agents: input.agentSummary.agents,
    knowledgeBases: input.knowledgeBaseSummary.knowledgeBases,
    distributions: input.distributions,
    recommendations: buildReleaseRecommendations(input),
    shadowMode: true,
    diagnostics: {
      ...input.diagnostics,
      metadataPersisted: false,
      autoDeleteEnabled: false,
      autoArchiveEnabled: false,
      autoMergeEnabled: false,
      autoPublishEnabled: false
    }
  };
}
