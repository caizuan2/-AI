export type KnowledgeOSDataQuality =
  | "real"
  | "partial"
  | "insufficient_data"
  | "shadow";

export type KnowledgeOSReleaseReadiness =
  | "ready"
  | "warning"
  | "blocked"
  | "unknown";

export type KnowledgeOSRiskLevel =
  | "low"
  | "medium"
  | "high"
  | "critical"
  | "unknown";

export type KnowledgeOSDistribution = Record<string, number>;

export type KnowledgeOSCoreAccessScope = {
  actorUserId: string;
  tenantId: string | null;
  appType: string | null;
  agentId: string;
  knowledgeBaseId: string;
  namespace: string;
  includeShared: boolean;
  includePublished: boolean;
};

export type KnowledgeOSCoreNormalizedItem = {
  id: string;
  title: string;
  status: string;
  sourceType: string;
  sourceTitle: string | null;
  agentId: string;
  knowledgeBaseId: string;
  namespace: string;
  chunkCount: number;
  qualityScore: number;
  updatedAt: string | null;
};

export type KnowledgeOSCoreNormalizedChunk = {
  id: string;
  knowledgeItemId: string;
  title: string;
  sourceTitle: string | null;
  agentId: string;
  knowledgeBaseId: string;
  namespace: string;
  version: string;
  qualityScore: number;
  stableOptimizationScore: number;
  feedbackScore: number;
  behaviorScore: number;
  trendScore: number;
  lifecycleScore: number;
  policyScore: number;
  policyDecision: string;
  policyRiskLevel: KnowledgeOSRiskLevel;
  lowQuality: boolean;
  highValue: boolean;
  unknownMetadata: boolean;
  updatedAt: string | null;
};

export type KnowledgeOSCoreHealthTarget = {
  id: string;
  name: string;
  agentId: string;
  knowledgeBaseId: string;
  namespace: string;
  chunkCount: number;
  healthScore: number;
  riskIndex: number;
  riskLevel: KnowledgeOSRiskLevel;
  readiness: KnowledgeOSReleaseReadiness;
  highRiskCount: number;
  reviewRequiredCount: number;
  lowQualityCount: number;
  highValueCount: number;
  unknownMetadataCount: number;
  latestUpdatedAt: string | null;
};

export type KnowledgeOSCoreRecommendation = {
  type: string;
  severity: "info" | "warning" | "critical";
  message: string;
  agentId?: string;
  knowledgeBaseId?: string;
  namespace?: string;
  score?: number;
};

export type KnowledgeOSCoreState = {
  success: boolean;
  generatedAt: string;
  dataQuality: KnowledgeOSDataQuality;
  releaseReadiness: KnowledgeOSReleaseReadiness;
  riskLevel: KnowledgeOSRiskLevel;
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
  summary: {
    totalKnowledgeItems: number;
    totalChunks: number;
    totalAgents: number;
    totalKnowledgeBases: number;
    highRiskCount: number;
    criticalRiskCount: number;
    reviewRequiredCount: number;
    lowQualityCount: number;
    highValueCount: number;
    unknownMetadataCount: number;
    archiveCandidateCount: number;
    blockedAutoActionCount: number;
    shadowMode: boolean;
  };
  agents: KnowledgeOSCoreHealthTarget[];
  knowledgeBases: KnowledgeOSCoreHealthTarget[];
  distributions: {
    policy: KnowledgeOSDistribution;
    lifecycle: KnowledgeOSDistribution;
    trend: KnowledgeOSDistribution;
  };
  recommendations: KnowledgeOSCoreRecommendation[];
  diagnostics: {
    mode: "knowledge_os_data_core_v4";
    realDataUsed: boolean;
    shadowMode: boolean;
    fallbackReason: string | null;
    unknownMetadataRatio: number;
    metadataPersisted: false;
    autoDeleteEnabled: false;
    autoArchiveEnabled: false;
    autoMergeEnabled: false;
    autoPublishEnabled: false;
    sourceCounts: {
      knowledgeItems: number;
      knowledgeChunks: number;
      feedbackEvents: number;
      behaviorEvents: number;
    };
    scope: KnowledgeOSCoreAccessScope | null;
    warnings: string[];
  };
};
