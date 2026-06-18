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
  ImagePlus,
  Link2,
  Loader2,
  Mic,
  Paperclip,
  Plug,
  Plus,
  Copy,
  Pencil,
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
import { IngestAgentMoreMenu } from "@/components/enterprise-admin/IngestAgentMoreMenu";
import { IngestGPTModelPicker } from "@/components/enterprise-admin/IngestGPTModelPicker";
import {
  ingestPrimaryRailFeatures,
  type IngestRailKey
} from "@/components/enterprise-admin/IngestRailConfig";
import { IngestTenantSummary } from "@/components/enterprise-admin/IngestTenantSummary";
import { getAdminIngestPlatformLabel } from "@/lib/enterprise/admin-ingest-platform";
import type {
  IngestConnectionStatus,
  IngestVoiceState,
  IngestUploadState
} from "@/lib/enterprise/ingest-client";
import {
  DEFAULT_GPT_MODEL_SELECTION,
  getGptModelSelectionByDisplayName
} from "@/lib/enterprise/gpt-model-options";
import { ingestEXECollections } from "@/lib/enterprise/mock-ingest";
import {
  ingestChatAgents,
  ingestChatInitialDraft,
  ingestTrainingRecords,
  type IngestChatAgent,
  type IngestChatMessage,
  type IngestKnowledgeDraft,
  type IngestTrainingRecord
} from "@/lib/enterprise/mock-chat";

const agentToneClasses: Record<IngestChatAgent["tone"], string> = {
  green: "bg-[#ddf7e6] text-[#128246]",
  blue: "bg-[#e7f0ff] text-[#2d5fa8]",
  amber: "bg-[#fff2d6] text-[#9a6500]",
  rose: "bg-[#ffe5e9] text-[#b93b4a]",
  slate: "bg-[#edf0f4] text-[#475569]"
};

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

type IngestActionResult = {
  draft: IngestKnowledgeDraft;
  records: IngestTrainingRecord[];
  preview: boolean;
  message: string;
};

interface IngestChatGPTShellProps {
  agents?: IngestChatAgent[];
  activeAgent?: IngestChatAgent;
  activeAgentId?: string;
  onAgentChange?: (agentId: string) => void;
  activeRailKey?: IngestRailKey;
  onRailChange?: (key: IngestRailKey) => void;
  searchKeyword?: string;
  onSearchKeywordChange?: (value: string) => void;
  selectedModel?: string;
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
  onAgentViewDetails?: (agentId: string) => void;
  onAgentEdit?: (agentId: string) => void;
  onAgentArchive?: (agentId: string) => void;
  onAgentDelete?: (agentId: string) => void;
  onNoticeChange?: (message: string) => void;
  onErrorChange?: (message: string) => void;
  onSend?: (value?: string) => Promise<IngestActionResult | null>;
  onSave?: () => Promise<IngestActionResult | null>;
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
  provider: "openai";
  model: string;
  modelDisplayName?: string;
  modelMode: "highest" | "fixed";
  replyMarkdown: string;
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
    fallbackUsed: draft.fallbackUsed
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
  activeAgentId: controlledActiveAgentId,
  onAgentChange,
  activeRailKey: controlledActiveRailKey,
  onRailChange,
  searchKeyword: controlledSearchKeyword,
  onSearchKeywordChange,
  selectedModel = DEFAULT_GPT_MODEL_SELECTION.displayName,
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
  onAgentViewDetails,
  onAgentEdit,
  onAgentArchive,
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
  const [internalActiveAgentId, setInternalActiveAgentId] = useState("chief");
  const [internalMessages, setInternalMessages] = useState<IngestChatMessage[]>([]);
  const [internalDraft, setInternalDraft] = useState<IngestKnowledgeDraft>(ingestChatInitialDraft);
  const [internalRecords, setInternalRecords] = useState<IngestTrainingRecord[]>(ingestTrainingRecords);
  const [internalInput, setInternalInput] = useState("");
  const [internalIsParsing, setInternalIsParsing] = useState(false);
  const [internalIsSaving, setInternalIsSaving] = useState(false);
  const [internalNoticeMessage, setInternalNoticeMessage] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerView, setDrawerView] = useState<"draft" | "records">("draft");
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isConnectionOpen, setIsConnectionOpen] = useState(false);
  const [isOrganizeOpen, setIsOrganizeOpen] = useState(false);
  const [fileAccept, setFileAccept] = useState(".pdf,.doc,.docx,.ppt,.pptx,image/*,.txt,.md");

  const agents = controlledAgents ?? ingestChatAgents;
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

  const activeAgent = useMemo(
    () => controlledActiveAgent ?? agents.find((agent) => agent.id === activeAgentId) ?? agents[0] ?? ingestChatAgents[0],
    [activeAgentId, agents, controlledActiveAgent]
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
  const filteredRecords = useMemo(
    () => normalizedSearch
      ? records.filter((record) => [record.resultTitle, record.category, record.input, record.agentName].join(" ").toLowerCase().includes(normalizedSearch))
      : records,
    [normalizedSearch, records]
  );
  const filteredCollections = useMemo(
    () => normalizedSearch
      ? ingestEXECollections.filter((item) => [item.name, item.kind, item.status].join(" ").toLowerCase().includes(normalizedSearch))
      : ingestEXECollections,
    [normalizedSearch]
  );
  const hasSearchResults = filteredAgents.length > 0 || filteredRecords.length > 0 || filteredCollections.length > 0;
  const agentLabelById = useMemo(
    () => new Map(agents.map((agent) => [agent.id, `${agent.name} · ${agent.role}`])),
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const value = input.trim();
    const hasAttachments = uploadedFiles.length > 0;

    if (!value && !hasAttachments) {
      return;
    }

    const now = getTimeLabel();

    if (onSend) {
      setErrorMessage("");
      setNoticeMessage("");

      const result = await onSend(value || undefined);

      if (result) {
        setDrawerView("draft");
      }

      return;
    }

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
        time: now
      },
      {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: "AI 正在解析投喂内容，并准备生成结构化知识。",
        time: now
      }
    ]);

    try {
      const gptSelection = getGptModelSelectionByDisplayName(selectedModelLabel);
      const response = await fetch("/api/admin/kb/ingest/gpt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          input: value,
          source: "admin_ingest",
          agentId: activeAgent.id,
          agentName: activeAgent.name,
          category: activeAgent.role,
          platform: "web",
          syncTarget: ["web", "exe", "apk"],
          modelProvider: "openai",
          modelMode: "highest",
          preferredModel: gptSelection.apiModel,
          gptTier: gptSelection.tier,
          gptTierLabel: gptSelection.tierLabel,
          gptVersion: gptSelection.version,
          selectedModelLabel: gptSelection.displayName,
          modelDisplayName: gptSelection.displayName
        })
      });
      const data = await readApiData<AdminGptIngestResponse>(response);
      const nextDraft = mapDraft({
        jobId: `gpt-${Date.now()}`,
        title: data.structured.title || "GPT 结构化知识",
        category: data.structured.category || activeAgent.role,
        tags: data.structured.tags ?? [],
        summary: data.structured.summary || data.structured.answer || value,
        qa_pairs: [{
          q: data.structured.question || `关于“${data.structured.title || value}”，应该如何处理？`,
          a: data.structured.answer || data.structured.summary || value
        }],
        confidence: data.structured.confidence ?? 78,
        should_save: data.structured.saveSuggestion ?? true,
        providerUsed: data.provider,
        model: data.modelDisplayName || data.model,
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
          time: getTimeLabel()
        }
      ]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "AI投喂失败，请稍后重试。");
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

  return (
    <main className="flex h-screen overflow-hidden bg-[#f7f7f6] text-[#191919]">
      <aside className="flex h-screen w-[68px] shrink-0 flex-col items-center border-r border-[#e9e9e6] bg-[#eeeeec] py-5">
        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-white bg-[#d9f8e9] text-sm font-semibold text-[#128246] shadow-sm">
          AI
        </div>

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

      <aside className="hidden h-screen w-[240px] shrink-0 flex-col border-r border-[#ededeb] bg-[#fbfbfa] md:flex">
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
            新建 Agent
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          <div className="space-y-1.5">
            {!hasSearchResults ? (
              <div className="mx-2 rounded-2xl bg-[#f6f6f5] px-3 py-4 text-center text-xs leading-5 text-[#8a8a86]">
                没有找到相关 Agent 或知识库
              </div>
            ) : null}
            {filteredAgents.map((agent) => (
              <div
                key={agent.id}
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
                  "group w-full cursor-pointer rounded-2xl p-3 text-left transition",
                  activeAgent.id === agent.id ? "bg-[#e9e9e7] ring-1 ring-[#d8d8d4]" : "hover:bg-[#f0f0ee]"
                ].join(" ")}
              >
                <div className="flex gap-3">
                  <span className={["flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold", agentToneClasses[agent.tone]].join(" ")}>
                    {agent.avatar}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="block truncate text-sm font-semibold text-[#202020]">{agent.name}</span>
                      <span className="flex shrink-0 items-center gap-1">
                        {agent.status === "archived" ? <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#9a6500]">已归档</span> : null}
                        {activeAgent.id === agent.id ? (
                          <>
                            <span className="hidden rounded-full bg-[#e9f8ef] px-1.5 py-0.5 text-[10px] font-semibold text-[#128246] xl:inline">当前使用中</span>
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#202020] text-white">
                              <Check className="h-3 w-3" aria-hidden="true" />
                            </span>
                          </>
                        ) : null}
                        <IngestAgentMoreMenu
                          agent={agent}
                          onViewDetails={(agentId) => {
                            if (onAgentViewDetails) {
                              onAgentViewDetails(agentId);
                              return;
                            }

                            setActiveAgentId(agentId);
                          }}
                          onEdit={(agentId) => onAgentEdit?.(agentId)}
                          onArchive={(agentId) => onAgentArchive?.(agentId)}
                          onDelete={(agentId) => onAgentDelete?.(agentId)}
                        />
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-[#9a9a96]">{agent.role}</span>
                    <span className="mt-2 block line-clamp-2 text-xs leading-5 text-[#70706b]">{agent.description}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>

          {filteredCollections.length > 0 ? (
            <div className="mx-2 mt-4 border-t border-[#eeeeeb] pt-4">
              <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9b9b96]">知识库 / 分类</p>
              <div className="mt-2 space-y-1">
                {filteredCollections.slice(0, normalizedSearch ? 4 : 2).map((item) => (
                  <button key={item.id} type="button" onClick={() => onRailChange?.("experts")} className="w-full rounded-xl px-2 py-2 text-left hover:bg-[#f0f0ee]">
                    <span className="block truncate text-xs font-semibold text-[#303030]">{item.name}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-[#8c8c88]">{item.kind} · {item.count} · {item.status}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mx-2 mt-4 border-t border-[#eeeeeb] pt-4">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9b9b96]">最近投喂</p>
            <div className="mt-2 space-y-1">
              {filteredRecords.slice(0, 3).map((record) => (
                <button key={record.id} type="button" onClick={() => openDrawer("records", { toggle: true })} className="w-full rounded-xl px-2 py-2 text-left hover:bg-[#f0f0ee]">
                  <span className="block truncate text-xs font-semibold text-[#303030]">{record.resultTitle}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-[#8c8c88]">{record.category} · {record.time}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </aside>

      <section className="relative flex min-w-0 flex-1 flex-col bg-white">
        <div className="flex h-16 shrink-0 items-center justify-end gap-2 border-b border-[#f0f0ee] px-5">
          <button type="button" onClick={() => openDrawer("records", { toggle: true })} className="hidden rounded-full bg-[#f3f3f1] px-3 py-2 text-xs font-semibold text-[#555] transition hover:bg-[#ededeb] sm:inline-flex">
            训练记录
          </button>
          <button type="button" onClick={() => openDrawer("draft", { toggle: true })} className="hidden rounded-full bg-[#f3f3f1] px-3 py-2 text-xs font-semibold text-[#555] transition hover:bg-[#ededeb] sm:inline-flex">
            结构化结果
          </button>
          <IngestTenantSummary compact />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4">
          <div className="mx-auto flex min-h-full max-w-4xl flex-col justify-center">
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
              <div className="mx-auto flex w-full max-w-3xl flex-col items-center text-center">
                <div className={["flex h-20 w-20 items-center justify-center rounded-[30px] text-3xl font-semibold shadow-sm", agentToneClasses[activeAgent.tone]].join(" ")}>
                  {activeAgent.avatar}
                </div>
                <h1 className="mt-6 text-4xl font-semibold tracking-tight text-[#181818] max-sm:text-3xl">Hi，我是知识投喂助手</h1>
                <p className="mt-3 text-lg text-[#9a9a96]">{activeAgent.name} · {activeAgent.role}</p>
                <div className="mt-24 grid w-full max-w-2xl gap-3 sm:grid-cols-2">
                  {quickPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setInput(prompt)}
                      className="rounded-full bg-[#f6f6f5] px-4 py-3 text-left text-sm text-[#303030] transition hover:bg-[#ededeb]"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mx-auto w-full max-w-3xl space-y-5 pt-8">
                {messages.map((message) => (
                  <div key={message.id} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
                    <div className={[
                      "max-w-[82%] rounded-[24px] px-4 py-3 text-sm leading-6 shadow-sm",
                      message.role === "user" ? "bg-[#202020] text-white" : "border border-[#ececea] bg-[#f8f8f7] text-[#303030]"
                    ].join(" ")}>
                      {message.role === "assistant" ? (
                        <MarkdownOutput content={message.content} />
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
                        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-white/70">
                          <span className="rounded-full bg-white/10 px-2 py-1">Agent：{agentLabelById.get(message.agentId ?? activeAgent.id) ?? activeAgent.name}</span>
                          <span className="rounded-full bg-white/10 px-2 py-1">模型：{message.model ?? selectedModelLabel}</span>
                          <span className="rounded-full bg-white/10 px-2 py-1">Web / EXE / APK</span>
                        </div>
                      ) : null}
                      {message.role === "user" ? (
                        <div className="mt-3 flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => void handleCopyMessage(message.content)}
                            className="inline-flex h-7 items-center gap-1 rounded-full bg-white/10 px-2.5 text-[11px] font-semibold text-white/80 transition hover:bg-white/15 hover:text-white"
                          >
                            <Copy className="h-3 w-3" aria-hidden="true" />
                            复制
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEditMessage(message)}
                            className="inline-flex h-7 items-center gap-1 rounded-full bg-white/10 px-2.5 text-[11px] font-semibold text-white/80 transition hover:bg-white/15 hover:text-white"
                          >
                            <Pencil className="h-3 w-3" aria-hidden="true" />
                            编辑
                          </button>
                        </div>
                      ) : null}
                      {message.role === "assistant" && (message.model || message.saveSuggestion !== undefined) ? (
                        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                          {message.model ? <span className="rounded-full bg-white px-2 py-1 font-semibold text-[#555] shadow-sm">模型：{message.model}</span> : null}
                          {message.saveSuggestion !== undefined ? (
                            <span className={message.saveSuggestion ? "rounded-full bg-[#e9f8ef] px-2 py-1 font-semibold text-[#128246]" : "rounded-full bg-[#fff3d8] px-2 py-1 font-semibold text-[#9a6500]"}>
                              {message.saveSuggestion ? "建议入库" : "建议复核"}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      {message.role === "assistant" && message.id.startsWith("assistant-result") ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button type="button" onClick={() => void handleCopyMessage(message.content)} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#555] shadow-sm">
                            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                            复制
                          </button>
                          <button type="button" onClick={() => openDrawer("draft")} className="rounded-full bg-[#202020] px-3 py-1.5 text-xs font-semibold text-white">查看结构化结果</button>
                          <button type="button" onClick={handleSaveDraft} disabled={isSaving || draft.saveStatus === "已保存"} className="rounded-full bg-[#e9f8ef] px-3 py-1.5 text-xs font-semibold text-[#128246] disabled:text-[#aaa]">
                            {draft.saveStatus === "已保存" ? "已保存" : "保存知识入库"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setInput(draft.standardQuestion || draft.title || message.content);
                              setNoticeMessage("已将当前结构化结果放回输入框，可再次发送重新生成。");
                            }}
                            className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#555] shadow-sm"
                          >
                            重新生成
                          </button>
                        </div>
                      ) : null}
                      <p className={message.role === "user" ? "mt-2 text-[11px] text-white/50" : "mt-2 text-[11px] text-[#999]"}>
                        {message.time}
                      </p>
                    </div>
                  </div>
                ))}

                {draft.jobId ? (
                  <div className="flex justify-start">
                    <div className="rounded-[24px] border border-[#e7e7e4] bg-white px-4 py-3 text-sm shadow-sm">
                      <p className="font-semibold text-[#202020]">AI 整理结果已准备好</p>
                      <p className="mt-1 text-xs text-[#777]">{draft.title} · {draft.category} · {draft.recommendation}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" onClick={() => openDrawer("draft")} className="rounded-full bg-[#202020] px-3 py-2 text-xs font-semibold text-white">查看结构化结果</button>
                        <button type="button" onClick={handleSaveDraft} disabled={isSaving || draft.saveStatus === "已保存"} className="rounded-full bg-[#e9f8ef] px-3 py-2 text-xs font-semibold text-[#128246] disabled:text-[#aaa]">
                          {draft.saveStatus === "已保存" ? "已保存" : "保存知识入库"}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}

                {isParsing ? (
                  <div className="flex items-center gap-2 rounded-2xl bg-[#f8f8f7] px-4 py-3 text-sm text-[#666]">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    AI 正在解析并生成知识结构...
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 bg-white px-5 pb-7">
          <form onSubmit={handleSubmit} className="mx-auto max-w-4xl rounded-[28px] border border-[#e4e4e1] bg-white p-3 shadow-[0_14px_45px_rgba(15,23,42,0.07)]">
            {uploadedFiles.length > 0 ? (
              <div className="mb-2 rounded-2xl bg-[#f8f8f7] p-2">
                <IngestAttachmentPreview files={uploadedFiles} onRemove={onRemoveUpload} />
              </div>
            ) : null}
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              rows={3}
              placeholder={`可以向${activeAgent.name}描述任务或提问任何问题`}
              className="min-h-[88px] w-full resize-none rounded-2xl border-0 bg-white px-3 py-3 text-sm leading-6 outline-none placeholder:text-[#aaa]"
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
                  onModelChange={(selection) => onModelChange?.(selection.displayName)}
                  onOpen={() => {
                    setIsMoreOpen(false);
                    setIsConnectionOpen(false);
                  }}
                />
                <div ref={moreMenuRef} className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setIsMoreOpen((current) => !current);
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
                <div className="relative">
                  <button type="button" title="AI 修正 / 整理工具" aria-label="AI 修正 / 整理工具" onClick={() => setIsOrganizeOpen((current) => !current)} className="flex h-9 w-9 items-center justify-center rounded-full text-[#555] hover:bg-[#f3f3f1]" aria-expanded={isOrganizeOpen}>
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
                  disabled={isParsing || (!input.trim() && uploadedFiles.length === 0)}
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
        {draft.providerUsed ? (
          <p className="text-center text-[11px] text-[#aaa]">
            Provider：{draft.providerUsed} · {draft.model}{draft.fallbackUsed ? " · fallback" : ""}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function MarkdownOutput({ content }: { content: string }) {
  const segments = content.split(/```/g);

  return (
    <div className="space-y-2 text-sm leading-6 text-[#303030]">
      {segments.map((segment, index) => {
        const key = `${index}-${segment.slice(0, 12)}`;

        if (index % 2 === 1) {
          const lines = segment.replace(/^\w+\n/, "").trim();

          return (
            <pre key={key} className="overflow-x-auto rounded-2xl bg-[#ececea] px-3 py-2 text-xs leading-5 text-[#303030]">
              <code>{lines}</code>
            </pre>
          );
        }

        return segment.split(/\n/g).map((line, lineIndex) => {
          const trimmed = line.trim();
          const lineKey = `${key}-${lineIndex}`;

          if (!trimmed) {
            return <div key={lineKey} className="h-1" />;
          }

          if (trimmed.startsWith("### ")) {
            return <h4 key={lineKey} className="pt-1 text-sm font-semibold text-[#202020]">{renderInlineMarkdown(trimmed.slice(4))}</h4>;
          }

          if (trimmed.startsWith("## ")) {
            return <h3 key={lineKey} className="pt-1 text-base font-semibold text-[#202020]">{renderInlineMarkdown(trimmed.slice(3))}</h3>;
          }

          if (trimmed.startsWith("# ")) {
            return <h2 key={lineKey} className="pt-1 text-lg font-semibold text-[#202020]">{renderInlineMarkdown(trimmed.slice(2))}</h2>;
          }

          if (trimmed.startsWith("- ")) {
            return (
              <div key={lineKey} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#a4a4a0]" />
                <p>{renderInlineMarkdown(trimmed.slice(2))}</p>
              </div>
            );
          }

          return <p key={lineKey}>{renderInlineMarkdown(trimmed)}</p>;
        });
      })}
    </div>
  );
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${part}-${index}`} className="font-semibold text-[#202020]">{part.slice(2, -2)}</strong>;
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[#f8f8f7] p-3">
      <p className="text-xs font-semibold text-[#8b8b86]">{label}</p>
      <p className="mt-1 leading-6 text-[#303030]">{value}</p>
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
        本地预览 · Web / EXE / APK · {statusSummary}
      </span>
    </div>
  );
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
