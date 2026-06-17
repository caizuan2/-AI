"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ComponentType, type FormEvent } from "react";
import {
  Bell,
  BotMessageSquare,
  Brain,
  Check,
  ChevronDown,
  CircleUserRound,
  FileText,
  FileType2,
  FlaskConical,
  FolderOpen,
  ImagePlus,
  Link2,
  ListChecks,
  Loader2,
  Mic,
  Paperclip,
  Plug,
  Plus,
  Presentation,
  Save,
  Scissors,
  Search,
  SendHorizontal,
  Settings,
  Sparkles,
  Tags,
  UploadCloud,
  X
} from "lucide-react";
import { IngestTenantSummary } from "@/components/enterprise-admin/IngestTenantSummary";
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

const primaryNav: Array<{ label: string; title: string; icon: ComponentType<{ className?: string }>; active?: boolean; badge?: string }> = [
  { label: "对话", title: "AI 对话投喂", icon: BotMessageSquare, active: true },
  { label: "专家", title: "知识专家 Agent", icon: CircleUserRound },
  { label: "任务", title: "训练任务", icon: Check },
  { label: "文件", title: "文档投喂", icon: FolderOpen },
  { label: "连接", title: "网址 / 系统连接", icon: Plug },
  { label: "记忆", title: "知识记忆", icon: Brain },
  { label: "Lab", title: "实验功能", icon: FlaskConical }
];

const quickPrompts = [
  "把这段客服对话整理成标准问答",
  "从 PDF 内容提取知识点并分类",
  "生成售后流程的入库建议",
  "检查这条知识是否需要 AI 修正"
];

const moreToolActions: Array<{ label: string; icon: ComponentType<{ className?: string }> }> = [
  { label: "图片 OCR", icon: ImagePlus },
  { label: "PDF", icon: FileType2 },
  { label: "Word", icon: FileText },
  { label: "PPT", icon: Presentation },
  { label: "网址", icon: Link2 },
  { label: "分类标签", icon: Tags },
  { label: "AI 修正", icon: Scissors },
  { label: "保存知识", icon: Save },
  { label: "训练记录", icon: ListChecks }
];

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

interface AdminIngestResponse {
  stage: "parsed" | "saved";
  job: {
    id: string;
  };
  draft: AdminIngestDraftResponse;
  records: AdminTrainingRecordResponse[];
  vectorStatus?: {
    indexed: boolean;
    model: string | null;
    provider: string | null;
    fallbackUsed: boolean;
    dimensions: number;
    indexedAt: string | null;
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

export function IngestChatGPTShell() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeAgentId, setActiveAgentId] = useState("chief");
  const [messages, setMessages] = useState<IngestChatMessage[]>([]);
  const [draft, setDraft] = useState<IngestKnowledgeDraft>(ingestChatInitialDraft);
  const [records, setRecords] = useState<IngestTrainingRecord[]>(ingestTrainingRecords);
  const [input, setInput] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [noticeMessage, setNoticeMessage] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerView, setDrawerView] = useState<"draft" | "records">("draft");
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const activeAgent = useMemo(
    () => ingestChatAgents.find((agent) => agent.id === activeAgentId) ?? ingestChatAgents[0],
    [activeAgentId]
  );

  const navItems = useMemo(
    () => primaryNav.map((item) => item.label === "任务"
      ? { ...item, badge: records.length > 0 ? String(Math.min(records.length, 99)) : undefined }
      : item),
    [records.length]
  );

  useEffect(() => {
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
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const value = input.trim();

    if (!value) {
      return;
    }

    const now = getTimeLabel();

    setIsParsing(true);
    setErrorMessage("");
    setNoticeMessage("");
    setInput("");
    setMessages((current) => [
      ...current,
      {
        id: `user-${Date.now()}`,
        role: "user",
        content: value,
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
      const response = await fetch("/api/core/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          input: value,
          source: "admin_ingest",
          agentId: activeAgent.id,
          agentName: activeAgent.name
        })
      });
      const data = await readApiData<AdminIngestResponse>(response);
      const nextDraft = mapDraft({
        ...data.draft,
        jobId: data.job.id,
        saveStatus: data.stage === "saved" ? "saved" : "pending"
      });

      setDraft(nextDraft);
      setRecords(data.records.map(mapRecord));
      setDrawerView("draft");
      const vectorText = data.vectorStatus?.indexed
        ? ` → 语义索引已完成（${data.vectorStatus.model}${data.vectorStatus.fallbackUsed ? " / mock" : ""}）`
        : "";
      setMessages((current) => [
        ...current,
        {
          id: `assistant-result-${Date.now()}`,
          role: "assistant",
          content: data.stage === "saved"
            ? `已完成核心闭环：AI解析 → 结构化为「${nextDraft.title}」→ 分类到「${nextDraft.category}」→ 写入统一知识库${vectorText} → 训练记录已更新。`
            : `已完成核心解析：AI解析 → 结构化为「${nextDraft.title}」→ 分类到「${nextDraft.category}」→ 等待保存确认。`,
          time: getTimeLabel()
        }
      ]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "AI投喂失败，请稍后重试。");
    } finally {
      setIsParsing(false);
    }
  }

  async function handleSaveDraft() {
    if (!draft.jobId) {
      setNoticeMessage("请先发送一次真实 AI 投喂，再保存知识。");
      return;
    }

    setIsSaving(true);
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
          structured: toStructuredPayload(draft)
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
      setNoticeMessage("已保存到知识库，训练记录已更新。");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "保存知识失败，请稍后重试。");
    } finally {
      setIsSaving(false);
    }
  }

  function openDrawer(view: "draft" | "records") {
    setDrawerView(view);
    setDrawerOpen(true);
  }

  function handleToolAction(label: string) {
    setNoticeMessage(`${label}入口已收纳到底部工具区，后续可接入文件选择或解析弹窗。`);
  }

  function handleUploadClick() {
    fileInputRef.current?.click();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (file) {
      setNoticeMessage(`已选择文件：${file.name}，后续可进入解析流程。`);
      setErrorMessage("");
    }

    event.target.value = "";
  }

  async function handleMoreTool(label: string) {
    setIsMoreOpen(false);

    if (label === "保存知识") {
      await handleSaveDraft();
      return;
    }

    if (label === "训练记录") {
      openDrawer("records");
      return;
    }

    if (label === "AI 修正") {
      openDrawer("draft");
      setNoticeMessage("AI 修正入口已打开，可结合结构化结果继续优化。");
      return;
    }

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

            return (
              <button
                key={item.label}
                title={item.title}
                type="button"
                className="group relative flex w-[54px] flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-medium text-[#252525] transition hover:bg-white/80"
                onClick={() => item.label === "任务" ? openDrawer("records") : setNoticeMessage(`${item.title}入口已保留。`)}
              >
                <span className={["relative flex h-8 w-8 items-center justify-center rounded-xl transition", item.active ? "bg-[#191919] text-white shadow-sm" : "text-[#222] group-hover:bg-white"].join(" ")}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {item.badge ? <span className="absolute -right-1 -top-1 h-4 min-w-4 rounded-full bg-[#20b25b] px-1 text-[10px] leading-4 text-white">{item.badge}</span> : null}
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex flex-col items-center gap-2 text-[#333]">
          <button type="button" title="更新提示" className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-white">
            <Bell className="h-5 w-5" aria-hidden="true" />
          </button>
          <button type="button" title="我的设置" className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-white">
            <Settings className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </aside>

      <aside className="hidden h-screen w-[240px] shrink-0 flex-col border-r border-[#ededeb] bg-[#fbfbfa] md:flex">
        <div className="p-4 pb-3">
          <div className="flex h-9 items-center gap-2 rounded-full bg-[#f0f0ef] px-3 text-sm text-[#8a8a86]">
            <Search className="h-4 w-4" aria-hidden="true" />
            <span>搜索</span>
          </div>
          <button type="button" className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-full border border-[#e4e4e1] bg-white text-sm font-medium text-[#202020] shadow-sm transition hover:bg-[#f7f7f5]">
            <Plus className="h-4 w-4" aria-hidden="true" />
            新建 Agent
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          <div className="space-y-1.5">
            {ingestChatAgents.map((agent) => (
              <button
                key={agent.id}
                type="button"
                onClick={() => setActiveAgentId(agent.id)}
                className={[
                  "w-full rounded-2xl p-3 text-left transition",
                  activeAgent.id === agent.id ? "bg-[#e9e9e7]" : "hover:bg-[#f0f0ee]"
                ].join(" ")}
              >
                <div className="flex gap-3">
                  <span className={["flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold", agentToneClasses[agent.tone]].join(" ")}>
                    {agent.avatar}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-[#202020]">{agent.name}</span>
                    <span className="mt-0.5 block truncate text-xs text-[#9a9a96]">{agent.role}</span>
                    <span className="mt-2 block line-clamp-2 text-xs leading-5 text-[#70706b]">{agent.description}</span>
                  </span>
                </div>
              </button>
            ))}
          </div>

          <div className="mx-2 mt-4 border-t border-[#eeeeeb] pt-4">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9b9b96]">最近投喂</p>
            <div className="mt-2 space-y-1">
              {records.slice(0, 3).map((record) => (
                <button key={record.id} type="button" onClick={() => openDrawer("records")} className="w-full rounded-xl px-2 py-2 text-left hover:bg-[#f0f0ee]">
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
          <button type="button" onClick={() => openDrawer("records")} className="hidden rounded-full bg-[#f3f3f1] px-3 py-2 text-xs font-semibold text-[#555] transition hover:bg-[#ededeb] sm:inline-flex">
            训练记录
          </button>
          <button type="button" onClick={() => openDrawer("draft")} className="hidden rounded-full bg-[#f3f3f1] px-3 py-2 text-xs font-semibold text-[#555] transition hover:bg-[#ededeb] sm:inline-flex">
            结构化结果
          </button>
          <IngestTenantSummary compact />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4">
          <div className="mx-auto flex min-h-full max-w-4xl flex-col justify-center">
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
                      <p>{message.content}</p>
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
                          {draft.saveStatus === "已保存" ? "已保存" : "保存知识"}
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
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              rows={3}
              placeholder="可以描述任务或提问任何问题"
              className="min-h-[88px] w-full resize-none rounded-2xl border-0 bg-white px-3 py-3 text-sm leading-6 outline-none placeholder:text-[#aaa]"
            />
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.ppt,.pptx,image/*"
              onChange={handleFileChange}
            />
            <div className="flex flex-col gap-2 border-t border-[#f0f0ee] pt-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-semibold text-[#555]">
                <button type="button" onClick={() => setNoticeMessage("当前模型：DeepSeek-V4-Pro。")} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#f6f6f5] px-3 transition hover:bg-[#ededeb]">
                  <Sparkles className="h-3.5 w-3.5 text-[#315bf6]" aria-hidden="true" />
                  DeepSeek-V4-Pro
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => setNoticeMessage("连接入口已保留，可接入企业知识源或外部系统。")} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#f6f6f5] px-3 transition hover:bg-[#ededeb]">
                  <Plug className="h-3.5 w-3.5" aria-hidden="true" />
                  连接
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button type="button" onClick={handleUploadClick} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#f6f6f5] px-3 transition hover:bg-[#ededeb]">
                  <UploadCloud className="h-3.5 w-3.5" aria-hidden="true" />
                  上传
                </button>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsMoreOpen((current) => !current)}
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
                </div>
              </div>
              <div className="flex shrink-0 items-center justify-end gap-1.5">
                <button type="button" title="AI 修正" onClick={() => void handleMoreTool("AI 修正")} className="flex h-9 w-9 items-center justify-center rounded-full text-[#555] hover:bg-[#f3f3f1]">
                  <Scissors className="h-4 w-4" aria-hidden="true" />
                </button>
                <button type="button" title="附件" onClick={handleUploadClick} className="flex h-9 w-9 items-center justify-center rounded-full text-[#555] hover:bg-[#f3f3f1]">
                  <Paperclip className="h-4 w-4" aria-hidden="true" />
                </button>
                <button type="button" title="语音" onClick={() => handleToolAction("麦克风")} className="flex h-9 w-9 items-center justify-center rounded-full text-[#555] hover:bg-[#f3f3f1]">
                  <Mic className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="submit"
                  disabled={isParsing || !input.trim()}
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

          {noticeMessage || errorMessage ? (
            <p className={errorMessage ? "mx-auto mt-2 max-w-4xl text-center text-xs text-[#b93b4a]" : "mx-auto mt-2 max-w-4xl text-center text-xs text-[#8a8a86]"}>
              {errorMessage || noticeMessage}
            </p>
          ) : (
            <p className="mx-auto mt-2 max-w-4xl text-center text-[11px] text-[#aaa]">内容由AI生成，请仔细甄别</p>
          )}
        </div>

        {drawerOpen ? (
          <div className="absolute inset-y-0 right-0 z-40 flex w-full justify-end bg-black/10">
            <aside className="h-full w-full max-w-[390px] overflow-y-auto border-l border-[#ececea] bg-[#fbfbfa] p-4 shadow-[-18px_0_45px_rgba(15,23,42,0.08)]">
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
          {isSaving ? "正在保存..." : draft.saveStatus === "已保存" ? "已保存到知识库" : draft.jobId ? "确认保存知识" : "先发送AI投喂"}
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[#f8f8f7] p-3">
      <p className="text-xs font-semibold text-[#8b8b86]">{label}</p>
      <p className="mt-1 leading-6 text-[#303030]">{value}</p>
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
