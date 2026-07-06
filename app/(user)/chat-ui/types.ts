import type { ChatModeCandidate, ChatModeKey, ChatModeSource } from "./lib/intent-mode-router";
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
} from "@/lib/knowledge-runtime/runtime-v2-sales-loop-types";
import type { RuntimeV3GrowthOutput } from "@/lib/knowledge-runtime/runtime-v3-sales-learning-types";
import type { RuntimeV4GrowthFlywheelOutput } from "@/lib/knowledge-runtime/runtime-v4-growth-types";
import type { RuntimeV5EvolutionOutput } from "@/lib/knowledge-runtime/runtime-v5-strategy-types";

export type ChatMode = "fast" | "expert";
export type RagConfidence = "high" | "medium" | "low";
export type ProviderStatus = "ok" | "provider_not_configured" | "no_relevant_knowledge" | "error";
export type AttachmentType = "image" | "camera_photo" | "gallery_photo" | "file" | "audio" | "video";
export type ChatAttachmentSource = "gallery" | "camera" | "file";

export interface ChatAttachmentDraft {
  id?: string;
  type: AttachmentType;
  source?: ChatAttachmentSource;
  name?: string;
  filename?: string;
  mime_type?: string;
  mimeType?: string;
  size?: number;
  reference_id?: string;
  previewUrl?: string;
  url?: string;
  src?: string;
  dataUrl?: string;
  fileUrl?: string;
  publicUrl?: string;
  downloadUrl?: string;
  path?: string;
  storagePath?: string;
  storage?: string;
  blobKey?: string;
  file?: File;
  metadata?: Record<string, unknown>;
}

export interface ChatSource {
  chunk_id: string;
  file_id: string | null;
  item_id?: string | null;
  knowledgeBaseId?: string | null;
  agentId?: string | null;
  tenantId?: string | null;
  namespace?: string | null;
  sourceApp?: string | null;
  includeShared?: boolean | null;
  includePublished?: boolean | null;
  title: string;
  score: number;
  relevance_score?: number | null;
  chunk_rank?: number | null;
  matchedBy?: string | null;
  content_preview?: string | null;
}

export interface ChatMessageView {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  rawContent?: string | null;
  rawText?: string | null;
  attachments?: ChatAttachmentDraft[] | null;
  sources?: ChatSource[] | null;
  confidence?: RagConfidence | null;
  customerCopy?: string | null;
  customer_answer?: string | null;
  finalized_answer?: FinalizedAnswerView | null;
  provider_status?: ProviderStatus | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  pending?: boolean;
}

export type SalesLoopDealSignalView = RuntimeV2DealSignal;
export type SalesLoopFollowUpStepView = RuntimeV2FollowUpStep;
export type SalesLoopBranchReplyView = RuntimeV2BranchReply;
export type SalesLoopPlanView = RuntimeV2SalesLoopPlan;
export type SalesLoopV2View = RuntimeV2SalesLoopV2;
export type DealProbabilityView = RuntimeV2DealProbability;
export type SilenceRiskView = RuntimeV2SilenceRisk;
export type ABScriptsView = RuntimeV2ABScripts;
export type MultiTurnSalesPathView = RuntimeV2MultiTurnSalesPath;
export type FollowupTimingView = RuntimeV2FollowupTiming;
export type StopPushPolicyView = RuntimeV2StopPushPolicy;
export type SalesLearningV3View = RuntimeV3GrowthOutput;
export type SalesGrowthV4View = RuntimeV4GrowthFlywheelOutput;
export type SalesEvolutionV5View = RuntimeV5EvolutionOutput;

export interface FinalizedAnswerView {
  title: string;
  rawContent?: string | null;
  rawText?: string | null;
  rawAnswer?: string | null;
  text?: string;
  answer?: string;
  content?: string;
  freeformAnswer?: string;
  problemUnderstanding: string;
  keyConclusion: string;
  suggestedSteps: string[];
  customerReply: string;
  nextAction: string;
  evidenceSummary?: string;
  confidenceLabel?: "高" | "中" | "低";
  salesIntent?: string;
  customerStage?: string;
  salesStrategy?: string;
  nextActionDetail?: string;
  dealSignals?: SalesLoopDealSignalView[];
  salesLoopPlan?: SalesLoopPlanView;
  nextQuestion?: string;
  followupSequence?: SalesLoopFollowUpStepView[];
  branchReplies?: SalesLoopBranchReplyView[];
  stopRules?: string[];
  stageReason?: string;
  salesLoopV2?: SalesLoopV2View;
  dealProbability?: DealProbabilityView;
  silenceRisk?: SilenceRiskView;
  abScripts?: ABScriptsView;
  multiTurnPath?: MultiTurnSalesPathView;
  followupTiming?: FollowupTimingView;
  stopPush?: StopPushPolicyView;
  recommendedAction?: string;
  salesLearningV3?: SalesLearningV3View;
  customerSegment?: SalesLearningV3View["customerSegment"];
  conversionScore?: SalesLearningV3View["conversionScore"];
  bestScriptRecommendation?: SalesLearningV3View["bestScriptRecommendation"];
  nextBestActionV3?: SalesLearningV3View["nextBestAction"];
  learningSignals?: SalesLearningV3View["learningSignals"];
  optimizationReason?: string;
  isolationScope?: SalesLearningV3View["isolationScope"];
  salesGrowthV4?: SalesGrowthV4View;
  scriptScoreboardV4?: SalesGrowthV4View["scriptScoreboard"];
  segmentPlaybookV4?: SalesGrowthV4View["segmentPlaybook"];
  optimizedRecommendationV4?: SalesGrowthV4View["optimizedRecommendation"];
  customerPathOptimizationV4?: SalesGrowthV4View["customerPathOptimization"];
  growthMetricsV4?: SalesGrowthV4View["metricsSummary"];
  growthWarningsV4?: SalesGrowthV4View["warnings"];
  salesEvolutionV5?: SalesEvolutionV5View;
  strategyCandidates?: SalesEvolutionV5View["strategyCandidates"];
  promotedStrategies?: SalesEvolutionV5View["promotedStrategies"];
  reducedStrategies?: SalesEvolutionV5View["reducedStrategies"];
  retiredStrategies?: SalesEvolutionV5View["retiredStrategies"];
  roiSignals?: SalesEvolutionV5View["roiSignals"];
  conversionTrend?: SalesEvolutionV5View["conversionTrend"];
  evolvedPath?: SalesEvolutionV5View["evolvedPath"];
  autonomousRecommendation?: SalesEvolutionV5View["autonomousRecommendation"];
  complianceWarnings?: string[];
  debug?: {
    removedInternalLabels: string[];
    originalLength: number;
    finalLength: number;
  };
}

export interface ChatConversation {
  id: string;
  title: string;
  mode: ChatMode;
  metadata: Record<string, unknown> | null;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface ChatQuickActionItem {
  id: string;
  label: string;
  prompt?: string | null;
  kind?: "mode" | "category" | "tool";
  mode?: ChatMode;
  sortOrder?: number | null;
  description?: string | null;
  icon?: string | null;
  type?: string | null;
  action?: string | null;
}

export interface SelectedKnowledgeBase {
  kb_id: string;
  kbId?: string;
  knowledgeBaseId?: string;
  expert_id?: string;
  expertId?: string;
  agentId?: string;
  tenant_id?: string;
  tenantId?: string;
  namespace?: string;
  title: string;
  name?: string;
  expertName?: string;
  category?: string;
  description?: string;
  active: boolean;
}

export interface ExpertMarketItem {
  kb_id: string;
  kbId?: string;
  knowledgeBaseId?: string;
  expert_id?: string;
  expertId?: string;
  agentId?: string;
  tenant_id?: string;
  tenantId?: string;
  namespace?: string;
  title: string;
  name?: string;
  expertName?: string;
  category?: string;
  description?: string;
}

export interface ExpertMarketSection {
  key: string;
  title: string;
  items: ExpertMarketItem[];
}

export interface ExpertMarketResponse {
  ok: boolean;
  message?: string;
  baseUrl?: string | null;
  endpoint?: string | null;
  sections: ExpertMarketSection[];
}

export interface CurrentChatUser {
  id: string;
  phone?: string | null;
  email?: string | null;
  account?: string | null;
  displayName?: string | null;
  username?: string | null;
  name?: string | null;
  nickname?: string | null;
  avatar?: string | null;
  avatarUrl?: string | null;
  avatar_url?: string | null;
  image?: string | null;
  profileImage?: string | null;
  profile_image?: string | null;
  avatarUpdatedAt?: string | null;
  avatar_updated_at?: string | null;
  licenseActivated: boolean;
}

export interface AvatarUpdateResponse {
  avatar_url: string | null;
  avatarUrl?: string | null;
  updated_at?: string | null;
  avatar_updated_at?: string | null;
  avatarUpdatedAt?: string | null;
}

export interface ChatAttachmentUploadResponse {
  attachment: ChatAttachmentDraft;
}

export interface ChangePasswordResponse {
  changed: true;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface AskChatRequest {
  text: string;
  attachments: ChatAttachmentDraft[];
  conversation_id: string | null;
  mode: ChatMode;
  userMode?: ChatModeKey;
  modeSource?: ChatModeSource;
  modeLabel?: string;
  modePrompt?: string;
  modeConfidence?: number;
  modeReason?: string;
  modeAlternatives?: ChatModeCandidate[];
  classifierVersion?: string;
  enable_deep_thinking: boolean;
  enable_web_search: boolean;
  business_execution?: unknown;
  business_execution_prompt?: string | null;
  auto_sales_agent?: unknown;
  conversion_feedback?: unknown;
  selectedKnowledgeBases?: SelectedKnowledgeBase[];
  activeKnowledgeBase?: SelectedKnowledgeBase | null;
  kb_id?: string | null;
  knowledgeBaseId?: string | null;
  expert_id?: string | null;
  agentId?: string | null;
  tenant_id?: string | null;
  namespace?: string | null;
}

export interface AskChatResponse {
  answer: string;
  rawContent?: string | null;
  rawText?: string | null;
  rawAnswer?: string | null;
  rawAnswerBeforeFinalizer?: string | null;
  rawCustomerAnswerBeforeFinalizer?: string | null;
  conversation_id: string;
  message_id: string;
  mode: ChatMode;
  customerCopy?: string | null;
  customer_answer?: string | null;
  finalized_answer?: FinalizedAnswerView | null;
  nextStep?: string | null;
  traceId?: string | null;
  sources: ChatSource[];
  runtime_sources?: unknown[] | null;
  runtime_output?: unknown;
  salesLearningV3?: SalesLearningV3View | null;
  customerSegment?: SalesLearningV3View["customerSegment"] | null;
  conversionScore?: SalesLearningV3View["conversionScore"] | null;
  bestScriptRecommendation?: SalesLearningV3View["bestScriptRecommendation"] | null;
  nextBestActionV3?: SalesLearningV3View["nextBestAction"] | null;
  learningSignals?: SalesLearningV3View["learningSignals"] | null;
  optimizationReason?: string | null;
  isolationScope?: SalesLearningV3View["isolationScope"] | null;
  salesGrowthV4?: SalesGrowthV4View | null;
  scriptScoreboardV4?: SalesGrowthV4View["scriptScoreboard"] | null;
  segmentPlaybookV4?: SalesGrowthV4View["segmentPlaybook"] | null;
  optimizedRecommendationV4?: SalesGrowthV4View["optimizedRecommendation"] | null;
  customerPathOptimizationV4?: SalesGrowthV4View["customerPathOptimization"] | null;
  growthMetricsV4?: SalesGrowthV4View["metricsSummary"] | null;
  growthWarningsV4?: SalesGrowthV4View["warnings"] | null;
  salesEvolutionV5?: SalesEvolutionV5View | null;
  strategyCandidates?: SalesEvolutionV5View["strategyCandidates"] | null;
  promotedStrategies?: SalesEvolutionV5View["promotedStrategies"] | null;
  reducedStrategies?: SalesEvolutionV5View["reducedStrategies"] | null;
  retiredStrategies?: SalesEvolutionV5View["retiredStrategies"] | null;
  roiSignals?: SalesEvolutionV5View["roiSignals"] | null;
  conversionTrend?: SalesEvolutionV5View["conversionTrend"] | null;
  evolvedPath?: SalesEvolutionV5View["evolvedPath"] | null;
  autonomousRecommendation?: SalesEvolutionV5View["autonomousRecommendation"] | null;
  confidence: RagConfidence;
  provider_status?: ProviderStatus;
}

export interface ConversationsResponse {
  conversations: ChatConversation[];
}

export interface HistoryResponse {
  conversation: ChatConversation;
  messages: ChatMessageView[];
}

export interface CurrentUserResponse {
  user: CurrentChatUser;
}
