"use client";

import * as React from "react";
import {
  ArrowRight,
  Brain,
  ChevronDown,
  Check,
  Copy,
  Loader2,
  Quote
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildProductAnswerDisplay,
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
  sources?: ChatSource[] | null;
  confidence?: RagConfidence | null;
  streaming?: boolean;
  className?: string;
}

function CopyMiniButton({ text, label = "复制" }: { text: string; label?: string }) {
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
      setCopyFailed(false);
      setSelectedForManualCopy(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
      return;
    }

    if (result.selected) {
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

function FoldSection({
  title,
  icon,
  children
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-600">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 font-semibold text-slate-800">
          {icon}
          {title}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="mt-3 border-t border-slate-100 pt-3 leading-7">
        {children}
      </div>
    </details>
  );
}

export function ProductAnswerView({
  answer,
  sources,
  confidence: _confidence,
  streaming = false,
  className
}: ProductAnswerViewProps) {
  const [selectedModeKey, setSelectedModeKey] = React.useState<SalesAnswerModeKey>("closing");
  void _confidence;
  const display = answer ? buildProductAnswerDisplay(answer, sources) : null;

  React.useEffect(() => {
    if (display?.defaultMode) {
      setSelectedModeKey(display.defaultMode);
    }
  }, [display?.defaultMode, answer?.title, answer?.customerReply]);

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

  if (!display) {
    return null;
  }

  const activeMode = display.salesModes.find((mode) => mode.key === selectedModeKey)
    ?? display.salesModes.find((mode) => mode.key === display.defaultMode)
    ?? display.salesModes[0];
  const copyAnswerText = [
    "小董AI处理建议",
    "",
    `判断：${display.decision}`,
    "",
    "行动建议：",
    ...display.actionSuggestions.map((suggestion, index) => `${index + 1}. ${suggestion}`),
    "",
    `【${activeMode.label}】`,
    activeMode.text,
    "",
    `下一步：${display.nextAction}`
  ].filter(Boolean).join("\n");

  return (
    <article className={cn("rounded-3xl bg-white px-5 py-5 text-slate-900 shadow-sm ring-1 ring-slate-100", className)}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-950">
            <Brain className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            小董AI处理建议
          </div>
          {streaming ? (
            <p className="mt-1 text-xs text-slate-400">正在逐步生成回复。</p>
          ) : null}
        </div>
        <CopyMiniButton text={copyAnswerText} label="复制答案" />
      </header>

      <div className="mt-4 space-y-3 text-[15px] leading-7 text-slate-800">
        <section className="rounded-2xl bg-blue-50 px-4 py-3 ring-1 ring-blue-100">
          <p className="text-xs font-semibold text-blue-700">判断</p>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-950">{display.decision}</p>
        </section>

        <section className="rounded-2xl bg-slate-50 px-4 py-3">
          <p className="mb-2 text-sm font-semibold text-slate-800">建议你这样做</p>
          <ul className="space-y-1.5 text-sm leading-6 text-slate-700">
            {display.actionSuggestions.map((step) => (
              <li key={step} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl bg-emerald-50 px-4 py-4 text-emerald-950 ring-1 ring-emerald-100">
          <div className="mb-3 flex flex-wrap gap-2">
            {display.salesModes.map((mode) => {
              const selected = mode.key === activeMode.key;

              return (
                <button
                  key={mode.key}
                  type="button"
                  onClick={() => setSelectedModeKey(mode.key)}
                  className={cn(
                    "focus-ring rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                    selected
                      ? "border-emerald-700 bg-emerald-700 text-white"
                      : "border-emerald-200 bg-white/80 text-emerald-800 hover:bg-white"
                  )}
                >
                  {mode.label}
                </button>
              );
            })}
          </div>

          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-emerald-900">{activeMode.title}</p>
            <CopyMiniButton text={activeMode.text} label={activeMode.copyLabel} />
          </div>
          <p className="whitespace-pre-line text-sm leading-7">{activeMode.text}</p>
        </section>

        <p className="flex items-start gap-2 text-sm leading-7 text-slate-700">
          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
          <span>
            <span className="font-semibold text-slate-900">下一步：</span>
            {display.nextAction}
          </span>
        </p>

        <FoldSection
          title="展开详细分析"
          icon={<Brain className="h-4 w-4 text-blue-600" aria-hidden="true" />}
        >
          <p className="whitespace-pre-line">{display.analysis}</p>
        </FoldSection>

        <FoldSection
          title="展开完整话术"
          icon={<Copy className="h-4 w-4 text-blue-600" aria-hidden="true" />}
        >
          <div className="mb-3 flex justify-end">
            <CopyMiniButton text={display.fullScriptText} label="复制完整话术" />
          </div>
          <p className="whitespace-pre-line">{display.fullScriptText}</p>
        </FoldSection>

        <FoldSection
          title="展开引用依据"
          icon={<Quote className="h-4 w-4 text-blue-600" aria-hidden="true" />}
        >
          <p>{display.evidenceSummary}</p>
          <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
            {display.sourceDetail}
          </p>
        </FoldSection>
      </div>
    </article>
  );
}
