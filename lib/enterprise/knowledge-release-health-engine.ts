import "server-only";

import type {
  KnowledgeReleaseRiskLevel,
  KnowledgeReleaseSummary,
  KnowledgeReleaseSystemAggregation
} from "@/lib/enterprise/knowledge-release-types";

function clamp01(value: unknown, fallback = 0.5) {
  const numeric = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, numeric));
}

function round4(value: number) {
  return Math.round(clamp01(value) * 10000) / 10000;
}

function avg(values: number[], fallback = 0.5) {
  const valid = values.filter((value) => Number.isFinite(value));

  if (valid.length === 0) {
    return fallback;
  }

  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function ratio(count: number, total: number) {
  return total > 0 ? clamp01(count / total, 0) : 0;
}

function normalizedSignedScore(value: number) {
  return clamp01((value + 1) / 2, 0.5);
}

function riskLevelFromIndex(riskIndex: number): KnowledgeReleaseRiskLevel {
  if (riskIndex >= 0.7) return "critical";
  if (riskIndex >= 0.45) return "high";
  if (riskIndex >= 0.25) return "medium";

  return "low";
}

export function calculateReleaseHealth(input: KnowledgeReleaseSystemAggregation): KnowledgeReleaseSummary {
  const totalChunks = input.ragSummary.totalChunks;

  if (totalChunks <= 0) {
    return {
      systemHealthScore: 0.5,
      ragHealthScore: 0.5,
      agentHealthScore: 0.5,
      knowledgeBaseHealthScore: 0.5,
      policyHealthScore: 0.5,
      lifecycleHealthScore: 0.5,
      trendHealthScore: 0.5,
      feedbackHealthScore: 0.5,
      behaviorHealthScore: 0.5,
      riskIndex: 0.25,
      riskLevel: "unknown",
      releaseReadiness: "unknown",
      summary: {
        totalChunks: 0,
        totalAgents: 0,
        totalKnowledgeBases: 0,
        highRiskCount: 0,
        criticalRiskCount: 0,
        reviewRequiredCount: 0,
        lowQualityCount: 0,
        unknownMetadataCount: 0,
        archiveCandidateCount: 0,
        blockedAutoActionCount: 0,
        shadowMode: true
      }
    };
  }

  const unknownMetadataRatio = ratio(input.ragSummary.unknownMetadataCount, totalChunks);
  const lowQualityRatio = ratio(input.ragSummary.lowQualityCount, totalChunks);
  const highRiskRatio = ratio(input.policySummary.highRiskCount + input.policySummary.criticalRiskCount, totalChunks);
  const criticalRiskRatio = ratio(input.policySummary.criticalRiskCount, totalChunks);
  const reviewRatio = ratio(input.policySummary.reviewRequiredCount, totalChunks);
  const archiveRatio = ratio(input.policySummary.archiveCandidateCount + input.lifecycleSummary.archiveCandidateCount, totalChunks);
  const blockedRatio = ratio(input.policySummary.blockedAutoActionCount, totalChunks);
  const decliningRatio = ratio(input.lifecycleSummary.decliningCount + input.trendSummary.decliningTrendCount, totalChunks);
  const crossScopeRatio = ratio(input.ragSummary.crossScopeRiskCount, totalChunks);
  const ragHealthScore = round4(
    (input.ragSummary.avgQualityScore * 0.34)
    + (input.ragSummary.avgStableOptimizationScore * 0.34)
    + ((1 - unknownMetadataRatio) * 0.12)
    + ((1 - lowQualityRatio) * 0.12)
    + ((1 - crossScopeRatio) * 0.08)
  );
  const policyHealthScore = round4(
    (input.policySummary.avgPolicyScore * 0.45)
    + (input.policySummary.avgPolicyConfidence * 0.18)
    + ((1 - highRiskRatio) * 0.17)
    + ((1 - reviewRatio) * 0.1)
    + ((1 - blockedRatio) * 0.1)
  );
  const lifecycleHealthScore = round4(
    (input.lifecycleSummary.avgLifecycleScore * 0.45)
    + (input.lifecycleSummary.avgLifecycleConfidence * 0.15)
    + ((1 - archiveRatio) * 0.2)
    + ((1 - decliningRatio) * 0.2)
  );
  const trendHealthScore = round4(
    (input.trendSummary.avgTrendScore * 0.55)
    + (input.trendSummary.avgTrendConfidence * 0.2)
    + ((1 - ratio(input.trendSummary.staleHighScoreCount, totalChunks)) * 0.1)
    + ((1 - ratio(input.trendSummary.decliningTrendCount, totalChunks)) * 0.15)
  );
  const feedbackHealthScore = round4(normalizedSignedScore(input.feedbackSummary.avgFeedbackScore));
  const behaviorHealthScore = round4(
    (normalizedSignedScore(input.behaviorSummary.avgBehaviorScore) * 0.78)
    + ((1 - ratio(input.behaviorSummary.suspectedGamingCount, totalChunks)) * 0.22)
  );
  const agentHealthScore = round4(avg(input.agentSummary.agents.map((agent) => agent.healthScore), ragHealthScore));
  const knowledgeBaseHealthScore = round4(avg(input.knowledgeBaseSummary.knowledgeBases.map((kb) => kb.healthScore), ragHealthScore));
  const systemHealthScore = round4(
    (ragHealthScore * 0.18)
    + (policyHealthScore * 0.18)
    + (agentHealthScore * 0.14)
    + (knowledgeBaseHealthScore * 0.14)
    + (lifecycleHealthScore * 0.14)
    + (trendHealthScore * 0.1)
    + (feedbackHealthScore * 0.06)
    + (behaviorHealthScore * 0.06)
  );
  const riskIndex = round4(
    ((1 - systemHealthScore) * 0.35)
    + (highRiskRatio * 0.2)
    + (criticalRiskRatio * 0.16)
    + (reviewRatio * 0.12)
    + (archiveRatio * 0.07)
    + (unknownMetadataRatio * 0.06)
    + (lowQualityRatio * 0.04)
  );
  const riskLevel = riskLevelFromIndex(riskIndex);
  const releaseReadiness = riskLevel === "critical" || systemHealthScore < 0.45 || input.policySummary.criticalRiskCount > 0
    ? "blocked"
    : riskLevel === "high" || riskLevel === "medium" || systemHealthScore < 0.72 || input.policySummary.reviewRequiredCount > 0
      ? "warning"
      : "ready";

  return {
    systemHealthScore,
    ragHealthScore,
    agentHealthScore,
    knowledgeBaseHealthScore,
    policyHealthScore,
    lifecycleHealthScore,
    trendHealthScore,
    feedbackHealthScore,
    behaviorHealthScore,
    riskIndex,
    riskLevel,
    releaseReadiness,
    summary: {
      totalChunks,
      totalAgents: input.agentSummary.totalAgents,
      totalKnowledgeBases: input.knowledgeBaseSummary.totalKnowledgeBases,
      highRiskCount: input.policySummary.highRiskCount,
      criticalRiskCount: input.policySummary.criticalRiskCount,
      reviewRequiredCount: input.policySummary.reviewRequiredCount,
      lowQualityCount: input.ragSummary.lowQualityCount,
      unknownMetadataCount: input.ragSummary.unknownMetadataCount,
      archiveCandidateCount: input.policySummary.archiveCandidateCount + input.lifecycleSummary.archiveCandidateCount,
      blockedAutoActionCount: input.policySummary.blockedAutoActionCount,
      shadowMode: true
    }
  };
}
