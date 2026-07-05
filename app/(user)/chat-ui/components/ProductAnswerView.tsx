"use client";

import * as React from "react";
import {
  Brain,
  Check,
  Copy,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { buildProductAnswerDisplay } from "../lib/answer-display";
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

const internalHeadingPattern = /^(?:#+\s*)?(?:小董AI处理建议|建议你这样做|详细分析|完整话术|引用来源|引用依据|适合自己理解|可直接发给客户|可推动下一步|解释|客户对话|成交话术|商业执行策略|推荐动作|标准回复话术|下一步行动|用户意图|业务问题分析)[：:]?\s*$/i;
const bracketHeadingPattern = /【(?:用户意图|业务问题分析|商业执行策略|推荐动作|标准回复话术|下一步行动|引用依据|引用来源)】/g;
const internalLinePattern = /(?:sourceApp|ingest_admin|admin_ingest|已命中知识库|条依据|知识库(?:中)?(?:暂时)?(?:暂无|没有|无)明确资料|暂无明确资料|判断点|执行难度|决策重点|分析框架|引用依据|引用来源|完整话术|详细分析|kb_id|expert_id|tenant_id|AI自动|成交概率|沉默风险|A\/B|多轮成交路径|策略候选池)/i;
const forbiddenOutputPhrasePattern = /(?:根据知识库|系统判断|资料显示|知识库中(?:暂时)?(?:暂无|没有|无)明确资料|暂无明确资料|目前我们知识库中没有)/g;
const markdownTableSeparatorPattern = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;
const markdownTableLinePattern = /^\s*\|.*\|\s*$/;
const numberedPrefixPattern = /^\s*(?:[-*•]\s*|\d+[.、]\s*)/;
const maxLineLength = 180;
const v5ScriptLabels = ["破冰承接", "确认需求", "推进下一步"] as const;

type ProductAnswerDisplayShape = NonNullable<ReturnType<typeof buildProductAnswerDisplay>>;

interface ChatModeAnswerText {
  lead: string;
  suggestions: string[];
  nextStep: string;
}

interface V5ScriptLine {
  label: string;
  text: string;
}

interface V5ThreePartAnswer {
  originalOutput: string;
  scripts: V5ScriptLine[];
  nextAction: string;
  copyText: string;
}

function readStringField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function normalizeNaturalText(text?: string | null) {
  return (text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(bracketHeadingPattern, "")
    .split("\n")
    .map((line) => line
      .replace(markdownTableLinePattern, "")
      .replace(markdownTableSeparatorPattern, "")
      .replace(/^\s*(?:[-*]\s*)?复制(?:答案|客户话术|成交话术)?\s*$/g, "")
      .replace(/^\s*#+\s*/g, "")
      .replace(/\*\*/g, "")
      .replace(/^>+\s*/g, "")
      .replace(numberedPrefixPattern, "")
      .trim())
    .filter((line) => line && !internalHeadingPattern.test(line) && !internalLinePattern.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizedKey(text: string) {
  return text.replace(/\s+/g, "").replace(/[，。！？、,.!?;；：:]/g, "").toLowerCase();
}

function splitReadableSentences(text?: string | null) {
  const normalized = normalizeNaturalText(text);

  if (!normalized) {
    return [];
  }

  return normalized
    .replace(/[。！？!?]\s*/g, (match) => `${match}\n`)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => line.length > maxLineLength
      ? line.split(/[；;]\s*/).map((part) => part.trim()).filter(Boolean)
      : [line])
    .map((line) => line.length > maxLineLength ? `${line.slice(0, maxLineLength)}...` : line)
    .filter((line) => line && !internalLinePattern.test(line));
}

function collectChatModeCandidates(answer: FinalizedAnswerView, display: ProductAnswerDisplayShape) {
  const directLines = [
    ...splitReadableSentences(answer.freeformAnswer),
    ...splitReadableSentences(display.freeformAnswer),
    ...splitReadableSentences(answer.keyConclusion),
    ...splitReadableSentences(answer.problemUnderstanding),
    ...splitReadableSentences(display.decision),
    ...splitReadableSentences(answer.customerReply),
    ...splitReadableSentences(display.customerReply.previewText),
  ];

  const suggestionLines = [
    ...(answer.suggestedSteps ?? []).flatMap((item) => splitReadableSentences(item)),
    ...(display.suggestions ?? []).flatMap((item) => splitReadableSentences(item)),
    ...(display.actionSuggestions ?? []).flatMap((item) => splitReadableSentences(item)),
  ];

  const nextLines = [
    ...splitReadableSentences(answer.nextAction),
    ...splitReadableSentences(answer.nextActionDetail),
    ...splitReadableSentences(display.nextAction),
    ...splitReadableSentences(answer.nextQuestion),
  ];

  for (const section of display.analysisSections) {
    for (const line of section.lines) {
      suggestionLines.push(...splitReadableSentences(line));
    }
  }

  return { directLines, suggestionLines, nextLines };
}

function pushUniqueLine(lines: string[], text?: string | null) {
  const normalized = normalizeNaturalText(text).replace(/\n+/g, " ").trim();

  if (!normalized) {
    return;
  }

  const key = normalizedKey(normalized);
  if (lines.some((line) => {
    const existing = normalizedKey(line);
    return existing.includes(key.slice(0, 36)) || key.includes(existing.slice(0, 36));
  })) {
    return;
  }

  lines.push(normalized.length > maxLineLength ? `${normalized.slice(0, maxLineLength)}...` : normalized);
}

function buildChatModeAnswer(answer: FinalizedAnswerView, display: ProductAnswerDisplayShape): ChatModeAnswerText {
  const { directLines, suggestionLines, nextLines } = collectChatModeCandidates(answer, display);
  const direct: string[] = [];
  const suggestions: string[] = [];

  for (const line of directLines) {
    pushUniqueLine(direct, line);
    if (direct.length >= 2) {
      break;
    }
  }

  if (direct.length === 0) {
    pushUniqueLine(direct, "这个问题可以先不用急着下结论，重点是先确认对方当前真正卡在哪一步。");
  }

  for (const line of suggestionLines) {
    pushUniqueLine(suggestions, line);
    if (suggestions.length >= 3) {
      break;
    }
  }

  if (suggestions.length === 0) {
    ["先问清楚客户当前想解决什么问题。", "再给出简洁、稳妥、容易执行的说明。", "最后引导客户回复下一步。"].forEach((item) => pushUniqueLine(suggestions, item));
  }

  const nextStep = nextLines.find((line) => /[？?]/.test(line))
    || nextLines[0]
    || "你可以先问他：你现在最想解决的是使用方法，还是当前效果上的问题？";

  return {
    lead: direct.join(" "),
    suggestions,
    nextStep: normalizeNaturalText(nextStep).replace(/\n+/g, " ")
  };
}

function limitText(text: string, maxLength: number) {
  const normalized = text
    .replace(forbiddenOutputPhrasePattern, "")
    .replace(/\s+/g, " ")
    .replace(/^["“”'‘’]+|["“”'‘’]+$/g, "")
    .trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).replace(/[，,、；;：:\s]+$/g, "")}…`;
}

function buildOriginalOutput(answer: FinalizedAnswerView, display: ProductAnswerDisplayShape) {
  const answerRecord = answer as unknown as Record<string, unknown>;
  const candidates = [
    readStringField(answerRecord, "rawContent"),
    readStringField(answerRecord, "content"),
    readStringField(answerRecord, "rawText"),
    readStringField(answerRecord, "text"),
    readStringField(answerRecord, "answer"),
    display.freeformAnswer,
    answer.freeformAnswer,
    answer.problemUnderstanding,
    answer.keyConclusion,
    display.customerReply.previewText,
    display.fullAnswerText
  ];

  for (const candidate of candidates) {
    const normalized = normalizeNaturalText(candidate);

    if (normalized.length >= 12) {
      return normalized;
    }
  }

  return "这个问题可以先围绕客户当前真实情况来回答，再给出更稳的下一步。";
}

function detectTopic(lines: string[]) {
  const text = lines.join(" ");

  if (/KKS|瘦身|体重|减脂|减肥/i.test(text)) {
    return "KKS";
  }

  if (/33|77|循环/i.test(text)) {
    return "33/77循环";
  }

  if (/同行|合作|代理|转介绍/.test(text)) {
    return "同行沟通";
  }

  if (/价格|太贵|优惠|贵/.test(text)) {
    return "价格异议";
  }

  if (/客户|成交|回复|话术/.test(text)) {
    return "客户沟通";
  }

  return "这件事";
}

function topicFallbackScripts(topic: string) {
  if (topic === "KKS") {
    return [
      "你先不用急着定KKS方案，我先帮你确认目标和现在基础。",
      "你现在更想了解使用方式、周期安排，还是是否适合自己？",
      "你把当前情况发我，我再帮你整理一个更稳的下一步。"
    ];
  }

  if (topic === "33/77循环") {
    return [
      "你先不用急着选，我先帮你看当前更适合哪一种节奏。",
      "你现在更在意启动难度、持续周期，还是最终效果？",
      "你把目标和当前情况发我，我帮你判断先走哪一步。"
    ];
  }

  if (topic === "同行沟通") {
    return [
      "你可以先从请教切入，不要一上来就推方案。",
      "你看到对方哪块内容比较专业？我帮你把开场话术顺一下。",
      "先发一段轻量破冰，再根据对方回应决定是否继续深入。"
    ];
  }

  if (topic === "价格异议") {
    return [
      "我理解你会考虑价格，我们先看这件事能不能真正解决你的问题。",
      "你现在主要担心预算，还是担心花了钱看不到效果？",
      "你把顾虑说具体一点，我帮你判断值不值得继续。"
    ];
  }

  return [
    "你先不用急着定，我先帮你确认真正卡住的点。",
    "你现在最想解决的是结果、方法，还是下一步怎么做？",
    "你把当前情况补充一下，我帮你整理一段更稳的回复。"
  ];
}

const universalFallbackScripts = [
  "你先不用急着下结论，把当前最卡的一点告诉我，我帮你判断下一步。",
  "你现在更想解决方法、效果，还是怎么回复客户？我按这个方向帮你整理。",
  "你把现状补充一句，我再给你一段可以直接发出去的回复。"
];

function pushV5Line(lines: string[], text?: string | null, maxLength = 80) {
  const cleaned = limitText(normalizeNaturalText(text).replace(/\n+/g, " "), maxLength);

  if (!cleaned || cleaned.length < 6 || internalLinePattern.test(cleaned)) {
    return;
  }

  const key = normalizedKey(cleaned);
  if (lines.some((line) => {
    const existing = normalizedKey(line);
    return existing.includes(key.slice(0, 28)) || key.includes(existing.slice(0, 28));
  })) {
    return;
  }

  lines.push(cleaned);
}

function buildV5ThreePartAnswer(answer: FinalizedAnswerView, display: ProductAnswerDisplayShape): V5ThreePartAnswer {
  const chatMode = buildChatModeAnswer(answer, display);
  const originalOutput = buildOriginalOutput(answer, display);
  const candidateLines = [
    ...splitReadableSentences(originalOutput),
    ...splitReadableSentences(answer.customerReply),
    ...splitReadableSentences(display.customerReply.previewText),
    ...splitReadableSentences(answer.freeformAnswer),
    ...splitReadableSentences(display.freeformAnswer),
    ...chatMode.suggestions,
    chatMode.lead,
    chatMode.nextStep
  ];
  const topic = detectTopic(candidateLines);
  const scripts: string[] = [];

  for (const line of candidateLines) {
    if (!/[你您我咱]|[？?]|先|可以|请|确认|回复/.test(line)) {
      continue;
    }

    pushV5Line(scripts, line, 80);
    if (scripts.length >= 3) {
      break;
    }
  }

  for (const line of topicFallbackScripts(topic)) {
    pushV5Line(scripts, line, 80);
    if (scripts.length >= 3) {
      break;
    }
  }

  const forcedFallbacks = topicFallbackScripts(topic);
  for (let index = 0; scripts.length < 3 && index < forcedFallbacks.length; index += 1) {
    const fallback = limitText(forcedFallbacks[index], 80);
    if (fallback && !scripts.some((line) => normalizedKey(line) === normalizedKey(fallback))) {
      scripts.push(fallback);
    }
  }

  for (let index = 0; scripts.length < 3 && index < universalFallbackScripts.length; index += 1) {
    const fallback = limitText(universalFallbackScripts[index], 80);
    if (fallback && !scripts.some((line) => normalizedKey(line) === normalizedKey(fallback))) {
      scripts.push(fallback);
    }
  }

  const nextAction = limitText(
    chatMode.nextStep || display.nextAction || "请客户补充当前情况，再给下一步建议。",
    50
  ) || "请客户补充当前情况，再给下一步建议。";

  const scriptLines = scripts.slice(0, 3).map((text, index) => ({
    label: v5ScriptLabels[index] ?? `话术${index + 1}`,
    text
  }));

  const copyText = [
    "DeepSeek 原文输出",
    originalOutput,
    "",
    "三条现成话术",
    ...scriptLines.map((item, index) => `${index + 1}. ${item.label}：${item.text}`),
    "",
    "下一步动作",
    nextAction
  ].join("\n").trim();

  return {
    originalOutput,
    scripts: scriptLines,
    nextAction,
    copyText
  };
}

function renderV5ThreePartAnswer(answer: V5ThreePartAnswer) {
  return (
    <div className="space-y-3 text-[15px] leading-7 text-slate-800">
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-xs font-semibold text-slate-500">DeepSeek 原文输出</p>
        <div className="mt-2 space-y-2 text-slate-900">
          {answer.originalOutput.split(/\n{2,}|\n/).filter(Boolean).map((paragraph, index) => (
            <p key={`${index}-${normalizedKey(paragraph).slice(0, 48)}`}>{paragraph}</p>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-xs font-semibold text-slate-500">三条现成话术</p>
        <div className="mt-3 space-y-3">
          {answer.scripts.map((item, index) => (
            <div
              key={`${item.label}-${normalizedKey(item.text)}`}
              className="rounded-xl border border-slate-100 bg-slate-50/80 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-emerald-700">{index + 1}. {item.label}</p>
                  <p className="mt-1 whitespace-pre-wrap text-slate-900">{item.text}</p>
                </div>
                <CopyMiniButton text={item.text} label="复制" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
        <p className="text-xs font-semibold text-emerald-700">下一步动作</p>
        <p className="mt-1 font-semibold text-emerald-950">{answer.nextAction}</p>
      </section>
    </div>
  );
}

export function ProductAnswerView({
  answer,
  sources,
  hitCount: _hitCount,
  hasRagHit,
  evidenceSummary: _evidenceSummary,
  confidence: _confidence,
  streaming = false,
  className
}: ProductAnswerViewProps) {
  void _confidence;
  void _hitCount;
  void _evidenceSummary;
  const display = answer ? buildProductAnswerDisplay(answer, sources, Boolean(hasRagHit)) : null;

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

  const v5Answer = buildV5ThreePartAnswer(answer, display);

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
          text={v5Answer.copyText}
          label="复制答案"
        />
      </header>

      <div className="mt-3">
        {renderV5ThreePartAnswer(v5Answer)}
      </div>
    </article>
  );
}
