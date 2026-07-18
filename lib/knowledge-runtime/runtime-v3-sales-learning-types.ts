import type {
  RuntimeV2ABScripts,
  RuntimeV2DealProbability,
  RuntimeV2DealSignal,
  RuntimeV2SalesLoopPlan,
  RuntimeV2SalesLoopV2,
  RuntimeV2SilenceRisk,
} from "./runtime-v2-sales-loop-types";
import type {
  RuntimeV2Input,
  RuntimeV2Memory,
  RuntimeV2MemoryTraceItem,
  RuntimeV2Source,
} from "./runtime-v2-types";

export type RuntimeV3CustomerSegment =
  | "new_lead"
  | "curious_lead"
  | "warm_lead"
  | "hesitating_lead"
  | "price_sensitive_lead"
  | "effect_doubt"
  | "high_intent_lead"
  | "started_customer"
  | "silent_risk"
  | "lost_or_stop";

export type RuntimeV3LearningSignal =
  | "copied_customer_copy"
  | "copied_variant_a"
  | "copied_variant_b"
  | "copied_variant_c"
  | "liked_answer"
  | "disliked_answer"
  | "edited_script"
  | "continued_thread"
  | "asked_followup"
  | "saved_response"
  | "ignored_response"
  | "manual_positive"
  | "manual_negative";

export interface RuntimeV3ScriptVariant {
  id: string;
  label: string;
  tone: "warm" | "direct" | "trust_building" | "decision_guiding" | "closing_soft";
  message: string;
  bestFor: string;
  riskLevel: "low" | "medium" | "high";
  complianceNotes?: string[];
}

export interface RuntimeV3LearningScope {
  knowledgeBaseId?: string | null;
  kbId?: string | null;
  agentId?: string | null;
  expertId?: string | null;
  tenantId?: string | null;
  namespace?: string | null;
}

export interface RuntimeV3SegmentResult {
  segment: RuntimeV3CustomerSegment;
  confidence: number;
  reason: string;
  recommendedTone: RuntimeV3ScriptVariant["tone"];
}

export interface RuntimeV3LearningEvent {
  signal: RuntimeV3LearningSignal;
  variantId?: string;
  tone?: RuntimeV3ScriptVariant["tone"];
  scoreDelta?: number;
  createdAt: string;
  reason?: string;
}

export interface RuntimeV3LearningSummary {
  scopeKey: string;
  eventCount: number;
  copiedVariantCounts: Record<string, number>;
  copiedToneCounts: Partial<Record<RuntimeV3ScriptVariant["tone"], number>>;
  positiveCount: number;
  negativeCount: number;
  lastSignals: RuntimeV3LearningSignal[];
  preferredVariantId?: string;
  preferredTone?: RuntimeV3ScriptVariant["tone"];
  summary: string;
}

export interface RuntimeV3ConversionScore {
  level: "low" | "medium" | "high";
  score: number;
  reasons: string[];
  confidence: number;
  riskFactors: string[];
  opportunityFactors: string[];
}

export interface RuntimeV3BestScriptRecommendation {
  recommendedVariantId: string;
  reason: string;
  alternatives: RuntimeV3ScriptVariant[];
}

export interface RuntimeV3NextBestAction {
  action:
    | "ask_clarifying_question"
    | "send_trust_building_script"
    | "send_decision_guide"
    | "send_value_explanation"
    | "send_soft_close"
    | "stop_followup"
    | "wait_for_customer";
  question: string;
  message: string;
  timing: string;
  stopIf?: string;
}

export interface RuntimeV3GrowthOutput {
  customerSegment: RuntimeV3CustomerSegment;
  conversionScore: RuntimeV3ConversionScore;
  bestScriptRecommendation: RuntimeV3BestScriptRecommendation;
  nextBestAction: RuntimeV3NextBestAction;
  learningSignals: RuntimeV3LearningSignal[];
  optimizationReason: string;
  isolationScope: RuntimeV3LearningScope;
  segmentReason?: string;
  recommendedTone?: RuntimeV3ScriptVariant["tone"];
  learningSummary?: RuntimeV3LearningSummary;
  safetyWarnings?: string[];
}

export interface RuntimeV3GrowthInput {
  scope: RuntimeV2Input;
  sources?: RuntimeV2Source[];
  memories?: RuntimeV2Memory[];
  memoryTrace?: RuntimeV2MemoryTraceItem[];
  salesLoopPlan?: RuntimeV2SalesLoopPlan;
  salesLoopV2?: RuntimeV2SalesLoopV2;
  dealProbability?: RuntimeV2DealProbability;
  silenceRisk?: RuntimeV2SilenceRisk;
  dealSignals?: RuntimeV2DealSignal[];
  abScripts?: RuntimeV2ABScripts;
  complianceWarnings?: string[];
  rawValue?: unknown;
  userActions?: unknown;
  responseMeta?: unknown;
}
