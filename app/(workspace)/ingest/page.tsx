"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  Bot,
  CheckCircle2,
  GitMerge,
  Loader2,
  MessageSquarePlus,
  RefreshCw,
  SendHorizontal,
  Sparkles,
  TriangleAlert,
  UserRound
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  getKnowledgeSourceTypeLabel,
  isKnowledgeSourceType,
  knowledgeSourceTypeLabels,
  knowledgeSourceTypes,
  type KnowledgeSourceType
} from "@/lib/knowledge/source-types";
import { feedRecords } from "@/lib/mock-data";
import type { FeedRecord } from "@/types";

type SubmitState = "idle" | "loading" | "success" | "error";
type SaveStrategy = "MANUAL_CONFIRM" | "AUTO_SAVE_AFTER_AI" | "ANALYZE_ONLY";
type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

interface AnalyzeResult extends KnowledgeQualityScores {
  shouldSave: boolean;
  title: string;
  summary: string;
  tags: string[];
  category: string;
  importance: number;
  reason: string;
  saveStrategy: SaveStrategy;
  saveRecommendation: string;
  content?: string;
  sourceType?: KnowledgeSourceType;
  sourceTitle?: string | null;
  sourceUrl?: string | null;
  fetchedFromUrl?: boolean;
}

interface KnowledgeSavePayload extends KnowledgeQualityScores {
  title: string;
  content: string;
  summary: string;
  tags: string[];
  category: string;
  importance: number;
  sourceType: KnowledgeSourceType;
  sourceTitle: string;
  sourceUrl: string | null;
  sourceMessageId: string | null;
}

interface SearchKnowledgeResult {
  chunkId: string;
  knowledgeItemId: string;
  title: string;
  chunkText: string;
  summary: string;
  tags: string[];
  sourceType: string;
  sourceTitle: string | null;
  sourceUrl: string | null;
  createdAt: string;
  similarity: number;
  score?: number;
}

interface SearchKnowledgeResponse {
  results: SearchKnowledgeResult[];
  mode: "hybrid" | "vector" | "keyword";
  insufficient?: boolean;
  message?: string | null;
}

interface SimilarKnowledgeCandidate {
  knowledgeItemId: string;
  title: string;
  summary: string;
  tags: string[];
  sourceType: string;
  createdAt: string;
  similarity: number;
}

interface MergeKnowledgeResponse extends KnowledgeQualityScores {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  category: string;
  importance: number;
  updatedAt: string;
  chunkCount: number;
}

type SaveKnowledgeOptions = {
  clearDraft?: boolean;
  message?: string;
  sourceMessageId?: string;
};

type PendingSave = {
  payload: KnowledgeSavePayload;
  options?: SaveKnowledgeOptions;
};

type UserSettingsResponse = {
  saveStrategy: SaveStrategy;
  updatedAt: string;
};

const SIMILARITY_PROMPT_THRESHOLD = 0.6;

const saveStrategyLabels: Record<SaveStrategy, string> = {
  MANUAL_CONFIRM: "手动确认入库",
  AUTO_SAVE_AFTER_AI: "AI 自动入库",
  ANALYZE_ONLY: "仅分析"
};

export default function IngestPage() {
  const [records, setRecords] = useState<FeedRecord[]>(feedRecords);
  const [sourceType, setSourceType] = useState<KnowledgeSourceType>("chat_input");
  const [sourceTitle, setSourceTitle] = useState("对话投喂");
  const [sourceUrl, setSourceUrl] = useState("");
  const [input, setInput] = useState("");
  const [contentToSave, setContentToSave] = useState("");
  const [contentSourceMessageId, setContentSourceMessageId] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "seed-ai",
      role: "assistant",
      content: "粘贴会议纪要、网页链接、客服对话或销售通话内容，我会先分析整理，再由你确认入库。",
      createdAt: "现在"
    }
  ]);
  const [state, setState] = useState<SubmitState>("idle");
  const [analyzeState, setAnalyzeState] = useState<SubmitState>("idle");
  const [saveState, setSaveState] = useState<SubmitState>("idle");
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [saveStrategy, setSaveStrategy] = useState<SaveStrategy>("MANUAL_CONFIRM");
  const [error, setError] = useState("");
  const [aiDraft, setAiDraft] = useState<AnalyzeResult | null>(null);
  const [similarCandidates, setSimilarCandidates] = useState<SimilarKnowledgeCandidate[]>([]);
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);
  const [mergeState, setMergeState] = useState<SubmitState>("idle");

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      setSettingsLoading(true);

      try {
        const response = await fetch("/api/settings");
        const data = await unwrapApiResponse<UserSettingsResponse>(response, "加载保存策略失败。");

        if (!cancelled) {
          setSaveStrategy(data.saveStrategy);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(caughtError instanceof Error ? caughtError.message : "加载保存策略失败。");
          setState("error");
        }
      } finally {
        if (!cancelled) {
          setSettingsLoading(false);
        }
      }
    }

    loadSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  function getNowLabel() {
    return new Date().toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  async function analyzeContent(content: string) {
    const response = await fetch("/api/ingest/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ content })
    });

    return unwrapApiResponse<AnalyzeResult>(response, "分析失败，请稍后重试。");
  }

  function getAssistantContent(result: AnalyzeResult) {
    const doneText = result.fetchedFromUrl ? "已抓取网页正文并完成整理" : "已完成整理";

    if (result.saveStrategy === "AUTO_SAVE_AFTER_AI") {
      return result.shouldSave
        ? `${doneText}，AI 判断值得入库，正在按策略自动保存。`
        : `${doneText}，AI 判断暂不建议入库，本次不会自动保存。`;
    }

    if (result.saveStrategy === "ANALYZE_ONLY") {
      return `${doneText}。当前为仅分析模式，不会写入知识库。`;
    }

    return `${doneText}，请在右侧确认结果后入库。`;
  }

  function getContentForSave(result: AnalyzeResult, fallbackContent: string) {
    return result.content?.trim() || fallbackContent;
  }

  function applyAnalyzeSource(result: AnalyzeResult) {
    const nextSourceType = isKnowledgeSourceType(result.sourceType) ? result.sourceType : null;

    if (nextSourceType) {
      setSourceType(nextSourceType);
    }

    if (result.sourceTitle?.trim()) {
      setSourceTitle(result.sourceTitle.trim());
    } else if (nextSourceType === "web_url") {
      setSourceTitle(result.title);
    }

    if (nextSourceType === "web_url") {
      setSourceUrl(result.sourceUrl?.trim() ?? "");
    }
  }

  function buildKnowledgePayload(
    draft: AnalyzeResult,
    content: string,
    sourceMessageId?: string
  ): KnowledgeSavePayload {
    const resolvedSourceType = isKnowledgeSourceType(draft.sourceType) ? draft.sourceType : sourceType;
    const resolvedSourceTitle = draft.sourceTitle?.trim()
      || sourceTitle.trim()
      || knowledgeSourceTypeLabels[resolvedSourceType];
    const resolvedSourceUrl = resolvedSourceType === "web_url"
      ? draft.sourceUrl?.trim() || sourceUrl.trim() || null
      : null;

    return {
      title: draft.title,
      content,
      summary: draft.summary,
      tags: draft.tags,
      category: draft.category,
      importance: draft.importance,
      clarityScore: draft.clarityScore,
      completenessScore: draft.completenessScore,
      usefulnessScore: draft.usefulnessScore,
      confidenceScore: draft.confidenceScore,
      sourceType: resolvedSourceType,
      sourceTitle: resolvedSourceTitle,
      sourceUrl: resolvedSourceUrl,
      sourceMessageId: (sourceMessageId ?? contentSourceMessageId) || null
    };
  }

  async function findSimilarKnowledge(payload: KnowledgeSavePayload) {
    const query = [payload.title, payload.summary, payload.content.slice(0, 600)].join("\n");
    const response = await fetch("/api/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query, topK: 5 })
    });
    const data = await unwrapApiResponse<SearchKnowledgeResponse>(response, "相似知识检查失败，请稍后重试。");
    const byKnowledgeItem = new Map<string, SimilarKnowledgeCandidate>();

    for (const result of data.results) {
      if (result.similarity < SIMILARITY_PROMPT_THRESHOLD) {
        continue;
      }

      const current = byKnowledgeItem.get(result.knowledgeItemId);

      if (current && current.similarity >= result.similarity) {
        continue;
      }

      byKnowledgeItem.set(result.knowledgeItemId, {
        knowledgeItemId: result.knowledgeItemId,
        title: result.title,
        summary: result.summary,
        tags: result.tags,
        sourceType: result.sourceType,
        createdAt: result.createdAt,
        similarity: result.similarity
      });
    }

    return Array.from(byKnowledgeItem.values())
      .sort((left, right) => right.similarity - left.similarity)
      .slice(0, 3);
  }

  function finishSave(payload: KnowledgeSavePayload, message: string, clearDraft?: boolean) {
    const nextRecord: FeedRecord = {
      id: `feed-${Date.now()}`,
      title: payload.title,
      source: payload.sourceTitle,
      contentPreview: payload.summary,
      tags: payload.tags,
      status: "completed",
      createdAt: new Date().toLocaleString("zh-CN")
    };

    setRecords((current) => [nextRecord, ...current]);
    setMessages((current) => [
      ...current,
      {
        id: `confirm-${Date.now()}`,
        role: "assistant",
        content: message,
        createdAt: getNowLabel()
      }
    ]);
    setInput("");
    setContentToSave("");
    setContentSourceMessageId("");
    setSimilarCandidates([]);
    setPendingSave(null);
    setMergeState("idle");
    setState("success");
    setSaveState("success");

    if (clearDraft) {
      setAiDraft(null);
    }
  }

  async function createKnowledgeFromPayload(payload: KnowledgeSavePayload, options?: SaveKnowledgeOptions) {
    setSaveState("loading");

    const response = await fetch("/api/knowledge", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    await unwrapApiResponse<unknown>(response, "入库失败，请稍后重试。");
    finishSave(payload, options?.message ?? "已入库。", options?.clearDraft);
  }

  async function saveKnowledge(draft: AnalyzeResult, content: string, options?: SaveKnowledgeOptions) {
    const payload = buildKnowledgePayload(draft, content, options?.sourceMessageId);

    setSaveState("loading");
    setSimilarCandidates([]);
    setPendingSave(null);

    const candidates = await findSimilarKnowledge(payload);

    if (candidates.length > 0) {
      setSimilarCandidates(candidates);
      setPendingSave({ payload, options });
      setSaveState("idle");
      setMessages((current) => [
        ...current,
        {
          id: `similar-${Date.now()}`,
          role: "assistant",
          content: "发现相似知识，请选择创建新知识、合并到已有知识，或放弃保存。",
          createdAt: getNowLabel()
        }
      ]);
      return;
    }

    await createKnowledgeFromPayload(payload, options);
  }

  async function handleCreateNewKnowledge() {
    if (!pendingSave) {
      return;
    }

    setError("");

    try {
      await createKnowledgeFromPayload(pendingSave.payload, pendingSave.options);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "入库失败，请稍后重试。");
      setSaveState("error");
      setState("error");
    }
  }

  async function handleMergeKnowledge(candidate: SimilarKnowledgeCandidate) {
    if (!pendingSave) {
      return;
    }

    setError("");
    setMergeState("loading");
    setSaveState("loading");

    try {
      const response = await fetch("/api/knowledge/merge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          targetKnowledgeItemId: candidate.knowledgeItemId,
          ...pendingSave.payload
        })
      });
      const merged = await unwrapApiResponse<MergeKnowledgeResponse>(response, "合并失败，请稍后重试。");

      finishSave(
        {
          ...pendingSave.payload,
          title: merged.title,
          summary: merged.summary,
          tags: merged.tags,
          category: merged.category,
          importance: merged.importance,
          clarityScore: merged.clarityScore,
          completenessScore: merged.completenessScore,
          usefulnessScore: merged.usefulnessScore,
          confidenceScore: merged.confidenceScore
        },
        `已合并到「${merged.title}」。`,
        pendingSave.options?.clearDraft
      );
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "合并失败，请稍后重试。");
      setMergeState("error");
      setSaveState("error");
      setState("error");
    }
  }

  function handleAbandonSave() {
    setSimilarCandidates([]);
    setPendingSave(null);
    setMergeState("idle");
    setSaveState("idle");
    setMessages((current) => [
      ...current,
      {
        id: `abandon-${Date.now()}`,
        role: "assistant",
        content: "已放弃保存，本次内容未写入知识库。",
        createdAt: getNowLabel()
      }
    ]);
  }

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = input.trim();

    if (!content) {
      setError("请输入要投喂的内容。");
      setState("error");
      return;
    }

    setError("");
    setState("idle");
    setSaveState("idle");
    setAnalyzeState("loading");
    setSimilarCandidates([]);
    setPendingSave(null);
    setMergeState("idle");

    try {
      const result = await analyzeContent(content);
      const contentForSave = getContentForSave(result, content);
      const userMessageId = `user-${Date.now()}`;

      setSaveStrategy(result.saveStrategy);
      applyAnalyzeSource(result);
      setAiDraft(result);
      setContentToSave(contentForSave);
      setContentSourceMessageId(userMessageId);
      setMessages((current) => [
        ...current,
        { id: userMessageId, role: "user", content, createdAt: getNowLabel() },
        {
          id: `ai-${Date.now()}`,
          role: "assistant",
          content: getAssistantContent(result),
          createdAt: getNowLabel()
        }
      ]);
      setAnalyzeState("success");

      if (result.saveStrategy === "AUTO_SAVE_AFTER_AI" && result.shouldSave) {
        try {
          await saveKnowledge(result, contentForSave, {
            message: "已根据保存策略自动入库。",
            sourceMessageId: userMessageId
          });
        } catch (caughtError) {
          setError(caughtError instanceof Error ? caughtError.message : "自动入库失败，请稍后重试。");
          setSaveState("error");
          setState("error");
        }
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "分析失败，请稍后重试。");
      setAnalyzeState("error");
      setState("error");
    }
  }

  async function handleConfirm() {
    if (!aiDraft || !contentToSave.trim()) {
      setError("请先分析内容，再确认入库。");
      setState("error");
      return;
    }

    setError("");
    setSaveState("loading");

    try {
      await saveKnowledge(aiDraft, contentToSave, {
        clearDraft: true,
        message: "已入库。",
        sourceMessageId: contentSourceMessageId
      });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "入库失败，请稍后重试。");
      setState("error");
      setSaveState("error");
    }
  }

  async function handleRegenerate() {
    const content = contentToSave.trim() || input.trim();

    if (!content) {
      setError("请输入要投喂的内容。");
      setState("error");
      return;
    }

    setError("");
    setState("idle");
    setAnalyzeState("loading");
    setSimilarCandidates([]);
    setPendingSave(null);
    setMergeState("idle");

    try {
      const result = await analyzeContent(content);
      const contentForSave = getContentForSave(result, content);

      setSaveStrategy(result.saveStrategy);
      applyAnalyzeSource(result);
      setAiDraft(result);
      setContentToSave(contentForSave);
      setMessages((current) => [
        ...current,
        {
          id: `regen-${Date.now()}`,
          role: "assistant",
          content: result.saveStrategy === "AUTO_SAVE_AFTER_AI" && result.shouldSave
            ? "已重新整理预览，AI 判断值得入库，正在按策略自动保存。"
            : "已重新整理预览。",
          createdAt: getNowLabel()
        }
      ]);
      setAnalyzeState("success");

      if (result.saveStrategy === "AUTO_SAVE_AFTER_AI" && result.shouldSave) {
        try {
          await saveKnowledge(result, contentForSave, {
            message: "已根据保存策略自动入库。",
            sourceMessageId: contentSourceMessageId
          });
        } catch (caughtError) {
          setError(caughtError instanceof Error ? caughtError.message : "自动入库失败，请稍后重试。");
          setSaveState("error");
          setState("error");
        }
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "重新整理失败，请稍后重试。");
      setAnalyzeState("error");
      setState("error");
    }
  }

  const draftQualityAverage = aiDraft ? getKnowledgeQualityAverage(aiDraft) : null;
  const draftIsLowQuality = aiDraft ? isLowQualityKnowledge(aiDraft) : false;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="Ingest"
        title="对话式投喂"
        description="输入文本或网页链接后调用 AI 分析整理，确认后写入知识库。"
      >
        <Badge variant={saveStrategy === "AUTO_SAVE_AFTER_AI" ? "warning" : "secondary"}>
          {settingsLoading ? "加载策略..." : saveStrategyLabels[saveStrategy]}
        </Badge>
      </PageHeader>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="flex min-h-[660px] flex-col">
          <CardHeader>
            <div className="flex items-center gap-2">
              <MessageSquarePlus className="h-4 w-4 text-teal-700" />
              <CardTitle>投喂聊天框</CardTitle>
            </div>
            <CardDescription>
              当前策略：{settingsLoading ? "加载中" : saveStrategyLabels[saveStrategy]}。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col p-0">
            <div className="flex-1 space-y-4 overflow-y-auto border-y border-line bg-canvas/70 p-4">
              {messages.map((message) => {
                const isUser = message.role === "user";
                return (
                  <div key={message.id} className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
                    {!isUser ? (
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-teal-100 text-teal-700">
                        <Bot className="h-4 w-4" />
                      </span>
                    ) : null}
                    <div
                      className={`max-w-[min(680px,calc(100vw-5rem))] rounded-lg px-4 py-3 text-sm leading-6 shadow-sm ${
                        isUser ? "bg-ink text-white" : "border border-line bg-white text-ink"
                      }`}
                    >
                      <p>{message.content}</p>
                      <p className={`mt-2 text-xs ${isUser ? "text-slate-300" : "text-muted"}`}>{message.createdAt}</p>
                    </div>
                    {isUser ? (
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-white">
                        <UserRound className="h-4 w-4" />
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <form onSubmit={handleSend} className="space-y-4 bg-white p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-ink">来源类型</span>
                  <select
                    value={sourceType}
                    onChange={(event) => setSourceType(event.target.value as KnowledgeSourceType)}
                    className="focus-ring mt-2 h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink shadow-sm"
                  >
                    {knowledgeSourceTypes.map((item) => (
                      <option key={item} value={item}>
                        {knowledgeSourceTypeLabels[item]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-ink">来源标题</span>
                  <Input
                    className="mt-2"
                    value={sourceTitle}
                    onChange={(event) => setSourceTitle(event.target.value)}
                    placeholder="例如：客户 Q2 复盘会议"
                  />
                </label>
              </div>

              {sourceType === "web_url" ? (
                <label className="block">
                  <span className="text-sm font-medium text-ink">来源链接</span>
                  <Input
                    className="mt-2"
                    value={sourceUrl}
                    onChange={(event) => setSourceUrl(event.target.value)}
                    placeholder="https://example.com/article"
                  />
                </label>
              ) : null}

              <div className="flex flex-col gap-3 sm:flex-row">
                <Textarea
                  className="min-h-16"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="继续投喂会议纪要、网页链接、客服对话或销售通话内容"
                />
                <Button type="submit" disabled={analyzeState === "loading"} className="h-12">
                  {analyzeState === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
                  分析
                </Button>
              </div>

              {state === "error" ? (
                <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  <TriangleAlert className="h-4 w-4" />
                  {error}
                </div>
              ) : null}

              {state === "success" ? (
                <div className="flex items-center gap-2 rounded-lg border border-teal-100 bg-teal-50 px-3 py-2 text-sm text-teal-700">
                  <CheckCircle2 className="h-4 w-4" />
                  已入库。
                </div>
              ) : null}
            </form>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-coral" />
                <CardTitle>AI 整理预览</CardTitle>
              </div>
              <CardDescription>
                {saveStrategy === "AUTO_SAVE_AFTER_AI"
                  ? "AI 判断值得保存时会自动入库。"
                  : saveStrategy === "ANALYZE_ONLY"
                    ? "仅展示整理结果，不会写入知识库。"
                    : "分析完成后在这里确认入库。"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {analyzeState === "loading" ? (
                <div className="flex items-center gap-2 rounded-lg border border-line bg-canvas p-5 text-sm text-muted">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在分析内容...
                </div>
              ) : null}

              {!aiDraft && analyzeState !== "loading" ? (
                <div className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">
                  暂无整理结果。
                </div>
              ) : null}

              {aiDraft ? (
                <>
                  <div>
                    <p className="text-xs text-muted">标题</p>
                    <p className="mt-1 text-sm font-semibold text-ink">{aiDraft.title}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">摘要</p>
                    <p className="mt-1 text-sm leading-6 text-slate-700">{aiDraft.summary}</p>
                  </div>
                  {aiDraft.fetchedFromUrl || aiDraft.sourceUrl ? (
                    <div className="rounded-lg border border-line bg-canvas p-3">
                      <p className="text-xs text-muted">网页来源</p>
                      <p className="mt-1 text-sm font-medium text-ink">{aiDraft.sourceTitle || sourceTitle || aiDraft.title}</p>
                      {aiDraft.sourceUrl ? (
                        <a
                          href={aiDraft.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 block break-all text-xs leading-5 text-teal-700 hover:underline"
                        >
                          {aiDraft.sourceUrl}
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted">分类</p>
                      <Badge className="mt-2">{aiDraft.category}</Badge>
                    </div>
                    <div>
                      <p className="text-xs text-muted">重要程度</p>
                      <Badge className="mt-2" variant={aiDraft.importance >= 4 ? "warning" : "secondary"}>
                        {aiDraft.importance}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-muted">知识质量评分</p>
                      <Badge variant={draftIsLowQuality ? "warning" : "secondary"}>
                        平均 {draftQualityAverage}/5
                      </Badge>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {knowledgeQualityScoreKeys.map((key) => (
                        <div key={key} className="rounded-lg border border-line bg-canvas px-3 py-2">
                          <p className="text-xs text-muted">{knowledgeQualityScoreLabels[key]}</p>
                          <p className="mt-1 text-sm font-semibold text-ink">{aiDraft[key]}/5</p>
                        </div>
                      ))}
                    </div>
                    {draftIsLowQuality ? (
                      <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                        这条知识质量偏低，建议补充背景、适用条件、来源依据或完整结论后再入库。
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <p className="text-xs text-muted">标签</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {aiDraft.tags.map((tag) => (
                        <Badge key={tag} variant="outline">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted">入库建议</p>
                    <p className="mt-1 text-sm leading-6 text-slate-700">{aiDraft.reason}</p>
                  </div>
                  <div className="rounded-lg border border-line bg-canvas p-3">
                    <p className="text-xs text-muted">当前保存策略</p>
                    <p className="mt-1 text-sm font-medium text-ink">{saveStrategyLabels[aiDraft.saveStrategy]}</p>
                    <p className="mt-1 text-xs leading-5 text-muted">{aiDraft.saveRecommendation}</p>
                  </div>
                  {pendingSave && similarCandidates.length > 0 ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                        <GitMerge className="h-4 w-4" />
                        发现相似知识
                      </div>
                      <p className="mt-1 text-xs leading-5 text-amber-800">
                        保存前检测到可能重复的知识。你可以创建新知识、合并到已有知识，或放弃保存。
                      </p>
                      <div className="mt-3 space-y-2">
                        {similarCandidates.map((candidate) => (
                          <article key={candidate.knowledgeItemId} className="rounded-lg border border-amber-200 bg-white p-3">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-semibold text-ink">{candidate.title}</p>
                                <p className="mt-1 text-xs text-muted">
                                  相似度 {Math.round(candidate.similarity * 100)}% · {getKnowledgeSourceTypeLabel(candidate.sourceType)}
                                </p>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => handleMergeKnowledge(candidate)}
                                disabled={mergeState === "loading" || saveState === "loading"}
                              >
                                {mergeState === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitMerge className="h-4 w-4" />}
                                合并
                              </Button>
                            </div>
                            <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted">{candidate.summary}</p>
                          </article>
                        ))}
                      </div>
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleCreateNewKnowledge}
                          disabled={saveState === "loading" || mergeState === "loading"}
                          className="flex-1 bg-white"
                        >
                          {saveState === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                          创建新知识
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleAbandonSave}
                          disabled={saveState === "loading" || mergeState === "loading"}
                          className="flex-1 bg-white"
                        >
                          放弃保存
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  <div className="flex flex-col gap-2 pt-2 sm:flex-row">
                    {aiDraft.saveStrategy === "MANUAL_CONFIRM" ? (
                      <Button
                        onClick={handleConfirm}
                        disabled={saveState === "loading" || !aiDraft.shouldSave || Boolean(pendingSave)}
                        className="flex-1"
                      >
                        {saveState === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        确认入库
                      </Button>
                    ) : null}
                    {aiDraft.saveStrategy === "AUTO_SAVE_AFTER_AI" ? (
                      <Button variant="secondary" disabled className="flex-1">
                        {saveState === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        {aiDraft.shouldSave ? (saveState === "success" ? "已自动入库" : "自动入库") : "AI 判断不入库"}
                      </Button>
                    ) : null}
                    {aiDraft.saveStrategy === "ANALYZE_ONLY" ? (
                      <Button variant="outline" disabled className="flex-1">
                        <Sparkles className="h-4 w-4" />
                        仅分析，不入库
                      </Button>
                    ) : null}
                    <Button variant="outline" onClick={handleRegenerate} disabled={analyzeState === "loading"} className="flex-1">
                      {analyzeState === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      重新整理
                    </Button>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>最近投喂</CardTitle>
              <CardDescription>空状态、处理中和完成状态都会在这里呈现。</CardDescription>
            </CardHeader>
            <CardContent>
              {records.length === 0 ? (
                <div className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">
                  暂无投喂记录。
                </div>
              ) : (
                <div className="space-y-3">
                  {records.slice(0, 4).map((record) => (
                    <article key={record.id} className="rounded-lg border border-line bg-canvas p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-ink">{record.title}</p>
                          <p className="mt-1 text-xs text-muted">{record.createdAt}</p>
                        </div>
                        <StatusBadge status={record.status} />
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
