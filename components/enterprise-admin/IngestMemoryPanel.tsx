"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Copy, RefreshCcw, Sparkles } from "lucide-react";
import { IngestAgentLearningPanel } from "@/components/enterprise-admin/IngestAgentLearningPanel";
import { IngestMemoryConflictPanel } from "@/components/enterprise-admin/IngestMemoryConflictPanel";
import { IngestMemoryDraftMergePanel } from "@/components/enterprise-admin/IngestMemoryDraftMergePanel";
import { IngestMemoryInsightCard } from "@/components/enterprise-admin/IngestMemoryInsightCard";
import { IngestMemoryRecallPanel } from "@/components/enterprise-admin/IngestMemoryRecallPanel";
import { IngestMemoryUsedPanel } from "@/components/enterprise-admin/IngestMemoryUsedPanel";
import type { IngestChatAgent, IngestChatMessage } from "@/lib/enterprise/mock-chat";
import type {
  IngestDraftMergePlan,
  IngestMemoryConflictResult,
  IngestMemoryExtractionResult,
  IngestMemoryItem,
  IngestMemoryPanelSummary,
  IngestMemoryRecallCandidate
} from "@/lib/enterprise/ingest-memory-types";

type IngestMemoryPanelProps = {
  activeAgent: IngestChatAgent;
  activeConversationId: string;
  messages: IngestChatMessage[];
  refreshKey?: number;
  onBack: () => void;
  onToast?: (toast: { type?: "success" | "warning" | "info"; title: string; description?: string }) => void;
};

const emptySummary: IngestMemoryPanelSummary = {
  ok: true,
  memoryCount: 0,
  draftCount: 0,
  recentTopics: [],
  memories: [],
  draftCandidates: [],
  agentLearning: null,
  mergeSuggestions: []
};

type MemoryPromptPreview = {
  ok?: boolean;
  success?: boolean;
  retrievedMemories?: IngestMemoryRecallCandidate[];
  memoryContextText?: string;
  agentLearningInstruction?: string;
  appliedPolicies?: string[];
  finalPromptPreview?: string;
  usedMemoryIds?: string[];
  debug?: {
    memoryParticipated?: boolean;
    usedMemoryIds?: string[];
    appliedPolicies?: string[];
    warnings?: string[];
  };
  warnings?: string[];
};

type MessageWithMemoryV2 = IngestChatMessage & {
  memoryV2?: {
    usedMemoryIds?: string[];
    recalledMemoryIds?: string[];
    memoryParticipated?: boolean;
    appliedPolicies?: string[];
    warnings?: string[];
  };
};

type MemoryIndexStatus = {
  ok?: boolean;
  draftCount?: number;
  publishableCount?: number;
  publishedCount?: number;
  totalPublished?: number;
  indexedCount?: number;
  totalIndexed?: number;
  lastBuiltAt?: number;
  builtAt?: number;
  source?: string;
  warnings?: string[];
  skippedReasons?: Record<string, number>;
};

type MemoryPublishResult = {
  publishedCount: number;
  skippedCount: number;
  totalPublished: number;
  publishedIds?: string[];
  skipped?: Array<{
    draftId: string;
    title: string;
    reason: string;
    missingFields?: string[];
    canFixByScopeNormalizer?: boolean;
  }>;
  warnings?: string[];
};

type RuntimeMemoryTestResult = {
  memoryApplied?: boolean;
  usedMemoryIds?: string[];
  memoryTrace?: Array<{
    memoryId: string;
    score: number;
    reason: string;
    matchedTokens?: string[];
  }>;
  memories?: Array<{
    memoryId: string;
    title: string;
    score: number;
    reason: string;
  }>;
  warnings?: string[];
};

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json() as T & { success?: boolean; ok?: boolean; message?: string };

  if (!response.ok || data.success === false || data.ok === false) {
    throw new Error(data.message || "训练记忆请求失败。");
  }

  return data;
}

export function IngestMemoryPanel({
  activeAgent,
  activeConversationId,
  messages,
  refreshKey = 0,
  onBack,
  onToast
}: IngestMemoryPanelProps) {
  const [summary, setSummary] = useState<IngestMemoryPanelSummary>(emptySummary);
  const [extraction, setExtraction] = useState<IngestMemoryExtractionResult | null>(null);
  const [mergePlan, setMergePlan] = useState<IngestDraftMergePlan | null>(null);
  const [promptPreview, setPromptPreview] = useState<MemoryPromptPreview | null>(null);
  const [conflictResult, setConflictResult] = useState<IngestMemoryConflictResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isRecalling, setIsRecalling] = useState(false);
  const [isDetectingConflict, setIsDetectingConflict] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isRebuildingIndex, setIsRebuildingIndex] = useState(false);
  const [isTestingRuntime, setIsTestingRuntime] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [indexStatus, setIndexStatus] = useState<MemoryIndexStatus | null>(null);
  const [publishResult, setPublishResult] = useState<MemoryPublishResult | null>(null);
  const [runtimeTestResult, setRuntimeTestResult] = useState<RuntimeMemoryTestResult | null>(null);
  const knowledgeBaseId = activeAgent.knowledgeBaseId ?? undefined;
  const query = useMemo(() => new URLSearchParams({
    agentId: activeAgent.id,
    ...(knowledgeBaseId ? { knowledgeBaseId } : {})
  }).toString(), [activeAgent.id, knowledgeBaseId]);

  const loadSummary = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const data = await readJson<IngestMemoryPanelSummary>(await fetch(`/api/admin/ingest-memory/summary?${query}`, {
        credentials: "include"
      }));

      setSummary(data);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "训练记忆摘要加载失败。");
    } finally {
      setIsLoading(false);
    }
  }, [query]);

  const loadIndexStatus = useCallback(async () => {
    try {
      const data = await readJson<MemoryIndexStatus>(await fetch(`/api/admin/ingest-memory/index/status?${query}`, {
        credentials: "include"
      }));

      setIndexStatus(data);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "训练记忆索引状态加载失败。");
    }
  }, [query]);

  useEffect(() => {
    void loadSummary();
    void loadIndexStatus();
  }, [loadIndexStatus, loadSummary, refreshKey]);

  async function handleExtract() {
    if (!activeConversationId) {
      setError("请先在当前 Agent 下完成一轮对话。");
      return;
    }

    setIsExtracting(true);
    setError("");

    try {
      const latestAssistant = [...messages].reverse().find((message) => message.role === "assistant")?.content ?? "";
      const latestUser = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
      const data = await readJson<IngestMemoryExtractionResult>(await fetch("/api/admin/ingest-memory/extract", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          conversationId: activeConversationId,
          agentId: activeAgent.id,
          knowledgeBaseId,
          messages: messages.map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content
          })),
          latestAssistantReply: latestAssistant,
          userInstruction: latestUser
        })
      }));

      setExtraction(data);
      onToast?.({
        type: "success",
        title: "本轮训练记忆已提取",
        description: `提取 ${data.memories.length} 条记忆，${data.draftCandidates.length} 条草稿候选。`
      });
      await loadSummary();
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "训练记忆提取失败。";

      setError(message);
      onToast?.({ type: "warning", title: message });
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleGenerateMergePlan() {
    const sourceDrafts = summary.draftCandidates.length ? summary.draftCandidates : extraction?.draftCandidates ?? [];
    const sourceIds = sourceDrafts.slice(0, 3).map((draft) => draft.id);

    if (sourceIds.length === 0) {
      setError("暂无可生成合并建议的草稿。");
      return;
    }

    setError("");

    try {
      const data = await readJson<IngestDraftMergePlan>(await fetch("/api/admin/ingest-memory/merge-plan", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sourceIds,
          agentId: activeAgent.id,
          knowledgeBaseId
        })
      }));

      setMergePlan(data);
      onToast?.({
        type: "info",
        title: "合并建议已生成",
        description: data.reason
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "合并建议生成失败。");
    }
  }

  async function handleRefreshRecall() {
    const latestUser = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";

    if (!latestUser.trim()) {
      setError("暂无可用于召回的用户提示词。");
      return;
    }

    setIsRecalling(true);
    setError("");

    try {
      const data = await readJson<MemoryPromptPreview>(await fetch("/api/admin/ingest-memory/prompt-preview", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query: latestUser,
          conversationId: activeConversationId,
          agentId: activeAgent.id,
          knowledgeBaseId,
          messages: messages.map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content
          }))
        })
      }));

      setPromptPreview(data);
      onToast?.({
        type: "info",
        title: "记忆召回已刷新",
        description: data.usedMemoryIds?.length
          ? `本轮可注入 ${data.usedMemoryIds.length} 条训练记忆。`
          : "当前没有高相关记忆，主对话仍可正常继续。"
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "记忆召回失败。");
    } finally {
      setIsRecalling(false);
    }
  }

  async function handleDetectConflict() {
    const candidate = currentDrafts[0] ?? currentMemories[0];

    if (!candidate) {
      setError("暂无可检测冲突的记忆草稿。");
      return;
    }

    setIsDetectingConflict(true);
    setError("");

    try {
      const data = await readJson<IngestMemoryConflictResult>(await fetch("/api/admin/ingest-memory/conflicts", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          newMemory: candidate,
          agentId: activeAgent.id,
          knowledgeBaseId
        })
      }));

      setConflictResult(data);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "冲突检测失败。");
    } finally {
      setIsDetectingConflict(false);
    }
  }

  async function handleConfirmDraft(id: string) {
    try {
      await readJson(await fetch("/api/admin/ingest-memory/drafts", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ id, status: "confirmed" })
      }));
      await loadSummary();
      onToast?.({ type: "success", title: "训练记忆已标记为确认" });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "标记确认失败。");
    }
  }

  async function handlePublishSavedMemories() {
    setIsPublishing(true);
    setError("");

    try {
      const data = await readJson<MemoryPublishResult>(await fetch("/api/admin/ingest-memory/publish", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ publishAllSaved: true })
      }));

      setPublishResult(data);
      await loadIndexStatus();
      onToast?.({
        type: data.publishedCount > 0 ? "success" : "info",
        title: data.publishedCount > 0 ? "训练记忆已发布" : "暂无新增发布记忆",
        description: data.publishedCount > 0
          ? `新增 ${data.publishedCount} 条，累计 ${data.totalPublished} 条。`
          : data.warnings?.[0] ?? `跳过 ${data.skippedCount} 条。`
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "发布训练记忆失败。");
    } finally {
      setIsPublishing(false);
    }
  }

  async function handleRebuildMemoryIndex() {
    setIsRebuildingIndex(true);
    setError("");

    try {
      const data = await readJson<MemoryIndexStatus>(await fetch("/api/admin/ingest-memory/index/rebuild", {
        method: "POST",
        credentials: "include"
      }));

      setIndexStatus(data);
      onToast?.({
        type: "success",
        title: "训练记忆索引已重建",
        description: `当前可检索索引 ${data.indexedCount ?? 0} 条。`
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "重建训练记忆索引失败。");
    } finally {
      setIsRebuildingIndex(false);
    }
  }

  async function handleTestRuntimeMemoryHit() {
    setIsTestingRuntime(true);
    setError("");

    try {
      const data = await readJson<RuntimeMemoryTestResult>(await fetch("/api/runtime/memory/search", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query: "33循环和77循环怎么选",
          knowledgeBaseId: "kb-kks-slim",
          agentId: "expert-kks",
          namespace: "kb-kks-slim",
          tenantId: "default",
          limit: 5
        })
      }));

      setRuntimeTestResult(data);
      onToast?.({
        type: data.memoryApplied ? "success" : "info",
        title: data.memoryApplied ? "运行时记忆已命中" : "运行时暂未命中",
        description: data.usedMemoryIds?.length ? `命中 ${data.usedMemoryIds.length} 条。` : data.warnings?.[0] ?? "当前没有 KKS/33/77 可用索引。"
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "运行时命中测试失败。");
    } finally {
      setIsTestingRuntime(false);
    }
  }

  async function handleCopy(item: IngestMemoryItem) {
    const text = `# ${item.title}\n\n${item.content}`;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setError("当前浏览器不允许写入剪贴板。");
    }
  }

  async function handleCopyText(text: string) {
    if (!text) {
      setError("暂无可复制内容。");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setError("当前浏览器不允许写入剪贴板。");
    }
  }

  const currentMemories = extraction?.memories.length ? extraction.memories : summary.memories;
  const currentDrafts = summary.draftCandidates.length ? summary.draftCandidates : extraction?.draftCandidates ?? [];
  const latestAssistantWithMemory = [...messages]
    .reverse()
    .find((message) => message.role === "assistant" && (message as MessageWithMemoryV2).memoryV2) as MessageWithMemoryV2 | undefined;
  const usedMemoryIds = promptPreview?.usedMemoryIds?.length
    ? promptPreview.usedMemoryIds
    : latestAssistantWithMemory?.memoryV2?.usedMemoryIds ?? [];

  return (
    <div className="h-full overflow-auto bg-[#f7f7f6] px-6 py-8">
      <div className="mx-auto max-w-[1180px]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={onBack}
              className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#e4ded3] bg-white px-3 py-1.5 text-xs font-semibold text-[#5b554c] shadow-sm transition hover:bg-[#f8f6f0]"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              返回对话
            </button>
            <h1 className="text-2xl font-semibold tracking-tight text-[#222]">训练记忆</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#7a746b]">
              从当前 Agent 的多轮投喂中沉淀长期记忆、草稿合并建议和学习轨迹。此面板不改变对话、不自动入库。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void loadSummary();
                void loadIndexStatus();
              }}
              className="inline-flex items-center gap-2 rounded-full border border-[#e1dbcf] bg-white px-4 py-2 text-sm font-semibold text-[#4b463f] shadow-sm transition hover:bg-[#f8f6f0]"
            >
              <RefreshCcw className="h-4 w-4" aria-hidden="true" />
              刷新
            </button>
            <button
              type="button"
              onClick={() => void handlePublishSavedMemories()}
              disabled={isPublishing}
              className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {isPublishing ? "发布中..." : "发布已保存记忆"}
            </button>
            <button
              type="button"
              onClick={() => void handleRebuildMemoryIndex()}
              disabled={isRebuildingIndex}
              className="inline-flex items-center gap-2 rounded-full border border-[#d8e1f3] bg-white px-4 py-2 text-sm font-semibold text-[#315078] shadow-sm transition hover:bg-[#f3f7ff] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCcw className={isRebuildingIndex ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
              {isRebuildingIndex ? "重建中..." : "重建索引"}
            </button>
            <button
              type="button"
              onClick={() => void handleTestRuntimeMemoryHit()}
              disabled={isTestingRuntime}
              className="inline-flex items-center gap-2 rounded-full border border-[#e4ded3] bg-white px-4 py-2 text-sm font-semibold text-[#4b463f] shadow-sm transition hover:bg-[#f8f6f0] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Sparkles className={isTestingRuntime ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
              {isTestingRuntime ? "测试中..." : "测试运行时命中"}
            </button>
            <button
              type="button"
              onClick={() => void handleExtract()}
              disabled={isExtracting}
              className="inline-flex items-center gap-2 rounded-full bg-[#1f1f1f] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-black disabled:cursor-not-allowed disabled:bg-[#b9b4aa]"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {isExtracting ? "提取中..." : "提取本轮记忆"}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3 xl:grid-cols-5">
          <div className="rounded-[22px] border border-[#e8e4dc] bg-white p-5 shadow-sm">
            <p className="text-xs text-[#8a8378]">训练记忆</p>
            <p className="mt-2 text-3xl font-semibold text-[#27231d]">{summary.memoryCount}</p>
          </div>
          <div className="rounded-[22px] border border-[#e8e4dc] bg-white p-5 shadow-sm">
            <p className="text-xs text-[#8a8378]">草稿候选</p>
            <p className="mt-2 text-3xl font-semibold text-[#27231d]">{indexStatus?.draftCount ?? summary.draftCount}</p>
            <p className="mt-1 text-xs text-[#8a8378]">可发布 {indexStatus?.publishableCount ?? 0} 条</p>
          </div>
          <div className="rounded-[22px] border border-[#e8e4dc] bg-white p-5 shadow-sm">
            <p className="text-xs text-[#8a8378]">当前 Agent</p>
            <p className="mt-2 truncate text-lg font-semibold text-[#27231d]">{activeAgent.name}</p>
          </div>
          <div className="rounded-[22px] border border-emerald-100 bg-emerald-50/60 p-5 shadow-sm">
            <p className="text-xs text-emerald-700">已发布记忆</p>
            <p className="mt-2 text-3xl font-semibold text-emerald-900">{indexStatus?.totalPublished ?? indexStatus?.publishedCount ?? 0}</p>
          </div>
          <div className="rounded-[22px] border border-[#dbe5f5] bg-[#f7fbff] p-5 shadow-sm">
            <p className="text-xs text-[#5c6d87]">运行时索引</p>
            <p className="mt-2 text-3xl font-semibold text-[#203b5a]">{indexStatus?.totalIndexed ?? indexStatus?.indexedCount ?? 0}</p>
          </div>
        </div>

        {(publishResult?.skipped?.length || runtimeTestResult || indexStatus?.warnings?.length) ? (
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {publishResult?.skipped?.length ? (
              <div className="rounded-2xl border border-[#eee4d4] bg-white px-4 py-3 text-xs text-[#75695a] shadow-sm">
                <p className="font-semibold text-[#2c2924]">发布跳过原因</p>
                <div className="mt-2 space-y-2">
                  {publishResult.skipped.slice(0, 6).map((item) => (
                    <div key={item.draftId} className="leading-5">
                      <span className="font-medium text-[#3a352e]">{item.title || item.draftId}</span>
                      <span>：{item.reason}</span>
                      {item.canFixByScopeNormalizer ? <span className="ml-2 text-emerald-700">可自动补全范围并发布</span> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {runtimeTestResult ? (
              <div className="rounded-2xl border border-[#dde8f3] bg-white px-4 py-3 text-xs text-[#596879] shadow-sm">
                <p className="font-semibold text-[#203044]">运行时命中测试</p>
                <p className="mt-2">memoryApplied：{runtimeTestResult.memoryApplied ? "true" : "false"}</p>
                <p className="mt-1">usedMemoryIds：{runtimeTestResult.usedMemoryIds?.join(", ") || "无"}</p>
                {runtimeTestResult.memoryTrace?.[0] ? (
                  <p className="mt-1">reason：{runtimeTestResult.memoryTrace[0].reason}</p>
                ) : null}
                {runtimeTestResult.warnings?.length ? <p className="mt-1 text-amber-700">{runtimeTestResult.warnings[0]}</p> : null}
              </div>
            ) : null}
            {indexStatus?.warnings?.length ? (
              <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-800 shadow-sm">
                {indexStatus.warnings.join(" / ")}
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <div className="mt-5 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            {error}
          </div>
        ) : null}
        {copied ? (
          <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            已复制训练记忆
          </div>
        ) : null}

        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section className="rounded-[22px] border border-[#e8e4dc] bg-[#fbfaf7] p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-[#27231d]">本轮提取记忆</h2>
                <p className="mt-1 text-xs text-[#8a8378]">{isLoading ? "正在加载..." : "按长期可复用价值排序展示。"}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const text = currentMemories.map((item) => `${item.title}\n${item.content}`).join("\n\n");
                  if (text) {
                    void navigator.clipboard.writeText(text);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1400);
                  }
                }}
                className="inline-flex items-center gap-2 rounded-full border border-[#e1dbcf] bg-white px-3 py-1.5 text-xs font-semibold text-[#4b463f] transition hover:bg-[#f8f6f0]"
              >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                复制全部
              </button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {currentMemories.length ? currentMemories.map((item) => (
                <IngestMemoryInsightCard
                  key={item.id}
                  item={item}
                  onConfirm={(id) => void handleConfirmDraft(id)}
                  onCopy={(memory) => void handleCopy(memory)}
                />
              )) : (
                <div className="col-span-full rounded-2xl bg-white px-4 py-10 text-center text-sm text-[#8a8378]">
                  暂无提取结果。完成一轮对话后点击“提取本轮记忆”。
                </div>
              )}
            </div>
          </section>

          <div className="space-y-5">
            <IngestMemoryRecallPanel
              memories={(promptPreview?.retrievedMemories ?? []).map((item) => ({
                ...item,
                injected: usedMemoryIds.includes(item.memory.id)
              }))}
              memoryContextText={promptPreview?.memoryContextText}
              agentLearningInstruction={promptPreview?.agentLearningInstruction}
              finalPromptPreview={promptPreview?.finalPromptPreview}
              isLoading={isRecalling}
              onRefresh={() => void handleRefreshRecall()}
              onCopy={(text) => void handleCopyText(text)}
            />
            <IngestMemoryUsedPanel
              assistantMessageId={latestAssistantWithMemory?.id}
              usedMemoryIds={usedMemoryIds}
              memoryParticipated={promptPreview?.debug?.memoryParticipated ?? latestAssistantWithMemory?.memoryV2?.memoryParticipated}
              appliedPolicies={promptPreview?.appliedPolicies ?? latestAssistantWithMemory?.memoryV2?.appliedPolicies}
              warnings={promptPreview?.warnings ?? latestAssistantWithMemory?.memoryV2?.warnings}
            />
            <IngestMemoryConflictPanel
              result={conflictResult}
              isLoading={isDetectingConflict}
              onDetect={() => void handleDetectConflict()}
            />
            <IngestMemoryDraftMergePanel
              drafts={currentDrafts}
              mergePlan={mergePlan ?? summary.mergeSuggestions[0] ?? null}
              onGenerate={() => void handleGenerateMergePlan()}
            />
            <IngestAgentLearningPanel learning={summary.agentLearning} />
          </div>
        </div>
      </div>
    </div>
  );
}
