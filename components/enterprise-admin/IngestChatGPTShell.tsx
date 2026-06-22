"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { BotMessageSquare, Check, Database, FileText, ImagePlus, Link2, Loader2, Save, SendHorizontal, Tags } from "lucide-react";
import { IngestTenantSummary } from "@/components/enterprise-admin/IngestTenantSummary";
import {
  ingestChatAgents,
  ingestChatInitialDraft,
  ingestChatSeedMessages,
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

const pipeline = ["用户输入", "AI解析", "结构化", "分类标签", "确认保存", "训练记录"];

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
  const [activeAgentId, setActiveAgentId] = useState("chief");
  const [messages, setMessages] = useState<IngestChatMessage[]>(ingestChatSeedMessages);
  const [draft, setDraft] = useState<IngestKnowledgeDraft>(ingestChatInitialDraft);
  const [records, setRecords] = useState<IngestTrainingRecord[]>(ingestTrainingRecords);
  const [input, setInput] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const activeAgent = useMemo(
    () => ingestChatAgents.find((agent) => agent.id === activeAgentId) ?? ingestChatAgents[0],
    [activeAgentId]
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
      setErrorMessage("请先发送一次真实 AI 投喂，再保存知识。");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

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
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "保存知识失败，请稍后重试。");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="flex h-screen overflow-hidden bg-[#f7f7f6] pt-14 text-[#191919]">
      <aside className="hidden w-[300px] shrink-0 flex-col border-r border-[#e8e8e5] bg-[#fbfbfa] md:flex">
        <div className="border-b border-[#ececea] p-4">
          <div className="flex h-10 items-center gap-2 rounded-2xl bg-[#f0f0ef] px-3 text-sm text-[#8a8a86]">
            <BotMessageSquare className="h-4 w-4" aria-hidden="true" />
            <span>搜索 Agent / 知识库</span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9b9b96]">Agent 系统</p>
          <div className="space-y-2">
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
                  <span className={["flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold", agentToneClasses[agent.tone]].join(" ")}>
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

          <div className="mt-5 rounded-2xl border border-[#ececea] bg-white p-3">
            <p className="text-sm font-semibold text-[#202020]">上传系统入口</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-medium text-[#555]">
              {[
                ["PDF", FileText],
                ["Word", FileText],
                ["PPT", FileText],
                ["图片 OCR", ImagePlus],
                ["网址", Link2],
                ["分类标签", Tags]
              ].map(([label, Icon]) => {
                const TypedIcon = Icon as typeof FileText;
                return (
                  <button key={label as string} type="button" className="flex items-center gap-2 rounded-xl bg-[#f7f7f6] px-2.5 py-2 transition hover:bg-[#efefed]">
                    <TypedIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    {label as string}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#eeeeeb] bg-white px-6">
          <div>
            <h1 className="text-base font-semibold text-[#202020]">ChatGPT 风格 AI 投喂</h1>
            <p className="text-xs text-[#8b8b86]">普通 AI 问答 / 轻量投喂 / 真实训练闭环</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-2xl bg-[#f0f0ee] px-3 py-2 text-xs font-semibold text-[#555]">
              <Database className="h-4 w-4" aria-hidden="true" />
              当前：{activeAgent.role}
            </div>
            <IngestTenantSummary compact />
          </div>
        </div>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col bg-white">
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
              <div className="mx-auto max-w-3xl space-y-5">
                <div className="rounded-[26px] border border-[#e7e7e4] bg-[#fbfbfa] p-4">
                  <div className="flex flex-wrap gap-2">
                    {pipeline.map((step, index) => (
                      <span key={step} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#555] ring-1 ring-[#ececea]">
                        {index + 1}. {step}
                      </span>
                    ))}
                  </div>
                </div>

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

                {isParsing ? (
                  <div className="flex items-center gap-2 rounded-2xl bg-[#f8f8f7] px-4 py-3 text-sm text-[#666]">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    AI 正在解析并生成知识结构...
                  </div>
                ) : null}

                {errorMessage ? (
                  <div className="rounded-2xl border border-[#ffd6dc] bg-[#fff6f7] px-4 py-3 text-sm leading-6 text-[#b93b4a]">
                    {errorMessage}
                  </div>
                ) : null}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="shrink-0 border-t border-[#ececea] bg-white px-5 py-4">
              <div className="mx-auto max-w-3xl rounded-[24px] border border-[#e4e4e1] bg-white p-3 shadow-[0_14px_45px_rgba(15,23,42,0.07)]">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  rows={3}
                  placeholder="输入要投喂的内容，例如：客户申请退款前需要先核对订单状态..."
                  className="min-h-[88px] w-full resize-none rounded-2xl border-0 bg-[#fbfbfa] px-4 py-3 text-sm leading-6 outline-none placeholder:text-[#aaa] focus:bg-white"
                />
                <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap gap-2 text-xs font-medium text-[#555]">
                    <button type="button" className="rounded-full bg-[#f3f3f1] px-3 py-2 hover:bg-[#ececea]">上传文件</button>
                    <button type="button" className="rounded-full bg-[#f3f3f1] px-3 py-2 hover:bg-[#ececea]">图片 OCR</button>
                    <button type="button" className="rounded-full bg-[#f3f3f1] px-3 py-2 hover:bg-[#ececea]">网址投喂</button>
                  </div>
                  <button type="submit" className="flex h-10 items-center justify-center gap-2 rounded-2xl bg-[#202020] px-4 text-sm font-semibold text-white transition hover:bg-black">
                    {isParsing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <SendHorizontal className="h-4 w-4" aria-hidden="true" />}
                    发送AI投喂
                  </button>
                </div>
              </div>
            </form>
          </div>

          <aside className="hidden min-h-0 overflow-y-auto border-l border-[#ececea] bg-[#fbfbfa] p-4 lg:block">
            <KnowledgeDraftPanel draft={draft} isSaving={isSaving} onSave={handleSaveDraft} />
            <TrainingRecords records={records} />
          </aside>
        </div>
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
