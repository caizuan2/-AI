"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GaugeCircle, MessageSquareText } from "lucide-react";
import { IngestAgentDeleteDialog } from "@/components/enterprise-admin/IngestAgentDeleteDialog";
import { IngestAgentDetailPanel } from "@/components/enterprise-admin/IngestAgentDetailPanel";
import {
  IngestCreateAgentDialog,
  type IngestCreateAgentPayload
} from "@/components/enterprise-admin/IngestCreateAgentDialog";
import { IngestChatGPTShell } from "@/components/enterprise-admin/IngestChatGPTShell";
import { IngestEXEShell } from "@/components/enterprise-admin/IngestEXEShell";
import { IngestNotificationPanel } from "@/components/enterprise-admin/IngestNotificationPanel";
import {
  IngestSettingsPanel,
  type IngestSettingsState
} from "@/components/enterprise-admin/IngestSettingsPanel";
import { IngestKnowledgeOSDashboard } from "@/components/enterprise-admin/IngestKnowledgeOSDashboard";
import {
  checkLicenseStatus,
  checkGptHealthStatus,
  createUploadState,
  ingestSyncTarget,
  parseUploadedFileForGpt,
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
  INGEST_MODEL_DISPLAY_NAMES,
  normalizeIngestModelSelection
} from "@/lib/enterprise/ingest-model-options";
import {
  ADMIN_INGEST_APP_NAME_STORAGE_KEY,
  DEFAULT_ADMIN_INGEST_ASSISTANT_NAME,
  resolveAdminIngestDisplayProfile
} from "@/lib/enterprise/admin-ingest-profile";
import { sanitizeGptOSUserMessage, toUserFriendlyMessage } from "@/lib/enterprise/gpt-os-fallback-normalizer";
import {
  getStateDomain,
  isRealIngestFailure,
  shouldClearTransientErrorOnAgentSwitch,
  shouldRestoreToastFromHistory,
  shouldSuppressFallbackToast
} from "@/lib/enterprise/ingest-ui-state";
import type { IngestExpert } from "@/lib/enterprise/mock-experts";

type IngestMode = "chat" | "workbench" | "knowledge";
type IngestRailKey = "chat" | "experts" | "tasks" | "files" | "connections" | "memory" | "lab" | "notifications" | "settings";
type IngestActionResult = Awaited<ReturnType<typeof sendCoreIngest>>;
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

const tenantId: string | null = null;
const userId: string | null = null;
const GPT_FALLBACK_TOAST = {
  title: "AI暂时不稳定",
  description: "请稍后再试，或检查模型连接状态。"
};
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
const EMPTY_HISTORY_MESSAGE_PREFIX = "empty-history-";
const INGEST_SUCCESS_TOAST_SUPPRESS_MS = 30_000;

function createIngestRequestId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // Browser crypto can be unavailable in older embedded shells.
  }

  return `admin-ingest-gpt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

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
  const [connectionStatus, setConnectionStatus] = useState<IngestConnectionStatus>(initialConnectionStatus);
  const [gptHealthStatus, setGptHealthStatus] = useState<IngestGptHealthStatus | null>(null);
  const [isCheckingGptHealth, setIsCheckingGptHealth] = useState(false);
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
  const [gptFallbackToast, setGptFallbackToast] = useState<GptFallbackToast | null>(null);
  const [actionToast, setActionToast] = useState<IngestActionToast | null>(null);
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

    setSelectedModel(storedModel.label);
    setResolvedModel(storedModel.label);
    if (storedModelValue !== storedModel.label) {
      window.localStorage.setItem(ADMIN_INGEST_MODEL_STORAGE_KEY, storedModel.label);
    }
    setHistoryLoaded(true);
  }, []);

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
    if (!historyLoaded || restoredInitialConversationRef.current || !activeConversationId) {
      return;
    }

    const activeConversation = agentConversations.find((conversation) => conversation.id === activeConversationId);
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

  function showGptFallbackToast(description = GPT_FALLBACK_TOAST.description, guard?: {
    reason?: string;
    stateDomain?: ReturnType<typeof getStateDomain>;
    requestId?: string;
    status?: number;
    errorCode?: string;
  }) {
    const hasCurrentSuccess = ingestSuccessLockRef.current
      || Boolean(lastSuccessfulIngestRequestIdRef.current && lastSuccessfulIngestRequestIdRef.current === guard?.requestId);

    if (shouldSuppressFallbackToast({
      reason: guard?.reason,
      stateDomain: guard?.stateDomain,
      requestId: guard?.requestId,
      activeRequestId: activeIngestRequestIdRef.current,
      hasCurrentSuccess,
      lastSuccessfulAt: lastSuccessfulIngestAtRef.current,
      suppressUntil: suppressFallbackToastUntilRef.current,
      status: guard?.status,
      errorCode: guard?.errorCode
    })) {
      return;
    }

    console.warn("[admin-ingest:gpt:fallback-toast]", {
      reason: guard?.reason,
      status: guard?.status,
      errorCode: guard?.errorCode,
      requestId: guard?.requestId,
      hasCurrentSuccess,
      stateDomain: guard?.stateDomain
    });
    setGptFallbackToast({
      id: `gpt-fallback-${Date.now()}`,
      title: GPT_FALLBACK_TOAST.title,
      description
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

  function handleAccountSettingAction(action: "password" | "switch") {
    const message = action === "password"
      ? "修改密码功能将在账号系统接入后启用。"
      : "切换账号将在登录系统接入后启用。";

    setNoticeMessage(message);
    showActionToast({
      type: "info",
      title: message
    });
  }

  function handleRailChange(nextKey: IngestRailKey) {
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
      settings: `当前 Agent 设置：${activeAgent.name} · ${activeAgent.role}。`
    };

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

    const nextConversation = agentConversations.find((conversation) => conversation.agentId === nextAgent.id && conversation.id === activeConversationId)
      ?? agentConversations.find((conversation) => conversation.agentId === nextAgent.id);

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
    const targetConversation = agentConversations.find((conversation) => conversation.id === conversationId && conversation.agentId === agentId);

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

  function handleDeleteAgentConversation(agentId: string, conversationId: string) {
    const targetAgent = visibleAgents.find((agent) => agent.id === agentId);
    const targetConversation = agentConversations.find((conversation) => conversation.agentId === agentId && conversation.id === conversationId);

    if (!targetAgent || !targetConversation) {
      return;
    }

    const remainingConversations = agentConversations.filter((conversation) => conversation.agentId === agentId && conversation.id !== conversationId);
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
    const existing = agentConversations.find((conversation) => conversation.id === activeConversationId && conversation.agentId === agent.id);

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

  async function handleSend(textOverride?: string): Promise<IngestActionResult | null> {
    const value = (textOverride ?? input).trim();
    const currentModelLabel = selectedModelLabel;

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

    const composerUploads = uploadedFiles;
    const draftAttachments = composerUploads.map((file) => ({
      ...stripUploadRuntimeFields(file),
      status: "attached" as const,
      agentId: activeAgent.id,
      tenantId,
      userId,
      platform: platformContext.platform,
      syncTarget: [...platformContext.syncTarget]
    }));
    const effectiveInput = value || (draftAttachments.length > 0
      ? `附件投喂：${draftAttachments.map((file) => file.fileName).join("、")}`
      : "");

    if (!effectiveInput) {
      setNoticeMessage("请输入投喂任务或先选择附件后再发送。");
      setErrorMessage("");
      return null;
    }

    const conversationId = ensureConversationForSend(activeAgent);
    const userMessageId = `user-${Date.now()}`;
    const requestId = createIngestRequestId();
    const isCurrentRequest = () => activeIngestRequestIdRef.current === requestId;

    activeIngestRequestIdRef.current = requestId;
    ingestSuccessLockRef.current = false;
    markConversationUsed(conversationId, effectiveInput, draftAttachments[0]?.fileName);
    setIsParsing(true);
    setNoticeMessage(`${selectedModelOption.label} 正在深度分析资料...`);
    setErrorMessage("");
    setGptFallbackToast(null);
    setActionToast(null);
    setMessages((current) => [
      ...current,
      {
        id: userMessageId,
        role: "user",
        content: value || "附件投喂",
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
    setInput("");
    setUploadedFiles([]);

    let successRendered = false;

    try {
      let outgoingAttachments = draftAttachments;

      if (composerUploads.length > 0) {
        const preparedUploads = await Promise.all(composerUploads.map((file) => parseUploadedFileForGpt({
          ...file,
          status: "parsing"
        })));

        outgoingAttachments = preparedUploads.map((file) => ({
          ...stripUploadRuntimeFields(file),
          status: "attached" as const,
          agentId: activeAgent.id,
          tenantId,
          userId,
          platform: platformContext.platform,
          syncTarget: [...platformContext.syncTarget]
        }));

        if (!isCurrentRequest()) {
          return null;
        }

        setMessages((current) => current.map((message) => message.id === userMessageId
          ? { ...message, attachments: outgoingAttachments }
          : message));
      }

      const result = await sendCoreIngest({
        text: effectiveInput,
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
        attachments: outgoingAttachments,
        recentMessages: messages.slice(-10).map((message) => ({
          role: message.role,
          content: message.content,
          model: message.model ?? null,
          provider: message.provider ?? null
        })),
        previousKnowledgeDrafts: draft.jobId ? [draft] : [],
        recentTrainingRecords: records.slice(0, 6).map((record) => ({
          input: record.input,
          resultTitle: record.resultTitle,
          category: record.category,
          saveStatus: record.saveStatus
        })),
        autonomous: {
          enabled: autonomousEnabled,
          mode: autonomousEnabled ? "execute_safe" : "plan_only"
        },
        platform: platformContext.platform
      });

      if (!isCurrentRequest()) {
        return null;
      }

      const nextRecords = mergeTrainingRecords(result.records, records);
      const successAt = Date.now();

      ingestSuccessLockRef.current = true;
      lastSuccessfulIngestAtRef.current = successAt;
      lastSuccessfulIngestRequestIdRef.current = requestId;
      suppressFallbackToastUntilRef.current = successAt + INGEST_SUCCESS_TOAST_SUPPRESS_MS;

      setDraft(result.draft);
      setRecords(nextRecords);
      setResolvedModel(result.model ?? currentModelLabel);
      setLastInput(effectiveInput);
      setGptFallbackToast(null);
      setErrorMessage("");
      setNoticeMessage(`${result.message} · 当前模型：${result.model ?? currentModelLabel} · 已携带 Web / EXE / APK 同步字段`);
      setMessages((current) => [
        ...current,
        {
          id: `assistant-result-${Date.now()}`,
          role: "assistant",
          content: result.replyMarkdown || (result.preview
            ? `${result.message} 已生成投喂大脑草稿：${result.draft.title}。`
            : `已完成统一投喂链路：AI解析 → 结构化为「${result.draft.title}」→ 分类到「${result.draft.category}」→ 训练记录已更新。`),
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
          saveSuggestion: result.saveSuggestion,
          gptProof: result.gptProof,
          gptOS: result.draft.gptOS,
          isRestored: false,
          isHistorical: false,
          isStreaming: true,
          isGenerating: true,
          typing: true,
          status: "streaming"
        }
      ]);
      successRendered = true;
      console.info("[admin-ingest:gpt:success]", {
        provider: result.provider,
        actualModel: result.actualModel ?? result.model,
        contentLength: (result.replyMarkdown || result.draft.summary || result.message || "").length,
        requestId
      });
      pushNotification({
        type: "success",
        title: "最近投喂完成",
        description: outgoingAttachments.length > 0
          ? `${outgoingAttachments.length} 个附件已加入投喂队列，结构化结果为「${result.draft.title}」。`
          : `结构化结果「${result.draft.title}」已生成，训练记录已刷新。`
      });

      return {
        ...result,
        records: nextRecords
      };
    } catch (error) {
      if (!isCurrentRequest()) {
        return null;
      }

      const stateDomain = getStateDomain(error);
      const errorCode = error instanceof Error ? error.name : undefined;
      const rawErrorMessage = error instanceof Error ? error.message : String(error ?? "");
      const shouldSuppress = shouldSuppressFallbackToast({
        reason: rawErrorMessage,
        stateDomain,
        requestId,
        activeRequestId: activeIngestRequestIdRef.current,
        hasCurrentSuccess: successRendered || ingestSuccessLockRef.current,
        lastSuccessfulAt: lastSuccessfulIngestAtRef.current,
        suppressUntil: suppressFallbackToastUntilRef.current,
        status: undefined,
        errorCode
      });

      if (successRendered || shouldSuppress) {
        console.warn("[admin-ingest:gpt:toast-suppressed]", {
          reason: rawErrorMessage,
          status: undefined,
          errorCode,
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

      const friendlyError = toUserFriendlyMessage(error);
      const message = friendlyError?.message ?? sanitizeGptOSUserMessage(error instanceof Error ? error.message : "AI服务暂时不稳定，请稍后再试。");

      console.error("[admin-ingest:gpt:error]", {
        url: "/api/admin/kb/ingest/gpt",
        status: undefined,
        errorCode,
        message,
        provider: selectedModelOption.provider,
        model: currentModelLabel,
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
        status: undefined,
        errorCode
      });

      if (!realIngestFailure) {
        console.warn("[admin-ingest:gpt:error:ignored]", {
          reason: "not_real_ingest_failure",
          status: undefined,
          errorCode,
          requestId,
          stateDomain
        });
        setGptFallbackToast(null);
        setErrorMessage("");
        setNoticeMessage("已忽略非当前投喂请求的临时状态。");
        return null;
      }

      showGptFallbackToast(message, {
        reason: "ingest_failure",
        stateDomain,
        requestId,
        status: undefined,
        errorCode
      });
      setNoticeMessage("AI服务暂时不稳定，请稍后再试。");
      setErrorMessage(message);
      return null;
    } finally {
      if (isCurrentRequest()) {
        setIsParsing(false);
      }
    }
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

  function handleUpload(files: File[]) {
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
      platform: platformContext.platform
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

    if (target?.previewUrl && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
      URL.revokeObjectURL(target.previewUrl);
    }

    setUploadedFiles((current) => current.filter((file) => file.id !== fileId));
    showActionToast({
      type: "info",
      title: "已移除附件"
    });
  }

  function handleModelChange(model: string) {
    if (isParsing) {
      setNoticeMessage("当前请求进行中，发送完成后再切换模型。");
      return;
    }

    const nextModel = getIngestModelOptionByLabel(model);

    setSelectedModel(nextModel.label);
    setResolvedModel(nextModel.label);
    setErrorMessage("");
    setGptFallbackToast(null);
    window.localStorage.setItem(ADMIN_INGEST_MODEL_STORAGE_KEY, nextModel.label);
    setNoticeMessage(`当前模型已切换为 ${nextModel.label}，下一次投喂会携带 ${nextModel.provider} provider 和三端同步字段。`);
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

  async function handleCheckGptStatus(action: "check" | "reconnect" = "check") {
    setIsCheckingGptHealth(true);
    setErrorMessage("");
    setNoticeMessage(action === "reconnect" ? `正在重新连接 ${selectedModelOption.label}...` : `正在检查 ${selectedModelOption.label} 接口状态...`);

    try {
      const nextStatus = await checkGptHealthStatus({
        provider: selectedModelOption.provider,
        selectedModelLabel: selectedModelOption.label,
        preferredModel: selectedModelOption.provider === "openai" ? selectedGptModel.apiModel : selectedModelOption.defaultModel
      });

      setGptHealthStatus(nextStatus);

      if (nextStatus.ok) {
        setGptFallbackToast(null);
        setNoticeMessage(action === "reconnect" ? `${selectedModelOption.label} 接口已连接，可重新生成。` : `${selectedModelOption.label} 接口已连接。`);
        showActionToast({
          type: "success",
          title: action === "reconnect" ? `${selectedModelOption.label} 接口已连接，可重新生成` : `${selectedModelOption.label} 接口已连接`,
          description: nextStatus.selectedModelLabel
        });
      } else {
        const safeMessage = sanitizeGptOSUserMessage(nextStatus.message);

        setGptFallbackToast(null);
        setNoticeMessage(safeMessage);
        showActionToast({
          type: "warning",
          title: "AI连接暂时不可用",
          description: safeMessage
        });
      }

      pushNotification({
        type: nextStatus.ok ? "success" : "fallback",
        title: nextStatus.ok ? `${selectedModelOption.label} 接口已连接` : `${selectedModelOption.label} 接口诊断提醒`,
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

    if (label === "图片 OCR") {
      setNoticeMessage("图片 OCR 入口已响应：请选择图片文件，下一阶段接入真实 OCR 解析。");
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
    onAgentConversationRename: handleRenameAgentConversation,
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
    onSave: handleSave,
    onReconnectGpt: () => handleCheckGptStatus("reconnect"),
    onUpload: handleUpload,
    onRemoveUpload: handleRemoveUpload,
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
        </div>
      ) : null}

      {mode === "knowledge"
        ? <IngestKnowledgeOSDashboard onBack={() => setMode("chat")} />
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
        onClose={() => setOpenPanel(null)}
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
