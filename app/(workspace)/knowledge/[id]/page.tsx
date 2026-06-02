"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  FileText,
  Gauge,
  History,
  Lightbulb,
  Loader2,
  MessageSquareText,
  Pencil,
  RefreshCw,
  Save,
  SendHorizontal,
  Trash2,
  TriangleAlert
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { unwrapApiResponse } from "@/lib/api/client";
import {
  getKnowledgeQualityAverage,
  isLowQualityKnowledge,
  knowledgeQualityScoreKeys,
  knowledgeQualityScoreLabels,
  type KnowledgeQualityScores
} from "@/lib/knowledge/quality";
import { getKnowledgeSourceTypeLabel } from "@/lib/knowledge/source-types";
import { knowledgeStatusLabels, type KnowledgeLifecycleStatus } from "@/lib/knowledge/status";

type KnowledgeDetailPageProps = {
  params: {
    id: string;
  };
};

type KnowledgeChunk = {
  id: string;
  knowledgeItemId: string;
  chunkText: string;
  chunkIndex: number;
  metadata: unknown;
  createdAt: string;
  hasEmbedding: boolean;
};

type KnowledgeDetail = KnowledgeQualityScores & {
  id: string;
  userId: string;
  title: string;
  content: string;
  summary: string;
  tags: string[];
  category: string;
  importance: number;
  sourceType: string;
  sourceId: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
  sourceMessageId: string | null;
  expiresAt: string | null;
  status: KnowledgeLifecycleStatus;
  createdAt: string;
  updatedAt: string;
  chunks: KnowledgeChunk[];
  mergeHistories: KnowledgeMergeHistory[];
};

type KnowledgeMergeHistory = {
  id: string;
  incomingTitle: string;
  incomingSummary: string;
  incomingTags: string[];
  incomingCategory: string;
  incomingImportance: number;
  incomingSourceType: string;
  incomingSourceTitle: string | null;
  incomingSourceUrl: string | null;
  incomingSourceMessageId: string | null;
  createdAt: string;
};

type CompletionSuggestion = {
  id: string;
  title: string;
  detail: string;
  question: string;
  priority: number;
};

type CompletionSuggestionsResponse = {
  suggestions: CompletionSuggestion[];
  mode: "ai" | "local";
};

type SupplementMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  createdAt: string;
};

type SaveState = "idle" | "loading" | "success" | "error";

function toTagsInput(tags: string[]) {
  return tags.join(", ");
}

function parseTags(value: string) {
  return value
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export default function KnowledgeDetailPage({ params }: KnowledgeDetailPageProps) {
  const router = useRouter();
  const [item, setItem] = useState<KnowledgeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [deleteState, setDeleteState] = useState<SaveState>("idle");
  const [suggestions, setSuggestions] = useState<CompletionSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState("");
  const [activeSuggestion, setActiveSuggestion] = useState<CompletionSuggestion | null>(null);
  const [supplementMessages, setSupplementMessages] = useState<SupplementMessage[]>([]);
  const [supplementInput, setSupplementInput] = useState("");
  const [supplementState, setSupplementState] = useState<SaveState>("idle");
  const [form, setForm] = useState({
    title: "",
    summary: "",
    content: "",
    category: "",
    importance: 3,
    tags: ""
  });

  const loadCompletionSuggestions = useCallback(async (id = params.id, signal?: AbortSignal) => {
    setSuggestionsLoading(true);
    setSuggestionsError("");

    try {
      const response = await fetch(`/api/knowledge/${id}/completion-suggestions`, {
        method: "POST",
        signal
      });
      const data = await unwrapApiResponse<CompletionSuggestionsResponse>(response, "生成补全建议失败。");

      setSuggestions(data.suggestions);
    } catch (caughtError) {
      if (caughtError instanceof DOMException && caughtError.name === "AbortError") {
        return;
      }

      setSuggestionsError(caughtError instanceof Error ? caughtError.message : "生成补全建议失败。");
    } finally {
      setSuggestionsLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadDetail() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(`/api/knowledge/${params.id}`, {
          signal: controller.signal
        });

        const data = await unwrapApiResponse<KnowledgeDetail>(response, "加载知识详情失败。");

        setItem(data);
        setForm({
          title: data.title,
          summary: data.summary,
          content: data.content,
          category: data.category,
          importance: data.importance,
          tags: toTagsInput(data.tags)
        });
        void loadCompletionSuggestions(data.id, controller.signal);
      } catch (caughtError) {
        if (caughtError instanceof DOMException && caughtError.name === "AbortError") {
          return;
        }

        setError(caughtError instanceof Error ? caughtError.message : "加载知识详情失败。");
      } finally {
        setLoading(false);
      }
    }

    loadDetail();

    return () => controller.abort();
  }, [loadCompletionSuggestions, params.id]);

  function getNowLabel() {
    return new Date().toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function selectSuggestion(suggestion: CompletionSuggestion) {
    setActiveSuggestion(suggestion);
    setSupplementInput("");
    setSupplementState("idle");
    setSupplementMessages([
      {
        id: `suggestion-${Date.now()}`,
        role: "assistant",
        content: suggestion.question,
        createdAt: getNowLabel()
      }
    ]);
  }

  function applyDetail(data: KnowledgeDetail) {
    setItem(data);
    setForm({
      title: data.title,
      summary: data.summary,
      content: data.content,
      category: data.category,
      importance: data.importance,
      tags: toTagsInput(data.tags)
    });
  }

  async function handleSupplementSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeSuggestion) {
      setSuggestionsError("请先选择一条补全建议。");
      return;
    }

    const message = supplementInput.trim();

    if (!message) {
      setSuggestionsError("请输入要补充的内容。");
      return;
    }

    setSuggestionsError("");
    setSupplementState("loading");
    const userMessage: SupplementMessage = {
      id: `supplement-user-${Date.now()}`,
      role: "user",
      content: message,
      createdAt: getNowLabel()
    };

    setSupplementMessages((current) => [...current, userMessage]);

    try {
      const response = await fetch(`/api/knowledge/${params.id}/supplement`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          suggestionTitle: activeSuggestion.title,
          suggestionQuestion: activeSuggestion.question,
          message
        })
      });
      const data = await unwrapApiResponse<KnowledgeDetail>(response, "补充知识失败。");

      applyDetail(data);
      setSupplementInput("");
      setSupplementState("success");
      setSaveState("success");
      setSupplementMessages((current) => [
        ...current,
        {
          id: `supplement-ai-${Date.now()}`,
          role: "assistant",
          content: "已更新原知识，并重新生成知识片段与 embedding。",
          createdAt: getNowLabel()
        }
      ]);
      void loadCompletionSuggestions(data.id);
    } catch (caughtError) {
      setSuggestionsError(caughtError instanceof Error ? caughtError.message : "补充知识失败。");
      setSupplementState("error");
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.title.trim() || !form.summary.trim() || !form.content.trim() || !form.category.trim()) {
      setError("标题、摘要、正文和分类不能为空。");
      setSaveState("error");
      return;
    }

    setError("");
    setSaveState("loading");

    try {
      const response = await fetch(`/api/knowledge/${params.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: form.title.trim(),
          summary: form.summary.trim(),
          content: form.content.trim(),
          category: form.category.trim(),
          importance: form.importance,
          tags: parseTags(form.tags)
        })
      });

      const data = await unwrapApiResponse<KnowledgeDetail>(response, "保存失败。");

      setItem(data);
      setForm({
        title: data.title,
        summary: data.summary,
        content: data.content,
        category: data.category,
        importance: data.importance,
        tags: toTagsInput(data.tags)
      });
      setEditing(false);
      setSaveState("success");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "保存失败。");
      setSaveState("error");
    }
  }

  async function handleDelete() {
    const confirmed = window.confirm("确认删除这条知识吗？删除后关联 chunks 也会一并删除。");

    if (!confirmed) {
      return;
    }

    setError("");
    setDeleteState("loading");

    try {
      const response = await fetch(`/api/knowledge/${params.id}`, {
        method: "DELETE"
      });

      await unwrapApiResponse<unknown>(response, "删除失败。");

      setDeleteState("success");
      router.push("/knowledge");
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "删除失败。");
      setDeleteState("error");
    }
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <Link
          href="/knowledge"
          className="focus-ring inline-flex w-fit items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium text-muted hover:bg-white hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          返回知识库
        </Link>
        <section className="flex items-center gap-2 rounded-lg border border-line bg-white p-6 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在加载知识详情...
        </section>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <Link
          href="/knowledge"
          className="focus-ring inline-flex w-fit items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium text-muted hover:bg-white hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          返回知识库
        </Link>
        <section className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <TriangleAlert className="h-4 w-4" />
          {error || "知识不存在。"}
        </section>
      </div>
    );
  }

  const qualityAverage = getKnowledgeQualityAverage(item);
  const isLowQuality = isLowQualityKnowledge(item);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <Link
        href="/knowledge"
        className="focus-ring inline-flex w-fit items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium text-muted hover:bg-white hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        返回知识库
      </Link>

      <PageHeader eyebrow={item.category} title={item.title} description={item.summary}>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEditing((current) => !current)}>
            <Pencil className="h-4 w-4" />
            {editing ? "取消编辑" : "编辑"}
          </Button>
          <Button variant="outline" onClick={handleDelete} disabled={deleteState === "loading"}>
            {deleteState === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            删除
          </Button>
        </div>
      </PageHeader>

      {error ? (
        <section className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <TriangleAlert className="h-4 w-4" />
          {error}
        </section>
      ) : null}

      {saveState === "success" ? (
        <section className="flex items-center gap-2 rounded-lg border border-teal-100 bg-teal-50 px-4 py-3 text-sm text-teal-700">
          <CheckCircle2 className="h-4 w-4" />
          已保存。
        </section>
      ) : null}

      {editing ? (
        <form onSubmit={handleSave} className="space-y-5 rounded-lg border border-line bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-ink">标题</span>
              <Input
                className="mt-2"
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink">分类</span>
              <Input
                className="mt-2"
                value={form.category}
                onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
              />
            </label>
          </div>
          <label className="block">
            <span className="text-sm font-medium text-ink">摘要</span>
            <Textarea
              className="mt-2 min-h-24"
              value={form.summary}
              onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))}
            />
          </label>
          <div className="grid gap-4 md:grid-cols-[1fr_160px]">
            <label className="block">
              <span className="text-sm font-medium text-ink">标签</span>
              <Input
                className="mt-2"
                value={form.tags}
                onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))}
                placeholder="用逗号分隔"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink">重要度</span>
              <Input
                className="mt-2"
                type="number"
                min={1}
                max={5}
                value={form.importance}
                onChange={(event) =>
                  setForm((current) => ({ ...current, importance: Number(event.target.value) }))
                }
              />
            </label>
          </div>
          <label className="block">
            <span className="text-sm font-medium text-ink">正文</span>
            <Textarea
              className="mt-2 min-h-64"
              value={form.content}
              onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
            />
          </label>
          <Button type="submit" disabled={saveState === "loading"}>
            {saveState === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            保存
          </Button>
        </form>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <div className="rounded-lg border border-line bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Lightbulb className="h-4 w-4 text-amber-600" />
                AI 建议补充什么
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => loadCompletionSuggestions()}
                disabled={suggestionsLoading}
              >
                {suggestionsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                刷新建议
              </Button>
            </div>

            {suggestionsError ? (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                <TriangleAlert className="h-4 w-4" />
                {suggestionsError}
              </div>
            ) : null}

            {suggestionsLoading && suggestions.length === 0 ? (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-line bg-canvas p-4 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在分析缺少的信息...
              </div>
            ) : null}

            {!suggestionsLoading && suggestions.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">
                暂无补全建议。
              </div>
            ) : null}

            {suggestions.length > 0 ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    onClick={() => selectSuggestion(suggestion)}
                    className={`focus-ring rounded-lg border p-4 text-left transition ${
                      activeSuggestion?.id === suggestion.id
                        ? "border-amber-300 bg-amber-50"
                        : "border-line bg-canvas hover:border-amber-200 hover:bg-amber-50/60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-sm font-semibold text-ink">{suggestion.title}</h2>
                      <Badge variant="outline">P{suggestion.priority}</Badge>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-muted">{suggestion.detail}</p>
                  </button>
                ))}
              </div>
            ) : null}

            {activeSuggestion ? (
              <div className="mt-5 rounded-lg border border-line bg-canvas p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <MessageSquareText className="h-4 w-4 text-teal-700" />
                  继续对话补充
                </div>
                <div className="mt-4 space-y-3">
                  {supplementMessages.map((message) => (
                    <div
                      key={message.id}
                      className={`rounded-lg px-3 py-2 text-sm leading-6 ${
                        message.role === "user"
                          ? "ml-auto max-w-[88%] bg-ink text-white"
                          : "mr-auto max-w-[88%] border border-line bg-white text-ink"
                      }`}
                    >
                      <p>{message.content}</p>
                      <p className={`mt-1 text-xs ${message.role === "user" ? "text-slate-300" : "text-muted"}`}>
                        {message.createdAt}
                      </p>
                    </div>
                  ))}
                </div>
                <form onSubmit={handleSupplementSubmit} className="mt-4 space-y-3">
                  <Textarea
                    className="min-h-28 bg-white"
                    value={supplementInput}
                    onChange={(event) => setSupplementInput(event.target.value)}
                    placeholder="根据上面的建议补充背景、来源、步骤或边界条件"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted">提交后会更新原知识，并重新生成 chunks 与 embedding。</p>
                    <Button type="submit" disabled={supplementState === "loading"}>
                      {supplementState === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
                      提交补充
                    </Button>
                  </div>
                </form>
              </div>
            ) : null}
          </div>

          <div className="rounded-lg border border-line bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
              <FileText className="h-4 w-4 text-teal-700" />
              知识片段
            </div>
            <div className="mt-5 space-y-4">
              {item.chunks.length === 0 ? (
                <div className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">
                  暂无片段。
                </div>
              ) : (
                item.chunks.map((chunk) => (
                  <article key={chunk.id} className="rounded-lg border border-line bg-canvas p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-base font-semibold text-ink">片段 {chunk.chunkIndex + 1}</h2>
                      <span className="text-xs text-muted">{new Date(chunk.createdAt).toLocaleString("zh-CN")}</span>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{chunk.chunkText}</p>
                  </article>
                ))
              )}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
              <History className="h-4 w-4 text-coral" />
              合并历史
            </div>
            <div className="mt-5 space-y-4">
              {item.mergeHistories.length === 0 ? (
                <div className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">
                  暂无合并历史。
                </div>
              ) : (
                item.mergeHistories.map((history) => (
                  <article key={history.id} className="rounded-lg border border-line bg-canvas p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-base font-semibold text-ink">{history.incomingTitle}</h2>
                        <p className="mt-1 text-xs text-muted">
                          {getKnowledgeSourceTypeLabel(history.incomingSourceType)} · {new Date(history.createdAt).toLocaleString("zh-CN")}
                        </p>
                      </div>
                      <Badge variant={history.incomingImportance >= 4 ? "warning" : "secondary"}>
                        重要度 {history.incomingImportance}
                      </Badge>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-700">{history.incomingSummary}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {history.incomingTags.length === 0 ? (
                        <span className="text-xs text-muted">暂无标签</span>
                      ) : (
                        history.incomingTags.map((tag) => (
                          <Badge key={`${history.id}-${tag}`} variant="outline">
                            {tag}
                          </Badge>
                        ))
                      )}
                    </div>
                    {history.incomingSourceTitle || history.incomingSourceUrl ? (
                      <div className="mt-3 text-xs leading-5 text-muted">
                        {history.incomingSourceTitle ? <p>来源：{history.incomingSourceTitle}</p> : null}
                        {history.incomingSourceUrl ? (
                          <a
                            href={history.incomingSourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="focus-ring inline-flex max-w-full items-center gap-1 rounded font-medium text-teal-700 hover:text-teal-800"
                          >
                            <span className="truncate">{history.incomingSourceUrl}</span>
                            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          </div>
        </div>

        <aside className="space-y-5">
          <section className="rounded-lg border border-line bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-ink">知识元信息</h2>
            <dl className="mt-5 space-y-4 text-sm">
              <div className="flex items-start gap-3">
                <CalendarClock className="mt-0.5 h-4 w-4 text-muted" />
                <div>
                  <dt className="text-muted">更新时间</dt>
                  <dd className="mt-1 font-medium text-ink">{new Date(item.updatedAt).toLocaleString("zh-CN")}</dd>
                </div>
              </div>
              <div>
                <dt className="text-muted">重要度</dt>
                <dd className="mt-1 font-medium text-ink">{item.importance}</dd>
              </div>
              <div>
                <dt className="text-muted">状态</dt>
                <dd className="mt-1">
                  <Badge variant={item.status === "stale" ? "warning" : item.status === "archived" ? "outline" : "secondary"}>
                    {knowledgeStatusLabels[item.status]}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-muted">过期提醒</dt>
                <dd className="mt-1 font-medium text-ink">
                  {item.expiresAt ? new Date(item.expiresAt).toLocaleDateString("zh-CN") : "未设置"}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-line bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-teal-700" />
              <h2 className="text-sm font-semibold text-ink">质量评分</h2>
            </div>
            <div className="mt-4 flex items-center justify-between rounded-lg border border-line bg-canvas px-3 py-2">
              <span className="text-sm text-muted">平均分</span>
              <Badge variant={isLowQuality ? "warning" : "secondary"}>{qualityAverage}/5</Badge>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              {knowledgeQualityScoreKeys.map((key) => (
                <div key={key} className="rounded-lg border border-line bg-white px-3 py-2">
                  <dt className="text-xs text-muted">{knowledgeQualityScoreLabels[key]}</dt>
                  <dd className="mt-1 font-semibold text-ink">{item[key]}/5</dd>
                </div>
              ))}
            </dl>
            {isLowQuality ? (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                这条知识质量偏低，建议补充背景、适用范围、来源依据和完整结论。
              </div>
            ) : null}
          </section>

          <section className="rounded-lg border border-line bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <MessageSquareText className="h-4 w-4 text-teal-700" />
              <h2 className="text-sm font-semibold text-ink">来源信息</h2>
            </div>
            <dl className="mt-5 space-y-4 text-sm">
              <div>
                <dt className="text-muted">来源类型</dt>
                <dd className="mt-1 font-medium text-ink">{getKnowledgeSourceTypeLabel(item.sourceType)}</dd>
              </div>
              <div>
                <dt className="text-muted">来源标题</dt>
                <dd className="mt-1 font-medium text-ink">{item.sourceTitle || item.title}</dd>
              </div>
              {item.sourceUrl ? (
                <div>
                  <dt className="text-muted">来源链接</dt>
                  <dd className="mt-1">
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="focus-ring inline-flex max-w-full items-center gap-1 rounded text-sm font-medium text-teal-700 hover:text-teal-800"
                    >
                      <span className="truncate">{item.sourceUrl}</span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    </a>
                  </dd>
                </div>
              ) : null}
              {item.sourceMessageId ? (
                <div>
                  <dt className="text-muted">来源消息 ID</dt>
                  <dd className="mt-1 break-all font-medium text-ink">{item.sourceMessageId}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-muted">创建时间</dt>
                <dd className="mt-1 font-medium text-ink">{new Date(item.createdAt).toLocaleString("zh-CN")}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-line bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-ink">标签</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {item.tags.length === 0 ? (
                <span className="text-sm text-muted">暂无标签</span>
              ) : (
                item.tags.map((tag) => (
                  <Badge key={tag} variant="outline">
                    {tag}
                  </Badge>
                ))
              )}
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}
