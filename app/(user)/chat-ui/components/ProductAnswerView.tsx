"use client";

import * as React from "react";
import {
  ArrowRight,
  Brain,
  Check,
  Copy,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AnswerSourcesPanel } from "@/components/user/AnswerSourcesPanel";
import { HighValueAnswerView } from "@/components/user/HighValueAnswerView";
import { SalesGrowthPanel } from "@/components/user/SalesGrowthPanel";
import { SalesNextStepCard } from "@/components/user/SalesNextStepCard";
import { recordRuntimeV4FeedbackEvent } from "@/lib/knowledge-runtime/runtime-v4-feedback-event-store";
import type { RuntimeV4FeedbackEvent } from "@/lib/knowledge-runtime/runtime-v4-growth-types";
import {
  buildProductAnswerDisplay,
  type AnalysisSectionDisplay,
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

function DetailedAnalysisBlock({ sections }: { sections: AnalysisSectionDisplay[] }) {
  if (sections.length === 0) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-4 text-sm text-slate-700">
      <div className="mb-3 inline-flex items-center gap-2 font-semibold text-slate-900">
        <Brain className="h-4 w-4 text-blue-600" aria-hidden="true" />
        详细分析
      </div>
      <div className="space-y-3">
        {sections.map((section) => (
          <div key={section.title} className="rounded-xl bg-slate-50 px-3 py-3">
            <p className="font-semibold text-slate-900">{section.title}</p>
            <div className="mt-1.5 space-y-1 leading-6">
              {section.lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ProductAnswerView({
  answer,
  sources,
  hasRagHit,
  confidence: _confidence,
  streaming = false,
  className
}: ProductAnswerViewProps) {
  const [selectedModeKey, setSelectedModeKey] = React.useState<SalesAnswerModeKey>("closing");
  void _confidence;
  const display = answer ? buildProductAnswerDisplay(answer, sources, Boolean(hasRagHit)) : null;

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
  const growthScope = answer.isolationScope ?? answer.salesLearningV3?.isolationScope ?? null;
  const customerSegment = answer.customerSegment ?? answer.salesLearningV3?.customerSegment;
  const primaryDealSignal = (answer.dealSignals ?? answer.salesLoopPlan?.dealSignals)?.[0]?.key;
  const recordV4Signal = (event: RuntimeV4FeedbackEvent, reason: string) => {
    recordRuntimeV4FeedbackEvent({
      scope: growthScope,
      event,
      customerSegment,
      dealSignal: primaryDealSignal,
      meta: { reason },
    });
  };
  const copyAnswerText = [
    "小董AI处理建议",
    "",
    display.freeformAnswer ? "主答案：" : "",
    display.freeformAnswer,
    display.freeformAnswer ? "" : "",
    "行动建议：",
    ...display.actionSuggestions.map((suggestion, index) => `${index + 1}. ${suggestion}`),
    "",
    "详细分析：",
    ...display.analysisSections.flatMap((section) => [
      section.title,
      ...section.lines
    ]),
    "",
    answer.nextActionDetail ? `推进策略：${answer.nextActionDetail}` : "",
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
        <CopyMiniButton
          text={copyAnswerText}
          label="复制答案"
          onCopySignal={() => recordV4Signal("save_response", "用户复制了完整回答。")}
        />
      </header>

      <div className="mt-4 space-y-3 text-[15px] leading-7 text-slate-800">
        {display.freeformAnswer ? (
          <HighValueAnswerView
            content={display.freeformAnswer}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-4"
          />
        ) : null}

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

        <SalesNextStepCard
          salesIntent={answer.salesIntent}
          customerStage={answer.customerStage}
          salesStrategy={answer.salesStrategy}
          nextAction={answer.nextActionDetail || display.nextAction}
          complianceWarnings={answer.complianceWarnings}
        />

        <SalesGrowthPanel
          customerStage={answer.customerStage}
          stageReason={answer.stageReason ?? answer.salesLoopPlan?.stageReason}
          dealSignals={answer.dealSignals ?? answer.salesLoopPlan?.dealSignals}
          nextQuestion={answer.nextQuestion ?? answer.salesLoopPlan?.nextQuestion}
          followupSequence={answer.followupSequence ?? answer.salesLoopPlan?.followupSequence}
          stopRules={answer.stopRules ?? answer.salesLoopPlan?.stopRules}
          salesLoopV2={answer.salesLoopV2}
          dealProbability={answer.dealProbability}
          silenceRisk={answer.silenceRisk}
          abScripts={answer.abScripts}
          multiTurnPath={answer.multiTurnPath}
          followupTiming={answer.followupTiming}
          stopPush={answer.stopPush}
          recommendedAction={answer.recommendedAction}
          salesLearningV3={answer.salesLearningV3}
          salesGrowthV4={answer.salesGrowthV4}
          salesEvolutionV5={answer.salesEvolutionV5}
        />

        <DetailedAnalysisBlock sections={display.analysisSections} />

        <section className="rounded-2xl bg-emerald-50 px-4 py-4 text-emerald-950 ring-1 ring-emerald-100">
          <div className="mb-3 inline-flex rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-100">
            复制给客户
          </div>
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
            <CopyMiniButton
              text={activeMode.text}
              label={activeMode.copyLabel}
              onCopySignal={() => recordV4Signal("copy_customer_copy", `用户复制了${activeMode.label}话术。`)}
            />
          </div>
          <p className="whitespace-pre-line text-sm leading-7">{activeMode.text}</p>

          <p className="mt-3 flex items-start gap-2 border-t border-emerald-100 pt-3 text-sm leading-7 text-emerald-900">
            <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
            <span>
              <span className="font-semibold">下一步：</span>
              {display.nextAction}
            </span>
          </p>
        </section>

        <AnswerSourcesPanel sources={sources} />
      </div>
    </article>
  );
}
