"use client";

import { useMemo, useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { trackIngestBehaviorEvent } from "@/components/enterprise-admin/IngestBehaviorTracker";

type FeedbackRating = "up" | "down";
type FeedbackStatus = "idle" | "sending" | "sent" | "error";

export interface IngestAnswerFeedbackActionsProps {
  messageId: string;
  agentId?: string | null;
  knowledgeBaseId?: string | null;
  namespace?: string | null;
  chunkIds?: string[];
  evidenceIds?: string[];
  question?: string | null;
  answer: string;
  inline?: boolean;
}

function buildAnswerHash(text: string) {
  let hash = 0;

  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(index);
    hash |= 0;
  }

  return `ans_${Math.abs(hash).toString(36)}`;
}

export function IngestAnswerFeedbackActions({
  messageId,
  agentId,
  knowledgeBaseId,
  namespace,
  chunkIds = [],
  evidenceIds = [],
  question,
  answer,
  inline = false
}: IngestAnswerFeedbackActionsProps) {
  const [rating, setRating] = useState<FeedbackRating | null>(null);
  const [resolved, setResolved] = useState<boolean | null>(null);
  const [status, setStatus] = useState<FeedbackStatus>("idle");
  const answerHash = useMemo(() => buildAnswerHash(answer), [answer]);

  const submitFeedback = async (nextRating: FeedbackRating, nextResolved: boolean | null = resolved) => {
    setRating(nextRating);
    setResolved(nextResolved);
    setStatus("sending");

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId,
          agentId: agentId ?? null,
          knowledgeBaseId: knowledgeBaseId ?? null,
          namespace: namespace ?? null,
          chunkIds,
          evidenceIds,
          rating: nextRating,
          resolved: nextResolved,
          question: question ?? null,
          answerHash,
          questionHash: question ? buildAnswerHash(question) : null,
          source: "admin_ingest"
        })
      });
      const data = await response.json().catch(() => null) as { success?: boolean; message?: string } | null;

      if (!response.ok || data?.success === false) {
        throw new Error(data?.message || "反馈提交失败");
      }

      trackIngestBehaviorEvent({
        eventType: nextRating === "up" ? "feedback_up" : "feedback_down",
        messageId,
        agentId: agentId ?? null,
        knowledgeBaseId: knowledgeBaseId ?? null,
        namespace: namespace ?? null,
        chunkIds,
        evidenceIds,
        source: "admin_ingest",
        metadata: {
          resolved: nextResolved,
          answerHash,
          questionHash: question ? buildAnswerHash(question) : null
        }
      });
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  };

  const feedbackButtonClass = (active: boolean) => [
    "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50",
    active
      ? "border-blue-200 bg-blue-100 text-blue-700"
      : "border-blue-100 bg-blue-50 text-blue-600 hover:border-blue-200 hover:bg-blue-100 hover:text-blue-700"
  ].join(" ");

  const content = (
    <>
      <button
        type="button"
        className={feedbackButtonClass(rating === "up")}
        title="有帮助"
        aria-label="有帮助"
        disabled={status === "sending"}
        onClick={() => void submitFeedback("up")}
      >
        <ThumbsUp className="h-4 w-4 stroke-[2]" aria-hidden="true" />
      </button>
      <button
        type="button"
        className={feedbackButtonClass(rating === "down")}
        title="没帮助"
        aria-label="没帮助"
        disabled={status === "sending"}
        onClick={() => void submitFeedback("down")}
      >
        <ThumbsDown className="h-4 w-4 stroke-[2]" aria-hidden="true" />
      </button>
      {rating ? (
        <div className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-full border border-neutral-200 bg-white/70 px-2 py-1">
          <span className="text-[11px] text-slate-500">是否解决</span>
          <button
            type="button"
            className={resolved === true ? "font-semibold text-[#08785f]" : "text-slate-600 hover:text-slate-900"}
            disabled={status === "sending"}
            onClick={() => void submitFeedback(rating, true)}
          >
            是
          </button>
          <span className="text-slate-300">/</span>
          <button
            type="button"
            className={resolved === false ? "font-semibold text-rose-600" : "text-slate-600 hover:text-slate-900"}
            disabled={status === "sending"}
            onClick={() => void submitFeedback(rating, false)}
          >
            否
          </button>
        </div>
      ) : null}
      {status === "sending" ? <span className="shrink-0 text-[12px] text-slate-500">提交中...</span> : null}
      {status === "sent" ? <span className="shrink-0 text-[12px] text-[#08785f]">感谢反馈，已记录</span> : null}
      {status === "error" ? <span className="shrink-0 text-[12px] text-rose-600">提交失败，请重试</span> : null}
    </>
  );

  if (inline) {
    return content;
  }

  return (
    <div className="mt-3 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap pb-1 text-[12px] text-slate-500">
      {content}
    </div>
  );
}
