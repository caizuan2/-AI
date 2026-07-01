import type { RuntimeV3CustomerSegment, RuntimeV3LearningScope } from "./runtime-v3-sales-learning-types";

export type RuntimeV4FeedbackEvent =
  | "copy_customer_copy"
  | "copy_variant_a"
  | "copy_variant_b"
  | "copy_variant_c"
  | "like_answer"
  | "dislike_answer"
  | "edit_script"
  | "continue_thread"
  | "ask_shorter_version"
  | "save_response"
  | "mark_deal_won"
  | "mark_deal_lost"
  | "mark_customer_silent"
  | "mark_stop_followup";

export type RuntimeV4ScriptRecommendation = "promote" | "keep_testing" | "reduce" | "avoid";

export interface RuntimeV4FeedbackRecord {
  id: string;
  event: RuntimeV4FeedbackEvent;
  variantId?: string;
  customerSegment?: RuntimeV3CustomerSegment | string;
  dealSignal?: string;
  timestamp: string;
  messageId?: string;
  traceId?: string;
  meta?: {
    tone?: string;
    reason?: string;
  };
}

export interface RuntimeV4ScriptScore {
  variantId: string;
  label: string;
  tone: string;
  copyCount: number;
  likeCount: number;
  dislikeCount: number;
  editCount: number;
  continueCount: number;
  wonCount: number;
  lostCount: number;
  score: number;
  rank: number;
  recommendation: RuntimeV4ScriptRecommendation;
  reason: string;
}

export interface RuntimeV4SegmentPlaybook {
  customerSegment: string;
  bestTone: string;
  bestNextAction: string;
  recommendedScriptStyle: string;
  avoidStrategy: string;
  reason: string;
}

export interface RuntimeV4OptimizedRecommendation {
  recommendedVariantId?: string;
  recommendedTone: string;
  recommendedAction: string;
  reason: string;
  avoidStrategy?: string;
}

export interface RuntimeV4CustomerPathOptimization {
  currentPath: string;
  bottleneck: string;
  nextOptimization: string;
  stopCondition?: string;
}

export interface RuntimeV4MetricsSummary {
  totalEvents: number;
  copyRateSignal: string;
  positiveSignalRate: string;
  negativeSignalRate: string;
  bestPerformingTone?: string;
  lowPerformingTone?: string;
  recommendation: string;
}

export interface RuntimeV4GrowthFlywheelOutput {
  enabled: boolean;
  scopeKey: string;
  scriptScoreboard: RuntimeV4ScriptScore[];
  segmentPlaybook: RuntimeV4SegmentPlaybook[];
  optimizedRecommendation: RuntimeV4OptimizedRecommendation;
  customerPathOptimization: RuntimeV4CustomerPathOptimization;
  metricsSummary: RuntimeV4MetricsSummary;
  warnings: string[];
}

export type RuntimeV4Scope = RuntimeV3LearningScope;
