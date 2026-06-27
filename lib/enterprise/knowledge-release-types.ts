import "server-only";

import type {
  KnowledgePolicyDecision,
  KnowledgePolicyRiskLevel
} from "@/lib/enterprise/knowledge-policy-types";

export type KnowledgeReleaseReadiness = "ready" | "warning" | "blocked" | "unknown";
export type KnowledgeReleaseRiskLevel = KnowledgePolicyRiskLevel;

export type KnowledgeReleaseDistribution = Record<string, number>;

export type KnowledgeReleaseHealthTarget = {
  id: string;
  name: string;
  agentId: string;
  knowledgeBaseId: string;
  namespace: string;
  chunkCount: number;
  healthScore: number;
  riskIndex: number;
  riskLevel: KnowledgeReleaseRiskLevel;
  readiness: KnowledgeReleaseReadiness;
  highRiskCount: number;
  reviewRequiredCount: number;
  lowQualityCount: number;
  highValueCount: number;
  unknownMetadataCount: number;
  latestUpdatedAt: string | null;
  policyDistribution: KnowledgeReleaseDistribution;
  lifecycleDistribution: KnowledgeReleaseDistribution;
};

export type KnowledgeReleasePolicySummary = {
  totalChunks: number;
  boostCount: number;
  keepCount: number;
  monitorCount: number;
  decayCount: number;
  reviewRequiredCount: number;
  mergeCandidateCount: number;
  archiveCandidateCount: number;
  blockedAutoActionCount: number;
  unknownCount: number;
  highRiskCount: number;
  criticalRiskCount: number;
  avgPolicyScore: number;
  avgPolicyConfidence: number;
  shadowMode: boolean;
};

export type KnowledgeReleaseLifecycleSummary = {
  totalChunks: number;
  newCount: number;
  growingCount: number;
  stableCount: number;
  decliningCount: number;
  archiveCandidateCount: number;
  unknownCount: number;
  avgLifecycleScore: number;
  avgLifecycleConfidence: number;
};

export type KnowledgeReleaseTrendSummary = {
  totalChunks: number;
  fastRisingCount: number;
  staleHighScoreCount: number;
  decliningTrendCount: number;
  evergreenCount: number;
  unknownCount: number;
  avgTrendScore: number;
  avgTrendConfidence: number;
  distribution: KnowledgeReleaseDistribution;
};

export type KnowledgeReleaseFeedbackSummary = {
  totalChunks: number;
  avgFeedbackScore: number;
  positiveCount: number;
  negativeCount: number;
  sampleCount: number;
};

export type KnowledgeReleaseBehaviorSummary = {
  totalChunks: number;
  avgBehaviorScore: number;
  behaviorEventCount: number;
  suspectedGamingCount: number;
};

export type KnowledgeReleaseRagSummary = {
  totalChunks: number;
  scoredChunks: number;
  unknownMetadataCount: number;
  lowQualityCount: number;
  highValueCount: number;
  avgQualityScore: number;
  avgStableOptimizationScore: number;
  crossScopeRiskCount: number;
};

export type KnowledgeReleaseSystemAggregation = {
  ragSummary: KnowledgeReleaseRagSummary;
  policySummary: KnowledgeReleasePolicySummary;
  lifecycleSummary: KnowledgeReleaseLifecycleSummary;
  trendSummary: KnowledgeReleaseTrendSummary;
  feedbackSummary: KnowledgeReleaseFeedbackSummary;
  behaviorSummary: KnowledgeReleaseBehaviorSummary;
  agentSummary: {
    totalAgents: number;
    agents: KnowledgeReleaseHealthTarget[];
  };
  knowledgeBaseSummary: {
    totalKnowledgeBases: number;
    knowledgeBases: KnowledgeReleaseHealthTarget[];
  };
  distributions: {
    policy: KnowledgeReleaseDistribution;
    lifecycle: KnowledgeReleaseDistribution;
    trend: KnowledgeReleaseDistribution;
  };
  diagnostics: {
    totalChunks: number;
    fallbackUnknownMetadata: boolean;
    oldMetadataFallback: "neutral";
    policyDecisions: KnowledgePolicyDecision[];
  };
};

export type KnowledgeReleaseSummary = {
  systemHealthScore: number;
  ragHealthScore: number;
  agentHealthScore: number;
  knowledgeBaseHealthScore: number;
  policyHealthScore: number;
  lifecycleHealthScore: number;
  trendHealthScore: number;
  feedbackHealthScore: number;
  behaviorHealthScore: number;
  riskIndex: number;
  riskLevel: KnowledgeReleaseRiskLevel;
  releaseReadiness: KnowledgeReleaseReadiness;
  summary: {
    totalChunks: number;
    totalAgents: number;
    totalKnowledgeBases: number;
    highRiskCount: number;
    criticalRiskCount: number;
    reviewRequiredCount: number;
    lowQualityCount: number;
    unknownMetadataCount: number;
    archiveCandidateCount: number;
    blockedAutoActionCount: number;
    shadowMode: boolean;
  };
};

export type KnowledgeReleaseRecommendation = {
  type:
    | "release_ready"
    | "release_warning"
    | "release_blocked"
    | "rag_quality_review"
    | "agent_quality_review"
    | "knowledge_base_review"
    | "policy_review"
    | "metadata_backfill";
  severity: "info" | "warning" | "critical";
  message: string;
  agentId?: string;
  knowledgeBaseId?: string;
  namespace?: string;
  score?: number;
};

export type KnowledgeReleaseDashboard = KnowledgeReleaseSummary & {
  agents: KnowledgeReleaseHealthTarget[];
  knowledgeBases: KnowledgeReleaseHealthTarget[];
  distributions: KnowledgeReleaseSystemAggregation["distributions"];
  recommendations: KnowledgeReleaseRecommendation[];
  shadowMode: true;
  diagnostics: KnowledgeReleaseSystemAggregation["diagnostics"] & {
    metadataPersisted: false;
    autoDeleteEnabled: false;
    autoArchiveEnabled: false;
    autoMergeEnabled: false;
    autoPublishEnabled: false;
  };
};
