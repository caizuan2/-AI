"use client";

import {
  useEffect,
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
import { IngestWelcomeHero } from "@/components/enterprise-admin/IngestWelcomeHero";
import { IngestGPTMessageRenderer } from "@/components/enterprise-admin/IngestGPTMessageRenderer";
import { IngestGPTCallProofBadge } from "@/components/enterprise-admin/IngestGPTCallProofBadge";
import { IngestKnowledgeDraftActions } from "@/components/enterprise-admin/IngestKnowledgeDraftActions";
import {
  buildIngestUserMessageCopyText,
  IngestChatGPTFileMessage
} from "@/components/enterprise-admin/IngestChatGPTFileMessage";
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
import type { GptCallProof, OpenAIGptUsage } from "@/lib/enterprise/gpt-call-proof";

const quickPrompts = [
  "把这段客服对话整理成标准问答",
  "从 PDF 内容提取知识点并分类",
  "生成售后流程的入库建议",
  "检查这条知识是否需要 AI 修正"
];

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
}

const uploadAcceptByTool: Record<string, string> = {
  "文件上传": ".pdf,.doc,.docx,.ppt,.pptx,image/*,.txt,.md",
  "图片 OCR": "image/*"
};

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  message?: string;
  error?: {
    message?: string;
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
  saveStatus: "pending" | "saved" | "rejected";
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
}

interface AdminTrainingRecordResponse {
  id: string;
  jobId: string;
  input: string;
  ai_output: AdminIngestDraftResponse | null;
  resultTitle: string;
  category: string;
  status: "pending" | "saved" | "rejected";
  sourceType: string;
  timestamp: string;
  hits: number;
}

interface AdminGptIngestResponse {
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
  replyMarkdown: string;
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
  structured: {
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
  records: AdminTrainingRecordResponse[];
}

async function readApiData<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;

  if (!response.ok || !payload?.ok || !payload.data) {
    throw new Error(payload?.message ?? payload?.error?.message ?? "请求失败，请稍后重试。");
  }

  return payload.data;
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
  if (status === "saved") {
    return "已保存";
  }

  if (status === "rejected") {
    return "已拒绝";
  }

  return "待确认";
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
    gptProof: draft.gptProof
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
    saveStatus: toSaveStatus(record.status),
    category: record.category,
    time: getTimeLabel(record.timestamp),
    hits: record.hits,
    sourceType: record.sourceType,
    aiOutput: draft
  };
}

function toStructuredPayload(draft: IngestKnowledgeDraft) {
  return {
    title: draft.title,
    category: draft.category,
    tags: draft.tags,
    summary: draft.summary ?? draft.standardAnswer,
    qa_pairs: draft.qaPairs?.length
      ? draft.qaPairs
      : [{ q: draft.standardQuestion, a: draft.standardAnswer }],
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
    fallbackUsed: draft.fallbackUsed ?? false
  };
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
  onToast
}: IngestChatGPTShellProps = {}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
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
  const [drawerView, setDrawerView] = useState<"draft" | "records">("draft");
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isConnectionOpen, setIsConnectionOpen] = useState(false);
  const [isOrganizeOpen, setIsOrganizeOpen] = useState(false);
  const [fileAccept, setFileAccept] = useState(".pdf,.doc,.docx,.ppt,.pptx,image/*,.txt,.md");

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
  const selectedModelLabel = selectedModel;

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
        const response = await fetch("/api/admin/kb/ingest", { cache: "no-store" });
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

      const result = await onSend(value || undefined);

      if (result) {
        setDrawerView("draft");
      }

      return;
    }

    setThinkingStartedAt(Date.now());
    setThinkingElapsedSeconds(0);
    setInternalIsParsing(true);
    setErrorMessage("");
    setNoticeMessage("");
    setInput("");
    setMessages((current) => [
      ...current,
      {
        id: `user-${Date.now()}`,
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

    try {
      const modelOption = getIngestModelOptionByLabel(selectedModelLabel);
      const gptSelection = getGptModelSelectionByDisplayName(modelOption.provider === "openai" ? selectedModelLabel : "GPT-5.5 超高");
      const preferredModel = modelOption.provider === "openai" ? gptSelection.apiModel : modelOption.defaultModel;
      const abortController = new AbortController();
      const timeout = window.setTimeout(() => abortController.abort(), GPT_CLIENT_TIMEOUT_MS);
      const response = await fetch("/api/admin/kb/ingest/gpt", {
        method: "POST",
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
          attachments: uploadedFiles.map((file) => ({ ...file, status: "attached" }))
        })
      }).finally(() => window.clearTimeout(timeout));
      const data = await readApiData<AdminGptIngestResponse>(response);

      if (!data.gptProof || data.gptProof.fallback !== false || (!data.responseId && !data.proofId)) {
        throw new Error(`${modelOption.label} 未返回有效调用证据，本次不插入成功回复。`);
      }

      setErrorMessage("");
      const knowledgeDraft = data.knowledgeDraft;
      const nextDraft = mapDraft({
        jobId: `gpt-${Date.now()}`,
        title: knowledgeDraft?.title || data.structured.title || "GPT 结构化知识",
        category: knowledgeDraft?.category || data.structured.category || activeAgent.role,
        tags: knowledgeDraft?.tags ?? data.structured.tags ?? [],
        summary: knowledgeDraft?.summary || data.structured.summary || data.structured.answer || value,
        qa_pairs: [{
          q: knowledgeDraft?.standardQuestion || data.structured.question || `关于“${data.structured.title || value}”，应该如何处理？`,
          a: knowledgeDraft?.standardAnswer || data.structured.answer || data.structured.summary || value
        }],
        confidence: knowledgeDraft?.trainingScore ?? data.structured.confidence ?? 78,
        should_save: data.structured.saveSuggestion ?? data.saveRecommendation !== "暂缓入库",
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
        generatedBy: data.provider,
        fallbackUsed: false,
        saveStatus: "pending"
      });

      setDraft(nextDraft);
      setRecords((current) => [
        {
          id: `record-gpt-${Date.now()}`,
          jobId: nextDraft.jobId,
          input: value,
          resultTitle: nextDraft.title,
          saveStatus: "待确认",
          category: nextDraft.category,
          time: getTimeLabel(),
          hits: 0,
          sourceType: "admin_ingest",
          aiOutput: nextDraft
        },
        ...current
      ]);
      setDrawerView("draft");
      setMessages((current) => [
        ...current,
        {
          id: `assistant-result-${Date.now()}`,
          role: "assistant",
          content: data.replyMarkdown || `GPT 已完成解析：AI解析 → 结构化为「${nextDraft.title}」→ 分类到「${nextDraft.category}」→ 等待保存确认。`,
          time: getTimeLabel(),
          agentId: activeAgent.id,
          expertId: activeAgent.expertId ?? null,
          agentName: activeAgent.name,
          expertName: activeAgent.expertId ? activeAgent.name : null,
          model: data.modelDisplayName || data.model,
          provider: data.provider,
          saveSuggestion: data.structured.saveSuggestion,
          gptProof: data.gptProof
        }
      ]);
    } catch (error) {
      setErrorMessage(isAbortError(error) ? "GPT-5.5 本次响应超时，请稍后重试。" : error instanceof Error ? error.message : "AI投喂失败，请稍后重试。");
    } finally {
      setInternalIsParsing(false);
    }
  }

  async function handleSaveDraft() {
    if (onSave) {
      const result = await onSave();

      if (result) {
        setDrawerView("records");
        setDrawerOpen(true);
      }

      return;
    }

    if (!draft.jobId) {
      setNoticeMessage("请先生成结构化结果，再保存知识入库。");
      return;
    }

    setInternalIsSaving(true);
    setErrorMessage("");
    setNoticeMessage("");

    try {
      const response = await fetch("/api/admin/kb/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          jobId: draft.jobId,
          structured: toStructuredPayload(draft),
          knowledge: toStructuredPayload(draft),
          agentId: activeAgent.id,
          source: "admin_ingest",
          platform: "web",
          syncTarget: ["web", "exe", "apk"]
        })
      });
      const data = await readApiData<AdminSaveResponse>(response);

      setDraft((current) => ({
        ...current,
        saveStatus: "已保存"
      }));
      setRecords(data.records.map(mapRecord));
      setDrawerView("records");
      setDrawerOpen(true);
      setNoticeMessage("已保存知识入库，训练记录已更新。");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "保存知识入库失败，请稍后重试。");
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
    if (options.toggle && drawerOpen && drawerView === view) {
      setDrawerOpen(false);
      return;
    }

    setDrawerView(view);
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

  async function handleCopyMessage(content: string) {
    try {
      await navigator.clipboard.writeText(content);
      showToast("已复制");
    } catch {
      showToast("复制失败", "当前环境暂不允许写入剪贴板。", "warning");
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

  const hasMessages = messages.length > 0;
  const isExpertMarketplace = activeRailKey === "experts";

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
            <button type="button" onClick={() => openDrawer("draft", { toggle: true })} className="hidden rounded-full bg-[#f3f3f1] px-3 py-2 text-xs font-semibold text-[#555] transition hover:bg-[#ededeb] sm:inline-flex">
              结构化结果
            </button>
          </div>
        ) : null}

        <div className={["min-h-0 flex-1 overflow-y-auto", isExpertMarketplace ? "bg-[#f7f7f6] px-5 py-5" : "px-5 pb-5 pt-4"].join(" ")}>
          <div className={isExpertMarketplace ? "mx-auto flex min-h-full w-full max-w-[1280px] flex-col" : "mx-auto flex min-h-full w-full max-w-[860px] flex-col justify-center"}>
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
              <div className="mx-auto flex w-full max-w-[860px] flex-col items-center text-center">
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
              <div className="mx-auto w-full max-w-[860px] space-y-5 pt-8">
                {messages.map((message) => {
                  const isStructuredResult = message.role === "assistant" && message.id.startsWith("assistant-result");
                  const messageAgent = agentById.get(message.agentId ?? "") ?? activeAgent;
                  const messageProfile = resolveAdminIngestDisplayProfile({
                    currentAgent: messageAgent,
                    appName,
                    adminAvatar
                  });
                  const messageAgentLabel = message.agentName ?? agentLabelById.get(message.agentId ?? activeAgent.id) ?? messageProfile.agentName;

                  if (message.role === "user" && message.attachments?.length) {
                    return (
                      <div key={message.id} className="flex justify-end">
                        <IngestChatGPTFileMessage
                          message={message}
                          agentLabel={messageAgentLabel}
                          modelLabel={message.model ?? selectedModelLabel}
                          onCopy={() => void handleCopyMessage(buildIngestUserMessageCopyText(message))}
                          onEdit={() => handleEditMessage(message)}
                        />
                      </div>
                    );
                  }

                  return (
                  <div key={message.id} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
                    <div className={[
                      "text-sm leading-6",
                      isStructuredResult || message.role === "assistant" ? "w-full max-w-full" : "max-w-[82%]",
                      message.role === "user"
                        ? "rounded-[24px] bg-[#202020] px-4 py-3 text-white shadow-sm"
                        : isStructuredResult
                          ? "px-1 py-2 text-[#303030]"
                          : "px-1 py-3 text-[#303030]"
                    ].join(" ")}>
                      {message.role === "assistant" ? (
                        <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold text-[#666]">
                          <IngestAgentAvatar profile={messageProfile} size="xs" />
                          <span className="truncate">{message.expertName ?? messageProfile.expertName}</span>
                        </div>
                      ) : null}
                      {message.role === "assistant" ? (
                        <IngestGPTMessageRenderer content={message.content} />
                      ) : (
                        <div>
                          {message.attachments?.length ? <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55">投喂说明</p> : null}
                          <p className="whitespace-pre-wrap">{message.content}</p>
                        </div>
                      )}
                      {message.attachments?.length ? (
                        <div className="mt-3">
                          <IngestAttachmentPreview files={message.attachments} compact />
                        </div>
                      ) : null}
                      {message.role === "user" ? (
                        <div className="mt-3 flex flex-wrap justify-end gap-2">
                          <IngestMessageQuickActions
                            onCopy={() => void handleCopyMessage(buildIngestUserMessageCopyText(message))}
                            onEdit={() => handleEditMessage(message)}
                            tone="dark"
                          />
                        </div>
                      ) : null}
                      {message.role === "assistant" && message.provider === "local-fallback" ? (
                        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                          <span className="rounded-full bg-[#fff3d8] px-2 py-1 font-semibold text-[#9a6500]">离线草稿</span>
                        </div>
                      ) : null}
                      {message.role === "assistant" && message.id.startsWith("assistant-result") ? (
                        <IngestKnowledgeDraftActions
                          isSaving={isSaving}
                          isSaved={draft.saveStatus === "已保存"}
                          isParsing={isParsing}
                          onCopy={() => void handleCopyMessage(message.content)}
                          onOpenDraft={() => openDrawer("draft")}
                          onSave={() => void handleSaveDraft()}
                          onRegenerate={() => void handleRegenerate(message.content)}
                          onContinueOptimize={handleContinueOptimize}
                        />
                      ) : null}
                      <p className={message.role === "user" ? "mt-2 text-[11px] text-white/50" : "mt-2 text-[11px] text-[#999]"}>
                        {message.time}
                      </p>
                    </div>
                  </div>
                  );
                })}

                {isParsing ? (
                  <div className="flex items-center gap-3 rounded-2xl border border-[#e2e2df] bg-[#f5f5f4] px-4 py-3 text-sm text-[#303030] shadow-sm">
                    <span className="shrink-0 text-xs font-semibold text-[#777]">已思考 {formatThinkingDuration(thinkingElapsedSeconds)} &gt;</span>
                    <span className="h-1 w-1 rounded-full bg-[#c7c7c1]" aria-hidden="true" />
                    <Loader2 className="h-4 w-4 animate-spin text-[#666]" aria-hidden="true" />
                    <span>AI 正在解析并生成知识结构...</span>
                  </div>
                ) : null}
              </div>
            )}
              </>
            )}
          </div>
        </div>

        {!isExpertMarketplace ? (
        <div className="shrink-0 bg-white px-5 pb-7">
          <form onSubmit={handleSubmit} className="mx-auto w-full max-w-[860px] rounded-[28px] border border-[#e4e4e1] bg-white p-3 shadow-[0_14px_45px_rgba(15,23,42,0.07)]">
            {uploadedFiles.length > 0 ? (
              <div className="mb-2 rounded-2xl bg-[#f8f8f7] p-2">
                <IngestAttachmentPreview files={uploadedFiles} onRemove={onRemoveUpload} />
              </div>
            ) : null}
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              rows={3}
              disabled={!canIngest}
              placeholder={canIngest ? `可以向${activeAgent.name}描述任务或提问任何问题` : "请先到专家广场添加专家 Agent"}
              className="min-h-[88px] w-full resize-none rounded-2xl border-0 bg-white px-3 py-3 text-sm leading-6 outline-none placeholder:text-[#aaa] disabled:cursor-not-allowed disabled:bg-[#fbfbfa] disabled:text-[#aaa]"
            />
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept={fileAccept}
              multiple
              onChange={handleFileChange}
            />
            <div className="flex flex-col gap-2 border-t border-[#f0f0ee] pt-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-semibold text-[#555]">
                <IngestGPTModelPicker
                  selectedModel={selectedModelLabel}
                  disabled={isParsing}
                  onModelChange={(selection) => onModelChange?.(selection.label)}
                  onOpen={() => {
                    setIsMoreOpen(false);
                    setIsConnectionOpen(false);
                    setIsOrganizeOpen(false);
                  }}
                />
                <div ref={moreMenuRef} className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setIsMoreOpen((current) => !current);
                      setIsConnectionOpen(false);
                      setIsOrganizeOpen(false);
                    }}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#f6f6f5] px-3 transition hover:bg-[#ededeb]"
                    aria-expanded={isMoreOpen}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    更多 +
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
              <div className="flex shrink-0 items-center justify-end gap-1.5">
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
                <div className="flex rounded-full bg-[#ededeb] p-1 text-xs font-semibold text-[#555]">
                  <button type="button" onClick={() => setDrawerView("draft")} className={drawerView === "draft" ? "rounded-full bg-white px-3 py-1.5 text-[#202020] shadow-sm" : "px-3 py-1.5"}>结构化结果</button>
                  <button type="button" onClick={() => setDrawerView("records")} className={drawerView === "records" ? "rounded-full bg-white px-3 py-1.5 text-[#202020] shadow-sm" : "px-3 py-1.5"}>训练记录</button>
                </div>
                <button type="button" aria-label="关闭详情抽屉" onClick={() => setDrawerOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#555] shadow-sm hover:bg-[#f3f3f1]">
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              {drawerView === "draft" ? (
                <KnowledgeDraftPanel draft={draft} isSaving={isSaving} onSave={handleSaveDraft} />
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
  onSave
}: {
  draft: IngestKnowledgeDraft;
  isSaving: boolean;
  onSave: () => void;
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
          disabled={draft.saveStatus === "已保存" || isSaving || !draft.jobId}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-2xl bg-[#202020] text-sm font-semibold text-white transition hover:bg-black disabled:bg-[#d9d9d6] disabled:text-[#777]"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : draft.saveStatus === "已保存" ? <Check className="h-4 w-4" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
          {isSaving ? "正在保存入库..." : draft.saveStatus === "已保存" ? "已保存到知识库" : draft.jobId ? "保存知识入库" : "先发送AI投喂"}
        </button>
      </div>
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
                : record.saveStatus === "已拒绝"
                  ? "rounded-full bg-[#ffe5e9] px-2 py-0.5 text-[11px] font-semibold text-[#b93b4a]"
                  : "rounded-full bg-[#fff3d8] px-2 py-0.5 text-[11px] font-semibold text-[#9a6500]"}>
                {record.saveStatus}
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
