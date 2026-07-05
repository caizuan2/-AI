"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Brain,
  Check,
  Copy,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getFinalizedRawAnswerText } from "../lib/answer-display";
import { safeCopyTextDetailed } from "../lib/clipboard";
import type {
  ChatSource,
  FinalizedAnswerView,
  RagConfidence
} from "../types";

interface ProductAnswerViewProps {
  answer: FinalizedAnswerView | null;
  sources?: ChatSource[] | null;
  hitCount?: number | null;
  hasRagHit?: boolean | null;
  evidenceSummary?: string | null;
  confidence?: RagConfidence | null;
  streaming?: boolean;
  className?: string;
}

function CopyMiniButton({
  text,
  label = "复制",
  onCopySignal,
}: {
  text: string;
  label?: string;
  onCopySignal?: () => void;
}) {
  const [copied, setCopied] = React.useState(false);
  const [selectedForManualCopy, setSelectedForManualCopy] = React.useState(false);
  const [copyFailed, setCopyFailed] = React.useState(false);
  const [manualCopyMessage, setManualCopyMessage] = React.useState("已选中内容，请按 Ctrl+C 复制");
  const [failureMessage, setFailureMessage] = React.useState("请手动复制选中的内容");
  const selectionRef = React.useRef<HTMLTextAreaElement>(null);
  const canCopy = text.trim().length > 0;

  async function handleCopy() {
    if (!canCopy) {
      return;
    }

    const result = await safeCopyTextDetailed(text, { selectTarget: selectionRef.current });

    if (result.copied) {
      onCopySignal?.();
      setCopyFailed(false);
      setSelectedForManualCopy(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
      return;
    }

    if (result.selected) {
      onCopySignal?.();
      setCopied(false);
      setCopyFailed(false);
      setManualCopyMessage(result.message);
      setSelectedForManualCopy(true);
      window.setTimeout(() => setSelectedForManualCopy(false), 2600);
      return;
    }

    setCopied(false);
    setSelectedForManualCopy(false);
    setFailureMessage(result.message);
    setCopyFailed(true);
    window.setTimeout(() => setCopyFailed(false), 1600);
  }

  return (
    <>
      <textarea
        ref={selectionRef}
        value={text}
        readOnly
        tabIndex={-1}
        aria-hidden="true"
        className="fixed -left-[9999px] top-0 h-px w-px opacity-0"
      />
      <button
        type="button"
        onClick={() => void handleCopy()}
        disabled={!canCopy}
        className="focus-ring inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
        {copied
          ? "已复制"
          : selectedForManualCopy
            ? manualCopyMessage
            : copyFailed
              ? failureMessage
              : label}
      </button>
    </>
  );
}

function markdownComponents() {
  return {
    p: ({ children }: { children?: React.ReactNode }) => <p className="mb-2 last:mb-0">{children}</p>,
    ol: ({ children }: { children?: React.ReactNode }) => (
      <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
    ),
    ul: ({ children }: { children?: React.ReactNode }) => (
      <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
    ),
    li: ({ children }: { children?: React.ReactNode }) => <li className="pl-1">{children}</li>,
    strong: ({ children }: { children?: React.ReactNode }) => (
      <strong className="font-semibold text-slate-950">{children}</strong>
    ),
    code: ({ children }: { children?: React.ReactNode }) => (
      <code className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[0.92em] text-slate-800">{children}</code>
    )
  };
}

export function ProductAnswerView({
  answer,
  sources: _sources,
  hitCount: _hitCount,
  hasRagHit: _hasRagHit,
  evidenceSummary: _evidenceSummary,
  confidence: _confidence,
  streaming = false,
  className
}: ProductAnswerViewProps) {
  void _sources;
  void _confidence;
  void _hitCount;
  void _hasRagHit;
  void _evidenceSummary;
  const rawText = getFinalizedRawAnswerText(answer);

  if (!answer) {
    return (
      <section className={cn("rounded-3xl border border-blue-100 bg-blue-50/70 p-5 text-blue-900", className)}>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          正在调用小董AI大脑🧠并组织回答
        </div>
        <div className="mt-3 flex gap-1.5">
          {[0, 1, 2].map((item) => (
            <span
              key={item}
              className="h-2 w-2 animate-pulse rounded-full bg-blue-500"
              style={{ animationDelay: `${item * 140}ms` }}
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <article className={cn("text-slate-900", className)}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-950">
            <Brain className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            小董AI
          </div>
          {streaming ? (
            <p className="mt-1 text-xs text-slate-400">正在逐步生成回复。</p>
          ) : null}
        </div>
        <CopyMiniButton
          text={rawText}
          label="复制答案"
        />
      </header>

      <div className="mt-3 text-[15px] leading-7 text-slate-900">
        {rawText ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents()}>
            {rawText}
          </ReactMarkdown>
        ) : (
          <p className="text-sm text-slate-500">这条历史消息没有保留可直接展示的最终正文。</p>
        )}
      </div>
    </article>
  );
}
