"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Brain,
  Check,
  ChevronDown,
  Copy,
  FileText,
  Loader2,
  MessageSquareText,
  Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";
import { sanitizeVisibleSources } from "@/lib/ai-chat/visible-output-sanitizer";
import {
  buildProductAnswerDisplay,
  getFinalizedRawAnswerText,
  getNaturalMarkdownAnswerText,
  type SalesAnswerModeKey
} from "../lib/answer-display";
import { safeCopyTextDetailed } from "../lib/clipboard";
import type {
  ChatSource,
  FinalizedAnswerView,
  RagConfidence
} from "../types";

interface ProductAnswerViewProps {
  answer: FinalizedAnswerView | null;
  userQuery?: string | null;
  sources?: ChatSource[] | null;
  rawAnswerText?: string | null;
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
    p: ({ children }: { children?: React.ReactNode }) => <p className="mb-3 last:mb-0">{children}</p>,
    ol: ({ children }: { children?: React.ReactNode }) => (
      <ol className="mb-3 list-decimal space-y-2 pl-5 last:mb-0">{children}</ol>
    ),
    ul: ({ children }: { children?: React.ReactNode }) => (
      <ul className="mb-3 list-disc space-y-2 pl-5 last:mb-0">{children}</ul>
    ),
    li: ({ children }: { children?: React.ReactNode }) => <li className="pl-1">{children}</li>,
    strong: ({ children }: { children?: React.ReactNode }) => (
      <strong className="font-semibold text-slate-950">{children}</strong>
    ),
    code: ({ children, className }: { children?: React.ReactNode; className?: string }) => {
      const isBlockCode = typeof className === "string" && className.includes("language-");

      return isBlockCode
        ? <code className={cn("font-mono text-[13px]", className)}>{children}</code>
        : <code className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[0.92em] text-slate-800">{children}</code>;
    },
    pre: ({ children }: { children?: React.ReactNode }) => (
      <pre className="my-3 overflow-x-auto rounded-lg bg-slate-100 p-3 text-[13px] leading-6 text-slate-900">
        {children}
      </pre>
    ),
    table: ({ children }: { children?: React.ReactNode }) => (
      <div className="my-3 overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-[13px]">{children}</table>
      </div>
    ),
    th: ({ children }: { children?: React.ReactNode }) => (
      <th className="border-b border-slate-200 px-2 py-2 align-top font-semibold text-slate-950">{children}</th>
    ),
    td: ({ children }: { children?: React.ReactNode }) => (
      <td className="border-b border-slate-200 px-2 py-2 align-top text-slate-700">{children}</td>
    )
  };
}

function formatScore(score: unknown) {
  const value = typeof score === "number" ? score : Number.NaN;

  return Number.isFinite(value) ? `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` : "";
}

function buildAnalysisMarkdown(display: NonNullable<ReturnType<typeof buildProductAnswerDisplay>>) {
  return display.analysisSections
    .map((section) => [
      `### ${section.title}`,
      ...section.lines.map((line) => line.trim()).filter(Boolean)
    ].join("\n\n"))
    .join("\n\n");
}

export function ProductAnswerView({
  answer,
  userQuery,
  sources,
  rawAnswerText,
  hitCount: _hitCount,
  hasRagHit = false,
  evidenceSummary: _evidenceSummary,
  confidence: _confidence,
  streaming = false,
  className
}: ProductAnswerViewProps) {
  void _confidence;
  void _hitCount;
  void _evidenceSummary;
  const answerForDisplay = React.useMemo(() => {
    const query = userQuery?.trim();

    if (!answer || !query) {
      return answer;
    }

    return {
      ...answer,
      title: answer.title && !/^(处理建议|回答|小董AI)$/i.test(answer.title) ? answer.title : query
    };
  }, [answer, userQuery]);
  const naturalAnswerText = React.useMemo(
    () => getNaturalMarkdownAnswerText(answerForDisplay, [rawAnswerText]),
    [answerForDisplay, rawAnswerText]
  );
  const display = React.useMemo(
    () => naturalAnswerText ? null : buildProductAnswerDisplay(answerForDisplay, sources, Boolean(hasRagHit)),
    [answerForDisplay, hasRagHit, naturalAnswerText, sources]
  );
  const [activeMode, setActiveMode] = React.useState<SalesAnswerModeKey>("customer_chat");

  React.useEffect(() => {
    if (display?.defaultMode) {
      setActiveMode(display.defaultMode);
    }
  }, [display?.defaultMode]);

  const rawText = naturalAnswerText || display?.fullAnswerText || getFinalizedRawAnswerText(answerForDisplay);
  const activeScript = display?.salesModes.find((mode) => mode.key === activeMode)
    ?? display?.salesModes.find((mode) => mode.key === display.defaultMode)
    ?? display?.salesModes[0];
  const analysisMarkdown = display ? buildAnalysisMarkdown(display) : "";
  const visibleSources = sanitizeVisibleSources(
    (sources ?? []).map((source) => ({
      title: source.title,
      content: source.content_preview
    }))
  );

  if (naturalAnswerText) {
    return (
      <article className={cn("space-y-4 text-slate-900", className)}>
        <section className="rounded-[18px] border border-neutral-100 bg-[#f7f7f8] px-5 py-4">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="inline-flex items-center gap-2 text-base font-semibold text-slate-950">
              <Brain className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              小董AI
            </div>
            <CopyMiniButton
              text={naturalAnswerText}
              label="复制答案"
            />
          </div>

          <div className="prose prose-slate max-w-none text-[15px] leading-7 prose-headings:mb-2 prose-headings:mt-4 prose-headings:text-[15px] prose-headings:font-semibold prose-headings:text-slate-950 prose-p:my-2 prose-li:my-1">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents()}>
              {naturalAnswerText}
            </ReactMarkdown>
          </div>
        </section>

        {visibleSources.length > 0 ? (
          <details className="group rounded-[18px] border border-slate-200 bg-white px-5 py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-950">
              <span className="inline-flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-600" aria-hidden="true" />
                引用来源
              </span>
              <ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {visibleSources.map((source, index) => {
                const originalSource = sources?.[index];
                const score = formatScore(originalSource?.relevance_score ?? originalSource?.score);

                return (
                  <div key={`${source.title}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-semibold text-slate-900">{source.title}</span>
                      {score ? <span className="shrink-0 font-semibold text-blue-700">{score}</span> : null}
                    </div>
                    {source.summary ? <p className="mt-1">{source.summary}</p> : null}
                  </div>
                );
              })}
            </div>
          </details>
        ) : null}
      </article>
    );
  }

  if (!display) {
    return (
      <section className={cn("rounded-[18px] border border-blue-100 bg-blue-50/70 p-5 text-blue-900", className)}>
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
    <article className={cn("space-y-4 text-slate-900", className)}>
      <header className="rounded-[18px] border border-neutral-100 bg-[#f7f7f8] px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 text-base font-semibold text-slate-950">
              <Brain className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              小董AI处理建议
            </div>
            {streaming ? (
              <p className="mt-1 text-xs text-slate-500">正在按自然对话方式整理回复。</p>
            ) : null}
          </div>
          <CopyMiniButton
            text={rawText}
            label="复制答案"
          />
        </div>

        <section className="mt-4 rounded-2xl border border-emerald-100 bg-white px-4 py-3">
          <div className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-950">
            <Sparkles className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            建议你这样做
          </div>
          <div className="space-y-2">
            {display.actionSuggestions.slice(0, 3).map((suggestion) => (
              <div key={suggestion} className="flex gap-2 text-[15px] leading-7 text-slate-800">
                <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
                <span>{suggestion}</span>
              </div>
            ))}
          </div>
        </section>
      </header>

      <section className="rounded-[18px] border border-slate-200 bg-white px-5 py-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-950">
          <MessageSquareText className="h-4 w-4 text-blue-600" aria-hidden="true" />
          详细分析
        </div>
        <div className="prose prose-slate max-w-none text-[15px] leading-7 prose-headings:mb-2 prose-headings:mt-4 prose-headings:text-[15px] prose-headings:font-semibold prose-p:my-2 prose-li:my-1 prose-pre:hidden prose-table:hidden">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents()}>
            {analysisMarkdown || display.analysis}
          </ReactMarkdown>
        </div>
      </section>

      <section className="rounded-[18px] border border-emerald-100 bg-emerald-50/60 px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-emerald-950">可直接发给客户</h3>
            <p className="mt-1 text-xs text-emerald-700">选择不同场景的话术，复制后可按客户语气微调。</p>
          </div>
          {activeScript ? (
            <CopyMiniButton text={activeScript.text} label={activeScript.copyLabel} />
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {display.salesModes.map((mode) => (
            <button
              key={mode.key}
              type="button"
              onClick={() => setActiveMode(mode.key)}
              className={cn(
                "focus-ring rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                activeScript?.key === mode.key
                  ? "border-emerald-300 bg-white text-emerald-800 shadow-sm"
                  : "border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-white"
              )}
            >
              {mode.label}
            </button>
          ))}
        </div>

        {activeScript ? (
          <div className="mt-3 rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-[15px] leading-7 text-slate-800">
            <p className="mb-2 text-xs font-semibold text-emerald-700">{activeScript.title}</p>
            <div className="whitespace-pre-wrap">{activeScript.text}</div>
          </div>
        ) : null}
      </section>

      {visibleSources.length > 0 ? (
        <details className="group rounded-[18px] border border-slate-200 bg-white px-5 py-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-950">
            <span className="inline-flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-600" aria-hidden="true" />
              引用来源
            </span>
            <ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {visibleSources.map((source, index) => {
              const originalSource = sources?.[index];
              const score = formatScore(originalSource?.relevance_score ?? originalSource?.score);

              return (
                <div key={`${source.title}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-semibold text-slate-900">{source.title}</span>
                    {score ? <span className="shrink-0 font-semibold text-blue-700">{score}</span> : null}
                  </div>
                  {source.summary ? <p className="mt-1">{source.summary}</p> : null}
                </div>
              );
            })}
          </div>
        </details>
      ) : null}
    </article>
  );
}
