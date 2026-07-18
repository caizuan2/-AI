export type RuntimeV2SalesCustomerStage =
  | "cold"
  | "curious"
  | "interested"
  | "hesitating"
  | "price_sensitive"
  | "effect_doubt"
  | "ready_to_decide"
  | "after_start"
  | "inactive";

export interface RuntimeV2DealSignal {
  key: string;
  label: string;
  confidence: number;
  evidence: string;
}

export interface RuntimeV2FollowUpStep {
  step: number;
  timing: string;
  goal: string;
  message: string;
  stopIf: string;
}

export interface RuntimeV2BranchReply {
  when: string;
  reply: string;
  nextQuestion?: string;
}

export interface RuntimeV2ClosingPath {
  currentGoal: string;
  decisionPath: string[];
  recommendedClose: string;
  avoidActions: string[];
}

export interface RuntimeV2SalesLoopPlan {
  customerStage: RuntimeV2SalesCustomerStage;
  stageReason: string;
  dealSignals: RuntimeV2DealSignal[];
  primaryDealSignal?: RuntimeV2DealSignal;
  confidence: number;
  nextQuestion: string;
  nextCustomerMessage: string;
  followupSequence: RuntimeV2FollowUpStep[];
  branchReplies: RuntimeV2BranchReply[];
  stopRules: string[];
  closingPath: RuntimeV2ClosingPath;
}

export type RuntimeV2DealProbabilityLevel = "low" | "medium" | "high";

export interface RuntimeV2DealProbability {
  probability: RuntimeV2DealProbabilityLevel;
  score: number;
  reasons: string[];
  positiveSignals: string[];
  negativeSignals: string[];
  recommendedFocus: string;
}

export type RuntimeV2SilenceRiskLevel = "low" | "medium" | "high";

export type RuntimeV2SilenceRiskType =
  | "information_gap"
  | "trust_gap"
  | "price_pressure"
  | "effect_doubt"
  | "decision_fatigue"
  | "low_interest"
  | "unknown";

export interface RuntimeV2SilenceRisk {
  silenceRisk: RuntimeV2SilenceRiskLevel;
  reasons: string[];
  riskType: RuntimeV2SilenceRiskType;
  recoveryStrategy: string;
}

export interface RuntimeV2ABScriptVariant {
  label: string;
  message: string;
  bestFor: string;
}

export interface RuntimeV2ABScripts {
  variantA: RuntimeV2ABScriptVariant;
  variantB: RuntimeV2ABScriptVariant;
  recommendation: "A" | "B";
  reason: string;
}

export interface RuntimeV2MultiTurnSalesPathStep {
  step: number;
  goal: string;
  userAction: string;
  ifCustomerResponds: string;
  nextReply: string;
}

export interface RuntimeV2MultiTurnSalesPath {
  currentStep: string;
  nextBestAction: string;
  path: RuntimeV2MultiTurnSalesPathStep[];
  pathRisk: string[];
}

export interface RuntimeV2FollowupTiming {
  immediate: string;
  later: string;
  finalClose: string;
  waitRecommendation: string;
}

export interface RuntimeV2StopPushPolicy {
  shouldStop: boolean;
  stopRules: string[];
  respectfulCloseMessage: string;
}

export interface RuntimeV2SalesLoopV2 {
  dealProbability: RuntimeV2DealProbability;
  silenceRisk: RuntimeV2SilenceRisk;
  abScripts: RuntimeV2ABScripts;
  multiTurnPath: RuntimeV2MultiTurnSalesPath;
  followupTiming: RuntimeV2FollowupTiming;
  stopPush: RuntimeV2StopPushPolicy;
  recommendedAction: string;
}
