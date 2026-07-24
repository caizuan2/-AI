"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Brain, GaugeCircle, MessageSquareText, Rocket } from "lucide-react";
import { IngestAgentDeleteDialog } from "@/components/enterprise-admin/IngestAgentDeleteDialog";
import { IngestAgentDetailPanel } from "@/components/enterprise-admin/IngestAgentDetailPanel";
import {
  IngestCreateAgentDialog,
  type IngestCreateAgentPayload
} from "@/components/enterprise-admin/IngestCreateAgentDialog";
import { IngestChatGPTShell } from "@/components/enterprise-admin/IngestChatGPTShell";
import {
  IngestConversationLinkDialog,
  type IngestConversationLinkDialogState
} from "@/components/enterprise-admin/IngestConversationLinkDialog";
import { IngestEXEShell } from "@/components/enterprise-admin/IngestEXEShell";
import { IngestNotificationPanel } from "@/components/enterprise-admin/IngestNotificationPanel";
import {
  IngestSettingsPanel,
  type IngestSettingsState
} from "@/components/enterprise-admin/IngestSettingsPanel";
import { IngestKnowledgeOSDashboard } from "@/components/enterprise-admin/IngestKnowledgeOSDashboard";
import { IngestMemoryPanel } from "@/components/enterprise-admin/IngestMemoryPanel";
import { IngestReleaseConsole } from "@/components/enterprise-admin/IngestReleaseConsole";
import {
  checkLicenseStatus,
  checkGptHealthStatus,
  createUploadState,
  ingestSyncTarget,
  AdminIngestFileParseCancelledError,
  parseUploadedFilesForGpt,
  persistAdminIngestUploadImages,
  retryDoubaoKnowledgeDraftMetadata,
  saveKnowledgeDraft,
  sendCoreIngest,
  sendUrlIngestPreview,
  stripUploadRuntimeFields,
  type IngestConnectionStatus,
  type IngestGptHealthStatus,
  type IngestNotification,
  type IngestPlatform,
  type IngestSyncTarget,
  type IngestVoiceState,
  type IngestUploadState
} from "@/lib/enterprise/ingest-client";
import {
  defaultAdminIngestPlatformContext,
  resolveAdminIngestPlatformContext,
  type AdminIngestPlatformContext
} from "@/lib/enterprise/admin-ingest-platform";
import {
  createAgentConversation,
  deriveConversationTitle,
  type IngestAgentConversation
} from "@/lib/enterprise/mock-agent-conversations";
import {
  ingestChatInitialDraft,
  ingestTrainingRecords,
  type IngestChatMessage,
  type IngestChatAgent,
  type IngestKnowledgeDraft,
  type IngestTrainingRecord
} from "@/lib/enterprise/mock-chat";
import {
  DEFAULT_GPT_MODEL_SELECTION,
  getGptModelSelectionByDisplayName,
} from "@/lib/enterprise/gpt-model-options";
import {
  ADMIN_INGEST_MODEL_STORAGE_KEY,
  DEFAULT_INGEST_MODEL_OPTION,
  getIngestModelOptionByLabel,
  getIngestModelOptionByProvider,
  INGEST_MODEL_DISPLAY_NAMES,
  normalizeIngestModelProvider,
  normalizeIngestModelSelection
} from "@/lib/enterprise/ingest-model-options";
import {
  ADMIN_INGEST_MODEL_BY_AGENT_STORAGE_KEY,
  migrateLegacyAdminIngestModelPreference,
  parseAdminIngestModelPreferences,
  resolveAdminIngestAgentModel,
  setAdminIngestAgentModel,
  type AdminIngestModelPreferencesByAgent
} from "@/lib/enterprise/ingest-model-preferences";
import { shouldDisableDoubaoForHealth } from "@/lib/enterprise/ingest-model-availability";
import {
  ADMIN_INGEST_APP_NAME_STORAGE_KEY,
  DEFAULT_ADMIN_INGEST_ASSISTANT_NAME,
  resolveAdminIngestDisplayProfile
} from "@/lib/enterprise/admin-ingest-profile";
import {
  normalizeAdminIngestWechatOutputMode,
  type AdminIngestWechatOutputMode
} from "@/lib/enterprise/admin-ingest-wechat-output-mode";
import { sanitizeGptOSUserMessage } from "@/lib/enterprise/gpt-os-fallback-normalizer";
import { buildAdminIngestFailurePresentation } from "@/lib/enterprise/admin-ingest-failure-presentation";
import {
  ATTACHMENT_CONTENT_MISSING_CODE,
  assessAdminIngestAttachmentEvidence,
  buildAttachmentContentMissingMessage,
  readAttachmentEvidenceErrorMessage
} from "@/lib/enterprise/ingest-attachment-evidence";
import {
  getStateDomain,
  isRealIngestFailure,
  shouldClearTransientErrorOnAgentSwitch,
  shouldRestoreToastFromHistory,
  shouldSuppressFallbackToast
} from "@/lib/enterprise/ingest-ui-state";
import {
  ensureConversationState,
  isIngestConversationRequestActive,
  markRequestActive,
  type IngestConversationMessage,
  type IngestConversationState
} from "@/lib/enterprise/ingest-conversation-state";
import {
  appendAssistantPlaceholder,
  appendUserMessage,
  completeAssistantMessage,
  failAssistantMessage,
  updateAssistantMessage
} from "@/lib/enterprise/ingest-message-reducer";
import { buildIngestContextPayload } from "@/lib/enterprise/ingest-context-builder";
import { MAX_INGEST_CONTEXT_CHARS } from "@/lib/enterprise/ingest-context-compressor";
import {
  createIngestRequestAttemptId,
  createIngestRequestId,
  getRetryDelayMs,
  isRetryableIngestError,
  shouldIgnoreRequestError,
  shouldIgnoreRequestResult,
  shouldResetLoading
} from "@/lib/enterprise/ingest-request-controller";
import {
  canStartRequest,
  completeRequest,
  createIngestQueueState,
  enqueueRequest,
  failRequest,
  getNextQueuedRequest,
  isDuplicateSendAttempt,
  recordSendAttempt,
  startRequest,
  type IngestRequestQueueState
} from "@/lib/enterprise/ingest-request-queue";
import type { IngestExpert } from "@/lib/enterprise/mock-experts";
import { resolvePublicExpertScope } from "@/lib/enterprise/public-expert-scope";
import {
  isStrictSelectedModelFailure,
  readAdminIngestRequestError
} from "@/lib/enterprise/admin-ingest-request-error";
import {
  excludeFailedIngestMessages,
  replaceIngestRetryOutcome,
  resolveIngestSendAttachments
} from "@/lib/enterprise/ingest-retry-state";
import {
  hasAdminIngestWechatConversationAttachment,
  shouldRetryAdminIngestWechatModelTimeout
} from "@/lib/enterprise/admin-ingest-wechat-request";

type IngestMode = "chat" | "workbench" | "knowledge" | "release" | "memory";
type IngestRailKey = "chat" | "experts" | "tasks" | "files" | "connections" | "memory" | "lab" | "notifications" | "settings";
type IngestActionResult = Awaited<ReturnType<typeof sendCoreIngest>>;
type IngestSendOptions = {
  reuseUserMessageId?: string;
  failedMessageId?: string;
  retryAttachments?: IngestUploadState[];
  modelLabel?: string;
  preserveComposer?: boolean;
};
type OpenPanel = "notifications" | "settings" | null;
type GptFallbackToast = {
  id: string;
  title: string;
  description: string;
};
type IngestActionToast = {
  id: string;
  title: string;
  description?: string;
  type?: "success" | "warning" | "info";
};
type MemoryPromptPreview = {
  success?: boolean;
  ok?: boolean;
  retrievedMemories?: Array<{
    memory: { id: string; title?: string };
    score?: number;
    reason?: string;
    matchedFields?: string[];
  }>;
  memoryContextText?: string;
  agentLearningInstruction?: string;
  appliedPolicies?: string[];
  finalPromptPreview?: string;
  usedMemoryIds?: string[];
  debug?: {
    memoryParticipated?: boolean;
    usedMemoryIds?: string[];
    recalledMemoryIds?: string[];
    injectedCharLength?: number;
    appliedPolicies?: string[];
    warnings?: string[];
  };
  warnings?: string[];
};
type MemoryV2Trace = {
  promptPreview: MemoryPromptPreview | null;
  warnings: string[];
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onresult: ((event: {
    resultIndex: number;
    results: ArrayLike<ArrayLike<{ transcript: string }>>;
  }) => void) | null;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};
type AdminIngestConversationSyncSnapshot = {
  agents?: IngestChatAgent[];
  agentConversations?: IngestAgentConversation[];
  activeAgentId?: string;
  activeConversationId?: string;
  conversationMessagesById?: Record<string, IngestChatMessage[]>;
  conversationDraftsById?: Record<string, IngestKnowledgeDraft>;
  pinnedAgentIds?: string[];
  expandedAgentIds?: string[];
  expandedConversationAgentIds?: string[];
};

const tenantId: string | null = null;
const userId: string | null = null;
const initialConnectionStatus: IngestConnectionStatus = {
  enterpriseSpace: "本地预览",
  knowledgeBase: "默认知识库",
  licenseStatus: "未检查"
};
const initialVoiceState: IngestVoiceState = {
  isVoiceSupported: false,
  isRecording: false,
  transcript: "",
  error: "",
  platform: "web",
  syncTarget: [...ingestSyncTarget]
};
const initialSettingsState: IngestSettingsState = {
  autoSaveStructuredResult: false,
  uploadPreference: "composer",
  localPreviewMode: true,
  platform: "web",
  syncTarget: [...ingestSyncTarget]
};
const ADMIN_AVATAR_STORAGE_KEY = "admin-ingest-avatar";
const INGEST_AGENTS_STORAGE_KEY = "ai-kb-ingest-agents";
const INGEST_CONVERSATIONS_STORAGE_KEY = "ai-kb-ingest-conversations";
const INGEST_ACTIVE_AGENT_STORAGE_KEY = "ai-kb-ingest-active-agent";
const INGEST_ACTIVE_CONVERSATION_STORAGE_KEY = "ai-kb-ingest-active-conversation";
const INGEST_CONVERSATION_MESSAGES_STORAGE_KEY = "ai-kb-ingest-conversation-messages";
const INGEST_CONVERSATION_DRAFTS_STORAGE_KEY = "ai-kb-ingest-conversation-drafts";
const INGEST_PINNED_AGENTS_STORAGE_KEY = "ai-kb-ingest-pinned-agents";
const INGEST_EXPANDED_AGENTS_STORAGE_KEY = "ai-kb-ingest-expanded-agents";
const INGEST_EXPANDED_CONVERSATION_AGENTS_STORAGE_KEY = "ai-kb-ingest-expanded-conversation-agents";
const DOUBAO_INFERENCE_PAUSED_STORAGE_KEY = "admin-ingest-doubao-inference-paused-v1";
const EMPTY_HISTORY_MESSAGE_PREFIX = "empty-history-";
const INGEST_SUCCESS_TOAST_SUPPRESS_MS = 30_000;
const INGEST_CONVERSATION_SYNC_ENDPOINT = "/api/admin/ingest-conversations";
const INGEST_REMOTE_SYNC_DEBOUNCE_MS = 800;

function readLocalArray<T>(key: string): T[] {
  try {
    const rawValue = window.localStorage.getItem(key);

    if (!rawValue) {
      return [];
    }

    const parsed = JSON.parse(rawValue) as unknown;

    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function getAuthAccessErrorMessage(error: unknown) {
  const raw = error instanceof Error
    ? `${error.name} ${error.message}`
    : typeof error === "string"
      ? error
      : "";
  const normalized = raw.toLowerCase();

  if (
    normalized.includes("auth_required")
    || normalized.includes("invalid_session")
    || normalized.includes("unauthorized")
    || normalized.includes("401")
    || normalized.includes("请先登录")
    || normalized.includes("重新登录")
    || normalized.includes("登录状态")
  ) {
    return "请重新登录后再试。";
  }

  if (
    normalized.includes("no_ingest_access")
    || normalized.includes("license_app_type_mismatch")
    || normalized.includes("forbidden")
    || normalized.includes("403")
    || normalized.includes("没有权限")
    || normalized.includes("不能访问")
    || normalized.includes("卡密")
    || normalized.includes("授权")
  ) {
    return "当前账号没有投喂权限，请确认卡密或账号权限。";
  }

  return "";
}

function getModelHealthWarningMessage(error: unknown) {
  const raw = error instanceof Error
    ? `${error.name} ${error.message}`
    : typeof error === "string"
      ? error
      : "";
  const normalized = raw.toLowerCase();

  if (
    normalized.includes("model_health_failure")
    || normalized.includes("模型健康")
    || normalized.includes("provider unavailable")
    || normalized.includes("model disabled")
    || normalized.includes("openai unavailable")
    || normalized.includes("gpt-5.5")
    || normalized.includes("gpt-55")
    || normalized.includes("health check")
  ) {
    return "模型健康检查暂不可用，已继续使用当前可用模型。";
  }

  return "";
}

function readLocalRecord<T>(key: string): Record<string, T> {
  try {
    const rawValue = window.localStorage.getItem(key);

    if (!rawValue) {
      return {};
    }

    const parsed = JSON.parse(rawValue) as unknown;

    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, T> : {};
  } catch {
    return {};
  }
}

function readLocalString(key: string) {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeLocalJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage can be unavailable in hardened browsers; UI should keep running.
  }
}

function removeLocalValue(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // localStorage can be unavailable in hardened browsers; UI should keep running.
  }
}

function mergeById<T extends { id: string }>(remoteItems: T[] = [], localItems: T[] = []) {
  const merged = new Map<string, T>();

  for (const item of remoteItems) {
    merged.set(item.id, item);
  }

  for (const item of localItems) {
    merged.set(item.id, item);
  }

  return Array.from(merged.values());
}

function mergeStringIds(remoteItems: string[] = [], localItems: string[] = []) {
  return Array.from(new Set([...remoteItems, ...localItems]));
}

function mergeMessageList(remoteMessages: IngestChatMessage[] = [], localMessages: IngestChatMessage[] = []) {
  const merged = new Map<string, IngestChatMessage>();

  for (const message of remoteMessages) {
    merged.set(message.id, markMessageCompleted(message));
  }

  for (const message of localMessages) {
    merged.set(message.id, markMessageCompleted(message));
  }

  return Array.from(merged.values()).filter((message) => !isEmptyHistoryMessage(message));
}

function mergeMessageRecords(
  remoteRecords: Record<string, IngestChatMessage[]> = {},
  localRecords: Record<string, IngestChatMessage[]> = {}
) {
  const next: Record<string, IngestChatMessage[]> = {};
  const keys = new Set([...Object.keys(remoteRecords), ...Object.keys(localRecords)]);

  keys.forEach((key) => {
    const messages = mergeMessageList(remoteRecords[key], localRecords[key]);

    if (messages.length > 0) {
      next[key] = messages;
    }
  });

  return next;
}

function hasRemoteConversationSyncState(
  state: AdminIngestConversationSyncSnapshot | null | undefined
): state is AdminIngestConversationSyncSnapshot {
  return Boolean(
    state
    && (
      state.agents?.length
      || state.agentConversations?.length
      || state.pinnedAgentIds?.length
      || state.expandedAgentIds?.length
      || state.expandedConversationAgentIds?.length
      || Object.keys(state.conversationMessagesById ?? {}).length
      || Object.keys(state.conversationDraftsById ?? {}).length
    )
  );
}

function createNotification(input: Pick<IngestNotification, "type" | "title" | "description"> & {
  read?: boolean;
  platform?: IngestPlatform;
  syncTarget?: IngestSyncTarget[];
}): IngestNotification {
  return {
    id: `notice-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type: input.type,
    title: input.title,
    description: input.description,
    read: input.read ?? false,
    source: "admin_ingest",
    platform: input.platform ?? defaultAdminIngestPlatformContext.platform,
    syncTarget: input.syncTarget ?? [...defaultAdminIngestPlatformContext.syncTarget],
    createdAt: new Date().toISOString()
  };
}

function isEmptyHistoryMessage(message: IngestChatMessage) {
  return message.id.startsWith(EMPTY_HISTORY_MESSAGE_PREFIX);
}

function markMessageCompleted(message: IngestChatMessage): IngestChatMessage {
  return {
    ...message,
    isStreaming: false,
    isGenerating: false,
    typing: false,
    status: message.status === "failed" ? "failed" : "completed"
  };
}

function normalizeRestoredMessages(messages: IngestChatMessage[]) {
  return messages.map((message) => ({
    ...markMessageCompleted(message),
    isRestored: true,
    isHistorical: true
  }));
}

function getPersistableMessages(messages: IngestChatMessage[]) {
  return messages
    .filter((message) => !isEmptyHistoryMessage(message))
    .map(markMessageCompleted);
}

function toConversationStateMessages(
  messages: IngestChatMessage[],
  conversationId: string,
  agent: IngestChatAgent
): IngestConversationMessage[] {
  return getPersistableMessages(messages)
    .filter((message) => {
      const content = message.content.trim();

      return message.status !== "failed" && Boolean(content) && content !== "暂无历史内容";
    })
    .map((message, index) => {
      const createdAt = Date.now() - ((messages.length - index) * 1000);

      return {
        id: message.id,
        role: message.role,
        content: message.content,
        status: message.status === "failed" ? "failed" : "completed",
        requestId: typeof message.gptProof?.responseId === "string" ? message.gptProof.responseId : undefined,
        conversationId: message.conversationId ?? conversationId,
        agentId: message.agentId ?? agent.id,
        knowledgeBaseId: agent.knowledgeBaseId ?? undefined,
        createdAt,
        updatedAt: createdAt,
        meta: {
          model: message.model,
          provider: message.provider
        }
      };
    });
}

function toPreviousKnowledgeDrafts(draft: IngestKnowledgeDraft) {
  return hasConversationDraft(draft) ? [draft] : [];
}

function createEmptyHistoryMessages({
  conversation,
  agent,
  context
}: {
  conversation: IngestAgentConversation;
  agent: IngestChatAgent;
  context: AdminIngestPlatformContext;
}): IngestChatMessage[] {
  return [{
    id: `${EMPTY_HISTORY_MESSAGE_PREFIX}${conversation.id}`,
    role: "assistant",
    content: "暂无历史内容",
    time: "刚刚",
    source: "admin_ingest",
    platform: context.platform,
    syncTarget: [...context.syncTarget],
    tenantId,
    userId,
    agentId: agent.id,
    expertId: agent.expertId ?? null,
    conversationId: conversation.id,
    agentName: agent.name,
    expertName: agent.expertId ? agent.name : null,
    provider: "admin_ingest",
    isRestored: true,
    isHistorical: true,
    isStreaming: false,
    isGenerating: false,
    typing: false,
    status: "completed"
  }];
}

function hasConversationDraft(draft: IngestKnowledgeDraft) {
  return Boolean(
    draft.jobId
    || draft.title !== ingestChatInitialDraft.title
    || draft.standardAnswer !== ingestChatInitialDraft.standardAnswer
    || draft.saveStatus !== ingestChatInitialDraft.saveStatus
    || draft.replyMarkdown
    || draft.sourceMaterials?.length
  );
}

function mergeTrainingRecords(incoming: IngestTrainingRecord[], current: IngestTrainingRecord[]) {
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

function syncSavedRecordState(records: IngestTrainingRecord[], draft: IngestKnowledgeDraft) {
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

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function buildAiFixInstruction(label: string, content: string, hasAttachments: boolean) {
  const trimmed = content.trim();

  if (!trimmed && hasAttachments) {
    if (label === "改写为标准问答") {
      return "请基于已上传附件改写为标准问答，并整理成可入库知识。";
    }

    if (label === "生成分类标签") {
      return "请基于已上传附件生成分类、标签和入库建议。";
    }

    if (label === "检查是否需要 AI 修正") {
      return "请基于已上传附件检查是否需要 AI 修正，并整理成可入库知识。";
    }

    return "请基于已上传附件提取重点，并整理成可入库知识。";
  }

  if (label === "改写为标准问答") {
    return `请将以下内容改写为标准问答，并整理成可入库知识：\n\n${trimmed}`;
  }

  if (label === "生成分类标签") {
    return `请为以下内容生成分类、标签和入库建议：\n\n${trimmed}`;
  }

  if (label === "检查是否需要 AI 修正") {
    return `请检查以下内容是否需要 AI 修正，并给出可入库版本：\n\n${trimmed}`;
  }

  return `请从以下内容中提取重点，并整理成可入库知识：\n\n${trimmed}`;
}

function normalizeInitialAgents() {
  return [] as IngestChatAgent[];
}

function createEmptyAgent(context: AdminIngestPlatformContext): IngestChatAgent {
  return {
    id: "no-agent",
    expertId: null,
    name: "未选择 Agent",
    role: "待添加专家",
    category: "专家广场",
    description: "请先到专家广场添加专家 Agent。",
    avatar: "+",
    tone: "slate",
    tenantId,
    userId,
    platform: context.platform,
    syncTarget: [...context.syncTarget],
    createdAt: new Date().toISOString(),
    status: "active",
    isSystem: false,
    knowledgeCount: 0,
    source: "expert_marketplace",
    sourceApp: "admin_ingest",
    managedBySuperAdmin: false,
    editableByIngestAdmin: false,
    deletableByIngestAdmin: false,
    visibleToUserClient: false
  };
}

export function IngestModeToggle() {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const restoredInitialConversationRef = useRef(false);
  const doubaoHealthRequestVersionRef = useRef(0);
  const activeAgentIdRef = useRef("");
  const activeConversationIdRef = useRef("");
  const [platformContext, setPlatformContext] = useState<AdminIngestPlatformContext>(defaultAdminIngestPlatformContext);
  const [mode, setMode] = useState<IngestMode>("chat");
  const [agents, setAgents] = useState<IngestChatAgent[]>(normalizeInitialAgents);
  const [activeAgentId, setActiveAgentId] = useState("");
  const [agentConversations, setAgentConversations] = useState<IngestAgentConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState("");
  const [expandedAgentIds, setExpandedAgentIds] = useState<string[]>([]);
  const [expandedConversationAgentIds, setExpandedConversationAgentIds] = useState<string[]>([]);
  const [pinnedAgentIds, setPinnedAgentIds] = useState<string[]>([]);
  const [activeRailKey, setActiveRailKey] = useState<IngestRailKey>("chat");
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const [isAgentDetailOpen, setIsAgentDetailOpen] = useState(false);
  const [deleteCandidateAgent, setDeleteCandidateAgent] = useState<IngestChatAgent | null>(null);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [selectedModel, setSelectedModel] = useState(DEFAULT_INGEST_MODEL_OPTION.label);
  const [resolvedModel, setResolvedModel] = useState(DEFAULT_INGEST_MODEL_OPTION.label);
  const [modelPreferencesByAgent, setModelPreferencesByAgent] = useState<AdminIngestModelPreferencesByAgent>({});
  const [connectionStatus, setConnectionStatus] = useState<IngestConnectionStatus>(initialConnectionStatus);
  const [gptHealthStatus, setGptHealthStatus] = useState<IngestGptHealthStatus | null>(null);
  const [isCheckingGptHealth, setIsCheckingGptHealth] = useState(false);
  const [unavailableModelProviders, setUnavailableModelProviders] = useState<string[]>([]);
  const [doubaoInferencePaused, setDoubaoInferencePaused] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<IngestUploadState[]>([]);
  const [voiceState, setVoiceState] = useState<IngestVoiceState>(initialVoiceState);
  const [notifications, setNotifications] = useState<IngestNotification[]>([
    createNotification({
      type: "sync",
      title: "三端同步字段已就绪",
      description: "当前 /admin-ingest 交互会预留 Web / EXE / APK 同步目标。",
      read: false
    }),
    createNotification({
      type: "license",
      title: "卡密状态待检查",
      description: "点击连接或设置可查看当前账号授权状态；本机工作区不会改动卡密核心逻辑。",
      read: false
    })
  ]);
  const [settingsState, setSettingsState] = useState<IngestSettingsState>(initialSettingsState);
  const [adminAvatar, setAdminAvatar] = useState("");
  const [appName, setAppName] = useState(DEFAULT_ADMIN_INGEST_ASSISTANT_NAME);
  const [isCreateAgentOpen, setIsCreateAgentOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<IngestChatMessage[]>([]);
  const [conversationMessagesById, setConversationMessagesById] = useState<Record<string, IngestChatMessage[]>>({});
  const [conversationDraftsById, setConversationDraftsById] = useState<Record<string, IngestKnowledgeDraft>>({});
  const [draft, setDraft] = useState<IngestKnowledgeDraft>(ingestChatInitialDraft);
  const [records, setRecords] = useState<IngestTrainingRecord[]>(ingestTrainingRecords);
  const [lastInput, setLastInput] = useState("");
  const [noticeMessage, setNoticeMessage] = useState("管理员投喂端已就绪，登录后将同步企业知识库。");
  const [errorMessage, setErrorMessage] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [recoveringMetadataMessageId, setRecoveringMetadataMessageId] = useState<string | null>(null);
  const [memoryRefreshKey, setMemoryRefreshKey] = useState(0);
  const [gptFallbackToast, setGptFallbackToast] = useState<GptFallbackToast | null>(null);
  const [actionToast, setActionToast] = useState<IngestActionToast | null>(null);
  const [conversationLinkDialog, setConversationLinkDialog] = useState<IngestConversationLinkDialogState | null>(null);
  const [isConversationLinkBusy, setIsConversationLinkBusy] = useState(false);
  const conversationStateByIdRef = useRef<Record<string, IngestConversationState>>({});
  const draftRef = useRef<IngestKnowledgeDraft>(ingestChatInitialDraft);
  const messagesRef = useRef<IngestChatMessage[]>([]);
  const requestQueueRef = useRef<IngestRequestQueueState>(createIngestQueueState());
  const abortControllerByConversationRef = useRef<Record<string, AbortController>>({});
  const activeIngestRequestIdRef = useRef("");
  const ingestSuccessLockRef = useRef(false);
  const lastSuccessfulIngestAtRef = useRef(0);
  const lastSuccessfulIngestRequestIdRef = useRef("");
  const suppressFallbackToastUntilRef = useRef(0);
  const [isUrlDialogOpen, setIsUrlDialogOpen] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState("");
  const [isUrlIngesting, setIsUrlIngesting] = useState(false);
  const [autonomousEnabled, setAutonomousEnabled] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [conversationSyncLoaded, setConversationSyncLoaded] = useState(false);
  const lastConversationSyncPayloadRef = useRef("");
  const uploadState = uploadedFiles[0] ?? null;
  const modelOptions = INGEST_MODEL_DISPLAY_NAMES;
  const selectedModelLabel = selectedModel;
  const selectedModelOption = useMemo(() => getIngestModelOptionByLabel(selectedModelLabel), [selectedModelLabel]);
  const selectedGptModel = useMemo(
    () => getGptModelSelectionByDisplayName(selectedModelOption.provider === "openai" ? selectedModelLabel : DEFAULT_GPT_MODEL_SELECTION.displayName),
    [selectedModelLabel, selectedModelOption.provider]
  );
  const visibleAgents = useMemo(() => {
    const filtered = agents.filter((agent) => agent.status !== "deleted_local" && agent.status !== "archived");

    return [...filtered].sort((left, right) => {
      const leftPinned = pinnedAgentIds.includes(left.id);
      const rightPinned = pinnedAgentIds.includes(right.id);

      if (leftPinned !== rightPinned) {
        return leftPinned ? -1 : 1;
      }

      return 0;
    });
  }, [agents, pinnedAgentIds]);

  const hasActiveAgent = visibleAgents.length > 0;
  const activeAgent = useMemo(
    () => visibleAgents.find((agent) => agent.id === activeAgentId) ?? visibleAgents[0] ?? createEmptyAgent(platformContext),
    [activeAgentId, platformContext, visibleAgents]
  );

  useEffect(() => {
    activeAgentIdRef.current = activeAgent.id;
    doubaoHealthRequestVersionRef.current += 1;
  }, [activeAgent.id]);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  const displayProfile = useMemo(
    () => resolveAdminIngestDisplayProfile({
      currentAgent: hasActiveAgent ? activeAgent : null,
      appName,
      adminAvatar
    }),
    [activeAgent, adminAvatar, appName, hasActiveAgent]
  );

  useEffect(() => {
    const nextContext = resolveAdminIngestPlatformContext({
      search: window.location.search,
      userAgent: navigator.userAgent
    });
    const storedAgents = readLocalArray<IngestChatAgent>(INGEST_AGENTS_STORAGE_KEY);
    const storedConversations = readLocalArray<IngestAgentConversation>(INGEST_CONVERSATIONS_STORAGE_KEY);
    const storedPinnedAgentIds = readLocalArray<string>(INGEST_PINNED_AGENTS_STORAGE_KEY);
    const storedExpandedAgentIds = readLocalArray<string>(INGEST_EXPANDED_AGENTS_STORAGE_KEY);
    const storedExpandedConversationAgentIds = readLocalArray<string>(INGEST_EXPANDED_CONVERSATION_AGENTS_STORAGE_KEY);
    const storedActiveAgentId = readLocalString(INGEST_ACTIVE_AGENT_STORAGE_KEY);
    const storedActiveConversationId = readLocalString(INGEST_ACTIVE_CONVERSATION_STORAGE_KEY);
    const storedConversationMessages = readLocalRecord<IngestChatMessage[]>(INGEST_CONVERSATION_MESSAGES_STORAGE_KEY);
    const storedConversationDrafts = readLocalRecord<IngestKnowledgeDraft>(INGEST_CONVERSATION_DRAFTS_STORAGE_KEY);

    setPlatformContext(nextContext);
    setAgents((current) => {
      const baseAgents = storedAgents.length ? storedAgents : current;

      return baseAgents.map((agent) => ({
        ...agent,
        platform: nextContext.platform,
        syncTarget: [...nextContext.syncTarget]
      }));
    });
    setVoiceState((current) => ({
      ...current,
      platform: nextContext.platform,
      syncTarget: [...nextContext.syncTarget]
    }));
    setSettingsState((current) => ({
      ...current,
      platform: nextContext.platform,
      syncTarget: [...nextContext.syncTarget]
    }));
    setNotifications((current) => current.map((notification) => ({
      ...notification,
      platform: nextContext.platform,
      syncTarget: [...nextContext.syncTarget]
    })));
    setAgentConversations((current) => {
      const baseConversations = storedConversations.length ? storedConversations : current;

      return baseConversations.map((conversation) => ({
        ...conversation,
        platform: nextContext.platform,
        syncTarget: [...nextContext.syncTarget]
      }));
    });
    setPinnedAgentIds(storedPinnedAgentIds);
    setExpandedAgentIds(storedExpandedAgentIds);
    setExpandedConversationAgentIds(storedExpandedConversationAgentIds);
    setActiveAgentId((current) => storedActiveAgentId || current);
    setConversationMessagesById(storedConversationMessages);
    setConversationDraftsById(storedConversationDrafts);
    setActiveConversationId((current) => storedActiveConversationId || current);

    setAdminAvatar(window.localStorage.getItem(ADMIN_AVATAR_STORAGE_KEY) ?? "");
    setAppName(window.localStorage.getItem(ADMIN_INGEST_APP_NAME_STORAGE_KEY)?.trim() || DEFAULT_ADMIN_INGEST_ASSISTANT_NAME);
    const storedModelValue = window.localStorage.getItem(ADMIN_INGEST_MODEL_STORAGE_KEY);
    const storedModel = normalizeIngestModelSelection({
      selectedModelLabel: storedModelValue
    });
    const storedModelPreferences = parseAdminIngestModelPreferences(
      window.localStorage.getItem(ADMIN_INGEST_MODEL_BY_AGENT_STORAGE_KEY)
    );
    const preferenceAgentId = storedActiveAgentId || storedAgents[0]?.id || "";
    const migratedModelPreferences = migrateLegacyAdminIngestModelPreference({
      preferences: storedModelPreferences,
      activeAgentId: preferenceAgentId,
      legacyModelLabel: storedModel.label
    });
    const initialModelLabel = resolveAdminIngestAgentModel({
      preferences: migratedModelPreferences,
      agentId: preferenceAgentId
    });

    setModelPreferencesByAgent(migratedModelPreferences);
    setSelectedModel(initialModelLabel);
    setResolvedModel(initialModelLabel);
    writeLocalJson(ADMIN_INGEST_MODEL_BY_AGENT_STORAGE_KEY, migratedModelPreferences);
    if (storedModelValue !== storedModel.label) {
      window.localStorage.setItem(ADMIN_INGEST_MODEL_STORAGE_KEY, storedModel.label);
    }
    setHistoryLoaded(true);
  }, []);

  useEffect(() => {
    if (!historyLoaded || !hasActiveAgent) {
      return;
    }

    const agentModelLabel = resolveAdminIngestAgentModel({
      preferences: modelPreferencesByAgent,
      agentId: activeAgent.id
    });

    setSelectedModel(agentModelLabel);
    setResolvedModel(agentModelLabel);
    setGptHealthStatus(null);
    setGptFallbackToast(null);
  }, [activeAgent.id, hasActiveAgent, historyLoaded, modelPreferencesByAgent]);

  useEffect(() => {
    if (!historyLoaded) {
      return;
    }

    writeLocalJson(ADMIN_INGEST_MODEL_BY_AGENT_STORAGE_KEY, modelPreferencesByAgent);
  }, [historyLoaded, modelPreferencesByAgent]);

  useEffect(() => {
    if (!historyLoaded) {
      return;
    }

    if (readLocalString(DOUBAO_INFERENCE_PAUSED_STORAGE_KEY) === "true") {
      doubaoHealthRequestVersionRef.current += 1;
      setDoubaoInferencePaused(true);
      setUnavailableModelProviders((current) => Array.from(new Set([...current, "doubao-pro"])));
      return;
    }

    let cancelled = false;
    const requestVersion = ++doubaoHealthRequestVersionRef.current;
    const doubaoOption = getIngestModelOptionByProvider("doubao-pro");

    void checkGptHealthStatus({
      provider: doubaoOption.provider,
      selectedModelLabel: doubaoOption.label,
      preferredModel: doubaoOption.defaultModel,
      testRequest: false
    }).then((status) => {
      if (cancelled || requestVersion !== doubaoHealthRequestVersionRef.current) {
        return;
      }

      if (readLocalString(DOUBAO_INFERENCE_PAUSED_STORAGE_KEY) === "true") {
        setDoubaoInferencePaused(true);
        setUnavailableModelProviders((current) => Array.from(new Set([...current, "doubao-pro"])));
        return;
      }

      setUnavailableModelProviders((current) => shouldDisableDoubaoForHealth(status)
        ? Array.from(new Set([...current, "doubao-pro"]))
        : current.filter((provider) => provider !== "doubao-pro"));
    }).catch(() => {
      if (!cancelled && requestVersion === doubaoHealthRequestVersionRef.current) {
        const paused = readLocalString(DOUBAO_INFERENCE_PAUSED_STORAGE_KEY) === "true";
        setUnavailableModelProviders((current) => paused
          ? Array.from(new Set([...current, "doubao-pro"]))
          : current.filter((provider) => provider !== "doubao-pro"));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [historyLoaded]);

  useEffect(() => {
    function syncDoubaoPauseAcrossTabs(event: StorageEvent) {
      if (event.key !== DOUBAO_INFERENCE_PAUSED_STORAGE_KEY) {
        return;
      }

      const paused = event.newValue === "true";
      if (paused) {
        doubaoHealthRequestVersionRef.current += 1;
      }
      setDoubaoInferencePaused(paused);
      setUnavailableModelProviders((current) => paused
        ? Array.from(new Set([...current, "doubao-pro"]))
        : current.filter((provider) => provider !== "doubao-pro"));
    }

    window.addEventListener("storage", syncDoubaoPauseAcrossTabs);
    return () => window.removeEventListener("storage", syncDoubaoPauseAcrossTabs);
  }, []);

  useEffect(() => {
    if (!historyLoaded) {
      return;
    }

    let cancelled = false;

    async function loadRemoteConversationState() {
      try {
        const response = await fetch(INGEST_CONVERSATION_SYNC_ENDPOINT, {
          method: "GET",
          credentials: "include",
          cache: "no-store"
        });

        if (!response.ok) {
          return;
        }

        const payload = await response.json() as {
          state?: AdminIngestConversationSyncSnapshot;
        };
        const remoteState = payload.state;

        if (cancelled || !hasRemoteConversationSyncState(remoteState)) {
          return;
        }

        restoredInitialConversationRef.current = false;
        const remoteAgents = (remoteState.agents ?? []).map((agent) => ({
          ...agent,
          platform: platformContext.platform,
          syncTarget: [...platformContext.syncTarget]
        }));
        const remoteConversations = (remoteState.agentConversations ?? []).map((conversation) => ({
          ...conversation,
          platform: platformContext.platform,
          syncTarget: [...platformContext.syncTarget]
        }));

        setAgents((current) => mergeById(remoteAgents, current));
        setAgentConversations((current) => mergeById(remoteConversations, current));
        setConversationMessagesById((current) => mergeMessageRecords(remoteState.conversationMessagesById, current));
        setConversationDraftsById((current) => ({
          ...(remoteState.conversationDraftsById ?? {}),
          ...current
        }));
        setPinnedAgentIds((current) => mergeStringIds(remoteState.pinnedAgentIds, current));
        setExpandedAgentIds((current) => mergeStringIds(remoteState.expandedAgentIds, current));
        setExpandedConversationAgentIds((current) => mergeStringIds(remoteState.expandedConversationAgentIds, current));
        setActiveAgentId((current) => current || remoteState.activeAgentId || "");
        setActiveConversationId((current) => current || remoteState.activeConversationId || "");
      } catch (error) {
        console.warn("[admin-ingest:conversation-sync:load]", error);
      } finally {
        if (!cancelled) {
          setConversationSyncLoaded(true);
        }
      }
    }

    void loadRemoteConversationState();

    return () => {
      cancelled = true;
    };
  }, [historyLoaded, platformContext.platform, platformContext.syncTarget]);

  useEffect(() => {
    if (!historyLoaded) {
      return;
    }

    writeLocalJson(INGEST_AGENTS_STORAGE_KEY, agents);
  }, [agents, historyLoaded]);

  useEffect(() => {
    if (!historyLoaded) {
      return;
    }

    writeLocalJson(INGEST_CONVERSATIONS_STORAGE_KEY, agentConversations);
  }, [agentConversations, historyLoaded]);

  useEffect(() => {
    if (!historyLoaded) {
      return;
    }

    writeLocalJson(INGEST_PINNED_AGENTS_STORAGE_KEY, pinnedAgentIds);
  }, [historyLoaded, pinnedAgentIds]);

  useEffect(() => {
    if (!historyLoaded) {
      return;
    }

    writeLocalJson(INGEST_EXPANDED_AGENTS_STORAGE_KEY, expandedAgentIds);
  }, [expandedAgentIds, historyLoaded]);

  useEffect(() => {
    if (!historyLoaded) {
      return;
    }

    writeLocalJson(INGEST_EXPANDED_CONVERSATION_AGENTS_STORAGE_KEY, expandedConversationAgentIds);
  }, [expandedConversationAgentIds, historyLoaded]);

  useEffect(() => {
    if (!historyLoaded) {
      return;
    }

    try {
      if (activeAgentId) {
        window.localStorage.setItem(INGEST_ACTIVE_AGENT_STORAGE_KEY, activeAgentId);
      } else {
        window.localStorage.removeItem(INGEST_ACTIVE_AGENT_STORAGE_KEY);
      }
    } catch {
      // Ignore storage failures; active Agent still works for the current session.
    }
  }, [activeAgentId, historyLoaded]);

  useEffect(() => {
    if (!historyLoaded) {
      return;
    }

    try {
      if (activeConversationId) {
        window.localStorage.setItem(INGEST_ACTIVE_CONVERSATION_STORAGE_KEY, activeConversationId);
      } else {
        window.localStorage.removeItem(INGEST_ACTIVE_CONVERSATION_STORAGE_KEY);
      }
    } catch {
      // Ignore storage failures; active conversation still works for the current session.
    }
  }, [activeConversationId, historyLoaded]);


  useEffect(() => {
    if (!historyLoaded || !activeConversationId) {
      return;
    }

    const persistableMessages = getPersistableMessages(messages);

    setConversationMessagesById((current) => {
      const previousMessages = current[activeConversationId] ?? [];

      if (persistableMessages.length === 0 && previousMessages.length === 0) {
        return current;
      }

      const next = {
        ...current,
        [activeConversationId]: persistableMessages
      };

      writeLocalJson(INGEST_CONVERSATION_MESSAGES_STORAGE_KEY, next);
      return next;
    });
  }, [activeConversationId, historyLoaded, messages]);

  useEffect(() => {
    if (!historyLoaded || !activeConversationId || !hasConversationDraft(draft)) {
      return;
    }

    setConversationDraftsById((current) => {
      const next = {
        ...current,
        [activeConversationId]: draft
      };

      writeLocalJson(INGEST_CONVERSATION_DRAFTS_STORAGE_KEY, next);
      return next;
    });
  }, [activeConversationId, draft, historyLoaded]);

  useEffect(() => {
    if (!historyLoaded || !conversationSyncLoaded) {
      return;
    }

    const syncPayload: AdminIngestConversationSyncSnapshot = {
      agents,
      agentConversations,
      activeAgentId,
      activeConversationId,
      conversationMessagesById,
      conversationDraftsById,
      pinnedAgentIds,
      expandedAgentIds,
      expandedConversationAgentIds
    };
    const serialized = JSON.stringify(syncPayload);

    if (serialized === lastConversationSyncPayloadRef.current) {
      return;
    }

    const timeout = window.setTimeout(() => {
      fetch(INGEST_CONVERSATION_SYNC_ENDPOINT, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: serialized
      })
        .then((response) => {
          if (response.ok) {
            lastConversationSyncPayloadRef.current = serialized;
          }
        })
        .catch((error) => {
          console.warn("[admin-ingest:conversation-sync:save]", error);
        });
    }, INGEST_REMOTE_SYNC_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [
    activeAgentId,
    activeConversationId,
    agentConversations,
    agents,
    conversationDraftsById,
    conversationMessagesById,
    conversationSyncLoaded,
    expandedAgentIds,
    expandedConversationAgentIds,
    historyLoaded,
    pinnedAgentIds
  ]);

  useEffect(() => {
    if (!historyLoaded || restoredInitialConversationRef.current || !activeConversationId) {
      return;
    }

    const activeConversation = agentConversations.find((conversation) => conversation.id === activeConversationId);
    if (activeConversation?.status === "archived") {
      const fallback = agentConversations.find((conversation) => (
        conversation.agentId === activeConversation.agentId
        && conversation.status !== "archived"
      ));

      setActiveConversationId(fallback?.id ?? "");
      return;
    }
    const conversationAgent = activeConversation
      ? visibleAgents.find((agent) => agent.id === activeConversation.agentId)
      : null;

    if (!activeConversation || !conversationAgent) {
      return;
    }

    const restoredMessages = conversationMessagesById[activeConversation.id];

    setMessages(restoredMessages?.length
      ? normalizeRestoredMessages(restoredMessages)
      : createEmptyHistoryMessages({ conversation: activeConversation, agent: conversationAgent, context: platformContext }));
    setDraft(conversationDraftsById[activeConversation.id] ?? ingestChatInitialDraft);
    restoredInitialConversationRef.current = true;
  }, [activeConversationId, agentConversations, conversationDraftsById, conversationMessagesById, historyLoaded, platformContext, visibleAgents]);
  useEffect(() => {
    const speechWindow = window as SpeechWindow;
    const SpeechRecognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;

    setVoiceState((current) => ({
      ...current,
      isVoiceSupported: Boolean(SpeechRecognition)
    }));

    return () => {
      recognitionRef.current?.abort?.();
      recognitionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!actionToast) {
      return;
    }

    const timeout = window.setTimeout(() => setActionToast(null), 3000);

    return () => window.clearTimeout(timeout);
  }, [actionToast]);

  useEffect(() => {
    if (!gptFallbackToast || isParsing || errorMessage) {
      return;
    }

    const hasRenderedAssistantReply = messages.some((message) => (
      message.role === "assistant"
      && message.content.trim()
      && message.content.trim() !== "暂无历史内容"
    ));

    if (hasRenderedAssistantReply) {
      setGptFallbackToast(null);
    }
  }, [errorMessage, gptFallbackToast, isParsing, messages]);

  function pushNotification(input: Pick<IngestNotification, "type" | "title" | "description">) {
    setNotifications((current) => [createNotification({
      ...input,
      platform: platformContext.platform,
      syncTarget: [...platformContext.syncTarget]
    }), ...current].slice(0, 8));
  }

  function showActionToast(input: Omit<IngestActionToast, "id">) {
    setActionToast({
      id: `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      ...input
    });
  }

  function handleAdminAvatarChange(nextAvatar: string) {
    setAdminAvatar(nextAvatar);
    window.localStorage.setItem(ADMIN_AVATAR_STORAGE_KEY, nextAvatar);
    setNoticeMessage("头像已更新。");
    showActionToast({
      type: "success",
      title: "头像已更新"
    });
  }

  function handleAppNameChange(nextName: string) {
    const normalizedName = nextName.trim() || DEFAULT_ADMIN_INGEST_ASSISTANT_NAME;

    setAppName(normalizedName);
    window.localStorage.setItem(ADMIN_INGEST_APP_NAME_STORAGE_KEY, normalizedName);
    setNoticeMessage(`应用名称已更新为 ${normalizedName}。`);
    showActionToast({
      type: "success",
      title: "应用名称已更新",
      description: normalizedName
    });
  }

  async function redirectToIngestLogin() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include"
      });
    } catch (error) {
      console.warn("[admin-ingest:account:logout]", error);
    }

    window.location.assign("/ingest/login?app=ingest-admin&next=/admin-ingest");
  }

  function handleAccountSettingAction(action: "password" | "switch" | "logout") {
    if (action === "password") {
      const message = "修改密码功能将在账号系统接入后启用。";

      setNoticeMessage(message);
      showActionToast({
        type: "info",
        title: message
      });
      return;
    }

    const message = action === "switch" ? "正在切换账号..." : "正在退出登录...";

    setNoticeMessage(message);
    showActionToast({
      type: "info",
      title: message
    });
    void redirectToIngestLogin();
  }

  function handleRailChange(nextKey: IngestRailKey) {
    if (nextKey === "settings" && openPanel === "settings") {
      setOpenPanel(null);
      setActiveRailKey("chat");
      setNoticeMessage("");
      return;
    }

    setActiveRailKey(nextKey);
    setErrorMessage("");
    setOpenPanel(nextKey === "notifications" || nextKey === "settings" ? nextKey : null);

    if (nextKey === "chat") {
      setMode("chat");
      setNoticeMessage("已切回 AI 对话投喂首页。");
      return;
    }

    const railMessages: Record<Exclude<IngestRailKey, "chat">, string> = {
      experts: "专家广场已打开，请添加专家到 Agent 后再开始对话投喂。",
      tasks: `训练记录 / 投喂任务摘要已打开，目前共 ${records.length} 条记录。`,
      files: uploadedFiles.length > 0
        ? `文件状态面板已打开，最近文件：${uploadedFiles[0].fileName}。`
        : "文件状态面板已打开，可通过文件上传或附件入口选择文件。",
      connections: `连接状态：企业空间 ${connectionStatus.enterpriseSpace}，知识库 ${connectionStatus.knowledgeBase}，卡密 ${connectionStatus.licenseStatus}。`,
      memory: `记忆 / 知识沉淀区已打开，最近保存知识：${draft.title}。`,
      lab: "实验功能区已打开：AI 修正 / OCR / 网址抓取将在下一阶段增强。",
      notifications: "通知中心已打开：最近投喂、保存、授权状态会在这里汇总。",
      settings: "账号设置已打开。"
    };

    if (nextKey === "memory") {
      setMode("memory");
    }

    setNoticeMessage(railMessages[nextKey]);
  }


  function restoreConversationState(conversation: IngestAgentConversation, agent: IngestChatAgent) {
    const restoredMessages = conversationMessagesById[conversation.id];

    if (!shouldRestoreToastFromHistory()) {
      setGptFallbackToast(null);
      setErrorMessage("");
    }
    setMessages(restoredMessages?.length
      ? normalizeRestoredMessages(restoredMessages)
      : createEmptyHistoryMessages({ conversation, agent, context: platformContext }));
    setDraft(conversationDraftsById[conversation.id] ?? ingestChatInitialDraft);
  }

  function clearConversationState() {
    if (!shouldRestoreToastFromHistory()) {
      setGptFallbackToast(null);
      setErrorMessage("");
    }
    setMessages([]);
    setDraft(ingestChatInitialDraft);
  }
  function handleAgentSelect(agentId: string) {
    const nextAgent = visibleAgents.find((agent) => agent.id === agentId);

    if (!nextAgent) {
      return;
    }

    const nextConversation = agentConversations.find((conversation) => (
      conversation.agentId === nextAgent.id
      && conversation.id === activeConversationId
      && conversation.status !== "archived"
    )) ?? agentConversations.find((conversation) => (
      conversation.agentId === nextAgent.id
      && conversation.status !== "archived"
    ));

    setCurrentAgent(nextAgent);
    setActiveRailKey("chat");
    setMode("chat");
    setActiveConversationId(nextConversation?.id ?? "");
    if (nextConversation) {
      restoreConversationState(nextConversation, nextAgent);
    } else {
      clearConversationState();
    }
    setIsAgentDetailOpen(false);
    setNoticeMessage(nextConversation
      ? `已切换到 ${nextAgent.name} · ${nextConversation.title}。`
      : `已切换到 ${nextAgent.name}。`);
  }

  function setCurrentAgent(agent: IngestChatAgent) {
    setActiveAgentId(agent.id);
    setOpenPanel(null);
    if (shouldClearTransientErrorOnAgentSwitch()) {
      setGptFallbackToast(null);
      setErrorMessage("");
    }
  }

  function createAgentLifecycleRecord(agent: IngestChatAgent, action: "archived" | "deleted_local"): IngestTrainingRecord {
    const now = new Date().toISOString();
    const title = action === "archived" ? "Agent 已归档" : "Agent 已移除";

    return {
      id: `record-agent-${action}-${Date.now()}`,
      jobId: null,
      tenantId,
      userId,
      agentId: agent.id,
      agentName: agent.name,
      input: `${title}：${agent.name}`,
      resultTitle: title,
      saveStatus: "待确认",
      category: agent.role,
      time: "刚刚",
      hits: 0,
      sourceType: "admin_ingest",
      source: "admin_ingest",
      platform: platformContext.platform,
      syncTarget: [...platformContext.syncTarget],
      createdAt: now,
      updatedAt: now,
      aiOutput: null
    };
  }

  function findVisibleAgent(agentId: string) {
    return visibleAgents.find((agent) => agent.id === agentId) ?? activeAgent;
  }

  function handleViewAgentDetail(agentId: string) {
    const target = findVisibleAgent(agentId);

    setCurrentAgent(target);
    setIsAgentDetailOpen(true);
    setNoticeMessage(`${target.name} 详情已打开。`);
  }

  function handleEditAgent(agentId = activeAgent.id) {
    const target = findVisibleAgent(agentId);

    setCurrentAgent(target);

    if (target.editableByIngestAdmin === false || target.managedBySuperAdmin) {
      setNoticeMessage("系统分类由超级管理员配置，编辑请到超级管理员后台处理。");
      return;
    }

    setNoticeMessage(`编辑 ${target.name} 入口已响应，下一阶段接入统一 Agent API。`);
  }

  function handleArchiveAgent(agentId = activeAgent.id) {
    const target = findVisibleAgent(agentId);

    setCurrentAgent(target);

    if (target.managedBySuperAdmin || target.editableByIngestAdmin === false) {
      setNoticeMessage("系统分类由超级管理员配置，不能在投喂端归档。");
      return;
    }

    setAgents((current) => current.map((agent) => agent.id === target.id
      ? { ...agent, status: "archived" as const }
      : agent));
    setRecords((current) => [createAgentLifecycleRecord(target, "archived"), ...current]);
    pushNotification({
      type: "info",
      title: "Agent 已归档",
      description: `${target.name} 已标记为已归档，未来可通过统一 Agent API 同步。`
    });

    if (activeAgentId === target.id) {
      setActiveAgentId("");
      setActiveConversationId("");
      setIsAgentDetailOpen(false);
    }

    setNoticeMessage(`${target.name} 已归档，三端同步字段已保留。`);
  }

  function handleRequestDeleteAgent(agentId = activeAgent.id) {
    const target = findVisibleAgent(agentId);

    setCurrentAgent(target);

    if (target.deletableByIngestAdmin !== true) {
      const message = "系统分类由超级管理员配置，不能在投喂端删除。";

      setNoticeMessage(message);
      showActionToast({
        type: "warning",
        title: message
      });
      return;
    }

    setDeleteCandidateAgent(target);
  }

  function handleConfirmDeleteAgent() {
    const target = deleteCandidateAgent;

    if (!target) {
      return;
    }

    if (target.deletableByIngestAdmin !== true) {
      setDeleteCandidateAgent(null);
      setNoticeMessage("系统分类由超级管理员配置，不能在投喂端删除。");
      return;
    }

    setAgents((current) => current.filter((agent) => agent.id !== target.id));
    setAgentConversations((current) => current.filter((conversation) => conversation.agentId !== target.id));
    setExpandedAgentIds((current) => current.filter((id) => id !== target.id));
    setExpandedConversationAgentIds((current) => current.filter((id) => id !== target.id));
    setPinnedAgentIds((current) => current.filter((id) => id !== target.id));
    setRecords((current) => [createAgentLifecycleRecord(target, "deleted_local"), ...current]);
    pushNotification({
      type: "fallback",
      title: "Agent 已从当前工作台移除",
      description: `${target.name} 已移除；已保存知识不会被删除，未来可在后台恢复或重新同步。`
    });

    if (activeAgentId === target.id) {
      setActiveAgentId("");
      setActiveConversationId("");
      setMessages([]);
    }

    setDeleteCandidateAgent(null);
    setIsAgentDetailOpen(false);
    setNoticeMessage(`${target.name} 已从当前投喂工作台移除，已新增训练记录。`);
  }

  function handleToggleAgentPinned(agentId: string) {
    const target = findVisibleAgent(agentId);
    const wasPinned = pinnedAgentIds.includes(agentId);

    setPinnedAgentIds((current) => wasPinned
      ? current.filter((id) => id !== agentId)
      : [agentId, ...current.filter((id) => id !== agentId)]);
    setNoticeMessage(wasPinned ? `${target.name} 已取消置顶。` : `${target.name} 已置顶。`);
    showActionToast({
      type: "success",
      title: wasPinned ? "已取消置顶" : "已置顶",
      description: target.name
    });
  }

  function handleToggleAgentExpanded(agentId: string) {
    setExpandedAgentIds((current) => current.includes(agentId)
      ? current.filter((id) => id !== agentId)
      : [...current, agentId]);
  }

  function handleToggleAgentConversationExpanded(agentId: string) {
    setExpandedConversationAgentIds((current) => current.includes(agentId)
      ? current.filter((id) => id !== agentId)
      : [...current, agentId]);
  }

  function handleSelectAgentConversation(agentId: string, conversationId: string) {
    const targetAgent = visibleAgents.find((agent) => agent.id === agentId);
    const targetConversation = agentConversations.find((conversation) => (
      conversation.id === conversationId
      && conversation.agentId === agentId
      && conversation.status !== "archived"
    ));

    if (!targetAgent || !targetConversation) {
      return;
    }

    setCurrentAgent(targetAgent);
    setActiveConversationId(targetConversation.id);
    restoreConversationState(targetConversation, targetAgent);
    setActiveRailKey("chat");
    setMode("chat");
    setNoticeMessage(`已打开 ${targetAgent.name} 下的对话：${targetConversation.title}。`);
  }

  function handleCreateAgentConversation(agentId: string) {
    const targetAgent = visibleAgents.find((agent) => agent.id === agentId);

    if (!targetAgent) {
      return;
    }

    const nextConversation = createAgentConversation({
      agent: targetAgent,
      platform: platformContext.platform,
      syncTarget: [...platformContext.syncTarget]
    });

    setAgentConversations((current) => [nextConversation, ...current]);
    setCurrentAgent(targetAgent);
    setActiveConversationId(nextConversation.id);
    setDraft(ingestChatInitialDraft);
    setMessages([]);
    setActiveRailKey("chat");
    setMode("chat");
    setNoticeMessage(`已为 ${targetAgent.name} 新建对话，可开始投喂。`);
    showActionToast({
      type: "success",
      title: "已新建对话",
      description: targetAgent.name
    });
  }

  function handleRenameAgentConversation(agentId: string, conversationId: string, title: string) {
    const nextTitle = title.trim();

    if (!nextTitle) {
      return;
    }

    setAgentConversations((current) => current.map((conversation) => conversation.agentId === agentId && conversation.id === conversationId
      ? {
        ...conversation,
        title: nextTitle,
        updatedAt: new Date().toISOString(),
        updatedLabel: "刚刚"
      }
      : conversation));

    setNoticeMessage(`已更新对话名称：${nextTitle}`);
    showActionToast({
      type: "success",
      title: "已更新对话名称",
      description: nextTitle
    });
  }

  function handleToggleAgentConversationPinned(agentId: string, conversationId: string) {
    const target = agentConversations.find((conversation) => (
      conversation.agentId === agentId
      && conversation.id === conversationId
      && conversation.status !== "archived"
    ));

    if (!target) {
      return;
    }

    const nextPinned = target.pinned !== true;

    setAgentConversations((current) => current.map((conversation) => (
      conversation.agentId === agentId && conversation.id === conversationId
        ? {
          ...conversation,
          pinned: nextPinned,
          updatedAt: new Date().toISOString(),
          updatedLabel: "刚刚"
        }
        : conversation
    )));
    setNoticeMessage(nextPinned ? `已置顶对话：${target.title}` : `已取消置顶：${target.title}`);
    showActionToast({
      type: "success",
      title: nextPinned ? "对话已置顶" : "已取消置顶",
      description: target.title
    });
  }

  function handleToggleAgentConversationArchived(agentId: string, conversationId: string) {
    const targetAgent = visibleAgents.find((agent) => agent.id === agentId);
    const target = agentConversations.find((conversation) => (
      conversation.agentId === agentId
      && conversation.id === conversationId
    ));

    if (!targetAgent || !target) {
      return;
    }

    const nextArchived = target.status !== "archived";
    const nextStatus = nextArchived ? "archived" as const : "active" as const;
    const nextActiveConversation = agentConversations.find((conversation) => (
      conversation.agentId === agentId
      && conversation.id !== conversationId
      && conversation.status !== "archived"
    ));

    setAgentConversations((current) => current.map((conversation) => (
      conversation.agentId === agentId && conversation.id === conversationId
        ? {
          ...conversation,
          status: nextStatus,
          pinned: nextArchived ? false : conversation.pinned,
          updatedAt: new Date().toISOString(),
          updatedLabel: "刚刚"
        }
        : conversation
    )));

    if (nextArchived && activeConversationId === conversationId) {
      setCurrentAgent(targetAgent);
      setActiveConversationId(nextActiveConversation?.id ?? "");
      if (nextActiveConversation) {
        restoreConversationState(nextActiveConversation, targetAgent);
      } else {
        clearConversationState();
      }
    }

    setNoticeMessage(nextArchived ? `已归档对话：${target.title}` : `已恢复对话：${target.title}`);
    showActionToast({
      type: "success",
      title: nextArchived ? "对话已归档" : "对话已恢复",
      description: target.title
    });
  }

  function getVisibleConversationMessages(conversationId: string) {
    const source = activeConversationId === conversationId
      ? messages
      : conversationMessagesById[conversationId] ?? [];

    return source
      .filter((message) => (
        (message.role === "user" || message.role === "assistant")
        && typeof message.content === "string"
        && message.content.trim()
        && message.isGenerating !== true
      ))
      .map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content
      }));
  }

  async function handleCreateAgentConversationPublicLink(
    agentId: string,
    conversationId: string,
    kind: "share" | "group"
  ) {
    const target = agentConversations.find((conversation) => (
      conversation.agentId === agentId
      && conversation.id === conversationId
    ));

    if (!target || isConversationLinkBusy) {
      return;
    }

    const visibleMessages = getVisibleConversationMessages(conversationId);

    if (visibleMessages.length === 0) {
      showActionToast({
        type: "warning",
        title: kind === "share" ? "当前对话暂无可分享正文" : "当前对话暂无可用于群聊的正文"
      });
      return;
    }

    const accessKey = kind === "share" ? "share" : "groupChat";
    const existingAccess = target.publicAccess?.[accessKey];

    setIsConversationLinkBusy(true);
    setNoticeMessage(kind === "share" ? "正在创建安全分享链接..." : "正在创建群聊邀请链接...");

    try {
      const response = await fetch(
        `/api/admin/ingest-conversations/${encodeURIComponent(conversationId)}/public-link`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind,
            title: target.title,
            token: existingAccess?.token,
            messages: visibleMessages
          })
        }
      );
      const payload = await response.json() as {
        data?: {
          token: string;
          url: string;
          status: "active" | "revoked";
          updatedAt: string;
        };
        message?: string;
      };

      if (!response.ok || !payload.data?.url) {
        throw new Error(payload.message || "公开链接创建失败。");
      }

      const nextAccess = {
        token: payload.data.token,
        url: payload.data.url,
        status: payload.data.status,
        updatedAt: payload.data.updatedAt
      };

      setAgentConversations((current) => current.map((conversation) => (
        conversation.id === conversationId && conversation.agentId === agentId
          ? {
            ...conversation,
            publicAccess: {
              ...conversation.publicAccess,
              [accessKey]: nextAccess
            }
          }
          : conversation
      )));
      setConversationLinkDialog({
        conversationId,
        kind,
        title: target.title,
        url: payload.data.url
      });
      setNoticeMessage(kind === "share" ? "安全分享链接已创建。" : "群聊邀请链接已创建。");
    } catch (error) {
      const message = error instanceof Error ? error.message : "公开链接创建失败。";

      setNoticeMessage(message);
      showActionToast({
        type: "warning",
        title: message
      });
    } finally {
      setIsConversationLinkBusy(false);
    }
  }

  async function handleRevokeAgentConversationPublicLink(state: IngestConversationLinkDialogState) {
    const target = agentConversations.find((conversation) => conversation.id === state.conversationId);
    const accessKey = state.kind === "share" ? "share" : "groupChat";
    const access = target?.publicAccess?.[accessKey];

    if (!target || !access?.token || isConversationLinkBusy) {
      return;
    }

    setIsConversationLinkBusy(true);

    try {
      const response = await fetch(
        `/api/admin/ingest-conversations/${encodeURIComponent(state.conversationId)}/public-link`,
        {
          method: "DELETE",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: access.token })
        }
      );
      const payload = await response.json() as { message?: string };

      if (!response.ok) {
        throw new Error(payload.message || "关闭公开链接失败。");
      }

      setAgentConversations((current) => current.map((conversation) => (
        conversation.id === state.conversationId
          ? {
            ...conversation,
            publicAccess: {
              ...conversation.publicAccess,
              [accessKey]: {
                ...access,
                status: "revoked" as const,
                updatedAt: new Date().toISOString()
              }
            }
          }
          : conversation
      )));
      setConversationLinkDialog(null);
      setNoticeMessage(state.kind === "share" ? "分享链接已关闭。" : "群聊已关闭。");
      showActionToast({
        type: "success",
        title: state.kind === "share" ? "已停止分享" : "群聊已关闭"
      });
    } catch (error) {
      showActionToast({
        type: "warning",
        title: error instanceof Error ? error.message : "关闭公开链接失败。"
      });
    } finally {
      setIsConversationLinkBusy(false);
    }
  }

  function handleDeleteAgentConversation(agentId: string, conversationId: string) {
    const targetAgent = visibleAgents.find((agent) => agent.id === agentId);
    const targetConversation = agentConversations.find((conversation) => conversation.agentId === agentId && conversation.id === conversationId);

    if (!targetAgent || !targetConversation) {
      return;
    }

    const hasActivePublicLink = targetConversation.publicAccess?.share?.status === "active"
      || targetConversation.publicAccess?.groupChat?.status === "active";

    if (hasActivePublicLink) {
      showActionToast({
        type: "warning",
        title: "请先停止分享或关闭群聊，再删除当前对话。"
      });
      return;
    }

    const remainingConversations = agentConversations.filter((conversation) => (
      conversation.agentId === agentId
      && conversation.id !== conversationId
      && conversation.status !== "archived"
    ));
    const nextConversation = remainingConversations[0];

    setAgentConversations((current) => current.filter((conversation) => conversation.id !== conversationId));
    setConversationMessagesById((current) => {
      const next = { ...current };
      delete next[conversationId];
      writeLocalJson(INGEST_CONVERSATION_MESSAGES_STORAGE_KEY, next);
      return next;
    });
    setConversationDraftsById((current) => {
      const next = { ...current };
      delete next[conversationId];
      writeLocalJson(INGEST_CONVERSATION_DRAFTS_STORAGE_KEY, next);
      return next;
    });

    if (activeConversationId === conversationId) {
      setCurrentAgent(targetAgent);
      setActiveConversationId(nextConversation?.id ?? "");
      if (nextConversation) {
        restoreConversationState(nextConversation, targetAgent);
      } else {
        clearConversationState();
      }
      setActiveRailKey("chat");
      setMode("chat");
    }

    setNoticeMessage(`已删除对话：${targetConversation.title}`);
    showActionToast({
      type: "success",
      title: "已删除对话",
      description: targetConversation.title
    });
  }

  function ensureConversationForSend(agent: IngestChatAgent) {
    const existing = agentConversations.find((conversation) => (
      conversation.id === activeConversationId
      && conversation.agentId === agent.id
      && conversation.status !== "archived"
    ));

    if (existing) {
      return existing.id;
    }

    const nextConversation = createAgentConversation({
      agent,
      platform: platformContext.platform,
      syncTarget: [...platformContext.syncTarget]
    });

    setAgentConversations((current) => [nextConversation, ...current]);
    setActiveConversationId(nextConversation.id);

    return nextConversation.id;
  }

  function markConversationUsed(conversationId: string, effectiveInput: string, attachmentFileName?: string) {
    const nextTitle = deriveConversationTitle(effectiveInput, attachmentFileName);
    const now = new Date().toISOString();

    setAgentConversations((current) => current.map((conversation) => conversation.id === conversationId
      ? {
        ...conversation,
        title: conversation.title === "新对话" ? nextTitle : conversation.title,
        updatedAt: now,
        updatedLabel: "刚刚",
        messageCount: Math.max(conversation.messageCount + 2, 2)
      }
      : conversation));
  }

  async function triggerMemoryExtraction(input: {
    conversationId: string;
    agentId: string;
    knowledgeBaseId?: string;
    messages: IngestConversationMessage[];
    latestAssistantReply: string;
    userInstruction: string;
    saveIntent?: boolean;
  }) {
    try {
      const response = await fetch("/api/admin/ingest-memory/extract", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          conversationId: input.conversationId,
          agentId: input.agentId,
          knowledgeBaseId: input.knowledgeBaseId,
          messages: input.messages.map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content
          })),
          latestAssistantReply: input.latestAssistantReply,
          userInstruction: input.userInstruction,
          saveIntent: input.saveIntent
        })
      });

      if (!response.ok) {
        console.warn("[admin-ingest-memory:extract:ignored]", {
          status: response.status,
          conversationId: input.conversationId
        });
        return;
      }

      setMemoryRefreshKey((current) => current + 1);
    } catch (error) {
      console.warn("[admin-ingest-memory:extract:ignored]", {
        message: error instanceof Error ? error.message : String(error ?? ""),
        conversationId: input.conversationId
      });
    }
  }

  async function prepareMemoryV2Context(input: {
    query: string;
    conversationId: string;
    agentId: string;
    knowledgeBaseId?: string;
    messages: IngestConversationMessage[];
  }): Promise<MemoryV2Trace> {
    const warnings: string[] = [];
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 2200);

    try {
      const response = await fetch("/api/admin/ingest-memory/prompt-preview", {
        method: "POST",
        credentials: "include",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query: input.query,
          conversationId: input.conversationId,
          agentId: input.agentId,
          knowledgeBaseId: input.knowledgeBaseId,
          messages: input.messages.map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content
          }))
        })
      });
      const data = await response.json() as MemoryPromptPreview & { message?: string };

      if (!response.ok || data.success === false || data.ok === false) {
        warnings.push(data.message || "MEMORY_V2_PREVIEW_FAILED");
        return { promptPreview: null, warnings };
      }

      return {
        promptPreview: data,
        warnings: data.warnings ?? []
      };
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : "MEMORY_V2_PREVIEW_ERROR");
      console.warn("[admin-ingest-memory:v2:preview:ignored]", {
        message: error instanceof Error ? error.message : String(error ?? "")
      });
      return {
        promptPreview: null,
        warnings
      };
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function handleSend(textOverride?: string, options?: IngestSendOptions): Promise<IngestActionResult | null> {
    const value = (textOverride ?? input).trim();
    const currentModelLabel = options?.modelLabel ?? selectedModelLabel;
    const requestModelOption = getIngestModelOptionByLabel(currentModelLabel) ?? selectedModelOption;

    if (!hasActiveAgent) {
      const message = "请先到专家广场添加专家 Agent。";

      setActiveRailKey("experts");
      setNoticeMessage(message);
      setErrorMessage("");
      showActionToast({
        type: "warning",
        title: message
      });
      return null;
    }

    if (
      requestModelOption.provider === "doubao-pro"
      && (
        doubaoInferencePaused
        || readLocalString(DOUBAO_INFERENCE_PAUSED_STORAGE_KEY) === "true"
      )
    ) {
      const message = "Doubao-Seed-2.1-pro 推理服务已暂停。请管理员恢复火山方舟推理限额，再点击失败卡片中的“检查豆包连接”；真实检查成功后才能继续发送。";
      setNoticeMessage(message);
      setErrorMessage("");
      showActionToast({
        type: "warning",
        title: "豆包推理服务已暂停",
        description: message
      });
      return null;
    }

    let composerUploads = resolveIngestSendAttachments(uploadedFiles, options?.retryAttachments);
    let draftAttachments = composerUploads.map((file) => ({
      ...stripUploadRuntimeFields(file),
      status: "attached" as const,
      agentId: activeAgent.id,
      tenantId,
      userId,
      platform: platformContext.platform,
      syncTarget: [...platformContext.syncTarget]
    }));
    let isWechatConversationReply = hasAdminIngestWechatConversationAttachment(draftAttachments);
    let wechatOutputMode = normalizeAdminIngestWechatOutputMode(
      draftAttachments.find((file) => file.recognitionMode === "wechat_conversation")?.wechatOutputMode
    );
    const baseInput = value || (draftAttachments.length > 0
      ? `附件投喂：${draftAttachments.map((file) => file.fileName).join("、")}`
      : "");
    const buildEffectiveInput = (isWechatConversation: boolean) => isWechatConversation
      ? [
        value || "请根据这张微信对话截图回复客户。",
        "固定规则：左侧头像或白色气泡是客户，右侧头像或绿色气泡是用户本人。",
        "右侧消息只作上下文；回答客户最后一个问题、顾虑或需要回应的话。",
        wechatOutputMode === "full_answer"
          ? "输出完整正文答案：根据当前微信对话和当前 Agent 知识库，完整说明沟通阶段、客户意图或顾虑、关键依据及可执行建议；存在推进需要时补充回复示例、下一步节奏和风险提醒。结构由模型按真实情况自适应决定，不得机械套用固定模板，也不得退化为只输出一段精准回复话术；不要输出 OCR 原文、知识来源、角色标签或模型信息。"
          : "只输出可直接发送给客户的答案正文，不要输出识别结果、分析、回复思路、标题、前言、角色标签或模型信息。"
      ].join("\n")
      : baseInput;
    let effectiveInput = buildEffectiveInput(isWechatConversationReply);

    if (!effectiveInput) {
      setNoticeMessage("请输入投喂任务或先选择附件后再发送。");
      setErrorMessage("");
      return null;
    }

    const conversationId = ensureConversationForSend(activeAgent);
    const sendAttemptAt = Date.now();
    const hasActiveConversationRequest = Boolean(conversationStateByIdRef.current[conversationId]?.activeRequestId)
      || !canStartRequest(requestQueueRef.current, conversationId);

    if (hasActiveConversationRequest) {
      if (isDuplicateSendAttempt(requestQueueRef.current, conversationId, sendAttemptAt)) {
        setNoticeMessage("上一条还在生成，已忽略重复点击。");
        setErrorMessage("");
        return null;
      }

      requestQueueRef.current = enqueueRequest(recordSendAttempt(requestQueueRef.current, conversationId, sendAttemptAt), {
        conversationId,
        prompt: effectiveInput,
        createdAt: sendAttemptAt
      });
      if (!options?.preserveComposer) {
        setInput(effectiveInput);
      }
      setNoticeMessage("上一条还在生成，请稍候。已保留最后一条输入，生成完成后可继续发送。");
      setErrorMessage("");
      return null;
    }

    if (
      platformContext.platform === "web"
      && composerUploads.some((file) => file.isImage && file.rawFile && !file.persistentUrl)
    ) {
      setIsParsing(true);
      setNoticeMessage("正在永久保存图片...");
      setErrorMessage("");

      try {
        composerUploads = await persistAdminIngestUploadImages(composerUploads);
        draftAttachments = composerUploads.map((file) => ({
          ...stripUploadRuntimeFields(file),
          status: "attached" as const,
          agentId: activeAgent.id,
          tenantId,
          userId,
          platform: platformContext.platform,
          syncTarget: [...platformContext.syncTarget]
        }));
        isWechatConversationReply = hasAdminIngestWechatConversationAttachment(draftAttachments);
        wechatOutputMode = normalizeAdminIngestWechatOutputMode(
          draftAttachments.find((file) => file.recognitionMode === "wechat_conversation")?.wechatOutputMode
        );
        effectiveInput = buildEffectiveInput(isWechatConversationReply);
      } catch (error) {
        const message = error instanceof Error ? error.message : "图片永久保存失败，请稍后重试。";

        setIsParsing(false);
        setNoticeMessage("");
        setErrorMessage(message);
        showActionToast({
          type: "warning",
          title: "图片未发送",
          description: message
        });
        return null;
      }
    }

    requestQueueRef.current = recordSendAttempt(requestQueueRef.current, conversationId, sendAttemptAt);
    const contextSourceMessages = excludeFailedIngestMessages(
      messages.length > 0 ? messages : conversationMessagesById[conversationId] ?? []
    );
    const requestId = createIngestRequestId();
    const assistantMessageId = `assistant-result-${requestId}`;
    const abortController = new AbortController();
    let conversationState = ensureConversationState(conversationStateByIdRef.current[conversationId], {
      conversationId,
      agentId: activeAgent.id,
      knowledgeBaseId: activeAgent.knowledgeBaseId ?? undefined,
      messages: toConversationStateMessages(contextSourceMessages, conversationId, activeAgent)
    });

    conversationState = {
      ...conversationState,
      messages: excludeFailedIngestMessages(conversationState.messages)
    };

    if (!options?.reuseUserMessageId) {
      conversationState = appendUserMessage(conversationState, {
        id: `user-${Date.now()}`,
        content: effectiveInput,
        requestId,
        meta: {
          model: currentModelLabel,
          provider: "admin_ingest"
        }
      });
    }

    const userMessageId = options?.reuseUserMessageId
      ?? conversationState.messages
        .filter((message) => message.role === "user" && message.requestId === requestId)
        .slice(-1)[0]?.id
      ?? `user-${Date.now()}`;
    conversationState = appendAssistantPlaceholder(conversationState, {
      id: assistantMessageId,
      requestId,
      meta: {
        model: currentModelLabel,
        provider: requestModelOption.provider
      }
    });
    conversationState = markRequestActive(conversationState, requestId);
    conversationStateByIdRef.current[conversationId] = conversationState;
    const isCurrentRequest = () => activeIngestRequestIdRef.current === requestId
      && !shouldIgnoreRequestResult(conversationStateByIdRef.current[conversationId], requestId);

    activeIngestRequestIdRef.current = requestId;
    requestQueueRef.current = startRequest(requestQueueRef.current, conversationId, requestId);
    abortControllerByConversationRef.current[conversationId] = abortController;
    ingestSuccessLockRef.current = false;
    markConversationUsed(conversationId, effectiveInput, draftAttachments[0]?.fileName);
    setIsParsing(true);
    setNoticeMessage(`${requestModelOption.label} 正在深度分析资料...`);
    setErrorMessage("");
    setGptFallbackToast(null);
    setActionToast(null);
    if (!options?.reuseUserMessageId) {
      setMessages((current) => [
        ...current.map(markMessageCompleted),
        {
          id: userMessageId,
          role: "user",
          content: value || (
            isWechatConversationReply
              ? wechatOutputMode === "full_answer"
                ? "微信截图识别并输出完整正文"
                : "微信截图识别并回复客户"
              : "附件投喂"
          ),
          time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
          attachments: draftAttachments,
          source: "admin_ingest",
          platform: platformContext.platform,
          syncTarget: [...platformContext.syncTarget],
          tenantId,
          userId,
          agentId: activeAgent.id,
          expertId: activeAgent.expertId ?? null,
          conversationId,
          agentName: activeAgent.name,
          expertName: activeAgent.expertId ? activeAgent.name : null,
          model: currentModelLabel,
          provider: "admin_ingest"
        }
      ]);
    }

    if (!options?.preserveComposer) {
      setInput("");
      setUploadedFiles([]);
    }

    let successRendered = false;
    let visibleReplyRendered = false;
    let visibleReplySnapshot = "";
    let resumableUploads = composerUploads;
    let outgoingAttachments: IngestUploadState[] = draftAttachments;

    try {
      if (composerUploads.length > 0) {
        const selectedFileModelProvider = requestModelOption.provider;

        if (selectedFileModelProvider !== "deepseek-pro" && selectedFileModelProvider !== "doubao-pro") {
          throw new Error("Web 投喂端附件解析仅支持当前选定的 DeepSeek Pro 或 Doubao Pro 模型。");
        }

        const preparedUploads = await parseUploadedFilesForGpt(composerUploads, 1, {
          modelProvider: selectedFileModelProvider,
          preferredModel: requestModelOption.defaultModel,
          selectedModelLabel: requestModelOption.label,
          strictModelAffinity: true
        }, {
          signal: abortController.signal,
          pageBatchSize: 4,
          onProgress: (progress) => {
            if (!isCurrentRequest()) {
              return;
            }

            const currentPage = progress.processedPageEnd ?? progress.processedPageStart ?? 0;
            const totalLabel = progress.totalPages > 0 ? String(progress.totalPages) : "未知";
            const qualityHint = progress.failedPages.length > 0 || progress.lowConfidencePages.length > 0
              ? `，失败 ${progress.failedPages.length} 页、低置信度 ${progress.lowConfidencePages.length} 页`
              : "";

            setNoticeMessage(
              progress.complete
                ? `「${progress.fileName}」已完成 ${currentPage}/${totalLabel} 页本地识别${qualityHint}，${requestModelOption.label} 正在整理正文...`
                : `正在本地识别「${progress.fileName}」：${currentPage}/${totalLabel} 页（${progress.coveragePercent.toFixed(1)}%）${qualityHint}`
            );
          }
        });
        resumableUploads = preparedUploads;

        outgoingAttachments = preparedUploads.map((file) => ({
          ...stripUploadRuntimeFields(file),
          status: file.status === "parsed" ? "attached" as const : "failed" as const,
          agentId: activeAgent.id,
          tenantId,
          userId,
          platform: platformContext.platform,
          syncTarget: [...platformContext.syncTarget]
        }));
        const parsedAsWechatConversation = hasAdminIngestWechatConversationAttachment(outgoingAttachments);

        if (!isWechatConversationReply && parsedAsWechatConversation) {
          isWechatConversationReply = true;
          wechatOutputMode = normalizeAdminIngestWechatOutputMode(
            outgoingAttachments.find((file) => file.recognitionMode === "wechat_conversation")?.wechatOutputMode
          );
          effectiveInput = buildEffectiveInput(true);
        }

        if (!isCurrentRequest()) {
          return null;
        }

        setMessages((current) => current.map((message) => message.id === userMessageId
          ? { ...message, attachments: outgoingAttachments }
          : message));
      }

      const attachmentEvidence = assessAdminIngestAttachmentEvidence(outgoingAttachments);

      if (attachmentEvidence.blocking) {
        throw new Error(`${ATTACHMENT_CONTENT_MISSING_CODE}: ${buildAttachmentContentMissingMessage(attachmentEvidence)}`);
      }

      const memoryV2Trace: MemoryV2Trace = isWechatConversationReply
        ? {
            promptPreview: null,
            warnings: ["WECHAT_DIRECT_REPLY_SKIPPED_MEMORY_PREVIEW"]
          }
        : await prepareMemoryV2Context({
            query: effectiveInput,
            conversationId,
            agentId: activeAgent.id,
            knowledgeBaseId: activeAgent.knowledgeBaseId ?? undefined,
            messages: conversationState.messages
          });
      const memoryV2Preview = memoryV2Trace.promptPreview;
      const contextPayload = buildIngestContextPayload({
        conversationId,
        agentId: activeAgent.id,
        knowledgeBaseId: activeAgent.knowledgeBaseId ?? undefined,
        messages: isWechatConversationReply ? [] : conversationState.messages,
        prompt: effectiveInput,
        maxMessages: 12,
        maxChars: MAX_INGEST_CONTEXT_CHARS,
        memoryContextText: memoryV2Preview?.memoryContextText,
        usedMemoryIds: memoryV2Preview?.usedMemoryIds,
        agentLearningInstruction: memoryV2Preview?.agentLearningInstruction
      });
      const recentMessages = contextPayload.messages.map((message) => ({
        ...message,
        model: null,
        provider: null
      }));
      const previousKnowledgeDrafts = isWechatConversationReply
        ? []
        : toPreviousKnowledgeDrafts(draft);

      let attempt = 0;
      let result: IngestActionResult;

      while (true) {
        try {
          result = await sendCoreIngest({
            text: effectiveInput,
            agent: activeAgent,
            category: activeAgent.role,
            model: requestModelOption.label,
            modelProvider: requestModelOption.provider,
            gptTier: requestModelOption.provider === "openai" ? selectedGptModel.tier : undefined,
            gptTierLabel: requestModelOption.provider === "openai" ? selectedGptModel.tierLabel : undefined,
            gptVersion: requestModelOption.provider === "openai" ? selectedGptModel.version : undefined,
            selectedModelLabel: requestModelOption.label,
            tenantId,
            userId,
            attachments: outgoingAttachments,
            recentMessages,
            contextSummary: contextPayload.contextSummary,
            memoryContextText: contextPayload.memoryContextText,
            agentLearningInstruction: contextPayload.agentLearningInstruction,
            usedMemoryIds: contextPayload.usedMemoryIds,
            previousKnowledgeDrafts,
            recentTrainingRecords: isWechatConversationReply
              ? []
              : records.slice(0, 6).map((record) => ({
                  input: record.input,
                  resultTitle: record.resultTitle,
                  category: record.category,
                  saveStatus: record.saveStatus
                })),
            autonomous: {
              enabled: autonomousEnabled,
              mode: autonomousEnabled ? "execute_safe" : "plan_only"
            },
            platform: platformContext.platform,
            skipHealthPreflight: isWechatConversationReply,
            streaming: {
              signal: abortController.signal,
              onVisibleReply: (event) => {
                if (
                  event.requestId !== requestId
                  || !isCurrentRequest()
                  || shouldIgnoreRequestResult(conversationStateByIdRef.current[conversationId], requestId)
                ) {
                  return;
                }

                visibleReplySnapshot = event.replyMarkdown;
                visibleReplyRendered = true;
                conversationStateByIdRef.current[conversationId] = updateAssistantMessage(
                  conversationStateByIdRef.current[conversationId],
                  {
                    requestId,
                    messageId: assistantMessageId,
                    content: event.replyMarkdown,
                    meta: {
                      provider: "doubao-pro",
                      model: event.actualModel ?? currentModelLabel,
                      metadataState: "pending"
                    }
                  }
                );
                setMessages((current) => replaceIngestRetryOutcome(
                  current.map(markMessageCompleted),
                  options?.failedMessageId,
                  {
                    id: assistantMessageId,
                    role: "assistant",
                    content: event.replyMarkdown,
                    time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
                    source: "admin_ingest",
                    platform: platformContext.platform,
                    syncTarget: [...platformContext.syncTarget],
                    tenantId,
                    userId,
                    agentId: activeAgent.id,
                    expertId: activeAgent.expertId ?? null,
                    conversationId,
                    agentName: activeAgent.name,
                    expertName: activeAgent.expertId ? activeAgent.name : null,
                    model: event.actualModel ?? currentModelLabel,
                    provider: "doubao-pro",
                    metadataState: "pending",
                    isRestored: false,
                    isHistorical: false,
                    isStreaming: true,
                    isGenerating: true,
                    typing: false,
                    status: "streaming"
                  }
                ));
                setNoticeMessage("正文已生成，正在用同一个豆包模型整理知识草稿...");
                setErrorMessage("");
              },
              onStatus: (event) => {
                if (!isCurrentRequest()) {
                  return;
                }

                if (event.type === "rate_limit_wait") {
                  const waitSeconds = Math.max(1, Math.ceil((event.retryAfterMs ?? 0) / 1000));
                  setNoticeMessage(`豆包限流排队中，预计 ${waitSeconds} 秒后使用同模型重试...`);
                  return;
                }

                if (event.type === "queue_wait") {
                  setNoticeMessage(`豆包请求正在排队（前方 ${event.queueDepth ?? 0} 个任务）...`);
                  return;
                }

                if (
                  event.type === "metadata_status"
                  && event.state === "deferred"
                  && event.failureCode?.trim().toUpperCase() === "DOUBAO_INFERENCE_LIMIT_PAUSED"
                ) {
                  doubaoHealthRequestVersionRef.current += 1;
                  setDoubaoInferencePaused(true);
                  writeLocalJson(DOUBAO_INFERENCE_PAUSED_STORAGE_KEY, true);
                  setUnavailableModelProviders((current) => Array.from(new Set([...current, "doubao-pro"])));
                  setNoticeMessage("正文已按豆包原文保留；豆包推理服务已暂停，后台知识草稿暂缓入库。管理员恢复限额后，请点击“检查豆包连接”。");
                  return;
                }

                if (event.state === "pending" && visibleReplyRendered) {
                  setNoticeMessage("正文已生成，正在用同一个豆包模型整理知识草稿...");
                } else if (event.state === "deferred" && visibleReplyRendered) {
                  setNoticeMessage("正文已生成，后台知识草稿暂缓入库。");
                }
              }
            },
            requestId,
            conversationId: contextPayload.conversationId,
            knowledgeBaseId: contextPayload.knowledgeBaseId
          });
          break;
        } catch (retryError) {
          if (readAttachmentEvidenceErrorMessage(retryError)) {
            throw retryError;
          }

          const retryRequestError = readAdminIngestRequestError(retryError);
          const canRetryWechatTimeout = isWechatConversationReply
            && !visibleReplyRendered
            && shouldRetryAdminIngestWechatModelTimeout({
              attempt,
              modelProvider: requestModelOption.provider,
              errorCode: retryRequestError?.errorCode,
              causeCode: retryRequestError?.causeCode
            });
          const canRetry = attempt < 1
            && !abortController.signal.aborted
            && isCurrentRequest()
            && isRetryableIngestError(retryError)
            && (canRetryWechatTimeout || !isStrictSelectedModelFailure(retryError));

          if (!canRetry) {
            throw retryError;
          }

          attempt += 1;
          const retryDelayMs = getRetryDelayMs(attempt);

          if (canRetryWechatTimeout) {
            setNoticeMessage(`${requestModelOption.label} 首次等待超时，正在使用同一个模型自动重试...`);
          }

          console.warn("[admin-ingest:gpt:retry]", {
            requestId,
            requestAttemptId: createIngestRequestAttemptId(requestId, attempt),
            conversationId,
            retryDelayMs
          });
          await new Promise((resolve) => window.setTimeout(resolve, retryDelayMs));
        }
      }

      if (!isCurrentRequest()) {
        return null;
      }

      if (shouldIgnoreRequestResult(conversationStateByIdRef.current[conversationId], requestId)) {
        return null;
      }

      const nextRecords = mergeTrainingRecords(result.records, records);
      const successAt = Date.now();
      const fallbackActualModel = result.fallbackUsed
        ? getIngestModelOptionByProvider(result.actualProvider ?? result.provider)
        : null;
      const fallbackDescription = fallbackActualModel
        ? `${currentModelLabel} 暂时不可用，本次已由 ${fallbackActualModel.label} 生成。`
        : "";
      const assistantContent = result.replyMarkdown || (result.preview
        ? `${result.message} 已生成投喂大脑草稿：${result.draft.title}。`
        : `已完成统一投喂链路：AI解析 → 结构化为「${result.draft.title}」→ 分类到「${result.draft.category}」→ 训练记录已更新。`);
      const isDoubaoResult = result.provider === "doubao" || result.provider === "doubao-pro";
      const metadataInferencePaused = isDoubaoResult
        && result.diagnostics.includes("doubao:metadataFailureCode:DOUBAO_INFERENCE_LIMIT_PAUSED");
      const metadataState: IngestChatMessage["metadataState"] = isDoubaoResult
        ? result.diagnostics.includes("doubao:metadataCompleted:true") ? "ready" : "unavailable"
        : undefined;
      const metadataPausedNotice = "正文已按豆包原文保留；豆包推理服务已暂停，后台知识草稿暂缓入库。管理员恢复限额后，请点击“检查豆包连接”。";

      if (visibleReplyRendered && assistantContent !== visibleReplySnapshot) {
        throw new Error("DOUBAO_RESPONSE_PARSE_FAILED: 豆包可见正文与最终正文不一致，已保留先前原文。");
      }

      let nextConversationState = updateAssistantMessage(conversationStateByIdRef.current[conversationId], {
        requestId,
        messageId: assistantMessageId,
        content: assistantContent,
        meta: {
          provider: result.provider,
          model: result.model ?? currentModelLabel,
          requestedProvider: result.requestedProvider,
          actualProvider: result.actualProvider ?? result.provider,
          requestedModel: result.requestedModel,
          actualModel: result.actualModel,
          fallbackUsed: result.fallbackUsed,
          metadataState,
          memoryV2: {
            usedMemoryIds: memoryV2Preview?.usedMemoryIds ?? [],
            recalledMemoryIds: memoryV2Preview?.debug?.recalledMemoryIds ?? memoryV2Preview?.retrievedMemories?.map((item) => item.memory.id) ?? [],
            memoryParticipated: memoryV2Preview?.debug?.memoryParticipated ?? Boolean(memoryV2Preview?.usedMemoryIds?.length),
            appliedPolicies: memoryV2Preview?.appliedPolicies ?? [],
            warnings: [...memoryV2Trace.warnings, ...(memoryV2Preview?.warnings ?? [])]
          }
        }
      });
      nextConversationState = completeAssistantMessage(nextConversationState, {
        requestId,
        messageId: assistantMessageId,
        content: assistantContent,
        meta: {
          provider: result.provider,
          model: result.model ?? currentModelLabel,
          requestedProvider: result.requestedProvider,
          actualProvider: result.actualProvider ?? result.provider,
          requestedModel: result.requestedModel,
          actualModel: result.actualModel,
          fallbackUsed: result.fallbackUsed,
          draftTitle: result.draft.title,
          metadataState,
          memoryV2: {
            usedMemoryIds: memoryV2Preview?.usedMemoryIds ?? [],
            recalledMemoryIds: memoryV2Preview?.debug?.recalledMemoryIds ?? memoryV2Preview?.retrievedMemories?.map((item) => item.memory.id) ?? [],
            memoryParticipated: memoryV2Preview?.debug?.memoryParticipated ?? Boolean(memoryV2Preview?.usedMemoryIds?.length),
            appliedPolicies: memoryV2Preview?.appliedPolicies ?? [],
            warnings: [...memoryV2Trace.warnings, ...(memoryV2Preview?.warnings ?? [])]
          }
        }
      });
      conversationStateByIdRef.current[conversationId] = nextConversationState;

      ingestSuccessLockRef.current = true;
      lastSuccessfulIngestAtRef.current = successAt;
      lastSuccessfulIngestRequestIdRef.current = requestId;
      suppressFallbackToastUntilRef.current = successAt + INGEST_SUCCESS_TOAST_SUPPRESS_MS;

      setDraft(result.draft);
      setRecords(nextRecords);
      setResolvedModel(result.model ?? currentModelLabel);
      setLastInput(effectiveInput);
      setGptFallbackToast(fallbackDescription ? {
        id: `model-fallback-${Date.now()}`,
        title: "已切换备用模型完成本次生成",
        description: fallbackDescription
      } : null);
      setErrorMessage("");
      setNoticeMessage(metadataInferencePaused
        ? metadataPausedNotice
        : fallbackDescription || `${result.message} · 当前模型：${result.model ?? currentModelLabel} · 已携带 Web / EXE / APK 同步字段`);
      setMessages((current) => replaceIngestRetryOutcome(
        current.map(markMessageCompleted),
        options?.failedMessageId,
        {
          id: assistantMessageId,
          role: "assistant",
          content: assistantContent,
          time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
          source: "admin_ingest",
          platform: platformContext.platform,
          syncTarget: [...platformContext.syncTarget],
          tenantId,
          userId,
          agentId: activeAgent.id,
          expertId: activeAgent.expertId ?? null,
          conversationId,
          agentName: activeAgent.name,
          expertName: activeAgent.expertId ? activeAgent.name : null,
          model: result.model ?? currentModelLabel,
          provider: result.provider,
          metadataState,
          saveSuggestion: result.saveSuggestion,
          gptProof: result.gptProof,
          gptOS: result.draft.gptOS,
          ...({
            memoryV2: {
              usedMemoryIds: memoryV2Preview?.usedMemoryIds ?? [],
              recalledMemoryIds: memoryV2Preview?.debug?.recalledMemoryIds ?? memoryV2Preview?.retrievedMemories?.map((item) => item.memory.id) ?? [],
              memoryParticipated: memoryV2Preview?.debug?.memoryParticipated ?? Boolean(memoryV2Preview?.usedMemoryIds?.length),
              appliedPolicies: memoryV2Preview?.appliedPolicies ?? [],
              warnings: [...memoryV2Trace.warnings, ...(memoryV2Preview?.warnings ?? [])]
            }
          } as Partial<IngestChatMessage> & {
            memoryV2: {
              usedMemoryIds: string[];
              recalledMemoryIds: string[];
              memoryParticipated: boolean;
              appliedPolicies: string[];
              warnings: string[];
            };
          }),
          isRestored: false,
          isHistorical: false,
          isStreaming: false,
          isGenerating: false,
          typing: false,
          status: "completed"
        }
      ));
      successRendered = true;
      console.info("[admin-ingest:gpt:success]", {
        provider: result.provider,
        actualModel: result.actualModel ?? result.model,
        contentLength: (result.replyMarkdown || result.draft.summary || result.message || "").length,
        requestId
      });
      pushNotification({
        type: metadataInferencePaused || fallbackDescription ? "fallback" : "success",
        title: metadataInferencePaused
          ? "豆包正文已保留，推理服务已暂停"
          : fallbackDescription ? "备用模型已完成本次投喂" : "最近投喂完成",
        description: metadataInferencePaused
          ? metadataPausedNotice
          : fallbackDescription || (outgoingAttachments.length > 0
            ? `${outgoingAttachments.length} 个附件已加入投喂队列，结构化结果为「${result.draft.title}」。`
            : `结构化结果「${result.draft.title}」已生成，训练记录已刷新。`)
      });
      if (metadataState !== "unavailable" && !isWechatConversationReply) {
        void triggerMemoryExtraction({
          conversationId,
          agentId: activeAgent.id,
          knowledgeBaseId: activeAgent.knowledgeBaseId ?? undefined,
          messages: nextConversationState.messages,
          latestAssistantReply: assistantContent,
          userInstruction: effectiveInput
        });
      }

      return {
        ...result,
        records: nextRecords
      };
    } catch (error) {
      if (shouldIgnoreRequestError(conversationStateByIdRef.current[conversationId], requestId) || !isCurrentRequest()) {
        return null;
      }

      const requestError = readAdminIngestRequestError(error);
      const stateDomain = getStateDomain(error);
      const errorCode = requestError?.errorCode ?? (error instanceof Error ? error.name : undefined);
      const causeCode = requestError?.causeCode;
      const responseStatus = requestError?.status;
      const rawErrorMessage = error instanceof Error ? error.message : String(error ?? "");
      const attachmentEvidenceMessage = readAttachmentEvidenceErrorMessage(error);
      if (causeCode?.trim().toUpperCase() === "DOUBAO_INFERENCE_LIMIT_PAUSED") {
        doubaoHealthRequestVersionRef.current += 1;
        setDoubaoInferencePaused(true);
        writeLocalJson(DOUBAO_INFERENCE_PAUSED_STORAGE_KEY, true);
        setUnavailableModelProviders((current) => Array.from(new Set([...current, "doubao-pro"])));
      }
      conversationStateByIdRef.current[conversationId] = failAssistantMessage(conversationStateByIdRef.current[conversationId], {
        requestId,
        message: attachmentEvidenceMessage || rawErrorMessage
      });
      const cancelledUploads = error instanceof AdminIngestFileParseCancelledError
        ? error.files
        : resumableUploads;

      if (!options?.preserveComposer) {
        setInput((current) => current || value);
        setUploadedFiles((current) => current.length > 0 ? current : cancelledUploads);
      }

      if (visibleReplyRendered && visibleReplySnapshot) {
        conversationStateByIdRef.current[conversationId] = completeAssistantMessage(
          conversationStateByIdRef.current[conversationId],
          {
            requestId,
            messageId: assistantMessageId,
            content: visibleReplySnapshot,
            meta: {
              provider: "doubao-pro",
              model: currentModelLabel,
              metadataState: "unavailable",
              warning: rawErrorMessage
            }
          }
        );
        setMessages((current) => replaceIngestRetryOutcome(
          current,
          options?.failedMessageId,
          {
            id: assistantMessageId,
            role: "assistant",
            content: visibleReplySnapshot,
            time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
            source: "admin_ingest",
            platform: platformContext.platform,
            syncTarget: [...platformContext.syncTarget],
            tenantId,
            userId,
            agentId: activeAgent.id,
            expertId: activeAgent.expertId ?? null,
            conversationId,
            agentName: activeAgent.name,
            expertName: activeAgent.expertId ? activeAgent.name : null,
            model: currentModelLabel,
            provider: "doubao-pro",
            metadataState: "unavailable",
            saveSuggestion: false,
            isRestored: false,
            isHistorical: false,
            isStreaming: false,
            isGenerating: false,
            typing: false,
            status: "completed"
          }
        ));
        successRendered = true;
        setGptFallbackToast(null);
        setNoticeMessage("豆包正文已完整保留，后台知识草稿本轮暂缓入库，可继续阅读或重新发送。");
        setErrorMessage("");
        return null;
      }

      if (abortController.signal.aborted) {
        setGptFallbackToast(null);
        setNoticeMessage("已停止本轮附件识别与生成；输入内容和附件已保留，可继续修改或重试。");
        setErrorMessage("");
        showActionToast({
          type: "info",
          title: "本轮投喂已停止，内容已保留。"
        });
        return null;
      }

      if (attachmentEvidenceMessage) {
        console.warn("[admin-ingest:attachment-evidence:warning]", {
          requestId,
          attachmentCount: draftAttachments.length
        });
        setGptFallbackToast(null);
        setNoticeMessage(attachmentEvidenceMessage);
        setErrorMessage(attachmentEvidenceMessage);
        showActionToast({
          type: "warning",
          title: "附件证据不足，已停止本轮分析。"
        });
        return null;
      }

      const shouldSuppress = shouldSuppressFallbackToast({
        reason: rawErrorMessage,
        stateDomain,
        requestId,
        activeRequestId: activeIngestRequestIdRef.current,
        hasCurrentSuccess: successRendered || ingestSuccessLockRef.current,
        lastSuccessfulAt: lastSuccessfulIngestAtRef.current,
        suppressUntil: suppressFallbackToastUntilRef.current,
        status: responseStatus,
        errorCode,
        causeCode,
        retryable: requestError?.retryable
      });

      if (successRendered || shouldSuppress) {
        console.warn("[admin-ingest:gpt:toast-suppressed]", {
          reason: rawErrorMessage,
          status: responseStatus,
          errorCode,
          causeCode,
          requestId,
          hasCurrentSuccess: successRendered || ingestSuccessLockRef.current,
          stateDomain
        });
        setGptFallbackToast(null);
        setErrorMessage("");
        return null;
      }

      const authAccessMessage = getAuthAccessErrorMessage(error);

      if (authAccessMessage) {
        console.warn("[admin-ingest:auth-access:error]", {
          message: authAccessMessage,
          rawMessage: error instanceof Error ? error.message : String(error ?? ""),
          requestId
        });
        setGptFallbackToast(null);
        setNoticeMessage(authAccessMessage);
        setErrorMessage(authAccessMessage);
        showActionToast({
          type: "warning",
          title: authAccessMessage
        });
        return null;
      }

      const modelHealthMessage = getModelHealthWarningMessage(error);

      if (modelHealthMessage) {
        console.warn("[admin-ingest:model-health:warning]", {
          message: modelHealthMessage,
          rawMessage: error instanceof Error ? error.message : String(error ?? ""),
          requestId
        });
        setGptFallbackToast(null);
        setNoticeMessage(modelHealthMessage);
        setErrorMessage("");
        showActionToast({
          type: "info",
          title: modelHealthMessage
        });
        return null;
      }

      const failurePresentation = buildAdminIngestFailurePresentation(error, currentModelLabel);
      const message = failurePresentation.message;

      console.error("[admin-ingest:gpt:error]", {
        url: "/api/admin/kb/ingest/gpt",
        status: responseStatus,
        errorCode,
        causeCode,
        message,
        provider: requestModelOption.provider,
        model: currentModelLabel,
        fallbackUsed: requestError?.fallbackUsed,
        requestId
      });
      const realIngestFailure = isRealIngestFailure({
        reason: error instanceof Error ? error.message : String(error ?? ""),
        stateDomain,
        requestId,
        activeRequestId: activeIngestRequestIdRef.current,
        hasCurrentSuccess: successRendered || ingestSuccessLockRef.current,
        lastSuccessfulAt: lastSuccessfulIngestAtRef.current,
        suppressUntil: suppressFallbackToastUntilRef.current,
        status: responseStatus,
        errorCode,
        causeCode,
        retryable: failurePresentation.retryable
      });

      if (!realIngestFailure) {
        console.warn("[admin-ingest:gpt:error:ignored]", {
          reason: "not_real_ingest_failure",
          status: responseStatus,
          errorCode,
          causeCode,
          requestId,
          stateDomain
        });
        setGptFallbackToast(null);
        setErrorMessage("");
        setNoticeMessage("已忽略非当前投喂请求的临时状态。");
        return null;
      }

      // The persistent failure card is the single source of truth for generation failures.
      setGptFallbackToast(null);
      setMessages((current) => replaceIngestRetryOutcome(
        current,
        options?.failedMessageId,
        {
          id: `assistant-failed-${requestId}`,
          role: "assistant",
          content: message,
          time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
          source: "admin_ingest",
          platform: platformContext.platform,
          syncTarget: [...platformContext.syncTarget],
          tenantId,
          userId,
          agentId: activeAgent.id,
          expertId: activeAgent.expertId ?? null,
          conversationId,
          agentName: activeAgent.name,
          expertName: activeAgent.expertId ? activeAgent.name : null,
          model: currentModelLabel,
          provider: requestModelOption.provider,
          failureMeta: {
            title: failurePresentation.title,
            errorCode,
            causeCode,
            retryable: failurePresentation.retryable,
            requestedModel: requestError?.requestedModel,
            actualModel: requestError?.actualModel,
            fallbackUsed: requestError?.fallbackUsed,
            retryAfterMs: failurePresentation.retryAfterMs,
            retryAt: typeof failurePresentation.retryAfterMs === "number"
              ? Date.now() + failurePresentation.retryAfterMs
              : undefined
          },
          isRestored: false,
          isHistorical: false,
          isStreaming: false,
          isGenerating: false,
          typing: false,
          status: "failed"
        }
      ));
      setNoticeMessage(message);
      setErrorMessage(message);
      return null;
    } finally {
      if (successRendered) {
        requestQueueRef.current = completeRequest(requestQueueRef.current, conversationId, requestId);
      } else {
        requestQueueRef.current = failRequest(requestQueueRef.current, conversationId, requestId);
      }
      if (abortControllerByConversationRef.current[conversationId] === abortController) {
        delete abortControllerByConversationRef.current[conversationId];
      }
      const queuedRequest = getNextQueuedRequest(requestQueueRef.current, conversationId);

      if (queuedRequest) {
        setInput((current) => current || queuedRequest.prompt);
      }

      if (activeIngestRequestIdRef.current === requestId || shouldResetLoading(conversationStateByIdRef.current[conversationId], requestId)) {
        setIsParsing(false);
        if (activeIngestRequestIdRef.current === requestId) {
          activeIngestRequestIdRef.current = "";
        }
      }
    }
  }

  async function handleRetryFailedMessage(failedMessageId: string, prompt: string) {
    if (isParsing) {
      setNoticeMessage("上一条还在生成，请稍候再重试。");
      return null;
    }

    const failedMessageIndex = messages.findIndex((message) => message.id === failedMessageId);
    const failedMessage = failedMessageIndex >= 0 ? messages[failedMessageIndex] : null;
    const previousUserMessage = failedMessageIndex > 0
      ? messages.slice(0, failedMessageIndex).reverse().find((message) => message.role === "user")
      : null;

    if (!failedMessage || !previousUserMessage || !prompt.trim()) {
      setNoticeMessage("未找到可重试的原始问题，请重新发送一次。");
      return null;
    }

    if (failedMessage.failureMeta?.retryable !== true) {
      setNoticeMessage("本轮错误不支持直接重试，请先检查模型连接配置或调整输入。");
      return null;
    }

    if (
      typeof failedMessage.failureMeta.retryAt === "number"
      && failedMessage.failureMeta.retryAt > Date.now()
    ) {
      const waitSeconds = Math.max(1, Math.ceil((failedMessage.failureMeta.retryAt - Date.now()) / 1000));
      setNoticeMessage(`豆包限流等待中，请在 ${waitSeconds} 秒后使用同模型重试。`);
      return null;
    }

    const retryAttachments: IngestUploadState[] = (previousUserMessage.attachments ?? []).map((file) => ({
      ...file
    }));

    return handleSend(prompt, {
      reuseUserMessageId: previousUserMessage.id,
      failedMessageId,
      retryAttachments,
      modelLabel: failedMessage.model ?? selectedModelLabel,
      preserveComposer: true
    });
  }

  async function handleRetryDoubaoMetadata(
    messageId: string,
    prompt: string,
    replyMarkdown: string
  ) {
    if (isParsing || recoveringMetadataMessageId) {
      setNoticeMessage("当前已有模型任务进行中，请稍候再重新整理知识草稿。");
      return null;
    }

    const currentMessages = messagesRef.current;
    const targetMessage = currentMessages.find((message) => message.id === messageId);
    const latestAssistantResult = [...currentMessages].reverse().find((message) =>
      message.role === "assistant" && message.id.startsWith("assistant-result")
    );
    const currentDraft = draftRef.current;
    const sourceResponseId = targetMessage?.gptProof?.responseId?.trim() ?? "";
    const provider = targetMessage?.provider?.trim().toLowerCase();
    const conversationId = activeConversationIdRef.current;

    if (
      !targetMessage
      || latestAssistantResult?.id !== messageId
      || targetMessage.role !== "assistant"
      || !targetMessage.id.startsWith("assistant-result")
      || targetMessage.metadataState !== "unavailable"
      || (provider !== "doubao" && provider !== "doubao-pro")
      || !currentDraft.jobId
      || !currentDraft.responseId
      || sourceResponseId !== currentDraft.responseId
      || currentDraft.replyMarkdown !== targetMessage.content
      || targetMessage.content !== replyMarkdown
      || targetMessage.agentId !== activeAgent.id
      || (targetMessage.conversationId && targetMessage.conversationId !== conversationId)
      || !prompt.trim()
    ) {
      setNoticeMessage("当前正文与待确认任务无法安全匹配，请刷新当前对话后再试。");
      return null;
    }

    const expectedAgentId = activeAgent.id;
    const expectedConversationId = conversationId;
    const expectedJobId = currentDraft.jobId;
    const expectedReply = targetMessage.content;
    const expectedResponseId = currentDraft.responseId;
    const controller = new AbortController();

    setRecoveringMetadataMessageId(messageId);
    setErrorMessage("");
    setNoticeMessage("豆包正文保持不变，正在用同一个模型重新整理知识草稿...");

    try {
      const result = await retryDoubaoKnowledgeDraftMetadata({
        originalInput: prompt,
        replyMarkdown: expectedReply,
        sourceResponseId: expectedResponseId,
        messageId,
        draft: currentDraft,
        agent: activeAgent,
        tenantId,
        userId,
        platform: platformContext.platform,
        signal: controller.signal
      });

      if (
        activeAgentIdRef.current !== expectedAgentId
        || activeConversationIdRef.current !== expectedConversationId
        || draftRef.current.jobId !== expectedJobId
        || draftRef.current.responseId !== expectedResponseId
        || result.jobId !== expectedJobId
        || result.sourceResponseId !== expectedResponseId
        || result.replyMarkdown !== expectedReply
      ) {
        setNoticeMessage("知识草稿已在后台恢复，但当前页面已切换，请返回原对话查看。");
        return null;
      }

      const latestTarget = messagesRef.current.find((message) => message.id === messageId);

      if (
        !latestTarget
        || latestTarget.content !== expectedReply
        || latestTarget.metadataState !== "unavailable"
      ) {
        setNoticeMessage("当前消息状态已变化，未覆盖页面中的知识草稿。");
        return null;
      }

      const nextMessages = messagesRef.current.map((message) => message.id === messageId
        ? {
            ...message,
            metadataState: "ready" as const,
            saveSuggestion: result.draft.recommendation === "建议入库"
          }
        : message);
      messagesRef.current = nextMessages;
      setMessages(nextMessages);
      setDraft(result.draft);
      draftRef.current = result.draft;
      setRecords((current) => mergeTrainingRecords(result.records, current));

      const conversationState = conversationStateByIdRef.current[expectedConversationId];

      if (conversationState) {
        conversationStateByIdRef.current[expectedConversationId] = {
          ...conversationState,
          messages: conversationState.messages.map((message) => message.id === messageId
            ? {
                ...message,
                content: expectedReply,
                meta: {
                  ...message.meta,
                  metadataState: "ready",
                  saveSuggestion: result.draft.recommendation === "建议入库"
                },
                updatedAt: Date.now()
              }
            : message),
          updatedAt: Date.now()
        };
      }

      doubaoHealthRequestVersionRef.current += 1;
      setDoubaoInferencePaused(false);
      writeLocalJson(DOUBAO_INFERENCE_PAUSED_STORAGE_KEY, false);
      setUnavailableModelProviders((current) => current.filter((item) => item !== "doubao-pro"));
      setNoticeMessage("知识草稿已恢复，豆包正文保持不变；现在可以查看草稿并确认入库。");
      showActionToast({
        type: "success",
        title: "知识草稿已重新整理",
        description: "豆包正文未改动，确认无误后即可入库。"
      });

      return result;
    } catch (error) {
      const requestError = readAdminIngestRequestError(error);
      const message = sanitizeGptOSUserMessage(
        error instanceof Error
          ? error.message
          : "知识草稿仍未完成，豆包正文已完整保留，可稍后重试。"
      );

      if (requestError?.causeCode?.trim().toUpperCase() === "DOUBAO_INFERENCE_LIMIT_PAUSED") {
        doubaoHealthRequestVersionRef.current += 1;
        setDoubaoInferencePaused(true);
        writeLocalJson(DOUBAO_INFERENCE_PAUSED_STORAGE_KEY, true);
        setUnavailableModelProviders((current) => Array.from(new Set([...current, "doubao-pro"])));
      }

      setErrorMessage(message);
      setNoticeMessage("知识草稿仍未完成，豆包正文已完整保留，可稍后重新整理。");
      showActionToast({
        type: "warning",
        title: "知识草稿暂未恢复",
        description: message
      });
      return null;
    } finally {
      setRecoveringMetadataMessageId((current) => current === messageId ? null : current);
    }
  }

  function handleCancelIngest() {
    const controllers = Object.values(abortControllerByConversationRef.current);

    if (controllers.length === 0) {
      setNoticeMessage("当前没有正在进行的附件识别或模型生成。");
      return;
    }

    controllers.forEach((controller) => controller.abort(
      new DOMException("用户已停止本轮附件识别与生成。", "AbortError")
    ));
    setNoticeMessage("正在停止本轮附件识别与生成...");
  }

  async function handleSave(): Promise<Awaited<ReturnType<typeof saveKnowledgeDraft>> | null> {
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
      setErrorMessage("");
      return null;
    }

    if (draft.saveStatus === "已保存") {
      setNoticeMessage("当前知识已保存入库，训练记录已更新。");
      setErrorMessage("");
      return null;
    }

    setIsSaving(true);
    setNoticeMessage("正在保存知识入库并更新训练记录...");
    setErrorMessage("");

    try {
      const result = await saveKnowledgeDraft({
        draft,
        agent: activeAgent,
        originalInput: lastInput || draft.summary || draft.standardQuestion,
        tenantId,
        userId,
        platform: platformContext.platform
      });
      const mergedRecords = mergeTrainingRecords(result.records, records);
      const nextRecords = syncSavedRecordState(mergedRecords, result.draft);
      const matchedRecord = nextRecords.some((record) => isTrainingRecordLinkedToDraft(record, result.draft));

      setDraft(result.draft);
      setRecords(nextRecords);
      setNoticeMessage(!matchedRecord
        ? `${result.message}，但未找到对应训练记录，请刷新训练记录。`
        : result.preview
        ? `${result.message}（本地预览状态）`
        : `${result.message} · 已携带 Web / EXE / APK 同步字段`);
      pushNotification({
        type: result.preview ? "fallback" : "success",
        title: "知识保存状态已更新",
        description: result.preview
          ? "保存接口暂不可用，已在本地预览中标记为已保存。"
          : `「${result.draft.title}」已保存到统一知识库。`
      });

      return {
        ...result,
        records: nextRecords
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "保存知识入库失败，请稍后重试。";

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
      setErrorMessage(message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }

  function handleUpload(files: File[], recognitionMode?: "wechat_conversation") {
    if (!hasActiveAgent) {
      const message = "请先到专家广场添加专家 Agent。";

      setActiveRailKey("experts");
      setNoticeMessage(message);
      setErrorMessage("");
      showActionToast({
        type: "warning",
        title: message
      });
      return;
    }

    const states = files.map((file) => createUploadState(file, {
      tenantId,
      userId,
      agentId: activeAgent.id,
      platform: platformContext.platform,
      recognitionMode,
      wechatOutputMode: recognitionMode === "wechat_conversation" ? "reply_script" : undefined
    }));

    if (states.length === 0) {
      return;
    }

    setUploadedFiles((current) => [...states, ...current].slice(0, 8));
    setErrorMessage("");
    showActionToast({
      type: "success",
      title: `已添加 ${states.length} 个附件`
    });
    pushNotification({
      type: "file",
      title: "文件等待解析",
      description: `${states.map((state) => state.fileName).join("、")} 已加入当前 composer，发送后进入统一投喂队列。`
    });
  }

  function handleRemoveUpload(fileId: string) {
    const target = uploadedFiles.find((file) => file.id === fileId);

    if (
      target?.previewUrl?.startsWith("blob:")
      && typeof URL !== "undefined"
      && typeof URL.revokeObjectURL === "function"
    ) {
      URL.revokeObjectURL(target.previewUrl);
    }

    setUploadedFiles((current) => current.filter((file) => file.id !== fileId));
    showActionToast({
      type: "info",
      title: "已移除附件"
    });
  }

  function handleWechatOutputModeChange(mode: AdminIngestWechatOutputMode) {
    setUploadedFiles((current) => current.map((file) => (
      file.recognitionMode === "wechat_conversation"
        ? { ...file, wechatOutputMode: mode }
        : file
    )));
    setNoticeMessage(
      mode === "full_answer"
        ? "微信截图将输出完整正文答案。"
        : "微信截图将只输出精准回复话术。"
    );
    setErrorMessage("");
  }

  async function handleModelChange(model: string) {
    if (isParsing) {
      setNoticeMessage("当前请求进行中，发送完成后再切换模型。");
      return;
    }

    const requestVersion = ++doubaoHealthRequestVersionRef.current;
    const targetAgentId = activeAgent.id;
    const nextModel = getIngestModelOptionByLabel(model);

    if (nextModel.provider === "doubao-pro") {
      setNoticeMessage("正在检查豆包模型连接状态...");
      const health = await checkGptHealthStatus({
        provider: nextModel.provider,
        selectedModelLabel: nextModel.label,
        preferredModel: nextModel.defaultModel,
        testRequest: false
      });

      if (
        requestVersion !== doubaoHealthRequestVersionRef.current
        || activeAgentIdRef.current !== targetAgentId
      ) {
        return;
      }

      const normalizedHealthProvider = normalizeIngestModelProvider(health.provider);

      setUnavailableModelProviders((current) => shouldDisableDoubaoForHealth(health)
        ? Array.from(new Set([...current, normalizedHealthProvider]))
        : current.filter((provider) => provider !== normalizedHealthProvider));
      setGptHealthStatus(health);

      if (!health.ok) {
        const message = sanitizeGptOSUserMessage(health.message || "豆包模型暂未连接");

        setNoticeMessage(message);
        setErrorMessage("");
        showActionToast({
          type: "warning",
          title: "豆包模型暂未连接",
          description: message
        });
        return;
      }
    }

    setModelPreferencesByAgent((current) => setAdminIngestAgentModel({
      preferences: current,
      agentId: targetAgentId,
      modelLabel: nextModel.label
    }));
    setSelectedModel(nextModel.label);
    setResolvedModel(nextModel.label);
    setErrorMessage("");
    setGptFallbackToast(null);
    setGptHealthStatus(null);
    setNoticeMessage(`当前 Agent 已切换为 ${nextModel.label}，下一次投喂开始生效；知识库、对话上下文和未提交内容保持不变。`);
  }

  async function handleCheckConnection() {
    setErrorMessage("");
    setNoticeMessage("正在检查企业空间 / 知识库 / 卡密连接状态...");
    const nextStatus = await checkLicenseStatus();

    setConnectionStatus(nextStatus);
    setNoticeMessage(`连接状态已更新：企业空间 ${nextStatus.enterpriseSpace}，知识库 ${nextStatus.knowledgeBase}，卡密 ${nextStatus.licenseStatus}。`);
    pushNotification({
      type: nextStatus.licenseStatus === "已激活" ? "license" : "fallback",
      title: "卡密状态提醒",
      description: `当前卡密状态：${nextStatus.licenseStatus}；企业空间：${nextStatus.enterpriseSpace}。`
    });
    return nextStatus;
  }

  async function handleCheckGptStatus(
    action: "check" | "reconnect" = "check",
    modelLabel = selectedModelOption.label
  ) {
    const healthModelOption = getIngestModelOptionByLabel(modelLabel);
    const doubaoPauseVersionAtStart = healthModelOption.provider === "doubao-pro"
      ? doubaoHealthRequestVersionRef.current
      : null;
    setIsCheckingGptHealth(true);
    setErrorMessage("");
    setNoticeMessage(action === "reconnect" ? `正在重新连接 ${healthModelOption.label}...` : `正在检查 ${healthModelOption.label} 接口状态...`);

    try {
      const nextStatus = await checkGptHealthStatus({
        provider: healthModelOption.provider,
        selectedModelLabel: healthModelOption.label,
        preferredModel: healthModelOption.provider === "openai" ? selectedGptModel.apiModel : healthModelOption.defaultModel,
        testRequest: healthModelOption.provider === "doubao-pro" ? true : undefined,
        forceTestRequest: healthModelOption.provider === "doubao-pro" ? true : undefined
      });

      if (
        doubaoPauseVersionAtStart !== null
        && doubaoPauseVersionAtStart !== doubaoHealthRequestVersionRef.current
      ) {
        return nextStatus;
      }

      setGptHealthStatus(nextStatus);
      const verifiedConnected = healthModelOption.provider !== "doubao-pro"
        ? nextStatus.ok
        : nextStatus.ok
          && nextStatus.requestTested === true
          && Boolean(nextStatus.actualModel)
          && nextStatus.actualModel === nextStatus.requestedModel;
      if (healthModelOption.provider === "doubao-pro") {
        setUnavailableModelProviders((current) => {
          if (verifiedConnected) {
            return current.filter((provider) => provider !== "doubao-pro");
          }
          if (shouldDisableDoubaoForHealth(nextStatus)) {
            return Array.from(new Set([...current, "doubao-pro"]));
          }
          return current;
        });
        if (verifiedConnected) {
          setDoubaoInferencePaused(false);
          removeLocalValue(DOUBAO_INFERENCE_PAUSED_STORAGE_KEY);
        } else if (nextStatus.errorCode === "DOUBAO_INFERENCE_LIMIT_PAUSED") {
          doubaoHealthRequestVersionRef.current += 1;
          setDoubaoInferencePaused(true);
          writeLocalJson(DOUBAO_INFERENCE_PAUSED_STORAGE_KEY, true);
        }
      }

      if (verifiedConnected) {
        setGptFallbackToast(null);
        setNoticeMessage(action === "reconnect" ? `${healthModelOption.label} 接口已连接，可重新生成。` : `${healthModelOption.label} 接口已连接。`);
        showActionToast({
          type: "success",
          title: action === "reconnect" ? `${healthModelOption.label} 接口已连接，可重新生成` : `${healthModelOption.label} 接口已连接`,
          description: nextStatus.selectedModelLabel
        });
      } else {
        const safeMessage = healthModelOption.provider === "doubao-pro" && nextStatus.ok
          ? "豆包真实连接检查没有返回当前指定模型，暂停状态未解除。"
          : sanitizeGptOSUserMessage(nextStatus.message);

        setGptFallbackToast(null);
        setNoticeMessage(safeMessage);
        showActionToast({
          type: "warning",
          title: "AI连接暂时不可用",
          description: safeMessage
        });
      }

      pushNotification({
        type: verifiedConnected ? "success" : "fallback",
        title: verifiedConnected ? `${healthModelOption.label} 接口已连接` : `${healthModelOption.label} 接口诊断提醒`,
        description: `${nextStatus.selectedModelLabel} · ${nextStatus.message}`
      });

      return nextStatus;
    } finally {
      setIsCheckingGptHealth(false);
    }
  }

  async function handleVoiceToggle() {
    const speechWindow = window as SpeechWindow;
    const SpeechRecognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      const message = "当前环境暂不支持网页语音识别。EXE / APK 端后续将接入系统级语音输入。";
      setVoiceState((current) => ({ ...current, isVoiceSupported: false, isRecording: false, error: message }));
      setErrorMessage("");
      setNoticeMessage(message);
      showActionToast({
        type: "warning",
        title: "语音输入暂不可用",
        description: message
      });
      return;
    }

    if (voiceState.isRecording) {
      recognitionRef.current?.stop();
      setVoiceState((current) => ({ ...current, isRecording: false }));
      setNoticeMessage("语音输入已停止。");
      showActionToast({
        type: "info",
        title: "语音输入已停止"
      });
      return;
    }

    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      }

      const recognition = new SpeechRecognition();
      let latestTranscript = "";

      recognitionRef.current = recognition;
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "zh-CN";
      recognition.onstart = () => {
        setErrorMessage("");
        setVoiceState((current) => ({ ...current, isVoiceSupported: true, isRecording: true, error: "" }));
        setNoticeMessage("正在听写，点击麦克风可停止。");
        showActionToast({
          type: "info",
          title: "正在听写，点击麦克风可停止。"
        });
      };
      recognition.onresult = (event) => {
        let transcript = "";

        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          transcript += event.results[index][0]?.transcript ?? "";
        }

        const nextTranscript = transcript.trim();

        if (nextTranscript) {
          latestTranscript = nextTranscript;
          setVoiceState((current) => ({ ...current, transcript: nextTranscript, error: "" }));
          setInput((current) => current.trim()
            ? `${current.trim()} ${nextTranscript}`
            : nextTranscript);
        }
      };
      recognition.onerror = (event) => {
        const message = event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "麦克风权限被拒绝，请在浏览器或系统设置中允许麦克风。"
          : "语音识别失败，请稍后重试或改用键盘输入。";

        setVoiceState((current) => ({ ...current, isRecording: false, error: message }));
        setErrorMessage(message);
        showActionToast({
          type: "warning",
          title: message
        });
      };
      recognition.onend = () => {
        setVoiceState((current) => ({ ...current, isRecording: false }));

        if (latestTranscript.trim()) {
          setNoticeMessage("语音内容已填入输入框。");
          showActionToast({
            type: "success",
            title: "语音内容已填入输入框。"
          });
        }
      };
      recognition.start();
    } catch {
      const message = "麦克风权限被拒绝，请在浏览器或系统设置中允许麦克风。";

      setVoiceState((current) => ({ ...current, isVoiceSupported: true, isRecording: false, error: message }));
      setErrorMessage(message);
      setNoticeMessage(message);
      showActionToast({
        type: "warning",
        title: message
      });
    }
  }

  function handleCreateAgent(payload: IngestCreateAgentPayload) {
    if (!payload.name.trim()) {
      setErrorMessage("请输入 Agent 名称");
      return false;
    }

    const now = new Date().toISOString();
    const id = `agent-${Date.now()}`;
    const nextAgent: IngestChatAgent = {
      id,
      name: payload.name,
      role: payload.category || payload.type,
      category: payload.category || payload.type,
      description: payload.description,
      avatar: payload.name.slice(0, 1) || "新",
      tone: "green",
      tenantId,
      userId,
      platform: platformContext.platform,
      syncTarget: [...platformContext.syncTarget],
      createdAt: now,
      status: "active",
      isSystem: false,
      knowledgeCount: 0,
      source: "ingest_custom",
      managedBySuperAdmin: false,
      editableByIngestAdmin: true,
      deletableByIngestAdmin: true,
      visibleToUserClient: false
    };

    const nextRecord: IngestTrainingRecord = {
      id: `record-agent-${Date.now()}`,
      jobId: null,
      tenantId,
      userId,
      agentId: nextAgent.id,
      agentName: nextAgent.name,
      input: `新建 Agent：${nextAgent.name}`,
      resultTitle: `新建 Agent：${nextAgent.name}`,
      saveStatus: "待确认",
      category: nextAgent.category ?? nextAgent.role,
      time: "刚刚",
      hits: 0,
      sourceType: "admin_ingest",
      source: "admin_ingest",
      platform: platformContext.platform,
      syncTarget: [...platformContext.syncTarget],
      createdAt: now,
      updatedAt: now,
      aiOutput: null
    };

    setAgents((current) => [nextAgent, ...current]);
    setActiveAgentId(nextAgent.id);
    setRecords((current) => [nextRecord, ...current]);
    setActiveRailKey("experts");
    setIsAgentDetailOpen(true);
    setErrorMessage("");
    setNoticeMessage(`已创建 ${nextAgent.name}，当前为本地预览 Agent，已预留统一 API 字段。`);
    return true;
  }

  function handleAddExpertToAgent(expert: IngestExpert) {
    const existing = visibleAgents.find((agent) => agent.expertId === expert.id);

    if (existing) {
      setActiveAgentId(existing.id);
      setActiveRailKey("experts");
      setNoticeMessage(`${existing.name} 已在 Agent 列表中，可点击左侧 Agent 或对话图标开始投喂。`);
      showActionToast({
        type: "info",
        title: "该专家已添加"
      });
      return;
    }

    const now = new Date().toISOString();
    const publicScope = resolvePublicExpertScope({
      agentId: expert.id,
      expertId: expert.id
    });
    const nextAgent: IngestChatAgent = {
      id: `expert-agent-${expert.id}`,
      expertId: expert.id,
      name: expert.name,
      role: expert.category,
      category: expert.category,
      description: expert.description,
      avatar: expert.avatar,
      tone: expert.tone,
      tenantId,
      userId,
      knowledgeBaseId: publicScope?.knowledgeBaseId ?? null,
      namespace: publicScope?.namespace ?? null,
      platform: platformContext.platform,
      syncTarget: [...platformContext.syncTarget],
      createdAt: now,
      status: "active",
      isSystem: false,
      knowledgeCount: 0,
      source: "expert_marketplace",
      sourceApp: "admin_ingest",
      managedBySuperAdmin: false,
      editableByIngestAdmin: true,
      deletableByIngestAdmin: true,
      visibleToUserClient: false
    };
    const nextRecord: IngestTrainingRecord = {
      id: `record-expert-agent-${Date.now()}`,
      jobId: null,
      tenantId,
      userId,
      agentId: nextAgent.id,
      expertId: expert.id,
      agentName: nextAgent.name,
      expertName: expert.name,
      input: `从专家广场添加 Agent：${expert.name}`,
      resultTitle: `添加专家 Agent：${expert.name}`,
      saveStatus: "待确认",
      category: expert.category,
      time: "刚刚",
      hits: 0,
      sourceType: "admin_ingest",
      source: "admin_ingest",
      platform: platformContext.platform,
      syncTarget: [...platformContext.syncTarget],
      createdAt: now,
      updatedAt: now,
      aiOutput: null
    };

    setAgents((current) => [nextAgent, ...current]);
    setActiveAgentId(nextAgent.id);
    setRecords((current) => [nextRecord, ...current]);
    setActiveRailKey("experts");
    setIsAgentDetailOpen(false);
    setErrorMessage("");
    setNoticeMessage("已添加到 Agent，可新建对话开始投喂。");
    pushNotification({
      type: "success",
      title: "已添加专家 Agent",
      description: `${expert.name} 已加入当前投喂工作台，并预留 Web / EXE / APK 同步字段。`
    });
    showActionToast({
      type: "success",
      title: "已添加到 Agent，可新建对话开始投喂。"
    });
  }

  async function handleUrlIngestSubmit() {
    const url = urlInput.trim();

    if (!hasActiveAgent) {
      setUrlError("请先到专家广场添加专家 Agent。");
      setActiveRailKey("experts");
      setNoticeMessage("请先到专家广场添加专家 Agent。");
      return;
    }

    if (!url) {
      setUrlError("URL 不能为空。");
      return;
    }

    if (!isHttpUrl(url)) {
      setUrlError("网址必须以 http:// 或 https:// 开头。");
      return;
    }

    const conversationId = ensureConversationForSend(activeAgent);

    markConversationUsed(conversationId, `网址投喂：${url}`);
    setIsUrlIngesting(true);
    setUrlError("");
    setErrorMessage("");
    setNoticeMessage("正在生成网页投喂本地预览...");

    try {
      const result = await sendUrlIngestPreview({
        url,
        agent: activeAgent,
        category: activeAgent.role,
        model: selectedModelOption.label,
        modelProvider: selectedModelOption.provider,
        gptTier: selectedModelOption.provider === "openai" ? selectedGptModel.tier : undefined,
        gptTierLabel: selectedModelOption.provider === "openai" ? selectedGptModel.tierLabel : undefined,
        gptVersion: selectedModelOption.provider === "openai" ? selectedGptModel.version : undefined,
        selectedModelLabel: selectedModelOption.label,
        tenantId,
        userId,
        platform: platformContext.platform
      });
      const nextRecords = mergeTrainingRecords(result.records, records);
      const now = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });

      setDraft(result.draft);
      setRecords(nextRecords);
      setLastInput(`网址投喂：${url}`);
      setMessages((current) => [
        ...current,
        {
          id: `user-url-${Date.now()}`,
          role: "user",
          content: `网址投喂：${url}`,
          time: now,
          source: "admin_ingest",
          platform: platformContext.platform,
          syncTarget: [...platformContext.syncTarget],
          tenantId,
          userId,
          agentId: activeAgent.id,
          expertId: activeAgent.expertId ?? null,
          conversationId,
          agentName: activeAgent.name,
          expertName: activeAgent.expertId ? activeAgent.name : null,
          model: selectedModelLabel,
          provider: "admin_ingest"
        },
        {
          id: `assistant-url-${Date.now()}`,
          role: "assistant",
          content: result.replyMarkdown || `${result.message} 已生成结构化预览：${result.draft.title}。`,
          time: now,
          source: "admin_ingest",
          platform: platformContext.platform,
          syncTarget: [...platformContext.syncTarget],
          tenantId,
          userId,
          agentId: activeAgent.id,
          expertId: activeAgent.expertId ?? null,
          conversationId,
          agentName: activeAgent.name,
          expertName: activeAgent.expertId ? activeAgent.name : null,
          model: selectedModelLabel,
          provider: result.provider,
          saveSuggestion: result.saveSuggestion,
          isRestored: false,
          isHistorical: false,
          isStreaming: true,
          isGenerating: true,
          typing: true,
          status: "streaming"
        }
      ]);
      setNoticeMessage(result.message);
      pushNotification({
        type: "fallback",
        title: "网页投喂本地预览已生成",
        description: `${result.draft.title} · ${result.draft.category}。真实网页抓取接入后可生成正式知识。`
      });
      setUrlInput("");
      setIsUrlDialogOpen(false);
    } catch (error) {
      setUrlError(error instanceof Error ? error.message : "网页投喂接口暂不可用，请稍后重试。");
      setNoticeMessage("网页投喂接口待接入真实抓取，当前为本地预览。");
    } finally {
      setIsUrlIngesting(false);
    }
  }

  function handleToolAction(label: string) {
    setErrorMessage("");

    if (["提取重点", "改写为标准问答", "生成分类标签", "检查是否需要 AI 修正"].includes(label)) {
      if (!input.trim() && uploadedFiles.length === 0) {
        const message = "请输入内容或上传附件后使用 AI 修正工具。";

        setNoticeMessage(message);
        showActionToast({
          type: "warning",
          title: message
        });
        return;
      }

      const nextInstruction = buildAiFixInstruction(label, input, uploadedFiles.length > 0);

      setInput(nextInstruction);
      setNoticeMessage(`已生成“${label}”指令，可继续发送 AI 投喂。`);
      showActionToast({
        type: "success",
        title: `已生成“${label}”指令`,
        description: input.trim() ? "指令已写入输入框。" : "已基于当前附件生成投喂指令。"
      });
      return;
    }

    if (label === "语音备注" || label === "麦克风") {
      void handleVoiceToggle();
      return;
    }

    if (label === "通知") {
      handleRailChange("notifications");
      return;
    }

    if (label === "设置") {
      handleRailChange("settings");
      return;
    }

    if (label === "图片识别·支持微信长截图") {
      setNoticeMessage("请选择图片；微信长截图会按左右气泡识别，并针对客户最后一条消息生成回复正文。");
      return;
    }

    if (label === "网址投喂") {
      if (!hasActiveAgent) {
        const message = "请先到专家广场添加专家 Agent。";

        setActiveRailKey("experts");
        setNoticeMessage(message);
        showActionToast({
          type: "warning",
          title: message
        });
        return;
      }

      setIsUrlDialogOpen(true);
      setUrlError("");
      setNoticeMessage("网址投喂弹窗已打开，可输入 http:// 或 https:// 链接生成本地预览。");
      return;
    }

    if (label === "连接状态") {
      void handleCheckConnection();
      return;
    }

    setNoticeMessage(`${label}入口已响应，当前阶段预留解析状态和三端同步字段。`);
  }

  const sharedProps = {
    agents: visibleAgents,
    activeAgent,
    hasActiveAgent,
    activeAgentId,
    adminAvatar,
    appName,
    displayProfile,
    onAgentChange: handleAgentSelect,
    agentConversations,
    activeConversationId,
    expandedAgentIds,
    expandedConversationAgentIds,
    pinnedAgentIds,
    onAgentToggleExpanded: handleToggleAgentExpanded,
    onAgentConversationToggleExpanded: handleToggleAgentConversationExpanded,
    onAgentConversationSelect: handleSelectAgentConversation,
    onAgentConversationCreate: handleCreateAgentConversation,
    onAgentConversationShare: (agentId: string, conversationId: string) => {
      void handleCreateAgentConversationPublicLink(agentId, conversationId, "share");
    },
    onAgentConversationStartGroupChat: (agentId: string, conversationId: string) => {
      void handleCreateAgentConversationPublicLink(agentId, conversationId, "group");
    },
    onAgentConversationRename: handleRenameAgentConversation,
    onAgentConversationTogglePinned: handleToggleAgentConversationPinned,
    onAgentConversationToggleArchived: handleToggleAgentConversationArchived,
    onAgentConversationDelete: handleDeleteAgentConversation,
    onAgentTogglePinned: handleToggleAgentPinned,
    activeRailKey,
    onRailChange: handleRailChange,
    searchKeyword,
    onSearchKeywordChange: setSearchKeyword,
    selectedModel: selectedModelLabel,
    regenerateInput: lastInput,
    resolvedModel,
    modelOptions,
    onModelChange: handleModelChange,
    unavailableModelProviders,
    connectionStatus,
    onCheckConnection: handleCheckConnection,
    input,
    onInputChange: setInput,
    messages,
    onMessagesChange: setMessages,
    draft,
    records,
    noticeMessage,
    errorMessage,
    uploadState,
    uploadedFiles,
    voiceState,
    notifications,
    settingsState,
    isParsing,
    showParsingProgress: isParsing && isIngestConversationRequestActive(
      conversationStateByIdRef.current[activeConversationId]
    ),
    isSaving,
    onOpenCreateAgent: () => handleRailChange("experts"),
    onAddExpertToAgent: handleAddExpertToAgent,
    addedExpertIds: visibleAgents.map((agent) => agent.expertId).filter((id): id is string => Boolean(id)),
    onAgentViewDetails: handleViewAgentDetail,
    onAgentEdit: handleEditAgent,
    onAgentArchive: handleArchiveAgent,
    onAgentDelete: handleRequestDeleteAgent,
    onNoticeChange: setNoticeMessage,
    onErrorChange: setErrorMessage,
    onSend: handleSend,
    onRetryFailedMessage: handleRetryFailedMessage,
    onRetryDoubaoMetadata: handleRetryDoubaoMetadata,
    recoveringMetadataMessageId,
    onCancel: handleCancelIngest,
    onSave: handleSave,
    onReconnectGpt: (modelLabel?: string) => handleCheckGptStatus("reconnect", modelLabel),
    onUpload: handleUpload,
    onRemoveUpload: handleRemoveUpload,
    onWechatOutputModeChange: handleWechatOutputModeChange,
    onVoiceToggle: handleVoiceToggle,
    onSettingsChange: setSettingsState,
    onToolAction: handleToolAction,
    onToast: showActionToast,
    autonomousEnabled,
    onAutonomousEnabledChange: setAutonomousEnabled
  };

  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#f7f7f6] text-[#191919]">
      {activeRailKey !== "experts" ? (
        <div className="absolute left-[calc(68px+var(--admin-ingest-sidebar-width,300px)+24px)] top-5 z-50 flex rounded-full border border-[#ededeb] bg-[#f2f2f1]/95 p-1 text-sm font-semibold shadow-[0_10px_30px_rgba(15,23,42,0.04)] backdrop-blur max-md:left-1/2 max-md:-translate-x-1/2">
          <button
            type="button"
            onClick={() => setMode("chat")}
            className={[
              "flex h-7 items-center gap-1.5 rounded-full px-5 transition",
              mode === "chat" ? "bg-white text-[#202020] shadow-sm" : "text-[#666] hover:text-[#202020]"
            ].join(" ")}
          >
            <MessageSquareText className="h-4 w-4" aria-hidden="true" />
            对话
          </button>
          <button
            type="button"
            onClick={() => setMode("knowledge")}
            className={[
              "flex h-7 items-center gap-1.5 rounded-full px-5 transition",
              mode === "knowledge" ? "bg-white text-[#202020] shadow-sm" : "text-[#666] hover:text-[#202020]"
            ].join(" ")}
          >
            <GaugeCircle className="h-4 w-4" aria-hidden="true" />
            AI总控
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("memory");
              setActiveRailKey("memory");
            }}
            className={[
              "flex h-7 items-center gap-1.5 rounded-full px-5 transition",
              mode === "memory" ? "bg-white text-[#202020] shadow-sm" : "text-[#666] hover:text-[#202020]"
            ].join(" ")}
          >
            <Brain className="h-4 w-4" aria-hidden="true" />
            训练记忆
          </button>
          <button
            type="button"
            onClick={() => setMode("release")}
            className={[
              "flex h-7 items-center gap-1.5 rounded-full px-5 transition",
              mode === "release" ? "bg-white text-[#202020] shadow-sm" : "text-[#666] hover:text-[#202020]"
            ].join(" ")}
          >
            <Rocket className="h-4 w-4" aria-hidden="true" />
            发布中心
          </button>
        </div>
      ) : null}

      {mode === "knowledge"
        ? <IngestKnowledgeOSDashboard onBack={() => setMode("chat")} />
        : mode === "release"
          ? <IngestReleaseConsole onBack={() => setMode("chat")} />
        : mode === "memory"
          ? (
            <IngestMemoryPanel
              activeAgent={activeAgent}
              activeConversationId={activeConversationId}
              messages={messages}
              refreshKey={memoryRefreshKey}
              onBack={() => {
                setMode("chat");
                setActiveRailKey("chat");
              }}
              onToast={showActionToast}
            />
          )
        : mode === "chat"
          ? <IngestChatGPTShell {...sharedProps} />
          : <IngestEXEShell {...sharedProps} />}
      <IngestCreateAgentDialog
        open={isCreateAgentOpen}
        onClose={() => setIsCreateAgentOpen(false)}
        onCreate={handleCreateAgent}
      />
      <IngestNotificationPanel
        open={openPanel === "notifications"}
        notifications={notifications}
        onClose={() => setOpenPanel(null)}
        onMarkAllRead={() => {
          setNotifications((current) => current.map((notification) => ({ ...notification, read: true })));
          setNoticeMessage("通知已全部标记为已读。");
        }}
      />
      <IngestSettingsPanel
        open={openPanel === "settings"}
        activeAgent={activeAgent}
        selectedModel={selectedModelLabel}
        connectionStatus={connectionStatus}
        uploadedFiles={uploadedFiles}
        voiceState={voiceState}
        settingsState={settingsState}
        adminAvatar={adminAvatar}
        appName={appName}
        gptHealthStatus={gptHealthStatus}
        isCheckingGptStatus={isCheckingGptHealth}
        onSettingsChange={setSettingsState}
        onAvatarChange={handleAdminAvatarChange}
        onAppNameChange={handleAppNameChange}
        onAccountAction={handleAccountSettingAction}
        onCheckGptStatus={() => void handleCheckGptStatus("check")}
        onReconnectGpt={() => void handleCheckGptStatus("reconnect")}
        onClose={() => {
          setOpenPanel(null);
          setActiveRailKey("chat");
        }}
      />
      <IngestAgentDetailPanel
        open={isAgentDetailOpen}
        agent={activeAgent}
        records={records}
        onClose={() => setIsAgentDetailOpen(false)}
      />
      <IngestAgentDeleteDialog
        agent={deleteCandidateAgent}
        onClose={() => setDeleteCandidateAgent(null)}
        onConfirm={handleConfirmDeleteAgent}
      />
      <UrlIngestDialog
        open={isUrlDialogOpen}
        url={urlInput}
        error={urlError}
        activeAgent={activeAgent}
        isSubmitting={isUrlIngesting}
        onUrlChange={setUrlInput}
        onClose={() => {
          if (!isUrlIngesting) {
            setIsUrlDialogOpen(false);
            setUrlError("");
          }
        }}
        onSubmit={() => void handleUrlIngestSubmit()}
      />
      <IngestConversationLinkDialog
        state={conversationLinkDialog}
        busy={isConversationLinkBusy}
        onClose={() => setConversationLinkDialog(null)}
        onRevoke={(state) => void handleRevokeAgentConversationPublicLink(state)}
      />
      <ActionToastView toast={actionToast} onClose={() => setActionToast(null)} />
      <GptFallbackToastView
        toast={gptFallbackToast}
        onClose={() => {
          setGptFallbackToast(null);
        }}
      />
    </div>
  );
}

function ActionToastView({
  toast,
  onClose
}: {
  toast: IngestActionToast | null;
  onClose: () => void;
}) {
  if (!toast) {
    return null;
  }

  const tone = toast.type === "warning"
    ? "border-[#ffe1a6] bg-[#fffaf0] text-[#9a6500]"
    : toast.type === "success"
      ? "border-[#ccefd9] bg-[#f6fff9] text-[#128246]"
      : "border-[#e5e5e2] bg-white text-[#333]";

  return (
    <div className={["absolute right-5 top-16 z-[85] w-[min(320px,calc(100vw-40px))] rounded-[20px] border p-3 shadow-[0_18px_60px_rgba(15,23,42,0.14)]", tone].join(" ")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{toast.title}</p>
          {toast.description ? <p className="mt-1 text-xs leading-5 text-[#555]">{toast.description}</p> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/70 text-sm font-semibold transition hover:bg-white"
          aria-label="关闭提示"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function UrlIngestDialog({
  open,
  url,
  error,
  activeAgent,
  isSubmitting,
  onUrlChange,
  onClose,
  onSubmit
}: {
  open: boolean;
  url: string;
  error: string;
  activeAgent: IngestChatAgent;
  isSubmitting: boolean;
  onUrlChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  useEffect(() => {
    if (!open || isSubmitting) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSubmitting, onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/20 px-4" onMouseDown={onClose}>
      <div className="w-full max-w-[460px] rounded-[28px] border border-[#e7e7e4] bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.18)]" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#202020]">网址投喂</h2>
            <p className="mt-1 text-xs leading-5 text-[#777]">网页投喂接口待接入真实抓取，当前为本地预览。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f4f4f2] text-sm font-semibold text-[#666] transition hover:bg-[#ececea] disabled:opacity-50"
            aria-label="关闭网址投喂弹窗"
          >
            ×
          </button>
        </div>

        <label className="mt-5 block text-xs font-semibold text-[#555]" htmlFor="admin-ingest-url-input">URL</label>
        <input
          id="admin-ingest-url-input"
          value={url}
          onChange={(event) => onUrlChange(event.target.value)}
          placeholder="https://example.com/article"
          className="mt-2 h-11 w-full rounded-2xl border border-[#e3e3df] bg-[#fbfbfa] px-4 text-sm text-[#202020] outline-none transition focus:border-[#128246] focus:bg-white"
        />
        {error ? <p className="mt-2 text-xs font-semibold text-[#b93b4a]">{error}</p> : null}

        <div className="mt-4 grid gap-2 rounded-2xl bg-[#f8f8f7] p-3 text-xs text-[#666]">
          <p><span className="font-semibold text-[#202020]">目标 Agent：</span>{activeAgent.name}</p>
          <p><span className="font-semibold text-[#202020]">分类：</span>{activeAgent.role}</p>
          <p><span className="font-semibold text-[#202020]">同步目标：</span>Web / EXE / APK</p>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="h-10 rounded-2xl bg-[#f3f3f1] px-4 text-sm font-semibold text-[#555] transition hover:bg-[#ececea] disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting}
            className="h-10 rounded-2xl bg-[#202020] px-4 text-sm font-semibold text-white transition hover:bg-black disabled:bg-[#d9d9d6] disabled:text-[#777]"
          >
            {isSubmitting ? "正在投喂..." : "开始投喂"}
          </button>
        </div>
      </div>
    </div>
  );
}

function GptFallbackToastView({
  toast,
  onClose
}: {
  toast: GptFallbackToast | null;
  onClose: () => void;
}) {
  if (!toast) {
    return null;
  }

  return (
    <div className="absolute right-5 top-32 z-[80] w-[min(360px,calc(100vw-40px))] rounded-[22px] border border-[#e7e7e4] bg-white p-4 shadow-[0_18px_60px_rgba(15,23,42,0.14)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#444]">{toast.title}</p>
          <p className="mt-1 text-xs leading-5 text-[#555]">{toast.description}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f3f3f1] text-sm font-semibold text-[#666] transition hover:bg-[#e9e9e6]"
          aria-label="关闭 GPT 接口提示"
        >
          ×
        </button>
      </div>
    </div>
  );
}
