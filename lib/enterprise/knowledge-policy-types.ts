import "server-only";

export type KnowledgePolicyDecision =
  | "boost"
  | "keep"
  | "monitor"
  | "decay"
  | "review_required"
  | "merge_candidate"
  | "archive_candidate"
  | "blocked_auto_action"
  | "unknown";

export type KnowledgePolicyRiskLevel =
  | "low"
  | "medium"
  | "high"
  | "critical"
  | "unknown";

export type KnowledgePolicySignal = {
  decision: KnowledgePolicyDecision;
  riskLevel: KnowledgePolicyRiskLevel;
  policyScore: number;
  confidence: number;
  reason: string;
  suggestion: string;
  allowedActions: string[];
  blockedActions: string[];
  requiresHumanReview: boolean;
  shadowMode: boolean;
};
