import type { RuntimeV3CustomerSegment, RuntimeV3LearningScope } from "./runtime-v3-sales-learning-types";

export type RuntimeV5StrategyType =
  | "trust_building"
  | "decision_guiding"
  | "value_explanation"
  | "objection_handling"
  | "soft_closing"
  | "followup_recovery"
  | "education_first"
  | "cycle_choice_guidance"
  | "execution_support"
  | "respectful_stop";

export type RuntimeV5StrategyStatus = "candidate" | "promoted" | "testing" | "reduced" | "retired";

export type RuntimeV5StrategyCandidate = {
  id: string;
  type: RuntimeV5StrategyType;
  label: string;
  tone: string;
  targetSegment: string;
  targetSignals: string[];
  messagePattern: string;
  bestFor: string;
  avoidWhen: string[];
  complianceRisk: "low" | "medium" | "high";
  expectedOutcome: string;
  score?: number;
  status: RuntimeV5StrategyStatus;
  reason?: string;
};

export type RuntimeV5ROISignals = {
  highROI: string[];
  lowROI: string[];
  score: number;
  reason: string;
};

export type RuntimeV5ConversionTrend = {
  trend: "up" | "flat" | "down" | "unknown";
  confidence: number;
  reason: string;
};

export type RuntimeV5EvolvedPath = {
  recommendedPath: string;
  whyThisPath: string;
  nextStep: string;
  stopCondition?: string;
};

export type RuntimeV5SegmentStrategy = {
  segment: RuntimeV3CustomerSegment | string;
  recommendedStyle: string;
  nextAction: string;
  avoidStrategy: string;
  bestPath: string;
  reason: string;
};

export type RuntimeV5AutonomousRecommendation = {
  primaryStrategyId?: string;
  recommendation: string;
  reason: string;
  caution?: string;
};

export type RuntimeV5EvolutionOutput = {
  enabled: boolean;
  scopeKey: string;
  strategyCandidates: RuntimeV5StrategyCandidate[];
  promotedStrategies: RuntimeV5StrategyCandidate[];
  reducedStrategies: RuntimeV5StrategyCandidate[];
  retiredStrategies: RuntimeV5StrategyCandidate[];
  roiSignals: RuntimeV5ROISignals;
  conversionTrend: RuntimeV5ConversionTrend;
  evolvedPath: RuntimeV5EvolvedPath;
  segmentStrategy: RuntimeV5SegmentStrategy;
  autonomousRecommendation: RuntimeV5AutonomousRecommendation;
  warnings: string[];
};

export type RuntimeV5Scope = RuntimeV3LearningScope;
