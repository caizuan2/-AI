export type KnowledgeGapType = "missing_knowledge";
export type KnowledgeGapSeverity = "low" | "medium" | "high";

export interface KnowledgeGapDetectorInput {
  query: string;
  relevanceScore: number;
  hitCount: number;
  answerGroundingScore: number;
}

export interface KnowledgeGapEvent {
  gap_type: KnowledgeGapType;
  query: string;
  severity: KnowledgeGapSeverity;
}

export function detectKnowledgeGap(input: KnowledgeGapDetectorInput): KnowledgeGapEvent | null {
  if (input.relevanceScore >= 0.3 && input.hitCount > 0) {
    return null;
  }

  return {
    gap_type: "missing_knowledge",
    query: input.query,
    severity: classifyGapSeverity(input),
  };
}

function classifyGapSeverity(input: KnowledgeGapDetectorInput): KnowledgeGapSeverity {
  if (input.hitCount === 0) {
    return "high";
  }

  if (input.relevanceScore < 0.2 || input.answerGroundingScore < 0.35) {
    return "medium";
  }

  return "low";
}
