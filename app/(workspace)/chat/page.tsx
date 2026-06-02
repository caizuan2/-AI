"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  BookOpenCheck,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  MessageCircleQuestion,
  SendHorizontal,
  ThumbsDown,
  ThumbsUp,
  TriangleAlert,
  UserRound
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { unwrapApiResponse } from "@/lib/api/client";
import { getKnowledgeSourceTypeLabel } from "@/lib/knowledge/source-types";
import { cn } from "@/lib/utils";

type ChatSource = {
  citationIndex: number;
  chunkId: string;
  knowledgeItemId: string;
  title: string;
  summary: string;
  chunkText: string;
  sourceType: string;
  createdAt: string;
};

type ChatApiResponse = {
  answer: string;
  sources: ChatSource[];
  retrievalMessage: string | null;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  question?: string;
  sources?: ChatSource[];
};
type FeedbackChoice = "helpful" | "not_helpful";
type AnswerFeedbackState = {
  submitted?: FeedbackChoice;
  submitting?: boolean;
  reasonOpen?: boolean;
  reason?: string;
  error?: string;
};

function getNowLabel() {
  return new Date().toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function AnswerContent({
  content,
  sources,
  onCitationClick,
  className
}: {
  content: string;
  sources: ChatSource[];
  onCitationClick?: (index: number) => void;
  className?: string;
}) {
  const sourceIndexes = new Set(sources.map((source) => source.citationIndex));
  const nodes: Array<string | JSX.Element> = [];
  const citationPattern = /\[(\d+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = citationPattern.exec(content)) !== null) {
    const citationText = match[0];
    const citationIndex = Number(match[1]);

    if (match.index > lastIndex) {
      nodes.push(content.slice(lastIndex, match.index));
    }

    if (sourceIndexes.has(citationIndex)) {
      nodes.push(
        <button
          key={`${citationIndex}-${match.index}`}
          type="button"
          onClick={() => onCitationClick?.(citationIndex)}
          className="focus-ring mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded border border-teal-200 bg-teal-50 px-1 text-[11px] font-semibold leading-none text-teal-700 hover:bg-teal-100"
        >
          {citationText}
        </button>
      );
    } else {
      nodes.push(citationText);
    }

    lastIndex = match.index + citationText.length;
  }

  if (lastIndex < content.length) {
    nodes.push(content.slice(lastIndex));
  }

  return <p className={cn("whitespace-pre-wrap", className)}>{nodes}</p>;
}

function AnswerFeedback({
  state,
  onHelpful,
  onOpenReason,
  onReasonChange,
  onSubmitReason,
  onCancelReason
}: {
  state: AnswerFeedbackState;
  onHelpful: () => void;
  onOpenReason: () => void;
  onReasonChange: (reason: string) => void;
  onSubmitReason: () => void;
  onCancelReason: () => void;
}) {
  if (state.submitted) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-md border border-teal-100 bg-teal-50 px-3 py-2 text-xs text-teal-700">
        <CheckCircle2 className="h-3.5 w-3.5" />
        已记录：{state.submitted === "helpful" ? "有帮助" : "没帮助"}
      </div>
    );
  }

  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">这次回答有帮助吗？</span>
        <Button size="sm" variant="outline" onClick={onHelpful} disabled={state.submitting}>
          {state.submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />}
          有帮助
        </Button>
        <Button size="sm" variant="outline" onClick={onOpenReason} disabled={state.submitting}>
          <ThumbsDown className="h-3.5 w-3.5" />
          没帮助
        </Button>
      </div>

      {state.reasonOpen ? (
        <div className="mt-3 space-y-2">
          <Textarea
            value={state.reason ?? ""}
            onChange={(event) => onReasonChange(event.target.value)}
            rows={3}
            maxLength={1000}
            className="min-h-20 text-xs"
            placeholder="可以补充原因，例如：引用不相关、回答太笼统、遗漏了关键知识。"
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={onCancelReason} disabled={state.submitting}>
              取消
            </Button>
            <Button size="sm" variant="secondary" onClick={onSubmitReason} disabled={state.submitting}>
              {state.submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SendHorizontal className="h-3.5 w-3.5" />}
              提交原因
            </Button>
          </div>
        </div>
      ) : null}

      {state.error ? (
        <div className="mt-2 flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
          {state.error}
        </div>
      ) : null}
    </div>
  );
}

function ChatBubble({
  message,
  onCitationClick,
  feedbackState,
  onSubmitFeedback,
  onOpenFeedbackReason,
  onFeedbackReasonChange,
  onCancelFeedbackReason
}: {
  message: ChatMessage;
  onCitationClick?: (index: number) => void;
  feedbackState?: AnswerFeedbackState;
  onSubmitFeedback?: (message: ChatMessage, choice: FeedbackChoice, reason?: string) => void;
  onOpenFeedbackReason?: (messageId: string) => void;
  onFeedbackReasonChange?: (messageId: string, reason: string) => void;
  onCancelFeedbackReason?: (messageId: string) => void;
}) {
  const isUser = message.role === "user";
  const sources = message.sources ?? [];
  const answerFeedbackState = feedbackState ?? {};

  return (
    <div className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser ? (
        <span className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-teal-100 text-teal-700">
          <Bot className="h-4 w-4" />
        </span>
      ) : null}

      <div
        className={cn(
          "max-w-[min(720px,calc(100vw-5rem))] rounded-lg px-4 py-3 text-sm leading-6 shadow-sm",
          isUser ? "bg-ink text-white" : "border border-line bg-white text-ink"
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <AnswerContent content={message.content} sources={sources} onCitationClick={onCitationClick} />
        )}
        <div className={cn("mt-2 text-xs", isUser ? "text-slate-300" : "text-muted")}>{message.createdAt}</div>

        {!isUser && sources.length > 0 ? (
          <div className="mt-3 space-y-2 border-t border-line pt-3">
            {sources.map((source) => (
              <Link
                key={`${source.knowledgeItemId}-${source.chunkId}`}
                href={`/knowledge/${source.knowledgeItemId}`}
                className="focus-ring block rounded-md border border-teal-100 bg-teal-50 px-3 py-2 text-xs text-teal-800 hover:bg-teal-100"
              >
                <span className="flex items-center justify-between gap-2 font-semibold">
                  [{source.citationIndex}] {source.title}
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                </span>
                <span className="mt-1 block font-normal leading-5 text-teal-700">
                  {getKnowledgeSourceTypeLabel(source.sourceType)} · {new Date(source.createdAt).toLocaleString("zh-CN")}
                </span>
                <span className="mt-1 block line-clamp-2 font-normal leading-5 text-teal-700">
                  {source.summary}
                </span>
              </Link>
            ))}
          </div>
        ) : null}

        {!isUser ? (
          <AnswerFeedback
            state={answerFeedbackState}
            onHelpful={() => onSubmitFeedback?.(message, "helpful")}
            onOpenReason={() => onOpenFeedbackReason?.(message.id)}
            onReasonChange={(reason) => onFeedbackReasonChange?.(message.id, reason)}
            onCancelReason={() => onCancelFeedbackReason?.(message.id)}
            onSubmitReason={() => onSubmitFeedback?.(message, "not_helpful", answerFeedbackState.reason)}
          />
        ) : null}
      </div>

      {isUser ? (
        <span className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-white">
          <UserRound className="h-4 w-4" />
        </span>
      ) : null}
    </div>
  );
}

function SourceCard({
  source,
  isHighlighted,
  isExpanded,
  onToggle
}: {
  source: ChatSource;
  isHighlighted: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <article
      id={`source-card-${source.citationIndex}`}
      className={cn(
        "rounded-lg border border-line bg-white p-4 transition-colors",
        isHighlighted ? "border-teal-300 bg-teal-50 shadow-sm" : "hover:border-teal-100 hover:bg-teal-50/40"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md border border-teal-200 bg-teal-50 px-1 text-xs font-semibold text-teal-700">
              [{source.citationIndex}]
            </span>
            <Link href={`/knowledge/${source.knowledgeItemId}`} className="focus-ring rounded text-sm font-semibold text-ink hover:text-teal-700">
              {source.title}
            </Link>
          </div>
          <p className="mt-2 text-xs text-muted">
            {getKnowledgeSourceTypeLabel(source.sourceType)} · {new Date(source.createdAt).toLocaleString("zh-CN")}
          </p>
        </div>
        <Link href={`/knowledge/${source.knowledgeItemId}`} className="focus-ring rounded text-muted hover:text-teal-700" aria-label="打开知识详情">
          <ExternalLink className="h-4 w-4 shrink-0" />
        </Link>
      </div>

      <p className="mt-3 line-clamp-3 text-xs leading-5 text-muted">{source.summary}</p>

      <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
        <p className="text-xs font-medium text-amber-900">命中片段</p>
        <p className={cn("mt-1 text-xs leading-5 text-amber-900", isExpanded ? "whitespace-pre-wrap" : "line-clamp-4")}>
          {source.chunkText}
        </p>
      </div>

      <Button type="button" variant="ghost" size="sm" onClick={onToggle} className="mt-3 w-full justify-center">
        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        {isExpanded ? "收起完整来源" : "展开完整来源"}
      </Button>
    </article>
  );
}

function ChatWorkspace() {
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState(searchParams.get("q") ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [highlightedSourceIndex, setHighlightedSourceIndex] = useState<number | null>(null);
  const [expandedSources, setExpandedSources] = useState<Set<number>>(() => new Set());
  const [feedbackByMessageId, setFeedbackByMessageId] = useState<Record<string, AnswerFeedbackState>>({});
  const latestAnswer = [...messages].reverse().find((message) => message.role === "assistant");
  const latestSources = latestAnswer?.sources ?? [];
  const questionHistory = messages
    .map((message, index) => ({ message, index }))
    .filter(({ message }) => message.role === "user")
    .map(({ message, index }) => ({
      question: message,
      answer: messages.slice(index + 1).find((item) => item.role === "assistant")
    }))
    .reverse();

  function handleCitationClick(index: number) {
    setHighlightedSourceIndex(index);
    document.getElementById(`source-card-${index}`)?.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }

  function toggleSource(index: number) {
    setExpandedSources((current) => {
      const next = new Set(current);

      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }

      return next;
    });
  }

  function updateFeedbackState(messageId: string, patch: AnswerFeedbackState) {
    setFeedbackByMessageId((current) => ({
      ...current,
      [messageId]: {
        ...current[messageId],
        ...patch
      }
    }));
  }

  function openFeedbackReason(messageId: string) {
    updateFeedbackState(messageId, {
      reasonOpen: true,
      error: ""
    });
  }

  function cancelFeedbackReason(messageId: string) {
    updateFeedbackState(messageId, {
      reasonOpen: false,
      reason: "",
      error: ""
    });
  }

  async function submitAnswerFeedback(message: ChatMessage, choice: FeedbackChoice, reason?: string) {
    updateFeedbackState(message.id, {
      submitting: true,
      error: ""
    });

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          type: choice === "helpful" ? "RAG_HELPFUL" : "RAG_NOT_HELPFUL",
          content: choice === "helpful"
            ? "用户认为这次 RAG 回答有帮助。"
            : reason?.trim() || "用户认为这次 RAG 回答没有帮助，但未填写具体原因。",
          metadata: {
            submittedFrom: "/chat",
            chatMessageId: message.id,
            question: message.question ?? null,
            answer: message.content,
            sourceCount: message.sources?.length ?? 0,
            sources: (message.sources ?? []).map((source) => ({
              citationIndex: source.citationIndex,
              knowledgeItemId: source.knowledgeItemId,
              title: source.title
            }))
          }
        })
      });

      await unwrapApiResponse<unknown>(response, "提交回答反馈失败。");
      updateFeedbackState(message.id, {
        submitted: choice,
        submitting: false,
        reasonOpen: false,
        error: ""
      });
    } catch (caughtError) {
      updateFeedbackState(message.id, {
        submitting: false,
        error: caughtError instanceof Error ? caughtError.message : "提交回答反馈失败。"
      });
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = input.trim();

    if (!question) {
      setError("请输入问题后再发送。");
      return;
    }

    const now = getNowLabel();
    const userMessage: ChatMessage = {
      id: `msg-user-${Date.now()}`,
      role: "user",
      content: question,
      createdAt: now
    };

    setMessages((current) => [...current, userMessage]);
    setInput("");
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ question })
      });

      const data = await unwrapApiResponse<ChatApiResponse>(response, "生成回答失败。");
      const assistantMessage: ChatMessage = {
        id: `msg-ai-${Date.now()}`,
        role: "assistant",
        content: data.answer,
        createdAt: getNowLabel(),
        question,
        sources: data.sources
      };

      setHighlightedSourceIndex(null);
      setExpandedSources(new Set());
      setMessages((current) => [...current, assistantMessage]);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "生成回答失败。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="grid min-h-[680px] gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Card className="flex min-h-0 flex-col">
        <CardHeader className="border-b border-line">
          <CardTitle>知识库问答</CardTitle>
          <CardDescription>基于已入库知识回答问题，回答会附带引用来源。</CardDescription>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col p-0">
          <div className="flex-1 space-y-5 overflow-y-auto bg-canvas/60 p-4 sm:p-5">
            {latestAnswer ? (
              <section className="rounded-lg border border-teal-100 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <BookOpenCheck className="h-4 w-4 text-teal-700" />
                  当前回答
                </div>
                <AnswerContent
                  content={latestAnswer.content}
                  sources={latestSources}
                  onCitationClick={handleCitationClick}
                  className="mt-3 text-sm leading-6 text-slate-700"
                />
              </section>
            ) : null}

            {messages.length === 0 ? (
              <div className="rounded-lg border border-dashed border-line bg-white p-8 text-center text-sm text-muted">
                暂无会话，输入一个问题开始检索知识库。
              </div>
            ) : (
              messages.map((message) => (
                <ChatBubble
                  key={message.id}
                  message={message}
                  onCitationClick={handleCitationClick}
                  feedbackState={feedbackByMessageId[message.id]}
                  onSubmitFeedback={submitAnswerFeedback}
                  onOpenFeedbackReason={openFeedbackReason}
                  onFeedbackReasonChange={(messageId, reason) => updateFeedbackState(messageId, { reason })}
                  onCancelFeedbackReason={cancelFeedbackReason}
                />
              ))
            )}

            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在检索知识并生成回答...
              </div>
            ) : null}
          </div>

          <form onSubmit={handleSubmit} className="border-t border-line bg-white p-4">
            {error ? (
              <div className="mb-3 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                <TriangleAlert className="h-4 w-4" />
                {error}
              </div>
            ) : null}
            <div className="flex flex-col gap-3 sm:flex-row">
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                rows={2}
                className="min-h-12"
                placeholder="输入一个业务问题"
              />
              <Button type="submit" disabled={loading} className="h-12">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
                发送
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-5">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BookOpenCheck className="h-4 w-4 text-teal-700" />
              <CardTitle>引用来源</CardTitle>
            </div>
            <CardDescription>当前回答命中的知识片段。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {latestSources.length === 0 ? (
              <div className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">
                暂无可引用知识
              </div>
            ) : (
              latestSources.map((source) => (
                <SourceCard
                  key={`${source.knowledgeItemId}-${source.chunkId}`}
                  source={source}
                  isHighlighted={highlightedSourceIndex === source.citationIndex}
                  isExpanded={expandedSources.has(source.citationIndex)}
                  onToggle={() => toggleSource(source.citationIndex)}
                />
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <MessageCircleQuestion className="h-4 w-4 text-coral" />
              <CardTitle>历史问答</CardTitle>
            </div>
            <CardDescription>本轮会话中的问题与回答摘要。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {questionHistory.length === 0 ? (
              <div className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">
                暂无历史问答。
              </div>
            ) : (
              questionHistory.map(({ question, answer }) => (
                <article key={question.id} className="rounded-lg border border-line bg-white p-4">
                  <p className="text-sm font-semibold text-ink">{question.content}</p>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted">
                    {answer?.content ?? "等待生成回答"}
                  </p>
                  <p className="mt-3 text-xs text-muted">{question.createdAt}</p>
                </article>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

export default function ChatPage() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="Chat"
        title="知识库问答"
        description="基于知识库提问，回答必须带来源引用。"
      />
      <Suspense fallback={<div className="rounded-lg border border-line bg-white p-6 text-sm text-muted">加载问答页...</div>}>
        <ChatWorkspace />
      </Suspense>
    </div>
  );
}
