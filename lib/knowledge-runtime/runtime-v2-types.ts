export type RuntimeV2OutputMode =
  | "auto"
  | "analysis"
  | "explain"
  | "faq"
  | "sop"
  | "customer_reply"
  | "sales_closing"
  | "sales_followup";

import type {
  RuntimeV2ABScripts,
  RuntimeV2BranchReply,
  RuntimeV2DealProbability,
  RuntimeV2DealSignal,
  RuntimeV2FollowupTiming,
  RuntimeV2FollowUpStep,
  RuntimeV2MultiTurnSalesPath,
  RuntimeV2SalesLoopPlan,
  RuntimeV2SalesLoopV2,
  RuntimeV2SilenceRisk,
  RuntimeV2StopPushPolicy,
} from "./runtime-v2-sales-loop-types";
import type { RuntimeV3GrowthOutput } from "./runtime-v3-sales-learning-types";
import type { RuntimeV4GrowthFlywheelOutput } from "./runtime-v4-growth-types";
import type { RuntimeV5EvolutionOutput } from "./runtime-v5-strategy-types";

export type RuntimeV2AppType = "user_app";
export type RuntimeV2Channel = "chat-ui" | "knowledge-query";
export type RuntimeV2Platform = "web" | "exe" | "apk" | "unknown";

export interface RuntimeV2Input {
  query: string;
  userId?: string | null;
  sessionId?: string | null;
  conversationId?: string | null;
  agentId?: string | null;
  expertId?: string | null;
  knowledgeBaseId?: string | null;
  kbId?: string | null;
  namespace?: string | null;
  tenantId?: string | null;
  appType: RuntimeV2AppType;
  channel: RuntimeV2Channel;
  platform: RuntimeV2Platform;
  outputMode: RuntimeV2OutputMode;
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface RuntimeV2Source {
  id?: string;
  title?: string;
  type?: "knowledge" | "memory" | "faq" | "sop" | "case" | "risk" | "rag" | "unknown" | string;
  score?: number;
  snippet?: string;
  safeSnippet?: string;
  metadata?: Record<string, unknown>;
  sourceApp?: string | null;
  knowledgeBaseId?: string | null;
  kbId?: string | null;
  agentId?: string | null;
  expertId?: string | null;
  namespace?: string | null;
  tenantId?: string | null;
  contentPreview?: string;
}

export interface RuntimeV2Memory {
  id: string;
  title?: string;
  content: string;
  score?: number;
  agentId?: string | null;
  expertId?: string | null;
  knowledgeBaseId?: string | null;
  kbId?: string | null;
  namespace?: string | null;
  tenantId?: string | null;
  source?: string | null;
  sourceApp?: string | null;
  matchedBy?: string[];
  origin?: "explicit" | "source" | "artifact";
}

export interface RuntimeV2MemoryTraceItem {
  memoryId: string;
  title?: string;
  score?: number;
  matchedBy: string[];
  source?: string | null;
  applied: boolean;
  reason: string;
}

export interface RuntimeV2AgentPolicy {
  id: string;
  label: string;
  weight: number;
  instructions: string[];
}

export interface RuntimeV2Context {
  promptContext: string;
  usedMemoryIds: string[];
  memoryTrace: RuntimeV2MemoryTraceItem[];
  appliedAgentPolicies: string[];
}

export interface RuntimeV2Output {
  ok: boolean;
  answer: string;
  customerCopy: string;
  explanation?: string;
  sources: RuntimeV2Source[];
  traceId: string;
  confidence: number;
  nextStep: string;
  runtimeVersion: "v2";
  memoryApplied: boolean;
  usedMemoryIds: string[];
  memoryTrace: RuntimeV2MemoryTraceItem[];
  memoryWarnings?: string[];
  appliedAgentPolicies: string[];
  salesIntent?: string;
  customerStage?: string;
  salesStrategy?: string;
  nextAction?: string;
  dealSignals?: RuntimeV2DealSignal[];
  salesLoopPlan?: RuntimeV2SalesLoopPlan;
  nextQuestion?: string;
  followupSequence?: RuntimeV2FollowUpStep[];
  branchReplies?: RuntimeV2BranchReply[];
  stopRules?: string[];
  stageReason?: string;
  salesLoopV2?: RuntimeV2SalesLoopV2;
  dealProbability?: RuntimeV2DealProbability;
  silenceRisk?: RuntimeV2SilenceRisk;
  abScripts?: RuntimeV2ABScripts;
  multiTurnPath?: RuntimeV2MultiTurnSalesPath;
  followupTiming?: RuntimeV2FollowupTiming;
  stopPush?: RuntimeV2StopPushPolicy;
  recommendedAction?: string;
  salesLearningV3?: RuntimeV3GrowthOutput;
  customerSegment?: RuntimeV3GrowthOutput["customerSegment"];
  conversionScore?: RuntimeV3GrowthOutput["conversionScore"];
  bestScriptRecommendation?: RuntimeV3GrowthOutput["bestScriptRecommendation"];
  nextBestActionV3?: RuntimeV3GrowthOutput["nextBestAction"];
  learningSignals?: RuntimeV3GrowthOutput["learningSignals"];
  optimizationReason?: string;
  isolationScope?: RuntimeV3GrowthOutput["isolationScope"];
  salesGrowthV4?: RuntimeV4GrowthFlywheelOutput;
  scriptScoreboardV4?: RuntimeV4GrowthFlywheelOutput["scriptScoreboard"];
  segmentPlaybookV4?: RuntimeV4GrowthFlywheelOutput["segmentPlaybook"];
  optimizedRecommendationV4?: RuntimeV4GrowthFlywheelOutput["optimizedRecommendation"];
  customerPathOptimizationV4?: RuntimeV4GrowthFlywheelOutput["customerPathOptimization"];
  growthMetricsV4?: RuntimeV4GrowthFlywheelOutput["metricsSummary"];
  growthWarningsV4?: RuntimeV4GrowthFlywheelOutput["warnings"];
  salesEvolutionV5?: RuntimeV5EvolutionOutput;
  strategyCandidates?: RuntimeV5EvolutionOutput["strategyCandidates"];
  promotedStrategies?: RuntimeV5EvolutionOutput["promotedStrategies"];
  reducedStrategies?: RuntimeV5EvolutionOutput["reducedStrategies"];
  retiredStrategies?: RuntimeV5EvolutionOutput["retiredStrategies"];
  roiSignals?: RuntimeV5EvolutionOutput["roiSignals"];
  conversionTrend?: RuntimeV5EvolutionOutput["conversionTrend"];
  evolvedPath?: RuntimeV5EvolutionOutput["evolvedPath"];
  autonomousRecommendation?: RuntimeV5EvolutionOutput["autonomousRecommendation"];
  complianceWarnings?: string[];
  knowledgeBaseId?: string | null;
  kbId?: string | null;
  agentId?: string | null;
  expertId?: string | null;
  namespace?: string | null;
  tenantId?: string | null;
  errorCode?: string;
  reason?: string;
  raw?: unknown;
}
