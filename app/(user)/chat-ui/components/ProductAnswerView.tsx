"use client";

import * as React from "react";
import {
  ArrowRight,
  Brain,
  Check,
  Copy,
  Loader2,
  Quote
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getCleanEvidenceSummary,
  sanitizeVisibleSources,
  sanitizeVisibleText
} from "@/lib/ai-chat/visible-output-sanitizer";
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

const MAX_STEP_LENGTH = 35;

function cleanVisibleText(value: unknown, fallback = "") {
  const text = sanitizeVisibleText(typeof value === "string" ? value : "");

  return text || fallback;
}

function compactVisibleText(value: string, maxLength = MAX_STEP_LENGTH) {
  const text = cleanVisibleText(value)
    .replace(/^[\s\d.、)-]+/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1)}…`;
}

function cleanVisibleList(values: string[] | undefined, fallback: string[]) {
  const cleaned = (values ?? [])
    .map((value) => cleanVisibleText(value))
    .filter(Boolean);

  return cleaned.length > 0 ? cleaned : fallback;
}

function getSourceSummary(sources?: ChatSource[] | null) {
  return getCleanEvidenceSummary(Boolean(sources?.length));
}

function getSourceDetail(sources?: ChatSource[] | null) {
  const visibleTitles = sanitizeVisibleSources(sources ?? undefined)
    .map((source) => source.title)
    .slice(0, 3);

  if (visibleTitles.length === 0) {
    return "暂无可展示的明确来源。";
  }

  return `引用来源：${visibleTitles.join("、")}`;
}

function CopyMiniButton({ text, label = "复制" }: { text: string; label?: string }) {
  const [copied, setCopied] = React.useState(false);
  const canCopy = text.trim().length > 0;

  async function handleCopy() {
    if (!canCopy) {
      return;
    }

    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        const input = document.createElement("textarea");
        input.value = text;
        input.setAttribute("readonly", "true");
        input.style.position = "fixed";
        input.style.left = "-9999px";
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }
    } catch {
      // Keep the UI responsive even when browser clipboard permission is strict.
    }

    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!canCopy}
      className="focus-ring inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
      {copied ? "已复制" : label}
    </button>
  );
}

export function ProductAnswerView({
  answer,
  sources,
  confidence: _confidence,
  streaming = false,
  className
}: ProductAnswerViewProps) {
  void _confidence;

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

  const problemUnderstanding = cleanVisibleText(answer.problemUnderstanding, "先判断客户真实顾虑，再给出稳妥回复。");
  const keyConclusion = cleanVisibleText(answer.keyConclusion, "先降低沟通压力，再结合资料说明价值。");
  const steps = cleanVisibleList(answer.suggestedSteps, [
    "先共情客户当前顾虑。",
    "再结合小董AI大脑🧠资料说明价值或使用方式。",
    "最后给出低压力的下一步选择。"
  ])
    .map((step) => compactVisibleText(step))
    .filter(Boolean)
    .slice(0, 3);
  const customerReply = cleanVisibleText(answer.customerReply, "理解的，我先帮您把重点梳理清楚，您看完再判断是否合适。");
  const nextAction = cleanVisibleText(answer.nextAction, "根据客户回复继续补充案例、对比或使用建议。");
  const evidenceSummary = cleanVisibleText(answer.evidenceSummary, getSourceSummary(sources));
  const sourceDetail = getSourceDetail(sources);
  const mainParagraphs = Array.from(new Set([
    problemUnderstanding,
    keyConclusion
  ].filter(Boolean))).slice(0, 2);
  const fullCopyText = [
    "小董AI建议",
    ...mainParagraphs,
    steps.length > 0 ? `建议：${steps.join("；")}` : "",
    "",
    "【可直接发给客户】",
    customerReply,
    "",
    `下一步：${nextAction}`
  ].filter(Boolean).join("\n");

  return (
    <article className={cn("rounded-3xl bg-white px-5 py-5 text-slate-900 shadow-sm ring-1 ring-slate-100", className)}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-950">
            <Brain className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            小董AI建议
          </div>
          {streaming ? (
            <p className="mt-1 text-xs text-slate-400">正在逐步生成回复。</p>
          ) : null}
        </div>
        <CopyMiniButton text={fullCopyText} label="复制" />
      </header>

      <div className="mt-4 space-y-4 text-[15px] leading-7 text-slate-800">
        {mainParagraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}

        {steps.length > 0 ? (
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <p className="mb-2 text-sm font-semibold text-slate-800">建议你先这样处理：</p>
            <ul className="space-y-1.5 text-sm leading-6 text-slate-700">
              {steps.map((step) => (
                <li key={step} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <section className="rounded-2xl bg-emerald-50 px-4 py-4 text-emerald-950 ring-1 ring-emerald-100">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-emerald-900">可直接发给客户</p>
            <CopyMiniButton text={customerReply} label="复制话术" />
          </div>
          <p className="whitespace-pre-wrap text-sm leading-7">{customerReply}</p>
        </section>

        <p className="flex items-start gap-2 text-sm leading-7 text-slate-700">
          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
          <span>
            <span className="font-semibold text-slate-900">下一步：</span>
            {nextAction}
          </span>
        </p>

        <details className="group border-t border-slate-100 pt-3 text-sm text-slate-500">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-slate-500">
            <Quote className="h-4 w-4 text-blue-600" aria-hidden="true" />
            <span>{evidenceSummary}</span>
          </summary>
          <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
            {sourceDetail}
          </p>
        </details>
      </div>
    </article>
  );
}
