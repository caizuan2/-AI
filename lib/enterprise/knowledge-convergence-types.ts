export interface KnowledgeStabilityDiagnostics {
  stabilityScore: number;
  confidenceWeight: number;
  trustWeight: number;
  volatilityPenalty: number;
  stableOptimizationScore: number;
  sampleCount: number;
  positiveCount: number;
  negativeCount: number;
  uniqueUserCount: number;
  suspectedGaming: boolean;
}

export interface KnowledgeScoreSmoothingDiagnostics {
  previousScore: number | null;
  incomingScore: number;
  smoothedScore: number;
  alpha: number;
}
