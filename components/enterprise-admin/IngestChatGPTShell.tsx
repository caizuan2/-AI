"use client";

import {
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentType,
  type Dispatch,
  type FormEvent,
  type SetStateAction
} from "react";
import {
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  ImagePlus,
  Link2,
  Loader2,
  Mic,
  Paperclip,
  Plug,
  Plus,
  Save,
  Scissors,
  Search,
  SendHorizontal,
  Settings,
  Tags,
  UploadCloud,
  X
} from "lucide-react";
import { IngestAttachmentPreview } from "@/components/enterprise-admin/IngestAttachmentPreview";
import { IngestAgentConversationList } from "@/components/enterprise-admin/IngestAgentConversationList";
import { IngestAgentMoreMenu } from "@/components/enterprise-admin/IngestAgentMoreMenu";
import { IngestExpertMarketplace } from "@/components/enterprise-admin/IngestExpertMarketplace";
import { IngestGPTModelPicker } from "@/components/enterprise-admin/IngestGPTModelPicker";
import { IngestResizableSidebar } from "@/components/enterprise-admin/IngestResizableSidebar";
import { IngestAgentAvatar } from "@/components/enterprise-admin/IngestAgentAvatar";
import { IngestAnswerFeedbackActions } from "@/components/enterprise-admin/IngestAnswerFeedbackActions";
import {
  IngestBehaviorTracker,
  trackIngestBehaviorEvent
} from "@/components/enterprise-admin/IngestBehaviorTracker";
import { IngestWelcomeHero } from "@/components/enterprise-admin/IngestWelcomeHero";
import { IngestGPTMessageRenderer } from "@/components/enterprise-admin/IngestGPTMessageRenderer";
import {
  IngestPromptHistoryHoverRail,
  type IngestPromptHistoryItem
} from "@/components/enterprise-admin/IngestPromptHistoryHoverRail";
import { IngestGPTOSPanel } from "@/components/enterprise-admin/IngestGPTOSPanel";
import { IngestAutonomousTaskPanel } from "@/components/enterprise-admin/IngestAutonomousTaskPanel";
import { IngestGPTTaskChainPanel } from "@/components/enterprise-admin/IngestGPTTaskChainPanel";
import { IngestGPTCallProofBadge } from "@/components/enterprise-admin/IngestGPTCallProofBadge";
import { IngestKnowledgeDraftActions } from "@/components/enterprise-admin/IngestKnowledgeDraftActions";
import { IngestChatGPTFileMessage } from "@/components/enterprise-admin/IngestChatGPTFileMessage";
import { IngestMessageQuickActions } from "@/components/enterprise-admin/IngestMessageQuickActions";
import {
  ingestPrimaryRailFeatures,
  type IngestRailKey
} from "@/components/enterprise-admin/IngestRailConfig";
import { getAdminIngestPlatformLabel } from "@/lib/enterprise/admin-ingest-platform";
import {
  resolveAdminIngestDisplayProfile,
  type AdminIngestDisplayProfile
} from "@/lib/enterprise/admin-ingest-profile";
import type {
  IngestConnectionStatus,
  IngestVoiceState,
  IngestUploadState
} from "@/lib/enterprise/ingest-client";
import {
  getGptModelSelectionByDisplayName
} from "@/lib/enterprise/gpt-model-options";
import {
  DEFAULT_INGEST_MODEL_OPTION,
  getIngestModelOptionByLabel,
  normalizeIngestModelSelection,
  type IngestModelProvider
} from "@/lib/enterprise/ingest-model-options";
import type { IngestAgentConversation } from "@/lib/enterprise/mock-agent-conversations";
import {
  ingestChatInitialDraft,
  ingestTrainingRecords,
  type IngestChatAgent,
  type IngestChatMessage,
  type IngestKnowledgeDraft,
  type IngestTrainingRecord
} from "@/lib/enterprise/mock-chat";
import type { IngestExpert } from "@/lib/enterprise/mock-experts";
import { resolvePublicExpertScope } from "@/lib/enterprise/public-expert-scope";
import type { GptCallProof, OpenAIGptUsage } from "@/lib/enterprise/gpt-call-proof";
import type { GptOSRouteResult } from "@/lib/enterprise/gpt-os-agent-router";
import type { AutonomousTaskResult } from "@/lib/enterprise/gpt-os-autonomous-executor";
import {
  approveTaskChainStep,
  cancelTaskChain,
  pauseTaskChain,
  resumeTaskChain,
  type TaskChainExecutionResult
} from "@/lib/enterprise/gpt-os-task-chain-engine";
import {
  loadTaskChainState,
  loadAutonomousTaskState,
  mergeTaskChainState,
  mergeAutonomousTaskState,
  saveTaskChainState,
  saveAutonomousTaskState,
  type AutonomousTaskStateSnapshot,
  type TaskChainStateSnapshot
} from "@/lib/enterprise/gpt-os-task-state";
import { sanitizeGptOSUserMessage } from "@/lib/enterprise/gpt-os-fallback-normalizer";
import {
  extractIngestReplyText,
  normalizeIngestErrorPayload,
  normalizeIngestResult,
  normalizeIngestSuccessPayload
} from "@/lib/enterprise/ingest-response-normalizer";
import {
  KnowledgeEvolutionEngine,
  type KnowledgeEvolutionResult
} from "@/lib/enterprise/knowledge-evolution-engine";
import {
  KnowledgeLoopEngine,
  type KnowledgeCandidateSource,
  type KnowledgeLoopCandidate,
  type KnowledgeLoopResult,
  type KnowledgeStoreDecision
} from "@/lib/enterprise/knowledge-loop-engine";
import {
  KnowledgeMemoryAdapter,
  type KnowledgeMemoryPlan,
  type KnowledgeMemoryReport,
  type SavedKnowledgeLike
} from "@/lib/enterprise/knowledge-memory-adapter";

const quickPrompts = [
  "把这段客服对话整理成标准问答",
  "从 PDF 内容提取知识点并分类",
  "生成售后流程的入库建议",
  "检查这条知识是否需要 AI 修正"
];

const CHAT_CONTENT_WIDTH_CLASS = "mx-auto w-full max-w-[780px]";

const SHOW_INTERNAL_OS_UI = false;
const SHOW_STRUCTURED_RESULT_DRAWER = false;

type LatestTurnSpacerMode = "active" | "settled";

const moreToolActions: Array<{ label: string; icon: ComponentType<{ className?: string }> }> = [
  { label: "文件上传", icon: UploadCloud },
  { label: "图片 OCR", icon: ImagePlus },
  { label: "网址投喂", icon: Link2 },
  { label: "分类标签", icon: Tags },
  { label: "连接状态", icon: Plug }
];

const organizeActions = ["提取重点", "改写为标准问答", "生成分类标签", "检查是否需要 AI 修正"];
const EMPTY_AGENTS: IngestChatAgent[] = [];
const GPT_CLIENT_TIMEOUT_MS = 300000;

type IngestActionResult = {
  draft: IngestKnowledgeDraft;
  records: IngestTrainingRecord[];
  preview: boolean;
  message: string;
  autonomousResult?: AutonomousTaskResult;
};

interface IngestChatGPTShellProps {
  agents?: IngestChatAgent[];
  activeAgent?: IngestChatAgent;
  hasActiveAgent?: boolean;
  activeAgentId?: string;
  adminAvatar?: string;
  appName?: string;
  displayProfile?: AdminIngestDisplayProfile;
  onAgentChange?: (agentId: string) => void;
  agentConversations?: IngestAgentConversation[];
  activeConversationId?: string;
  expandedAgentIds?: string[];
  expandedConversationAgentIds?: string[];
  pinnedAgentIds?: string[];
  onAgentToggleExpanded?: (agentId: string) => void;
  onAgentConversationToggleExpanded?: (agentId: string) => void;
  onAgentConversationSelect?: (agentId: string, conversationId: string) => void;
  onAgentConversationCreate?: (agentId: string) => void;
  onAgentConversationRename?: (agentId: string, conversationId: string, title: string) => void;
  onAgentConversationDelete?: (agentId: string, conversationId: string) => void;
  onAgentTogglePinned?: (agentId: string) => void;
  activeRailKey?: IngestRailKey;
  onRailChange?: (key: IngestRailKey) => void;
  searchKeyword?: string;
  onSearchKeywordChange?: (value: string) => void;
  selectedModel?: string;
  regenerateInput?: string;
  modelOptions?: string[];
  onModelChange?: (model: string) => void;
  unavailableModelProviders?: string[];
  connectionStatus?: IngestConnectionStatus;
  onCheckConnection?: () => Promise<IngestConnectionStatus>;
  input?: string;
  onInputChange?: (value: string) => void;
  messages?: IngestChatMessage[];
  onMessagesChange?: Dispatch<SetStateAction<IngestChatMessage[]>>;
  draft?: IngestKnowledgeDraft;
  records?: IngestTrainingRecord[];
  noticeMessage?: string;
  errorMessage?: string;
  uploadState?: IngestUploadState | null;
  uploadedFiles?: IngestUploadState[];
  voiceState?: IngestVoiceState;
  isParsing?: boolean;
  isSaving?: boolean;
  onOpenCreateAgent?: () => void;
  onAddExpertToAgent?: (expert: IngestExpert) => void;
  addedExpertIds?: string[];
  onAgentViewDetails?: (agentId: string) => void;
  onAgentEdit?: (agentId: string) => void;
  onAgentArchive?: (agentId: string) => void;
  onAgentDelete?: (agentId: string) => void;
  onNoticeChange?: (message: string) => void;
  onErrorChange?: (message: string) => void;
  onSend?: (value?: string) => Promise<IngestActionResult | null>;
  onSave?: () => Promise<IngestActionResult | null>;
  onReconnectGpt?: () => Promise<unknown>;
  onUpload?: (files: File[]) => void;
  onRemoveUpload?: (fileId: string) => void;
  onVoiceToggle?: () => void;
  onToolAction?: (label: string) => void;
  onToast?: (toast: { title: string; description?: string; type?: "success" | "warning" | "info" }) => void;
  autonomousEnabled?: boolean;
  onAutonomousEnabledChange?: (enabled: boolean) => void;
}

const uploadAcceptByTool: Record<string, string> = {
  "文件上传": ".pdf,.doc,.docx,.ppt,.pptx,image/*,.txt,.md",
  "图片 OCR": "image/*"
};

interface ApiEnvelope<T> {
  ok: boolean;
  success?: boolean;
  data?: T;
  message?: string;
  error?: {
    message?: string;
    code?: string;
  };
}

interface AdminIngestDraftResponse {
  jobId: string;
  title: string;
  category: string;
  tags: string[];
  summary: string;
  qa_pairs: Array<{ q: string; a: string }>;
  confidence: number;
  should_save: boolean;
  providerUsed: string;
  model: string;
  fallbackUsed: boolean;
  saveStatus: "pending" | "saved" | "rejected" | "completed" | "failed" | "stored" | "indexed" | "knowledge_saved";
  scenarios?: string[];
  sourceMaterials?: string[];
  missingFields?: string[];
  suggestedQuestions?: string[];
  userClientCallPlan?: IngestKnowledgeDraft["userClientCallPlan"];
  saveRecommendation?: string;
  sourceModel?: string;
  generatedBy?: string;
  actualModel?: string;
  responseId?: string;
  usage?: OpenAIGptUsage;
  gptProof?: GptCallProof;
  gptOS?: GptOSRouteResult;
  knowledgeLoop?: KnowledgeLoopResult;
  evolution?: KnowledgeEvolutionResult;
  storeDecision?: KnowledgeStoreDecision;
  reusableKnowledgeUnits?: KnowledgeLoopCandidate[];
  reviewRequiredUnits?: KnowledgeLoopCandidate[];
  autoStoreCandidates?: KnowledgeLoopCandidate[];
  memory?: KnowledgeMemoryReport;
  memoryPlan?: KnowledgeMemoryPlan;
  knowledgeIntelligence?: IngestKnowledgeDraft["knowledgeIntelligence"];
  ragOptimization?: IngestKnowledgeDraft["ragOptimization"];
}

interface AdminTrainingRecordResponse {
  id: string;
  jobId: string;
  input: string;
  ai_output: AdminIngestDraftResponse | null;
  resultTitle: string;
  category: string;
  status: "pending" | "saved" | "rejected" | "completed" | "failed" | "stored" | "indexed" | "knowledge_saved";
  sourceType: string;
  timestamp: string;
  hits: number;
}

interface AdminGptIngestResponse {
  jobId?: string | null;
  trainingRecord?: AdminTrainingRecordResponse | null;
  records?: AdminTrainingRecordResponse[];
  provider: IngestModelProvider;
  model: string;
  requestedModel?: string;
  actualModel?: string;
  responseId?: string;
  proofId?: string;
  usage?: OpenAIGptUsage;
  gptProof?: GptCallProof;
  modelDisplayName?: string;
  modelMode: "highest" | "fixed";
  fallback?: boolean;
  fallbackUsed?: boolean;
  content?: string;
  answer?: string;
  reply?: string;
  visibleReply?: string;
  message?: string | {
    content?: string;
  };
  replyMarkdown?: string;
  knowledgeDraft?: {
    title: string;
    summary: string;
    category: string;
    tags: string[];
    standardQuestion: string;
    standardAnswer: string;
    scenarios?: string[];
    sourceMaterials?: string[];
    saveRecommendation?: string;
    missingFields?: string[];
    trainingScore?: number;
    userClientCallPlan?: IngestKnowledgeDraft["userClientCallPlan"];
    knowledgeLoop?: IngestKnowledgeDraft["knowledgeLoop"];
    evolution?: IngestKnowledgeDraft["evolution"];
    storeDecision?: IngestKnowledgeDraft["storeDecision"];
    reusableKnowledgeUnits?: IngestKnowledgeDraft["reusableKnowledgeUnits"];
    reviewRequiredUnits?: IngestKnowledgeDraft["reviewRequiredUnits"];
    autoStoreCandidates?: IngestKnowledgeDraft["autoStoreCandidates"];
    memory?: IngestKnowledgeDraft["memory"];
    memoryPlan?: IngestKnowledgeDraft["memoryPlan"];
    knowledgeIntelligence?: IngestKnowledgeDraft["knowledgeIntelligence"];
    ragOptimization?: IngestKnowledgeDraft["ragOptimization"];
  };
  knowledgeLoop?: KnowledgeLoopResult;
  evolution?: KnowledgeEvolutionResult;
  storeDecision?: KnowledgeStoreDecision;
  reusableKnowledgeUnits?: KnowledgeLoopCandidate[];
  reviewRequiredUnits?: KnowledgeLoopCandidate[];
  autoStoreCandidates?: KnowledgeLoopCandidate[];
  memory?: KnowledgeMemoryReport;
  memoryPlan?: KnowledgeMemoryPlan;
  knowledgeIntelligence?: IngestKnowledgeDraft["knowledgeIntelligence"];
  ragOptimization?: IngestKnowledgeDraft["ragOptimization"];
  metadata?: {
    knowledgeLoopVersion?: "v1";
    autoStoreEnabled?: boolean;
    requiresReview?: boolean;
    [key: string]: unknown;
  };
  userClientCallPlan?: IngestKnowledgeDraft["userClientCallPlan"];
  sourceFiles?: Array<{
    fileName: string;
    mimeType?: string;
    parseStatus?: string;
    limitationNote?: string;
  }>;
  suggestedQuestions?: string[];
  saveRecommendation?: string;
  gptOS?: GptOSRouteResult;
  autonomousResult?: AutonomousTaskResult;
  structured?: {
    title?: string;
    category?: string;
    summary?: string;
    tags?: string[];
    question?: string;
    answer?: string;
    confidence?: number;
    saveSuggestion?: boolean;
  };
}

interface AdminSaveResponse {
  records?: AdminTrainingRecordResponse[];
  record?: AdminTrainingRecordResponse;
  knowledgeItem?: SavedKnowledgeLike;
  status?: "saved";
  knowledgeItemId?: string | null;
  storedCount?: number;
  chunkCount?: number;
  indexedCount?: number;
  message?: string;
}

async function readApiData<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;

  if (!response.ok || !payload?.ok || !payload.data) {
    throw new Error(payload?.message ?? payload?.error?.message ?? "请求失败，请稍后重试。");
  }

  return payload.data;
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readGptResponseContent(data: AdminGptIngestResponse) {
  return extractIngestReplyText(data);
}

function getTimeLabel(value?: string) {
  const date = value ? new Date(value) : new Date();

  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function toRecommendation(draft: Pick<AdminIngestDraftResponse, "confidence" | "should_save">): IngestKnowledgeDraft["recommendation"] {
  if (!draft.should_save) {
    return "暂不入库";
  }

  return draft.confidence >= 75 ? "建议入库" : "需要复核";
}

function toSaveStatus(status: AdminIngestDraftResponse["saveStatus"] | AdminTrainingRecordResponse["status"]): IngestKnowledgeDraft["saveStatus"] {
  if (["saved", "completed", "stored", "indexed", "knowledge_saved"].includes(status)) {
    return "已保存";
  }

  if (["rejected", "failed"].includes(status)) {
    return "已拒绝";
  }

  return "待确认";
}

function toTrainingRecordSaveStatus(status: AdminIngestDraftResponse["saveStatus"] | AdminTrainingRecordResponse["status"]): IngestTrainingRecord["saveStatus"] {
  const saveStatus = toSaveStatus(status);

  return saveStatus === "保存失败" ? "失败" : saveStatus;
}

function mapDraft(draft: AdminIngestDraftResponse): IngestKnowledgeDraft {
  const firstPair = draft.qa_pairs[0] ?? {
    q: `关于“${draft.title}”，应该如何处理？`,
    a: draft.summary
  };

  return {
    id: draft.jobId,
    jobId: draft.jobId,
    title: draft.title,
    category: draft.category,
    tags: draft.tags,
    summary: draft.summary,
    qaPairs: draft.qa_pairs,
    standardQuestion: firstPair.q,
    standardAnswer: firstPair.a,
    trainingScore: Math.min(100, Math.max(1, Math.round(draft.confidence))),
    recommendation: toRecommendation(draft),
    saveStatus: toSaveStatus(draft.saveStatus),
    providerUsed: draft.providerUsed,
    model: draft.model,
    scenarios: draft.scenarios,
    sourceMaterials: draft.sourceMaterials,
    missingFields: draft.missingFields,
    suggestedQuestions: draft.suggestedQuestions,
    saveRecommendation: draft.saveRecommendation,
    sourceModel: draft.sourceModel ?? draft.model,
    generatedBy: draft.generatedBy ?? draft.providerUsed,
    fallbackUsed: draft.fallbackUsed,
    actualModel: draft.actualModel,
    responseId: draft.responseId,
    usage: draft.usage,
    gptProof: draft.gptProof,
    gptOS: draft.gptOS,
    knowledgeLoop: draft.knowledgeLoop,
    evolution: draft.evolution,
    storeDecision: draft.storeDecision,
    reusableKnowledgeUnits: draft.reusableKnowledgeUnits,
    reviewRequiredUnits: draft.reviewRequiredUnits,
    autoStoreCandidates: draft.autoStoreCandidates,
    memory: draft.memory,
    memoryPlan: draft.memoryPlan,
    knowledgeIntelligence: draft.knowledgeIntelligence,
    ragOptimization: draft.ragOptimization
  };
}

function mapRecord(record: AdminTrainingRecordResponse): IngestTrainingRecord {
  const draft = record.ai_output ? mapDraft({
    ...record.ai_output,
    jobId: record.jobId,
    saveStatus: record.status
  }) : null;

  return {
    id: record.id,
    jobId: record.jobId,
    input: record.input,
    resultTitle: record.resultTitle,
    saveStatus: toTrainingRecordSaveStatus(record.status),
    category: record.category,
    time: getTimeLabel(record.timestamp),
    hits: record.hits,
    sourceType: record.sourceType,
    aiOutput: draft
  };
}

function currentRecordsWithSavedDraft(records: IngestTrainingRecord[], draft: IngestKnowledgeDraft) {
  return records.map((record) => {
    if (!isTrainingRecordLinkedToDraft(record, draft)) {
      return record;
    }

    return {
      ...record,
      saveStatus: "已保存" as const,
      aiOutput: record.aiOutput
        ? { ...record.aiOutput, saveStatus: "已保存" as const }
        : { ...draft, saveStatus: "已保存" as const }
    };
  });
}

function getDraftRecordIdentifiers(draft: IngestKnowledgeDraft) {
  return new Set([draft.jobId, draft.id, draft.responseId].filter((value): value is string => Boolean(value)));
}

function isTrainingRecordLinkedToDraft(record: IngestTrainingRecord, draft: IngestKnowledgeDraft) {
  const draftIds = getDraftRecordIdentifiers(draft);

  if (draftIds.size === 0) {
    return false;
  }

  return [
    record.jobId,
    record.id,
    record.aiOutput?.jobId,
    record.aiOutput?.id,
    record.aiOutput?.responseId
  ].some((value) => Boolean(value && draftIds.has(value)));
}

function mergeTrainingRecordLists(incoming: IngestTrainingRecord[], current: IngestTrainingRecord[]) {
  const seen = new Set<string>();

  return [...incoming, ...current].filter((record) => {
    const key = record.jobId ?? record.id;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function buildDraftMemoryPlan(draft: IngestKnowledgeDraft) {
  return new KnowledgeMemoryAdapter().buildMemoryPlan(draft);
}

function buildDraftMemoryReport(plan: KnowledgeMemoryPlan): KnowledgeMemoryReport {
  return {
    enabled: true,
    mode: plan.mode,
    storedCount: 0,
    draftCount: plan.candidates.length,
    indexedCount: 0,
    failedCount: 0,
    retrievalCheck: plan.retrievalCheck,
    warnings: plan.warnings,
    recommendedAction: plan.recommendedAction,
    intelligence: plan.intelligence,
    ragOptimization: plan.ragOptimization
  };
}

function attachMemoryPlan(draft: IngestKnowledgeDraft): IngestKnowledgeDraft {
  const memoryPlan = draft.memoryPlan ?? buildDraftMemoryPlan(draft);

  return {
    ...draft,
    memoryPlan,
    memory: draft.memory ?? buildDraftMemoryReport(memoryPlan),
    knowledgeIntelligence: draft.knowledgeIntelligence ?? memoryPlan.intelligence,
    ragOptimization: draft.ragOptimization ?? memoryPlan.ragOptimization
  };
}

function toStructuredPayload(draft: IngestKnowledgeDraft) {
  const memoryPlan = draft.memoryPlan ?? buildDraftMemoryPlan(draft);
  const qaPairs = memoryPlan.qaPairs.length > 0
    ? memoryPlan.qaPairs
    : draft.qaPairs?.length
      ? draft.qaPairs
      : [{ q: draft.standardQuestion, a: draft.standardAnswer }];

  return {
    title: draft.title,
    category: draft.category,
    tags: draft.tags,
    summary: memoryPlan.structuredSummary || draft.summary || draft.standardAnswer,
    qa_pairs: qaPairs,
    confidence: draft.trainingScore,
    should_save: draft.recommendation !== "暂不入库",
    scenarios: draft.scenarios ?? [],
    sourceMaterials: draft.sourceMaterials ?? [],
    complianceNotes: draft.complianceNotes ?? [],
    userClientCallPlan: draft.userClientCallPlan,
    missingFields: draft.missingFields ?? [],
    suggestedQuestions: draft.suggestedQuestions ?? [],
    saveRecommendation: draft.saveRecommendation ?? draft.recommendation,
    sourceModel: draft.sourceModel ?? draft.model ?? "unknown",
    generatedBy: draft.generatedBy ?? draft.providerUsed ?? "unknown",
    reason: draft.recommendation,
    importance: Math.min(5, Math.max(1, Math.round(draft.trainingScore / 20))),
    clarityScore: Math.min(5, Math.max(1, Math.round(draft.trainingScore / 20))),
    completenessScore: Math.min(5, Math.max(1, Math.round(draft.trainingScore / 20))),
    usefulnessScore: Math.min(5, Math.max(1, Math.round(draft.trainingScore / 20))),
    confidenceScore: Math.min(5, Math.max(1, Math.round(draft.trainingScore / 20))),
    providerUsed: draft.providerUsed ?? "unknown",
    model: draft.model ?? "unknown",
    fallbackUsed: draft.fallbackUsed ?? false,
    knowledgeLoop: draft.knowledgeLoop,
    evolution: draft.evolution,
    storeDecision: draft.storeDecision,
    reusableKnowledgeUnits: draft.reusableKnowledgeUnits ?? [],
    reviewRequiredUnits: draft.reviewRequiredUnits ?? [],
    autoStoreCandidates: draft.autoStoreCandidates ?? [],
    memory: draft.memory ?? buildDraftMemoryReport(memoryPlan),
    memoryPlan,
    knowledgeIntelligence: draft.knowledgeIntelligence ?? memoryPlan.intelligence,
    ragOptimization: draft.ragOptimization ?? memoryPlan.ragOptimization,
    knowledgeLoopMetadata: {
      knowledgeLoopVersion: "v1",
      autoStoreEnabled: false,
      requiresReview: draft.storeDecision?.requiresReview ?? true
    }
  };
}

function buildReplySourceMaterials(draft: IngestKnowledgeDraft, files: IngestUploadState[]) {
  return Array.from(new Set([
    ...(draft.sourceMaterials ?? []),
    ...files.map((file) => file.fileName)
  ].map((source) => source.trim()).filter(Boolean)));
}

function normalizeFeedbackScopeId(value: string | null | undefined, fallback: string) {
  return (value ?? "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^0-9A-Za-z_\-:.]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || fallback;
}

function buildFeedbackAgentScope(agent: IngestChatAgent) {
  const agentId = normalizeFeedbackScopeId(agent.id, "chief");
  const knowledgeBaseId = normalizeFeedbackScopeId(agent.knowledgeBaseId, `kb:${agentId}`);
  const namespace = normalizeFeedbackScopeId(agent.namespace, `agent:${agentId}:kb:${knowledgeBaseId}`);
  const publicScope = resolvePublicExpertScope({
    agentId,
    expertId: agent.expertId,
    knowledgeBaseId,
    namespace,
    tenantId: agent.tenantId
  });

  if (publicScope) {
    return {
      agentId: publicScope.agentId,
      knowledgeBaseId: publicScope.knowledgeBaseId,
      namespace: publicScope.namespace
    };
  }

  return {
    agentId,
    knowledgeBaseId,
    namespace
  };
}

function findPreviousUserQuestion(messages: IngestChatMessage[], currentIndex: number) {
  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (message?.role === "user") {
      return message.content;
    }
  }

  return "";
}

function inferDraftKnowledgeSource(files: IngestUploadState[]): KnowledgeCandidateSource {
  const first = files[0];
  const fileName = first?.fileName.toLowerCase() ?? "";
  const mimeType = first?.mimeType?.toLowerCase() || first?.fileType.toLowerCase() || "";

  if (/\.pptx?$/.test(fileName) || mimeType.includes("presentation")) {
    return "ppt";
  }

  if (/\.docx?$/.test(fileName) || mimeType.includes("word")) {
    return "word";
  }

  return first ? "document" : "conversation";
}

function enrichDraftWithKnowledgeLoop(input: {
  draft: IngestKnowledgeDraft;
  userInput: string;
  replyMarkdown: string;
  uploadedFiles: IngestUploadState[];
  response?: Pick<AdminGptIngestResponse, "knowledgeLoop" | "evolution" | "storeDecision" | "reusableKnowledgeUnits" | "reviewRequiredUnits" | "autoStoreCandidates" | "memory" | "memoryPlan" | "knowledgeIntelligence" | "ragOptimization">;
}): IngestKnowledgeDraft {
  if (input.response?.knowledgeLoop || input.draft.knowledgeLoop) {
    return attachMemoryPlan({
      ...input.draft,
      knowledgeLoop: input.response?.knowledgeLoop ?? input.draft.knowledgeLoop,
      evolution: input.response?.evolution ?? input.draft.evolution,
      storeDecision: input.response?.storeDecision ?? input.draft.storeDecision,
      reusableKnowledgeUnits: input.response?.reusableKnowledgeUnits ?? input.draft.reusableKnowledgeUnits,
      reviewRequiredUnits: input.response?.reviewRequiredUnits ?? input.draft.reviewRequiredUnits,
      autoStoreCandidates: input.response?.autoStoreCandidates ?? input.draft.autoStoreCandidates,
      memory: input.response?.memory ?? input.draft.memory,
      memoryPlan: input.response?.memoryPlan ?? input.draft.memoryPlan,
      knowledgeIntelligence: input.response?.knowledgeIntelligence ?? input.draft.knowledgeIntelligence,
      ragOptimization: input.response?.ragOptimization ?? input.draft.ragOptimization
    });
  }

  try {
    const knowledgeLoop = new KnowledgeLoopEngine({ autoStoreAvailable: false }).processConversation({
      text: input.userInput,
      replyMarkdown: input.replyMarkdown,
      source: inferDraftKnowledgeSource(input.uploadedFiles),
      draft: {
        title: input.draft.title,
        summary: input.draft.summary,
        category: input.draft.category,
        tags: input.draft.tags,
        standardQuestion: input.draft.standardQuestion,
        standardAnswer: input.draft.standardAnswer,
        scenarios: input.draft.scenarios
      },
      autoStoreAvailable: false
    });
    const evolution = new KnowledgeEvolutionEngine().normalizeDraft(knowledgeLoop.draft);

    return attachMemoryPlan({
      ...input.draft,
      knowledgeLoop,
      evolution,
      storeDecision: knowledgeLoop.storeDecision,
      reusableKnowledgeUnits: knowledgeLoop.candidates.filter((candidate) => candidate.reusable),
      reviewRequiredUnits: knowledgeLoop.candidates.filter((candidate) => candidate.storeAction === "review_required"),
      autoStoreCandidates: []
    });
  } catch {
    return attachMemoryPlan(input.draft);
  }
}

export function IngestChatGPTShell({
  agents: controlledAgents,
  activeAgent: controlledActiveAgent,
  hasActiveAgent: controlledHasActiveAgent,
  activeAgentId: controlledActiveAgentId,
  adminAvatar = "",
  appName,
  displayProfile,
  onAgentChange,
  agentConversations = [],
  activeConversationId = "",
  expandedAgentIds = [],
  expandedConversationAgentIds = [],
  pinnedAgentIds = [],
  onAgentToggleExpanded,
  onAgentConversationToggleExpanded,
  onAgentConversationSelect,
  onAgentConversationCreate,
  onAgentConversationRename,
  onAgentConversationDelete,
  onAgentTogglePinned,
  activeRailKey: controlledActiveRailKey,
  onRailChange,
  searchKeyword: controlledSearchKeyword,
  onSearchKeywordChange,
  selectedModel = DEFAULT_INGEST_MODEL_OPTION.label,
  regenerateInput = "",
  onModelChange,
  unavailableModelProviders = [],
  connectionStatus = {
    enterpriseSpace: "本地预览",
    knowledgeBase: "默认知识库",
    licenseStatus: "未检查"
  },
  onCheckConnection,
  input: controlledInput,
  onInputChange,
  messages: controlledMessages,
  onMessagesChange,
  draft: controlledDraft,
  records: controlledRecords,
  noticeMessage: controlledNoticeMessage,
  uploadedFiles = [],
  voiceState = {
    isVoiceSupported: false,
    isRecording: false,
    transcript: "",
    error: "",
    platform: "web",
    syncTarget: ["web", "exe", "apk"]
  },
  isParsing: controlledIsParsing,
  isSaving: controlledIsSaving,
  onOpenCreateAgent,
  onAddExpertToAgent,
  addedExpertIds = [],
  onAgentViewDetails,
  onAgentDelete,
  onNoticeChange,
  onErrorChange,
  onSend,
  onSave,
  onUpload,
  onRemoveUpload,
  onVoiceToggle,
  onToolAction,
  onToast,
  autonomousEnabled: controlledAutonomousEnabled,
  onAutonomousEnabledChange
}: IngestChatGPTShellProps = {}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputTextareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollContentRef = useRef<HTMLDivElement | null>(null);
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null);
  const messageNodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const highlightPromptTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingLatestUserTurnRequestRef = useRef(false);
  const latestUserMessageIdBeforeSendRef = useRef<string | null>(null);
  const pendingLatestUserTurnScrollRef = useRef<{
    messageId: string;
    behavior: ScrollBehavior;
    attempts: number;
  } | null>(null);
  const suppressBottomAutoScrollRef = useRef(false);
  const isNearBottomRef = useRef(true);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const organizeMenuRef = useRef<HTMLDivElement>(null);
  const [internalActiveAgentId, setInternalActiveAgentId] = useState("");
  const [internalMessages, setInternalMessages] = useState<IngestChatMessage[]>([]);
  const [internalDraft, setInternalDraft] = useState<IngestKnowledgeDraft>(ingestChatInitialDraft);
  const [internalRecords, setInternalRecords] = useState<IngestTrainingRecord[]>(ingestTrainingRecords);
  const [internalInput, setInternalInput] = useState("");
  const [internalIsParsing, setInternalIsParsing] = useState(false);
  const [internalIsSaving, setInternalIsSaving] = useState(false);
  const [internalNoticeMessage, setInternalNoticeMessage] = useState("");
  const [thinkingStartedAt, setThinkingStartedAt] = useState<number | null>(null);
  const [thinkingElapsedSeconds, setThinkingElapsedSeconds] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerView, setDrawerView] = useState<"draft" | "records">("records");
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isConnectionOpen, setIsConnectionOpen] = useState(false);
  const [isOrganizeOpen, setIsOrganizeOpen] = useState(false);
  const [fileAccept, setFileAccept] = useState(".pdf,.doc,.docx,.ppt,.pptx,image/*,.txt,.md");
  const [internalAutonomousEnabled, setInternalAutonomousEnabled] = useState(false);
  const [autonomousTask, setAutonomousTask] = useState<AutonomousTaskStateSnapshot | null>(null);
  const [taskChain, setTaskChain] = useState<TaskChainStateSnapshot | null>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [highlightedPromptMessageId, setHighlightedPromptMessageId] = useState<string | null>(null);
  const [latestTurnAnchorId, setLatestTurnAnchorId] = useState<string | null>(null);
  const [latestTurnSpacerMode, setLatestTurnSpacerMode] = useState<LatestTurnSpacerMode | null>(null);

  const agents = controlledAgents ?? EMPTY_AGENTS;
  const activeAgentId = controlledActiveAgentId ?? internalActiveAgentId;
  const setActiveAgentId = onAgentChange ?? setInternalActiveAgentId;
  const activeRailKey = controlledActiveRailKey ?? "chat";
  const searchKeyword = controlledSearchKeyword ?? "";
  const setSearchKeyword = onSearchKeywordChange ?? (() => undefined);
  const messages = controlledMessages ?? internalMessages;
  const setMessages = onMessagesChange ?? setInternalMessages;
  const draft = controlledDraft ?? internalDraft;
  const setDraft = setInternalDraft;
  const records = controlledRecords ?? internalRecords;
  const setRecords = setInternalRecords;
  const input = controlledInput ?? internalInput;
  const setInput = onInputChange ?? setInternalInput;
  const isParsing = controlledIsParsing ?? internalIsParsing;
  const isSaving = controlledIsSaving ?? internalIsSaving;
  const noticeMessage = controlledNoticeMessage ?? internalNoticeMessage;
  const setErrorMessage = onErrorChange ?? (() => undefined);
  const setNoticeMessage = onNoticeChange ?? setInternalNoticeMessage;
  const normalizedModelSelection = useMemo(() => normalizeIngestModelSelection({
    selectedModelLabel: selectedModel
  }), [selectedModel]);
  const selectedModelLabel = normalizedModelSelection.label;
  const autonomousEnabled = controlledAutonomousEnabled ?? internalAutonomousEnabled;
  const setAutonomousEnabled = onAutonomousEnabledChange ?? setInternalAutonomousEnabled;

  const fallbackAgent = useMemo<IngestChatAgent>(() => ({
    id: "no-agent",
    expertId: null,
    name: "未选择 Agent",
    role: "待添加专家",
    category: "专家广场",
    description: "请先到专家广场添加专家 Agent。",
    avatar: "+",
    tone: "slate",
    platform: voiceState.platform,
    syncTarget: [...voiceState.syncTarget],
    status: "active",
    source: "expert_marketplace",
    sourceApp: "admin_ingest",
    managedBySuperAdmin: false,
    editableByIngestAdmin: false,
    deletableByIngestAdmin: false,
    visibleToUserClient: false
  }), [voiceState.platform, voiceState.syncTarget]);
  const activeAgent = useMemo(
    () => controlledActiveAgent ?? agents.find((agent) => agent.id === activeAgentId) ?? agents[0] ?? fallbackAgent,
    [activeAgentId, agents, controlledActiveAgent, fallbackAgent]
  );
  const canIngest = controlledHasActiveAgent ?? agents.length > 0;
  const activeDisplayProfile = useMemo(
    () => displayProfile ?? resolveAdminIngestDisplayProfile({
      currentAgent: canIngest ? activeAgent : null,
      appName,
      adminAvatar
    }),
    [activeAgent, adminAvatar, appName, canIngest, displayProfile]
  );

  const navItems = useMemo(
    () => ingestPrimaryRailFeatures.map((item) => ({
      ...item,
      badge: item.key === "tasks" && records.length > 0 ? String(Math.min(records.length, 99)) : undefined
    })),
    [records.length]
  );

  const normalizedSearch = searchKeyword.trim().toLowerCase();
  const filteredAgents = useMemo(
    () => normalizedSearch
      ? agents.filter((agent) => [agent.name, agent.role, agent.description, agent.category].join(" ").toLowerCase().includes(normalizedSearch))
      : agents,
    [agents, normalizedSearch]
  );
  const hasSearchResults = filteredAgents.length > 0;
  const agentLabelById = useMemo(
    () => new Map(agents.map((agent) => [agent.id, `${agent.name} · ${agent.role}`])),
    [agents]
  );
  const agentById = useMemo(
    () => new Map(agents.map((agent) => [agent.id, agent])),
    [agents]
  );
  const hasMessages = messages.length > 0;
  const isExpertMarketplace = activeRailKey === "experts";
  const shouldShowScrollToBottom = !isExpertMarketplace && (hasMessages || isParsing) && !isNearBottom;
  const latestTurnSpacerClass = latestTurnSpacerMode === "active"
    ? "pointer-events-none h-[55vh] min-h-[360px] max-h-[560px] shrink-0"
    : latestTurnSpacerMode === "settled"
      ? "pointer-events-none h-[180px] shrink-0"
      : "";
  const promptHistoryItems = useMemo<IngestPromptHistoryItem[]>(() => messages
    .filter((message) => message.role === "user" && message.content.trim())
    .slice(-24)
    .reverse()
    .map((message) => ({
      id: message.id,
      title: message.content.trim(),
      time: message.time,
      attachmentsCount: message.attachments?.length ?? 0
    })), [messages]);

  const registerMessageNode = useCallback((messageId: string, node: HTMLDivElement | null) => {
    if (!node) {
      messageNodeRefs.current.delete(messageId);
      return;
    }

    messageNodeRefs.current.set(messageId, node);
  }, []);

  const updateNearBottomState = useCallback(() => {
    const container = scrollContainerRef.current;

    if (!container) {
      isNearBottomRef.current = true;
      setIsNearBottom(true);
      return;
    }

    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const nextIsNearBottom = distanceToBottom <= 120;

    isNearBottomRef.current = nextIsNearBottom;
    setIsNearBottom(nextIsNearBottom);
  }, []);

  const scrollToLatestMessage = useCallback((behavior: ScrollBehavior = "smooth") => {
    bottomAnchorRef.current?.scrollIntoView({
      behavior,
      block: "end"
    });
    requestAnimationFrame(updateNearBottomState);
  }, [updateNearBottomState]);

  const scrollToLatestUserTurnTop = useCallback((messageId: string, behavior: ScrollBehavior = "smooth") => {
    const container = scrollContainerRef.current;
    const node = messageNodeRefs.current.get(messageId);

    if (!container || !node) {
      return false;
    }

    const topOffset = 88;
    const containerRect = container.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    const nextTop = container.scrollTop + (nodeRect.top - containerRect.top) - topOffset;

    container.scrollTo({
      top: Math.max(nextTop, 0),
      behavior
    });
    requestAnimationFrame(updateNearBottomState);

    return true;
  }, [updateNearBottomState]);

  const scheduleLatestUserTurnTopScroll = useCallback((messageId: string, behavior: ScrollBehavior = "smooth") => {
    pendingLatestUserTurnScrollRef.current = {
      messageId,
      behavior,
      attempts: 0
    };

    const tryScroll = () => {
      const pending = pendingLatestUserTurnScrollRef.current;

      if (!pending || pending.messageId !== messageId) {
        return;
      }

      if (scrollToLatestUserTurnTop(pending.messageId, pending.behavior)) {
        pendingLatestUserTurnScrollRef.current = null;
        return;
      }

      if (pending.attempts >= 6) {
        pendingLatestUserTurnScrollRef.current = null;
        return;
      }

      pendingLatestUserTurnScrollRef.current = {
        ...pending,
        attempts: pending.attempts + 1
      };
      requestAnimationFrame(tryScroll);
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(tryScroll);
    });
  }, [scrollToLatestUserTurnTop]);

  const getLatestUserMessageId = useCallback(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role === "user") {
        return messages[index].id;
      }
    }

    return null;
  }, [messages]);

  const handleConversationScroll = useCallback(() => {
    updateNearBottomState();
  }, [updateNearBottomState]);

  const handlePromptHistorySelect = useCallback((messageId: string) => {
    const node = messageNodeRefs.current.get(messageId);

    if (!node) {
      return;
    }

    node.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });

    setHighlightedPromptMessageId(messageId);

    if (highlightPromptTimeoutRef.current) {
      clearTimeout(highlightPromptTimeoutRef.current);
    }

    highlightPromptTimeoutRef.current = setTimeout(() => {
      setHighlightedPromptMessageId((current) => current === messageId ? null : current);
      highlightPromptTimeoutRef.current = null;
    }, 1800);

    requestAnimationFrame(updateNearBottomState);
  }, [updateNearBottomState]);

  useEffect(() => {
    setAutonomousTask(loadAutonomousTaskState());
    setTaskChain(loadTaskChainState());
  }, []);

  useEffect(() => () => {
    if (highlightPromptTimeoutRef.current) {
      clearTimeout(highlightPromptTimeoutRef.current);
      highlightPromptTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!latestTurnAnchorId) {
      return;
    }

    const anchorExists = messages.some((message) => message.id === latestTurnAnchorId);

    if (anchorExists) {
      return;
    }

    setLatestTurnAnchorId(null);
    setLatestTurnSpacerMode(null);
    pendingLatestUserTurnRequestRef.current = false;
    latestUserMessageIdBeforeSendRef.current = null;
    pendingLatestUserTurnScrollRef.current = null;
    suppressBottomAutoScrollRef.current = false;
  }, [latestTurnAnchorId, messages]);

  useEffect(() => {
    const textarea = inputTextareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, 44), 160);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > 160 ? "auto" : "hidden";
  }, [input, uploadedFiles.length]);

  useEffect(() => {
    requestAnimationFrame(() => {
      if (pendingLatestUserTurnRequestRef.current) {
        const messageId = getLatestUserMessageId();
        const previousMessageId = latestUserMessageIdBeforeSendRef.current;

        if (messageId && messageId !== previousMessageId) {
          pendingLatestUserTurnRequestRef.current = false;
          latestUserMessageIdBeforeSendRef.current = null;
          setLatestTurnAnchorId(messageId);
          setLatestTurnSpacerMode("active");
          scheduleLatestUserTurnTopScroll(messageId, "smooth");
        }

        return;
      }

      const pending = pendingLatestUserTurnScrollRef.current;

      if (pending) {
        scheduleLatestUserTurnTopScroll(pending.messageId, pending.behavior);
        return;
      }

      if (suppressBottomAutoScrollRef.current) {
        updateNearBottomState();
        return;
      }

      if (latestTurnSpacerMode === "active") {
        updateNearBottomState();
        return;
      }

      if (isNearBottomRef.current) {
        scrollToLatestMessage("smooth");
        return;
      }

      updateNearBottomState();
    });
  }, [getLatestUserMessageId, isParsing, latestTurnSpacerMode, messages.length, scheduleLatestUserTurnTopScroll, scrollToLatestMessage, updateNearBottomState]);

  useEffect(() => {
    const target = scrollContentRef.current ?? scrollContainerRef.current;

    if (!target || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      const pending = pendingLatestUserTurnScrollRef.current;

      if (pending) {
        scheduleLatestUserTurnTopScroll(pending.messageId, pending.behavior);
        return;
      }

      if (suppressBottomAutoScrollRef.current) {
        updateNearBottomState();
        return;
      }

      if (latestTurnSpacerMode === "active") {
        updateNearBottomState();
        return;
      }

      if (isNearBottomRef.current) {
        scrollToLatestMessage("auto");
        return;
      }

      updateNearBottomState();
    });

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [latestTurnSpacerMode, scheduleLatestUserTurnTopScroll, scrollToLatestMessage, updateNearBottomState]);

  useEffect(() => {
    if (!drawerOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDrawerOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (!isMoreOpen && !isConnectionOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (moreMenuRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsMoreOpen(false);
      setIsConnectionOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMoreOpen(false);
        setIsConnectionOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMoreOpen, isConnectionOpen]);

  useEffect(() => {
    if (!isOrganizeOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (organizeMenuRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsOrganizeOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOrganizeOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOrganizeOpen]);

  useEffect(() => {
    if (controlledRecords) {
      return;
    }

    let cancelled = false;

    async function loadRecords() {
      try {
        const response = await fetch("/api/admin/kb/ingest", { cache: "no-store", credentials: "include" });
        const data = await readApiData<{ records: AdminTrainingRecordResponse[] }>(response);

        if (!cancelled && data.records.length > 0) {
          setRecords(data.records.map(mapRecord));
        }
      } catch {
        if (!cancelled) {
          setRecords(ingestTrainingRecords);
        }
      }
    }

    loadRecords();

    return () => {
      cancelled = true;
    };
  }, [controlledRecords, setRecords]);

  useEffect(() => {
    if (!isParsing) {
      setThinkingStartedAt(null);
      setThinkingElapsedSeconds(0);
      return;
    }

    const startedAt = thinkingStartedAt ?? Date.now();

    if (thinkingStartedAt === null) {
      setThinkingStartedAt(startedAt);
    }

    const updateElapsed = () => {
      setThinkingElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    };

    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);

    return () => window.clearInterval(timer);
  }, [isParsing, thinkingStartedAt]);

  function persistAutonomousTask(result?: AutonomousTaskResult | null) {
    if (!result) {
      return;
    }

    const snapshot = mergeAutonomousTaskState(autonomousTask, {
      taskId: result.taskId,
      goal: result.goal,
      steps: result.steps,
      status: result.status,
      summaryResult: result.summaryResult
    });

    setAutonomousTask(snapshot);
    saveAutonomousTaskState(snapshot);
  }

  function persistTaskChain(result?: TaskChainExecutionResult | null) {
    if (!result) {
      return;
    }

    const snapshot = mergeTaskChainState(taskChain, result);

    setTaskChain(snapshot);
    saveTaskChainState(snapshot);
  }

  function updateTaskChain(next: TaskChainExecutionResult, notice: string) {
    const snapshot = mergeTaskChainState(taskChain, next);

    setTaskChain(snapshot);
    saveTaskChainState(snapshot);
    setNoticeMessage(notice);
  }

  function updateAutonomousTaskStatus(status: AutonomousTaskStateSnapshot["status"], summaryResult?: string) {
    if (!autonomousTask) {
      return;
    }

    const snapshot = mergeAutonomousTaskState(autonomousTask, {
      ...autonomousTask,
      status,
      summaryResult: summaryResult ?? autonomousTask.summaryResult
    });

    setAutonomousTask(snapshot);
    saveAutonomousTaskState(snapshot);
  }

  function pauseCurrentTaskChain() {
    if (!taskChain) {
      return;
    }

    updateTaskChain(pauseTaskChain(taskChain), "任务链已暂停。");
  }

  function resumeCurrentTaskChain() {
    if (!taskChain) {
      return;
    }

    updateTaskChain(resumeTaskChain(taskChain), "任务链已继续，并会从下一步安全动作恢复。");
  }

  function cancelCurrentTaskChain() {
    if (!taskChain) {
      return;
    }

    updateTaskChain(cancelTaskChain(taskChain), "任务链已取消，不会继续推进后续步骤。");
  }

  function handleApproveTaskChainStep(stepId: string) {
    if (!taskChain) {
      return;
    }

    updateTaskChain(approveTaskChainStep(taskChain, stepId), "已确认该任务链步骤，系统已继续推进后续安全步骤。");
  }

  function handleApproveAutonomousStep(stepId: string) {
    if (!autonomousTask) {
      return;
    }

    const steps = autonomousTask.steps.map((step) => step.id === stepId
      ? {
        ...step,
        status: "completed" as const,
        result: `${step.title} 已由管理员确认。需要真实保存/写入时仍请使用明确保存入口。`
      }
      : step);
    const hasPendingApproval = steps.some((step) => step.status === "needs_approval");
    const snapshot = mergeAutonomousTaskState(autonomousTask, {
      ...autonomousTask,
      steps,
      status: hasPendingApproval ? "needs_approval" : "completed",
      summaryResult: hasPendingApproval ? "仍有步骤等待确认。" : "所有自主任务步骤已确认完成。"
    });

    setAutonomousTask(snapshot);
    saveAutonomousTaskState(snapshot);
    setNoticeMessage("已确认该自主任务步骤；真实入库仍需通过保存知识按钮完成。");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const value = input.trim();
    const hasAttachments = uploadedFiles.length > 0;

    if (!canIngest) {
      setNoticeMessage("请先到专家广场添加专家 Agent。");
      setErrorMessage("");
      onRailChange?.("experts");
      return;
    }

    if (!value && !hasAttachments) {
      return;
    }

    const now = getTimeLabel();

    if (onSend) {
      setThinkingStartedAt(Date.now());
      setThinkingElapsedSeconds(0);
      setErrorMessage("");
      setNoticeMessage("");
      latestUserMessageIdBeforeSendRef.current = getLatestUserMessageId();
      pendingLatestUserTurnRequestRef.current = true;
      suppressBottomAutoScrollRef.current = true;
      setLatestTurnSpacerMode("active");

      try {
        const sendPromise = onSend(value || undefined);

        const result = await sendPromise;

        if (result) {
          persistAutonomousTask(result.autonomousResult ?? result.draft.gptOS?.autonomousResult);
          persistTaskChain(result.draft.gptOS?.taskChain);
          setDrawerView("records");
        }
      } finally {
        setLatestTurnSpacerMode((current) => current === "active" ? "settled" : current);
        suppressBottomAutoScrollRef.current = false;
      }


      return;
    }

    setThinkingStartedAt(Date.now());
    setThinkingElapsedSeconds(0);
    setInternalIsParsing(true);
    setErrorMessage("");
    setNoticeMessage("");
    setInput("");
    uploadedFiles.forEach((file) => onRemoveUpload?.(file.id));
    const userMessageId = `user-${Date.now()}`;
    suppressBottomAutoScrollRef.current = true;
    setLatestTurnAnchorId(userMessageId);
    setLatestTurnSpacerMode("active");
    setMessages((current) => [
      ...current,
      {
        id: userMessageId,
        role: "user",
        content: value || "附件投喂",
        time: now,
        attachments: uploadedFiles.map((file) => ({ ...file, status: "attached" as const })),
        agentId: activeAgent.id,
        expertId: activeAgent.expertId ?? null,
        agentName: activeAgent.name,
        expertName: activeAgent.expertId ? activeAgent.name : null,
        model: selectedModelLabel,
        provider: "admin_ingest"
      }
    ]);
    scheduleLatestUserTurnTopScroll(userMessageId, "smooth");

    try {
      const modelOption = getIngestModelOptionByLabel(selectedModelLabel);
      const gptSelection = getGptModelSelectionByDisplayName(modelOption.provider === "openai" ? selectedModelLabel : "GPT-5.5 超高");
      const preferredModel = modelOption.provider === "openai" ? gptSelection.apiModel : modelOption.defaultModel;
      const abortController = new AbortController();
      const timeout = window.setTimeout(() => abortController.abort(), GPT_CLIENT_TIMEOUT_MS);
      const response = await fetch("/api/admin/kb/ingest/gpt", {
        method: "POST",
        credentials: "include",
        signal: abortController.signal,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          input: value,
          source: "admin_ingest",
          sourceApp: "admin_ingest",
          agentId: activeAgent.id,
          expertId: activeAgent.expertId ?? null,
          agentName: activeAgent.name,
          expertName: activeAgent.expertId ? activeAgent.name : null,
          category: activeAgent.role,
          platform: "web",
          syncTarget: ["web", "exe", "apk"],
          modelProvider: modelOption.provider,
          modelMode: "highest",
          preferredModel,
          gptTier: modelOption.provider === "openai" ? gptSelection.tier : undefined,
          gptTierLabel: modelOption.provider === "openai" ? gptSelection.tierLabel : undefined,
          gptVersion: modelOption.provider === "openai" ? gptSelection.version : undefined,
          selectedModelLabel: modelOption.label,
          modelDisplayName: modelOption.displayName,
          attachments: uploadedFiles.map((file) => ({ ...file, status: "attached" })),
          autonomous: {
            enabled: autonomousEnabled,
            taskId: autonomousTask?.taskId,
            mode: autonomousEnabled ? "execute_safe" : "plan_only"
          }
        })
      }).finally(() => window.clearTimeout(timeout));
      const payload = await response.json().catch(() => null) as ApiEnvelope<AdminGptIngestResponse> | null;
      const ingestResult = normalizeIngestResult(response, payload);

      if (ingestResult.type !== "success" || !ingestResult.raw) {
        const normalizedError = normalizeIngestErrorPayload(response, payload);
        console.error("[admin-ingest:gpt:error]", {
          url: "/api/admin/kb/ingest/gpt",
          status: normalizedError.status,
          errorCode: normalizedError.errorCode,
          message: normalizedError.message,
          provider: normalizedError.provider,
          actualModel: normalizedError.actualModel,
          requestId: normalizedError.requestId
        });
        throw new Error(ingestResult.message || normalizedError.message || "请求失败，请稍后重试。");
      }

      const normalizedSuccess = normalizeIngestSuccessPayload(payload);
      const data = ingestResult.raw as unknown as AdminGptIngestResponse;
      const replyContent = ingestResult.replyText || normalizedSuccess?.replyText || readGptResponseContent(data);
      const visibleReply = replyContent
        || readString(data.structured?.summary)
        || readString(data.structured?.answer)
        || readString(data.knowledgeDraft?.summary)
        || readString(data.knowledgeDraft?.standardAnswer)
        || "AI已完成知识整理，训练记录已更新。";

      console.info("[admin-ingest:gpt:success]", {
        provider: normalizedSuccess?.provider ?? data.provider,
        actualModel: normalizedSuccess?.actualModel ?? data.actualModel ?? data.model,
        contentLength: visibleReply.length,
        requestId: data.responseId
      });

      setErrorMessage("");
      persistAutonomousTask(data.autonomousResult ?? data.gptOS?.autonomousResult);
      persistTaskChain(data.gptOS?.taskChain);
      const knowledgeDraft = data.knowledgeDraft;
      const structured = data.structured ?? {};
      const draftJobId = data.jobId || data.trainingRecord?.jobId || `gpt-${Date.now()}`;
      const nextDraft = mapDraft({
        jobId: draftJobId,
        title: knowledgeDraft?.title || structured.title || "GPT 结构化知识",
        category: knowledgeDraft?.category || structured.category || activeAgent.role,
        tags: knowledgeDraft?.tags ?? structured.tags ?? [],
        summary: knowledgeDraft?.summary || structured.summary || structured.answer || value,
        qa_pairs: [{
          q: knowledgeDraft?.standardQuestion || structured.question || `关于“${structured.title || value}”，应该如何处理？`,
          a: knowledgeDraft?.standardAnswer || structured.answer || structured.summary || value
        }],
        confidence: knowledgeDraft?.trainingScore ?? structured.confidence ?? 78,
        should_save: structured.saveSuggestion ?? data.saveRecommendation !== "暂缓入库",
        providerUsed: data.provider,
        model: data.modelDisplayName || data.model,
        scenarios: knowledgeDraft?.scenarios,
        sourceMaterials: knowledgeDraft?.sourceMaterials,
        missingFields: knowledgeDraft?.missingFields,
        userClientCallPlan: data.userClientCallPlan ?? knowledgeDraft?.userClientCallPlan,
        suggestedQuestions: data.suggestedQuestions,
        saveRecommendation: data.saveRecommendation ?? knowledgeDraft?.saveRecommendation,
        sourceModel: data.model,
        actualModel: data.actualModel || data.model,
        responseId: data.responseId,
        usage: data.usage,
        gptProof: data.gptProof,
        gptOS: data.gptOS,
        memory: data.memory ?? knowledgeDraft?.memory,
        memoryPlan: data.memoryPlan ?? knowledgeDraft?.memoryPlan,
        knowledgeIntelligence: data.knowledgeIntelligence ?? knowledgeDraft?.knowledgeIntelligence,
        ragOptimization: data.ragOptimization ?? knowledgeDraft?.ragOptimization,
        generatedBy: data.provider,
        fallbackUsed: false,
        saveStatus: "pending"
      });
      const enrichedDraft = enrichDraftWithKnowledgeLoop({
        draft: nextDraft,
        userInput: value,
        replyMarkdown: data.replyMarkdown || visibleReply,
        uploadedFiles,
        response: data
      });

      setDraft(enrichedDraft);
      const nextRecord: IngestTrainingRecord = data.trainingRecord
        ? mapRecord(data.trainingRecord)
        : {
          id: `record-gpt-${Date.now()}`,
          jobId: enrichedDraft.jobId,
          input: value,
          resultTitle: enrichedDraft.title,
          saveStatus: "待确认",
          category: enrichedDraft.category,
          time: getTimeLabel(),
          hits: 0,
          sourceType: "admin_ingest",
          aiOutput: enrichedDraft
        };
      setRecords((current) => {
        const incomingRecords = data.records?.length ? data.records.map(mapRecord) : [nextRecord];
        const seen = new Set<string>();

        return [...incomingRecords, ...current].filter((record) => {
          const key = record.jobId ?? record.id;

          if (seen.has(key)) {
            return false;
          }

          seen.add(key);
          return true;
        });
      });
      setDrawerView("records");
      setMessages((current) => [
        ...current,
        {
          id: `assistant-result-${Date.now()}`,
          role: "assistant",
          content: data.replyMarkdown || visibleReply || `GPT 已完成解析：AI解析 → 结构化为「${enrichedDraft.title}」→ 分类到「${enrichedDraft.category}」→ 等待保存确认。`,
          time: getTimeLabel(),
          agentId: activeAgent.id,
          expertId: activeAgent.expertId ?? null,
          agentName: activeAgent.name,
          expertName: activeAgent.expertId ? activeAgent.name : null,
          model: data.modelDisplayName || data.model,
          provider: data.provider,
          saveSuggestion: structured.saveSuggestion,
          gptProof: data.gptProof,
          gptOS: data.gptOS,
          isRestored: false,
          isHistorical: false,
          isStreaming: true,
          isGenerating: true,
          typing: true,
          status: "streaming"
        }
      ]);
    } catch (error) {
      setErrorMessage(sanitizeGptOSUserMessage(isAbortError(error)
        ? "AI响应较慢，请稍后再试。"
        : error instanceof Error
          ? error.message
        : "AI服务暂时不稳定，请稍后再试。"));
    } finally {
      setLatestTurnSpacerMode((current) => current === "active" ? "settled" : current);
      suppressBottomAutoScrollRef.current = false;
      setInternalIsParsing(false);
    }
  }

  async function handleSaveDraft() {
    if (onSave) {
      const result = await onSave();

      return result;
    }

    const hasSaveableContent = Boolean(
      draft.id
      || draft.title
      || draft.summary
      || draft.standardAnswer
      || draft.replyMarkdown
      || draft.knowledgeLoop?.candidates?.length
    );

    if (!hasSaveableContent) {
      setNoticeMessage("没有可保存的知识内容。");
      return null;
    }

    setInternalIsSaving(true);
    setErrorMessage("");
    setNoticeMessage("");

    try {
      const response = await fetch("/api/admin/kb/save", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          jobId: draft.jobId ?? null,
          draftId: draft.id,
          messageId: draft.responseId ?? draft.id,
          title: draft.title,
          content: draft.standardAnswer || draft.summary || draft.replyMarkdown || null,
          replyMarkdown: draft.replyMarkdown ?? null,
          knowledgeDraft: draft,
          knowledgeLoop: draft.knowledgeLoop ?? null,
          memory: draft.memory ?? null,
          sourceFiles: draft.sourceMaterials ?? [],
          tags: draft.tags,
          scenario: draft.scenarios?.[0] ?? null,
          structured: toStructuredPayload(draft),
          knowledge: toStructuredPayload(draft),
          agentId: activeAgent.id,
          source: "admin_ingest",
          platform: "web",
          syncTarget: ["web", "exe", "apk"]
        })
      });
      const data = await readApiData<AdminSaveResponse>(response);
      const responseRecords = data.records?.length ? data.records : data.record ? [data.record] : [];
      const memoryAdapter = new KnowledgeMemoryAdapter();
      const memoryPlan = draft.memoryPlan ?? memoryAdapter.buildMemoryPlan(draft);
      const retrievalCandidate = memoryPlan.candidates[0] ?? draft.knowledgeLoop?.candidates[0] ?? null;
      const retrievalCheck = await memoryAdapter.runRetrievalCheck(retrievalCandidate, {
        expectedTitle: data.knowledgeItem?.title ?? draft.title
      });
      const memory = memoryAdapter.buildStoredKnowledgeReport({
        draft,
        savedKnowledge: data.knowledgeItem ?? null,
        retrievalCheck
      });

      setDraft((current) => ({
        ...current,
        saveStatus: "已保存",
        memoryPlan: current.memoryPlan ?? memoryPlan,
        memory,
        knowledgeIntelligence: current.knowledgeIntelligence ?? memoryPlan.intelligence,
        ragOptimization: current.ragOptimization ?? memoryPlan.ragOptimization
      }));
      const incomingRecords = responseRecords.length ? responseRecords.map(mapRecord) : [];
      const mergedRecords = incomingRecords.length ? mergeTrainingRecordLists(incomingRecords, records) : records;
      const nextRecords = currentRecordsWithSavedDraft(mergedRecords, draft);
      const hasMatchedRecord = nextRecords.some((record) => isTrainingRecordLinkedToDraft(record, draft));
      setRecords(nextRecords);
      setNoticeMessage(data.message ?? (hasMatchedRecord
        ? "已保存知识入库，训练记录已更新。"
        : "已保存到知识库，但未找到对应训练记录，请刷新训练记录。"));
    } catch (error) {
      setDraft((current) => ({
        ...current,
        saveStatus: "保存失败"
      }));
      setRecords((current) => current.map((record) => {
        if (!isTrainingRecordLinkedToDraft(record, draft)) {
          return record;
        }

        return {
          ...record,
          saveStatus: "失败",
          aiOutput: record.aiOutput
            ? { ...record.aiOutput, saveStatus: "保存失败" }
            : { ...draft, saveStatus: "保存失败" }
        };
      }));
      setErrorMessage(error instanceof Error ? error.message : "保存知识入库失败，请稍后重试。");
      return null;
    } finally {
      setInternalIsSaving(false);
    }
  }

  async function handleRegenerate(messageContent: string) {
    const nextInput = (regenerateInput || draft.standardQuestion || draft.title || messageContent).trim();

    if (!nextInput) {
      setNoticeMessage("没有可重新生成的投喂内容。");
      return;
    }

    if (!onSend) {
      setInput(nextInput);
      setNoticeMessage("已将当前结构化结果放回输入框，可再次发送重新生成。");
      return;
    }

    setNoticeMessage("正在重新请求 GPT 生成结构化结果...");
    const result = await onSend(nextInput);

    if (result && !result.preview) {
      showToast("GPT 已重新生成", result.draft.title, "success");
    }
  }

  function handleContinueOptimize() {
    const missing = draft.missingFields?.length ? `，重点补齐：${draft.missingFields.join("、")}` : "";
    const nextInput = `请基于上一轮投喂结果继续优化，让内容更适合「${activeAgent.role}」使用${missing}，并重新生成更清晰的标准问答、标签和入库建议。`;

    setInput(nextInput);
    setNoticeMessage("已把继续优化指令放入输入框，可直接发送给 GPT。");
  }

  function openDrawer(view: "draft" | "records", options: { toggle?: boolean } = {}) {
    const nextView = view === "draft" ? "records" : view;

    if (options.toggle && drawerOpen && drawerView === nextView) {
      setDrawerOpen(false);
      return;
    }

    setDrawerView(nextView);
    setDrawerOpen(true);
  }

  function handleAgentCardSelect(agentId: string) {
    setActiveAgentId(agentId);
  }

  function handleSearchConfirm() {
    setNoticeMessage(searchKeyword.trim()
      ? `已搜索：${searchKeyword.trim()}`
      : "搜索已清空，列表已恢复全部内容。");
  }

  function handleToolAction(label: string) {
    if (onToolAction) {
      onToolAction(label);
      return;
    }

    setNoticeMessage(`${label}入口已收纳到底部工具区，后续可接入文件选择或解析弹窗。`);
  }

  function showToast(title: string, description?: string, type: "success" | "warning" | "info" = "success") {
    onToast?.({ title, description, type });
  }

  async function writeClipboardText(content: string) {
    const text = content.trim();

    if (!text) {
      return false;
    }

    if (navigator.clipboard?.writeText && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Fall through to the textarea fallback for HTTP deployments.
      }
    }

    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.setAttribute("readonly", "");
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "0";
    textArea.style.opacity = "0";

    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    textArea.setSelectionRange(0, text.length);

    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      document.body.removeChild(textArea);
    }
  }

  async function handleCopyMessage(content: string) {
    const copied = await writeClipboardText(content);

    if (copied) {
      showToast("已复制");
    } else {
      showToast("复制失败", "请手动选中文本后按 Ctrl+C 复制。", "warning");
    }
  }

  function handleEditMessage(message: IngestChatMessage) {
    setInput(message.content);
    showToast("已进入编辑", message.attachments?.length ? "附件已在消息中，编辑仅修改文本。" : undefined, "info");
  }

  function handleUploadClick() {
    if (!canIngest) {
      setNoticeMessage("请先到专家广场添加专家 Agent。");
      setErrorMessage("");
      onRailChange?.("experts");
      return;
    }

    setFileAccept(".pdf,.doc,.docx,.ppt,.pptx,image/*,.txt,.md");
    fileInputRef.current?.click();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);

    if (files.length > 0) {
      onUpload?.(files);
      setNoticeMessage(`已选择 ${files.length} 个文件，附件卡片已进入输入框。`);
      setErrorMessage("");
    }

    event.target.value = "";
  }

  function openTypedUpload(label: string) {
    if (!canIngest) {
      setNoticeMessage("请先到专家广场添加专家 Agent。");
      setErrorMessage("");
      onRailChange?.("experts");
      return;
    }

    setFileAccept(uploadAcceptByTool[label] ?? ".pdf,.doc,.docx,.ppt,.pptx,image/*,.txt,.md");
    onToolAction?.(label);
    setTimeout(() => fileInputRef.current?.click(), 0);
  }

  async function handleMoreTool(label: string) {
    setIsMoreOpen(false);

    if (label === "连接状态") {
      setIsConnectionOpen(true);
      void onCheckConnection?.();
      setNoticeMessage(`连接状态：企业空间 ${connectionStatus.enterpriseSpace}，知识库 ${connectionStatus.knowledgeBase}，卡密 ${connectionStatus.licenseStatus}。`);
      setErrorMessage("");
      return;
    }

    if (label in uploadAcceptByTool) {
      openTypedUpload(label);
      return;
    }

    if (label === "网址投喂") {
      onToolAction?.(label);
      setErrorMessage("");
      return;
    }

    if (label === "分类标签") {
      onToolAction?.(label);
      setNoticeMessage("分类标签入口已响应，可结合输入内容生成分类建议。");
      setErrorMessage("");
      return;
    }

    onToolAction?.(label);
    setNoticeMessage(`${label}入口已打开，当前阶段保留为投喂工具快捷入口。`);
    setErrorMessage("");
  }

  return (
    <main className="flex h-screen overflow-hidden bg-[#f7f7f6] text-[#191919]">
      <aside className="flex h-screen w-[68px] shrink-0 flex-col items-center border-r border-[#e9e9e6] bg-[#eeeeec] py-5">
        <button
          type="button"
          title="管理员头像 / 设置"
          onClick={() => onRailChange?.("settings")}
          className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-white bg-gradient-to-br from-[#d9f8e9] to-[#fff7e8] text-sm font-semibold text-[#128246] shadow-sm transition hover:scale-[1.03] hover:shadow-md"
        >
          {adminAvatar ? (
            <span aria-label="管理员头像" className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${adminAvatar})` }} />
          ) : (
            "AI"
          )}
        </button>

        <nav className="mt-7 flex flex-1 flex-col items-center gap-2" aria-label="Admin ingest navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isDisabled = item.enabled === false;
            const isActive = !isDisabled && activeRailKey === item.key;

            return (
              <button
                key={item.key}
                title={isDisabled ? item.disabledHint ?? "该功能将由超级管理员后台开启。" : item.title}
                type="button"
                aria-disabled={isDisabled}
                className={[
                  "group relative flex w-[54px] flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-medium transition",
                  isDisabled ? "cursor-not-allowed text-[#aaa]" : "hover:bg-white/80",
                  isActive ? "text-[#128246]" : isDisabled ? "text-[#aaa]" : "text-[#252525]"
                ].join(" ")}
                onClick={() => {
                  if (isDisabled) {
                    setNoticeMessage(item.disabledHint ?? "该功能将由超级管理员后台开启。");
                    setErrorMessage("");
                    return;
                  }

                  onRailChange?.(item.key);
                  if (item.key === "tasks") {
                    openDrawer("records", { toggle: true });
                  }
                }}
              >
                <span className={["relative flex h-8 w-8 items-center justify-center rounded-xl transition", isActive ? "bg-[#191919] text-white shadow-sm" : isDisabled ? "text-[#aaa]" : "text-[#222] group-hover:bg-white"].join(" ")}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {item.badge && !isDisabled ? <span className="absolute -right-1 -top-1 h-4 min-w-4 rounded-full bg-[#20b25b] px-1 text-[10px] leading-4 text-white">{item.badge}</span> : null}
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex flex-col items-center gap-2 text-[#333]">
          <button type="button" title="更新提示" onClick={() => onRailChange?.("notifications")} className={["flex h-9 w-9 items-center justify-center rounded-xl hover:bg-white", activeRailKey === "notifications" ? "bg-white text-[#128246]" : ""].join(" ")}>
            <Bell className="h-5 w-5" aria-hidden="true" />
          </button>
          <button type="button" title="我的设置" onClick={() => onRailChange?.("settings")} className={["flex h-9 w-9 items-center justify-center rounded-xl hover:bg-white", activeRailKey === "settings" ? "bg-white text-[#128246]" : ""].join(" ")}>
            <Settings className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </aside>

      <IngestResizableSidebar className="border-[#ededeb] bg-[#fbfbfa]" ariaLabel="管理员投喂 Agent 列表">
        <div className="p-4 pb-3">
          <div className="flex h-9 items-center gap-2 rounded-full bg-[#f0f0ef] px-3 text-sm text-[#8a8a86]">
            <Search className="h-4 w-4" aria-hidden="true" />
            <input
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  handleSearchConfirm();
                }
              }}
              placeholder="搜索"
              className="min-w-0 flex-1 bg-transparent text-sm text-[#333] outline-none placeholder:text-[#8a8a86]"
            />
          </div>
          <button type="button" onClick={onOpenCreateAgent} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-full border border-[#e4e4e1] bg-white text-sm font-medium text-[#202020] shadow-sm transition hover:bg-[#f7f7f5]">
            <Plus className="h-4 w-4" aria-hidden="true" />
            添加专家 Agent
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          <div className="space-y-1.5">
            {agents.length === 0 ? (
              <div className="mx-2 rounded-2xl border border-dashed border-[#d9d9d5] bg-white px-3 py-5 text-center">
                <p className="text-xs font-semibold text-[#202020]">暂无 Agent，请到专家广场添加专家。</p>
                <button
                  type="button"
                  onClick={() => onRailChange?.("experts")}
                  className="mt-3 h-8 rounded-full bg-[#202020] px-3 text-xs font-semibold text-white hover:bg-black"
                >
                  打开专家广场
                </button>
              </div>
            ) : !hasSearchResults ? (
              <div className="mx-2 rounded-2xl bg-[#f6f6f5] px-3 py-4 text-center text-xs leading-5 text-[#8a8a86]">
                没有找到相关 Agent 或知识库
              </div>
            ) : null}
            {filteredAgents.map((agent) => {
              const isActive = activeAgent.id === agent.id;
              const isExpanded = expandedAgentIds.includes(agent.id);
              const isPinned = pinnedAgentIds.includes(agent.id);
              const conversations = agentConversations.filter((conversation) => conversation.agentId === agent.id);
              const agentProfile = resolveAdminIngestDisplayProfile({
                currentAgent: agent,
                appName,
                adminAvatar
              });

              return (
                <div key={agent.id} className="mx-2">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => handleAgentCardSelect(agent.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleAgentCardSelect(agent.id);
                      }
                    }}
                    className={[
                      "group relative w-full cursor-pointer rounded-2xl border px-2.5 py-2 text-left transition",
                      isActive
                        ? "border-orange-200 bg-gradient-to-r from-orange-50 via-amber-50 to-white shadow-sm"
                        : "border-transparent bg-transparent hover:bg-[#f5f3ef]"
                    ].join(" ")}
                  >
                    {isActive ? <span aria-hidden="true" className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-gradient-to-b from-orange-400 to-amber-400" /> : null}
                    <div className="flex min-h-[56px] items-center gap-3">
                      <IngestAgentAvatar profile={agentProfile} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className={["block min-w-0 flex-1 truncate text-sm font-semibold", isActive ? "text-[#2f1f0f]" : "text-[#202020]"].join(" ")}>{agent.name}</span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            {isPinned ? <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#9a6500]">置顶</span> : null}
                            <span className="flex items-center gap-1 transition">
                              <IngestAgentMoreMenu
                                agent={agent}
                                isPinned={isPinned}
                                onCreateConversation={(agentId) => onAgentConversationCreate?.(agentId)}
                                onTogglePinned={(agentId) => onAgentTogglePinned?.(agentId)}
                                onViewDetails={(agentId) => {
                                  if (onAgentViewDetails) {
                                    onAgentViewDetails(agentId);
                                    return;
                                  }

                                  setActiveAgentId(agentId);
                                }}
                                onDelete={(agentId) => onAgentDelete?.(agentId)}
                              />
                              <button
                                type="button"
                                aria-label={isExpanded ? "收起 Agent 对话记录" : "展开 Agent 对话记录"}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onAgentToggleExpanded?.(agent.id);
                                }}
                                className="flex h-7 w-7 items-center justify-center rounded-full text-[#8a8a86] transition hover:bg-white hover:text-[#202020]"
                              >
                                {isExpanded ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
                              </button>
                            </span>
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-[#9a9a96]">{agent.description || agent.role}</span>
                      </span>
                    </div>
                  </div>
                  {isExpanded ? (
                    <IngestAgentConversationList
                      agentId={agent.id}
                      conversations={conversations}
                      activeConversationId={activeConversationId}
                      expandedAll={expandedConversationAgentIds.includes(agent.id)}
                      onSelectConversation={(agentId, conversationId) => onAgentConversationSelect?.(agentId, conversationId)}
                      onToggleExpandedAll={(agentId) => onAgentConversationToggleExpanded?.(agentId)}
                      onRenameConversation={(agentId, conversationId, title) => onAgentConversationRename?.(agentId, conversationId, title)}
                      onDeleteConversation={(agentId, conversationId) => onAgentConversationDelete?.(agentId, conversationId)}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </IngestResizableSidebar>

      <section className="relative flex min-w-0 flex-1 flex-col bg-white">
        {!isExpertMarketplace ? (
          <div className="flex h-16 shrink-0 items-center justify-end gap-2 border-b border-[#f0f0ee] px-5">
            <button type="button" onClick={() => openDrawer("records", { toggle: true })} className="hidden rounded-full bg-[#f3f3f1] px-3 py-2 text-xs font-semibold text-[#555] transition hover:bg-[#ededeb] sm:inline-flex">
              训练记录
            </button>
          </div>
        ) : null}

        <div
          ref={scrollContainerRef}
          onScroll={handleConversationScroll}
          className={["min-h-0 flex-1 overflow-y-auto", isExpertMarketplace ? "bg-[#f7f7f6] px-5 py-5" : "px-5 pb-5 pt-4"].join(" ")}
        >
          <div ref={scrollContentRef} className={isExpertMarketplace
            ? "mx-auto flex min-h-full w-full max-w-[1440px] flex-col"
            : [
              `${CHAT_CONTENT_WIDTH_CLASS} flex min-h-full flex-col`,
              hasMessages || isParsing ? "justify-start" : "justify-center"
            ].join(" ")}>
            {isExpertMarketplace ? (
              <IngestExpertMarketplace
                addedExpertIds={addedExpertIds}
                onAddExpert={(expert) => onAddExpertToAgent?.(expert)}
              />
            ) : (
              <>
            {activeRailKey !== "chat" ? (
              <RailStatusPanel
                activeRailKey={activeRailKey}
                records={records}
                uploadedFiles={uploadedFiles}
                connectionStatus={connectionStatus}
                draft={draft}
                noticeMessage={noticeMessage}
              />
            ) : null}
            {!hasMessages ? (
              <div className={`${CHAT_CONTENT_WIDTH_CLASS} flex flex-col items-center text-center`}>
                <IngestWelcomeHero
                  profile={activeDisplayProfile}
                  canIngest={canIngest}
                  onOpenExperts={() => onRailChange?.("experts")}
                />
                <div className="mt-24 grid w-full max-w-2xl gap-3 sm:grid-cols-2">
                  {quickPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      disabled={!canIngest}
                      onClick={() => {
                        if (canIngest) {
                          setInput(prompt);
                        }
                      }}
                      className="rounded-full bg-[#f6f6f5] px-4 py-3 text-left text-sm text-[#303030] transition hover:bg-[#ededeb] disabled:cursor-not-allowed disabled:text-[#b6b6b2] disabled:hover:bg-[#f6f6f5]"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className={`${CHAT_CONTENT_WIDTH_CLASS} space-y-5 pt-8`}>
                {messages.map((message, messageIndex) => {
                  const isStructuredResult = message.role === "assistant" && message.id.startsWith("assistant-result");
                  const messageAgent = agentById.get(message.agentId ?? "") ?? activeAgent;
                  const messageFeedbackScope = buildFeedbackAgentScope(messageAgent);
                  const messageQuestion = findPreviousUserQuestion(messages, messageIndex);
                  const messageChunkIds: string[] = [];
                  const messageEvidenceIds = isStructuredResult ? buildReplySourceMaterials(draft, uploadedFiles) : [];
                  const trackAssistantBehavior = (
                    eventType: Parameters<typeof trackIngestBehaviorEvent>[0]["eventType"],
                    metadata?: Record<string, unknown>
                  ) => {
                    trackIngestBehaviorEvent({
                      eventType,
                      messageId: message.id,
                      conversationId: draft.jobId ?? draft.id ?? null,
                      agentId: messageFeedbackScope.agentId,
                      knowledgeBaseId: messageFeedbackScope.knowledgeBaseId,
                      namespace: messageFeedbackScope.namespace,
                      chunkIds: messageChunkIds,
                      evidenceIds: messageEvidenceIds,
                      source: "admin_ingest",
                      metadata
                    });
                  };
                  const messageProfile = resolveAdminIngestDisplayProfile({
                    currentAgent: messageAgent,
                    appName,
                    adminAvatar
                  });
                  const messageAgentLabel = message.agentName ?? agentLabelById.get(message.agentId ?? activeAgent.id) ?? messageProfile.agentName;
                  const highlightClass = highlightedPromptMessageId === message.id
                    ? "scroll-mt-24 rounded-[28px] ring-2 ring-[#10a37f]/35 ring-offset-4 ring-offset-white"
                    : "scroll-mt-24";
                  const isAssistantResult = message.role === "assistant" && message.id.startsWith("assistant-result");
                  const feedbackActions = message.role === "assistant" ? (
                    <IngestAnswerFeedbackActions
                      messageId={message.id}
                      agentId={messageFeedbackScope.agentId}
                      knowledgeBaseId={messageFeedbackScope.knowledgeBaseId}
                      namespace={messageFeedbackScope.namespace}
                      chunkIds={messageChunkIds}
                      evidenceIds={messageEvidenceIds}
                      question={messageQuestion}
                      answer={message.content}
                      inline={isAssistantResult}
                    />
                  ) : null;

                  if (message.role === "user" && message.attachments?.length) {
                    return (
                      <div
                        key={message.id}
                        ref={(node) => registerMessageNode(message.id, node)}
                        className={`flex w-full justify-end transition ${highlightClass}`}
                      >
                        <IngestChatGPTFileMessage
                          message={message}
                          agentLabel={messageAgentLabel}
                          modelLabel={message.model ?? selectedModelLabel}
                          onCopy={() => void handleCopyMessage(message.content)}
                          onEdit={() => handleEditMessage(message)}
                        />
                      </div>
                    );
                  }

                  if (message.role === "user") {
                    return (
                      <div
                        key={message.id}
                        ref={(node) => registerMessageNode(message.id, node)}
                        className={["flex w-full justify-end transition", highlightClass].join(" ")}
                      >
                        <div className="flex max-w-[82%] flex-col items-end gap-2 text-sm leading-6">
                          <div className="rounded-[24px] bg-[#202020] px-4 py-3 text-white shadow-sm">
                            <p className="whitespace-pre-wrap">{message.content}</p>
                          </div>

                          <IngestMessageQuickActions
                            onCopy={() => void handleCopyMessage(message.content)}
                            onEdit={() => handleEditMessage(message)}
                            tone="light"
                          />

                          <p className="pr-1 text-[11px] text-[#999]">{message.time}</p>
                        </div>
                      </div>
                    );
                  }

                  return (
                  <div
                    key={message.id}
                    ref={(node) => registerMessageNode(message.id, node)}
                    className={[
                      "flex w-full transition",
                      "justify-start",
                      highlightClass
                    ].join(" ")}
                  >
                    <div className={[
                      "text-sm leading-6",
                      "w-full max-w-full",
                      isStructuredResult
                        ? "px-1 py-2 text-[#303030]"
                        : "px-1 py-3 text-[#303030]"
                    ].join(" ")}>
                      <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold text-[#666]">
                        <IngestAgentAvatar profile={messageProfile} size="xs" />
                        <span className="truncate">{message.expertName ?? messageProfile.expertName}</span>
                      </div>
                      <IngestBehaviorTracker
                        messageId={message.id}
                        conversationId={draft.jobId ?? draft.id ?? null}
                        agentId={messageFeedbackScope.agentId}
                        knowledgeBaseId={messageFeedbackScope.knowledgeBaseId}
                        namespace={messageFeedbackScope.namespace}
                        chunkIds={messageChunkIds}
                        evidenceIds={messageEvidenceIds}
                        metadata={{ role: message.role, provider: message.provider ?? null }}
                      />
                      <IngestGPTMessageRenderer content={message.content} message={message} />
                      {SHOW_INTERNAL_OS_UI ? (
                        <IngestGPTOSPanel gptOS={message.gptOS} />
                      ) : null}
                      {SHOW_INTERNAL_OS_UI && message.gptOS?.autonomousResult ? (
                        <IngestAutonomousTaskPanel
                          task={message.gptOS.autonomousResult}
                          enabled={autonomousEnabled}
                          onToggleEnabled={setAutonomousEnabled}
                          onPause={() => updateAutonomousTaskStatus("paused", "自主任务已暂停。")}
                          onResume={() => updateAutonomousTaskStatus("running", "自主任务已继续。")}
                          onCancel={() => updateAutonomousTaskStatus("cancelled", "自主任务已取消，不会继续执行后续步骤。")}
                          onApproveStep={handleApproveAutonomousStep}
                          compact
                        />
                      ) : null}
                      {SHOW_INTERNAL_OS_UI && message.gptOS?.taskChain ? (
                        <IngestGPTTaskChainPanel
                          chain={taskChain ?? message.gptOS.taskChain}
                          onPause={pauseCurrentTaskChain}
                          onResume={resumeCurrentTaskChain}
                          onCancel={cancelCurrentTaskChain}
                          onApproveStep={handleApproveTaskChainStep}
                          compact
                        />
                      ) : null}
                      {message.attachments?.length ? (
                        <div className="mt-3">
                          <IngestAttachmentPreview files={message.attachments} compact />
                        </div>
                      ) : null}
                      {message.provider === "local-fallback" ? (
                        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                          <span className="rounded-full bg-[#fff3d8] px-2 py-1 font-semibold text-[#9a6500]">离线草稿</span>
                        </div>
                      ) : null}
                      {isAssistantResult ? (
                        <IngestKnowledgeDraftActions
                          isSaving={isSaving}
                          isSaved={draft.saveStatus === "已保存"}
                          isError={draft.saveStatus === "保存失败"}
                          isParsing={isParsing}
                          sourceMaterials={buildReplySourceMaterials(draft, uploadedFiles)}
                          hasDraft={Boolean(draft.jobId || draft.id || draft.title || draft.summary)}
                          jobId={draft.jobId ?? null}
                          draftId={draft.id ?? null}
                          onCopy={() => {
                            trackAssistantBehavior("answer_copy", { action: "copy_draft_answer" });
                            void handleCopyMessage(message.content);
                          }}
                          onOpenDraft={() => openDrawer("draft")}
                          onSave={async () => {
                            const result = await handleSaveDraft();

                            if (result !== null) {
                              trackAssistantBehavior("save_knowledge", { action: "save_knowledge" });
                            }

                            return result;
                          }}
                          onRegenerate={() => {
                            trackAssistantBehavior("regenerate_answer", { action: "regenerate_answer" });
                            void handleRegenerate(message.content);
                          }}
                          onContinueOptimize={handleContinueOptimize}
                          onSourceOpen={() => trackAssistantBehavior("source_click", { action: "open_source_materials" })}
                          feedbackActions={feedbackActions}
                        />
                      ) : null}
                      {!isAssistantResult ? feedbackActions : null}
                      <p className="mt-2 text-[11px] text-[#999]">
                        {message.time}
                      </p>
                    </div>
                  </div>
                  );
                })}

                {isParsing ? (
                  <div className="flex w-full justify-start">
                    <div className="inline-flex w-full items-center gap-3 rounded-2xl border border-neutral-100 bg-[#f7f7f8] px-4 py-2.5 text-sm text-[#303030]">
                      <span className="shrink-0 text-xs font-semibold text-[#777]">已思考 {formatThinkingDuration(thinkingElapsedSeconds)} &gt;</span>
                      <span className="h-1 w-1 rounded-full bg-[#c7c7c1]" aria-hidden="true" />
                      <Loader2 className="h-4 w-4 animate-spin text-[#666]" aria-hidden="true" />
                      <span>AI 正在解析并生成知识结构...</span>
                    </div>
                  </div>
                ) : null}
                {latestTurnSpacerClass ? (
                  <div aria-hidden="true" className={latestTurnSpacerClass} />
                ) : null}
                <div ref={bottomAnchorRef} className="h-1" aria-hidden="true" />
              </div>
            )}
              </>
            )}
          </div>
        </div>

        {!isExpertMarketplace ? (
          <IngestPromptHistoryHoverRail
            items={promptHistoryItems}
            onSelect={handlePromptHistorySelect}
          />
        ) : null}

        {shouldShowScrollToBottom ? (
          <button
            type="button"
            title="回到底部"
            aria-label="回到底部"
            onClick={() => scrollToLatestMessage("smooth")}
            className="absolute bottom-24 left-1/2 z-30 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border border-neutral-200 bg-white/95 text-[#444] shadow-[0_8px_24px_rgba(15,23,42,0.12)] transition hover:bg-[#f7f7f8] hover:text-black"
          >
            <ChevronDown className="h-5 w-5" aria-hidden="true" />
          </button>
        ) : null}

        {!isExpertMarketplace ? (
        <div className="shrink-0 bg-white/80 px-5 pb-4 pt-2">
          <form onSubmit={handleSubmit} className={`${CHAT_CONTENT_WIDTH_CLASS} rounded-[28px] border border-neutral-200 bg-white/95 p-2 shadow-none`}>
            {uploadedFiles.length > 0 ? (
              <div className="mb-2 rounded-2xl bg-[#f8f8f7] p-2">
                <IngestAttachmentPreview files={uploadedFiles} onRemove={onRemoveUpload} />
              </div>
            ) : null}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept={fileAccept}
              multiple
              onChange={handleFileChange}
            />
            <div className="flex items-end gap-2">
              <div className="flex shrink-0 items-center gap-1 text-xs font-semibold text-[#555]">
                {SHOW_INTERNAL_OS_UI ? (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={autonomousEnabled}
                    onClick={() => setAutonomousEnabled(!autonomousEnabled)}
                    className={[
                      "inline-flex h-9 items-center gap-2 rounded-full px-3 text-xs font-semibold transition",
                      autonomousEnabled ? "bg-[#202020] text-white" : "bg-[#f6f6f5] text-[#555] hover:bg-[#ededeb]"
                    ].join(" ")}
                    title="开启后只自动执行低风险步骤，高风险动作必须人工确认"
                  >
                    <span className={["h-2 w-2 rounded-full", autonomousEnabled ? "bg-[#74f0a7]" : "bg-[#bbb]"].join(" ")} aria-hidden="true" />
                    自主执行
                  </button>
                ) : null}
                <div ref={moreMenuRef} className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setIsMoreOpen((current) => !current);
                      setIsConnectionOpen(false);
                      setIsOrganizeOpen(false);
                    }}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-transparent text-[#555] transition hover:bg-[#f3f3f1]"
                    aria-expanded={isMoreOpen}
                    aria-label="更多功能"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </button>
                  {isMoreOpen ? (
                    <div className="absolute bottom-11 left-0 z-30 w-56 rounded-2xl border border-[#e7e7e4] bg-white p-2 shadow-[0_18px_50px_rgba(15,23,42,0.14)]">
                      {moreToolActions.map((action) => {
                        const Icon = action.icon;

                        return (
                          <button
                            key={action.label}
                            type="button"
                            onClick={() => void handleMoreTool(action.label)}
                            className="flex h-9 w-full items-center gap-2 rounded-xl px-3 text-left text-xs font-semibold text-[#444] transition hover:bg-[#f5f5f3]"
                          >
                            <Icon className="h-3.5 w-3.5 text-[#777]" aria-hidden="true" />
                            {action.label}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  {isConnectionOpen ? (
                    <div className="absolute bottom-11 left-0 z-30 w-64 rounded-2xl border border-[#e7e7e4] bg-white p-3 text-xs shadow-[0_18px_50px_rgba(15,23,42,0.14)]">
                      <p className="font-semibold text-[#202020]">连接状态</p>
                      <div className="mt-2 space-y-1.5 text-[#666]">
                        <p>企业空间：{connectionStatus.enterpriseSpace}</p>
                        <p>知识库：{connectionStatus.knowledgeBase}</p>
                        <p>当前端：{getAdminIngestPlatformLabel(voiceState.platform)}</p>
                        <p>同步目标：Web / EXE / APK</p>
                        <p>同账号同步投喂记录、Agent、知识库和训练记录</p>
                        <p>卡密状态：{connectionStatus.licenseStatus}</p>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
              <textarea
                ref={inputTextareaRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                rows={1}
                disabled={!canIngest}
                placeholder={canIngest ? "询问、投喂、整理知识..." : "请先到专家广场添加专家 Agent"}
                className="max-h-[160px] min-h-11 min-w-0 flex-1 resize-none overflow-hidden border-0 bg-transparent px-1 py-2.5 text-[15px] leading-6 outline-none placeholder:text-[#aaa] disabled:cursor-not-allowed disabled:text-[#aaa]"
              />
              <div className="flex shrink-0 items-center justify-end gap-1.5">
                <IngestGPTModelPicker
                  selectedModel={selectedModelLabel}
                  disabled={isParsing}
                  compact
                  align="right"
                  unavailableProviders={unavailableModelProviders}
                  onModelChange={(selection) => onModelChange?.(selection.label)}
                  onOpen={() => {
                    setIsMoreOpen(false);
                    setIsConnectionOpen(false);
                    setIsOrganizeOpen(false);
                  }}
                />
                <div ref={organizeMenuRef} className="relative">
                  <button
                    type="button"
                    title="AI 修正 / 整理工具"
                    aria-label="AI 修正 / 整理工具"
                    onClick={() => {
                      setIsOrganizeOpen((current) => !current);
                      setIsMoreOpen(false);
                      setIsConnectionOpen(false);
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-[#555] hover:bg-[#f3f3f1]"
                    aria-expanded={isOrganizeOpen}
                  >
                    <Scissors className="h-4 w-4" aria-hidden="true" />
                  </button>
                  {isOrganizeOpen ? (
                    <div className="absolute bottom-11 right-0 z-30 w-56 rounded-2xl border border-[#e7e7e4] bg-white p-2 shadow-[0_18px_50px_rgba(15,23,42,0.14)]">
                      {organizeActions.map((action) => (
                        <button
                          key={action}
                          type="button"
                          onClick={() => {
                            setIsOrganizeOpen(false);
                            handleToolAction(action);
                          }}
                          className="flex h-9 w-full items-center rounded-xl px-3 text-left text-xs font-semibold text-[#444] transition hover:bg-[#f5f5f3]"
                        >
                          {action}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <button type="button" title="附件" onClick={handleUploadClick} className="flex h-9 w-9 items-center justify-center rounded-full text-[#555] hover:bg-[#f3f3f1]">
                  <Paperclip className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  title={voiceState.isRecording ? "停止语音输入" : "语音"}
                  aria-label={voiceState.isRecording ? "停止语音输入" : "语音"}
                  onClick={() => onVoiceToggle ? onVoiceToggle() : handleToolAction("语音备注")}
                  className={[
                    "flex h-9 w-9 items-center justify-center rounded-full transition",
                    voiceState.isRecording ? "bg-[#ffe5e9] text-[#b93b4a]" : voiceState.error ? "text-[#b93b4a] hover:bg-[#fff3f4]" : "text-[#555] hover:bg-[#f3f3f1]"
                  ].join(" ")}
                >
                  <Mic className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="submit"
                  disabled={!canIngest || isParsing || (!input.trim() && uploadedFiles.length === 0)}
                  className={[
                    "flex h-10 items-center justify-center gap-2 rounded-full bg-[#202020] text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-[#eeeeec] disabled:text-[#c6c6c2]",
                    isParsing ? "w-auto px-3 text-xs font-semibold" : "w-10"
                  ].join(" ")}
                >
                  {isParsing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      发送中
                    </>
                  ) : (
                    <SendHorizontal className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>
          </form>

        </div>
        ) : null}

        {drawerOpen ? (
          <div className="absolute inset-y-0 right-0 z-40 flex w-full justify-end bg-black/10" onClick={() => setDrawerOpen(false)}>
            <aside className="h-full w-full max-w-[390px] overflow-y-auto border-l border-[#ececea] bg-[#fbfbfa] p-4 shadow-[-18px_0_45px_rgba(15,23,42,0.08)]" onClick={(event) => event.stopPropagation()}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#202020]">训练记录</p>
                  <p className="mt-1 text-xs text-[#8b8b86]">投喂任务、入库状态与训练摘要</p>
                </div>
                <button type="button" aria-label="关闭详情抽屉" onClick={() => setDrawerOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#555] shadow-sm hover:bg-[#f3f3f1]">
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              {SHOW_STRUCTURED_RESULT_DRAWER && drawerView === "draft" ? (
                <KnowledgeDraftPanel
                  draft={draft}
                  isSaving={isSaving}
                  onSave={handleSaveDraft}
                  autonomousTask={autonomousTask ?? draft.gptOS?.autonomousResult}
                  taskChain={taskChain ?? draft.gptOS?.taskChain}
                  autonomousEnabled={autonomousEnabled}
                  onAutonomousEnabledChange={setAutonomousEnabled}
                  onPauseAutonomousTask={() => updateAutonomousTaskStatus("paused", "自主任务已暂停。")}
                  onResumeAutonomousTask={() => updateAutonomousTaskStatus("running", "自主任务已继续。")}
                  onCancelAutonomousTask={() => updateAutonomousTaskStatus("cancelled", "自主任务已取消，不会继续执行后续步骤。")}
                  onApproveAutonomousStep={handleApproveAutonomousStep}
                  onPauseTaskChain={pauseCurrentTaskChain}
                  onResumeTaskChain={resumeCurrentTaskChain}
                  onCancelTaskChain={cancelCurrentTaskChain}
                  onApproveTaskChainStep={handleApproveTaskChainStep}
                />
              ) : (
                <TrainingRecords records={records} />
              )}
            </aside>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function KnowledgeDraftPanel({
  draft,
  isSaving,
  onSave,
  autonomousTask,
  taskChain,
  autonomousEnabled,
  onAutonomousEnabledChange,
  onPauseAutonomousTask,
  onResumeAutonomousTask,
  onCancelAutonomousTask,
  onApproveAutonomousStep,
  onPauseTaskChain,
  onResumeTaskChain,
  onCancelTaskChain,
  onApproveTaskChainStep
}: {
  draft: IngestKnowledgeDraft;
  isSaving: boolean;
  onSave: () => void;
  autonomousTask?: AutonomousTaskStateSnapshot | AutonomousTaskResult | null;
  taskChain?: TaskChainStateSnapshot | TaskChainExecutionResult | null;
  autonomousEnabled: boolean;
  onAutonomousEnabledChange: (enabled: boolean) => void;
  onPauseAutonomousTask: () => void;
  onResumeAutonomousTask: () => void;
  onCancelAutonomousTask: () => void;
  onApproveAutonomousStep: (stepId: string) => void;
  onPauseTaskChain: () => void;
  onResumeTaskChain: () => void;
  onCancelTaskChain: () => void;
  onApproveTaskChainStep: (stepId: string) => void;
}) {
  return (
    <div className="rounded-[24px] border border-[#e7e7e4] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[#202020]">AI 结构化知识</h2>
          <p className="mt-1 text-xs text-[#8b8b86]">标题 / 分类 / 标签 / 标准问答 / 训练评分</p>
        </div>
        <span className="rounded-full bg-[#e9f8ef] px-2.5 py-1 text-xs font-semibold text-[#128246]">{draft.recommendation}</span>
      </div>

      <div className="mt-4 space-y-3 text-sm">
        <Field label="标题" value={draft.title} />
        <Field label="分类" value={draft.category} />
        <Field label="摘要" value={draft.summary ?? draft.standardAnswer} />
        <div>
          <p className="text-xs font-semibold text-[#8b8b86]">标签</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {draft.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-[#f0f0ee] px-2.5 py-1 text-xs font-medium text-[#555]">{tag}</span>
            ))}
          </div>
        </div>
        <Field label="标准问题" value={draft.standardQuestion} />
        <Field label="标准答案" value={draft.standardAnswer} />
        {draft.scenarios?.length ? <Field label="适用场景" value={draft.scenarios.join("、")} /> : null}
        {draft.sourceMaterials?.length ? <Field label="来源材料" value={draft.sourceMaterials.join("、")} /> : null}
        {draft.knowledgeLoop || draft.evolution || draft.storeDecision ? (
          <KnowledgeLoopSummary draft={draft} />
        ) : null}
        {draft.userClientCallPlan ? (
          <div className="rounded-2xl bg-[#f8f8f7] p-3">
            <p className="text-xs font-semibold text-[#8b8b86]">用户端调用策略</p>
            <div className="mt-2 space-y-2 text-sm leading-6 text-[#303030]">
              <p><span className="font-semibold text-[#202020]">检索策略：</span>{draft.userClientCallPlan.retrievalStrategy}</p>
              <p><span className="font-semibold text-[#202020]">回答风格：</span>{draft.userClientCallPlan.userAnswerStyle}</p>
              {draft.userClientCallPlan.recommendedAgents.length ? (
                <p><span className="font-semibold text-[#202020]">推荐 Agent：</span>{draft.userClientCallPlan.recommendedAgents.join("、")}</p>
              ) : null}
              {draft.userClientCallPlan.exampleUserQuestions.length ? (
                <Field label="用户端示例问题" value={draft.userClientCallPlan.exampleUserQuestions.join("\n")} />
              ) : null}
              {draft.userClientCallPlan.safetyRules.length ? (
                <Field label="安全边界" value={draft.userClientCallPlan.safetyRules.join("\n")} />
              ) : null}
              {draft.userClientCallPlan.answerTemplates.length ? (
                <Field label="回答模板" value={draft.userClientCallPlan.answerTemplates.join("\n\n")} />
              ) : null}
            </div>
          </div>
        ) : null}
        {draft.complianceNotes?.length ? <Field label="合规/风险提醒" value={draft.complianceNotes.join("\n")} /> : null}
        {draft.missingFields?.length ? <Field label="建议补充" value={draft.missingFields.join("、")} /> : null}
        {draft.suggestedQuestions?.length ? <Field label="建议继续追问" value={draft.suggestedQuestions.join("\n")} /> : null}
        {SHOW_INTERNAL_OS_UI ? (
          <>
            <IngestGPTOSPanel gptOS={draft.gptOS} />
            <IngestAutonomousTaskPanel
              task={autonomousTask}
              enabled={autonomousEnabled}
              onToggleEnabled={onAutonomousEnabledChange}
              onPause={onPauseAutonomousTask}
              onResume={onResumeAutonomousTask}
              onCancel={onCancelAutonomousTask}
              onApproveStep={onApproveAutonomousStep}
            />
            <IngestGPTTaskChainPanel
              chain={taskChain ?? null}
              onPause={onPauseTaskChain}
              onResume={onResumeTaskChain}
              onCancel={onCancelTaskChain}
              onApproveStep={onApproveTaskChainStep}
            />
          </>
        ) : null}
        {draft.gptProof ? (
          <div className="rounded-2xl bg-[#f8f8f7] p-3">
            <p className="mb-2 text-xs font-semibold text-[#8b8b86]">GPT 调用证据</p>
            <IngestGPTCallProofBadge proof={draft.gptProof} />
          </div>
        ) : null}
        <div className="rounded-2xl bg-[#f8f8f7] p-3">
          <div className="flex items-center justify-between text-xs font-semibold text-[#555]">
            <span>训练价值评分</span>
            <span>{draft.trainingScore}/100</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-[#e8e8e5]">
            <div className="h-2 rounded-full bg-[#20b25b]" style={{ width: `${draft.trainingScore}%` }} />
          </div>
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={draft.saveStatus === "已保存" || isSaving || !hasSaveableDraftContent(draft)}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-2xl bg-[#202020] text-sm font-semibold text-white transition hover:bg-black disabled:bg-[#d9d9d6] disabled:text-[#777]"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : draft.saveStatus === "已保存" ? <Check className="h-4 w-4" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
          {getKnowledgeSaveButtonLabel(draft, isSaving)}
        </button>
      </div>
    </div>
  );
}

function hasSaveableDraftContent(draft: IngestKnowledgeDraft) {
  return Boolean(
    draft.jobId
    || draft.id
    || draft.title
    || draft.summary
    || draft.standardAnswer
    || draft.replyMarkdown
    || draft.knowledgeLoop?.candidates?.length
  );
}

function getKnowledgeSaveButtonLabel(draft: IngestKnowledgeDraft, isSaving: boolean) {
  if (isSaving) {
    return "保存中...";
  }

  if (draft.saveStatus === "保存失败") {
    return "保存失败，重试";
  }

  if (draft.saveStatus === "已保存") {
    if (draft.memory?.indexedCount) {
      return `已入库，已生成 ${draft.memory.indexedCount} 个索引块`;
    }

    if (draft.memory?.storedCount) {
      return `已入库 ${draft.memory.storedCount} 条知识`;
    }

    return "已入库";
  }

  if (!hasSaveableDraftContent(draft)) {
    return "没有可保存内容";
  }

  if (draft.memory?.mode === "review_required" || draft.memoryPlan?.mode === "review_required") {
    return "保存待复核知识";
  }

  if (draft.memory?.mode === "draft_only" || draft.memoryPlan?.mode === "draft_only") {
    return "保存知识草稿";
  }

  return "保存知识库";
}

function KnowledgeLoopSummary({ draft }: { draft: IngestKnowledgeDraft }) {
  const reusableCount = draft.reusableKnowledgeUnits?.length ?? draft.knowledgeLoop?.reusableCount ?? 0;
  const reviewCount = draft.reviewRequiredUnits?.length ?? draft.knowledgeLoop?.reviewCount ?? 0;
  const duplicateRisk = draft.evolution?.duplicateRisk ?? "low";
  const riskLabel = duplicateRisk === "high" ? "高" : duplicateRisk === "medium" ? "中" : "低";
  const memory = draft.memory;
  const memoryPlan = draft.memoryPlan;
  const intelligence = draft.knowledgeIntelligence ?? memory?.intelligence ?? memoryPlan?.intelligence;
  const ragOptimization = draft.ragOptimization ?? memory?.ragOptimization ?? memoryPlan?.ragOptimization;
  const retrievalCheck = memory?.retrievalCheck ?? memoryPlan?.retrievalCheck;
  const retrievalLabel = retrievalCheck?.tested
    ? retrievalCheck.passed ? "已命中" : "未命中"
    : "未验证";
  const recommendedAction = memory?.recommendedAction
    ?? memoryPlan?.recommendedAction
    ?? draft.storeDecision?.recommendedAction
    ?? draft.knowledgeLoop?.storeDecision.recommendedAction
    ?? "请人工确认后点击保存知识入库。";
  const warnings = memory?.warnings?.length ? memory.warnings : memoryPlan?.warnings ?? [];
  const modeLabel = memory?.mode === "auto_store" || memoryPlan?.mode === "auto_store"
    ? "可自动入库"
    : memory?.mode === "draft_only" || memoryPlan?.mode === "draft_only"
      ? "草稿待补充"
      : "人工确认后入库";
  const qualityLevelLabel = intelligence?.qualityLevel === "high"
    ? "高"
    : intelligence?.qualityLevel === "medium"
      ? "中"
      : intelligence?.qualityLevel === "low"
        ? "低"
        : "未评估";

  return (
    <div className="rounded-2xl bg-[#f8f8f7] p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-[#8b8b86]">知识闭环草稿</p>
        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-[#777] shadow-sm">{modeLabel}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-3">
        <div className="rounded-xl bg-white p-2 shadow-sm">
          <p className="font-semibold text-[#202020]">{memory?.draftCount ?? memoryPlan?.candidates.length ?? reusableCount}</p>
          <p className="mt-1 text-[#8b8b86]">可入库知识</p>
        </div>
        <div className="rounded-xl bg-white p-2 shadow-sm">
          <p className="font-semibold text-[#202020]">{memory?.storedCount ?? 0}</p>
          <p className="mt-1 text-[#8b8b86]">已保存</p>
        </div>
        <div className="rounded-xl bg-white p-2 shadow-sm">
          <p className="font-semibold text-[#202020]">{reviewCount}</p>
          <p className="mt-1 text-[#8b8b86]">待复核</p>
        </div>
        <div className="rounded-xl bg-white p-2 shadow-sm">
          <p className="font-semibold text-[#202020]">{memory?.indexedCount ?? 0}</p>
          <p className="mt-1 text-[#8b8b86]">已索引</p>
        </div>
        <div className="rounded-xl bg-white p-2 shadow-sm">
          <p className="font-semibold text-[#202020]">{riskLabel}</p>
          <p className="mt-1 text-[#8b8b86]">重复风险</p>
        </div>
        <div className="rounded-xl bg-white p-2 shadow-sm">
          <p className="font-semibold text-[#202020]">{retrievalLabel}</p>
          <p className="mt-1 text-[#8b8b86]">RAG检索验证</p>
        </div>
        <div className="rounded-xl bg-white p-2 shadow-sm">
          <p className="font-semibold text-[#202020]">{qualityLevelLabel}{intelligence?.overallScore ? ` · ${intelligence.overallScore}` : ""}</p>
          <p className="mt-1 text-[#8b8b86]">知识质量</p>
        </div>
        <div className="rounded-xl bg-white p-2 shadow-sm">
          <p className="font-semibold text-[#202020]">{intelligence?.lowQualityCount ?? 0}</p>
          <p className="mt-1 text-[#8b8b86]">待补强</p>
        </div>
        <div className="rounded-xl bg-white p-2 shadow-sm">
          <p className="font-semibold text-[#202020]">{ragOptimization?.ragFitScore ? `${ragOptimization.ragFitScore}%` : "未评估"}</p>
          <p className="mt-1 text-[#8b8b86]">RAG适配度</p>
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-[#666]">
        <span className="font-semibold text-[#303030]">推荐操作：</span>{recommendedAction}
      </p>
      {ragOptimization?.suggestedQueries?.length ? (
        <p className="mt-2 text-xs leading-5 text-[#8b8b86]">
          建议验证问法：{ragOptimization.suggestedQueries.slice(0, 3).join("；")}
        </p>
      ) : null}
      {ragOptimization?.retrievalHints?.length ? (
        <p className="mt-2 text-xs leading-5 text-[#8b8b86]">
          检索提示：{ragOptimization.retrievalHints.slice(0, 3).join("；")}
        </p>
      ) : null}
      {intelligence?.improvementSuggestions?.length ? (
        <p className="mt-2 text-xs leading-5 text-[#8b8b86]">
          质量建议：{intelligence.improvementSuggestions.slice(0, 3).join("；")}
        </p>
      ) : null}
      {retrievalCheck?.reason ? (
        <p className="mt-2 text-xs leading-5 text-[#8b8b86]">
          检索说明：{retrievalCheck.reason}
          {retrievalCheck.matchedTitles.length ? `（命中：${retrievalCheck.matchedTitles.join("、")}）` : ""}
        </p>
      ) : null}
      {warnings.length ? (
        <p className="mt-2 text-xs leading-5 text-[#9a6500]">
          注意：{warnings.slice(0, 2).join("；")}
        </p>
      ) : null}
      {draft.knowledgeLoop?.reuseHints.length ? (
        <p className="mt-2 text-xs leading-5 text-[#8b8b86]">
          复用提示：{draft.knowledgeLoop.reuseHints.slice(0, 2).join("；")}
        </p>
      ) : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[#f8f8f7] p-3">
      <p className="text-xs font-semibold text-[#8b8b86]">{label}</p>
      <p className="mt-1 whitespace-pre-wrap leading-6 text-[#303030]">{value}</p>
    </div>
  );
}

function RailStatusPanel({
  activeRailKey,
  records,
  uploadedFiles,
  connectionStatus,
  draft,
  noticeMessage
}: {
  activeRailKey: IngestRailKey;
  records: IngestTrainingRecord[];
  uploadedFiles: IngestUploadState[];
  connectionStatus: IngestConnectionStatus;
  draft: IngestKnowledgeDraft;
  noticeMessage: string;
}) {
  const titles: Record<Exclude<IngestRailKey, "chat">, string> = {
    experts: "专家 Agent 工作区",
    tasks: "训练记录 / 投喂任务摘要",
    files: "文件解析状态面板",
    connections: "连接状态面板",
    memory: "记忆 / 知识沉淀",
    lab: "实验功能",
    notifications: "通知中心",
    settings: "当前 Agent 设置"
  };
  const key = activeRailKey === "chat" ? "experts" : activeRailKey;
  const statusSummary = [
    `训练 ${records.length} 条`,
    uploadedFiles[0] ? `文件 ${uploadedFiles[0].fileName}` : "文件待选择",
    `卡密 ${connectionStatus.licenseStatus}`,
    `${draft.title} · ${draft.category}`
  ].join(" · ");

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#eeeeeb] bg-[#fbfbfa] px-4 py-2 text-xs text-[#666]">
      <span className="min-w-0 truncate">
        <strong className="mr-1 text-[#202020]">{titles[key]}</strong>
        {noticeMessage}
      </span>
      <span className="shrink-0 rounded-full bg-white px-2.5 py-1 font-semibold text-[#777] shadow-sm">
        本机工作区 · Web / EXE / APK · {statusSummary}
      </span>
    </div>
  );
}

function formatThinkingDuration(totalSeconds: number) {
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}m${seconds.toString().padStart(2, "0")}s`;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function TrainingRecords({ records }: { records: IngestTrainingRecord[] }) {
  return (
    <div className="mt-4 rounded-[24px] border border-[#e7e7e4] bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-[#202020]">训练记录系统</h2>
      <div className="mt-3 space-y-3">
        {records.map((record) => (
          <div key={record.id} className="rounded-2xl bg-[#f8f8f7] p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium leading-5 text-[#252525]">{record.resultTitle}</p>
              <span className={record.saveStatus === "已保存"
                ? "rounded-full bg-[#e9f8ef] px-2 py-0.5 text-[11px] font-semibold text-[#128246]"
                : record.saveStatus === "已拒绝" || record.saveStatus === "失败"
                  ? "rounded-full bg-[#ffe5e9] px-2 py-0.5 text-[11px] font-semibold text-[#b93b4a]"
                  : "rounded-full bg-[#fff3d8] px-2 py-0.5 text-[11px] font-semibold text-[#9a6500]"}>
                {record.saveStatus === "已保存" ? "已入库" : record.saveStatus === "失败" ? "保存失败" : record.saveStatus}
              </span>
            </div>
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#777]">投喂内容：{record.input}</p>
            <div className="mt-2 flex items-center justify-between text-[11px] text-[#90908b]">
              <span>{record.category} · {record.time}</span>
              <span>命中 {record.hits} 次</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
