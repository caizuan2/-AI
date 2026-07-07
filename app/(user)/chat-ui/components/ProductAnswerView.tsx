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
  getFinalNaturalMarkdownAnswerText,
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

type NaturalAnswerSegment =
  | { kind: "markdown"; text: string }
  | { kind: "customerScript"; title: string; text: string };

type CustomerQuoteLine = {
  text: string;
  trailingText: string;
};

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

function normalizeScriptHeadingText(line: string) {
  return line
    .trim()
    .replace(/^>\s*/, "")
    .replace(/^#{1,6}\s*/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+[.、]\s*/, "")
    .replace(/^[\s💡📌✅☑️⭐🌟🔥👉➡️]+/, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCustomerScriptHeading(line: string) {
  const normalized = normalizeScriptHeadingText(line);

  if (!normalized) {
    return null;
  }

  const labelPatterns = [
    /^(可直接(?:复制)?(?:发给|给)客户|复制给客户|客户(?:可复制)?话术|客户回复|标准(?:回应|回复)(?:要点|话术)?(?:[（(][^）)]{1,36}[）)])?|标准回复(?:话术)?|直接复制(?:使用)?|对外话术|外发话术|您可以这样发给客户|可以这样发给客户)\s*[：:]?\s*(.*)$/i,
    /^(话术\s*(?:[一二三四五六七八九十\d]+)?(?:[（(][^）)]{1,24}[）)])?)\s*[：:]?\s*(.*)$/i
  ];

  for (const pattern of labelPatterns) {
    const match = normalized.match(pattern);

    if (!match) {
      continue;
    }

    return {
      title: match[1].replace(/[：:]$/, "").trim() || "客户话术",
      firstLine: match[2]?.trim() ?? ""
    };
  }

  const hasScriptWord = /话术|客户回复|回复文案|沟通文案|私聊发送|微信发送|外发文案/i.test(normalized);
  const hasScriptIntent = /复制|粘贴|直接|客户|微信|私聊|发送|发给|外发|对外|沟通/i.test(normalized);
  const isStrategyHeading = /背后|策略|要点|原则|思路|说明|分析|注意事项|使用建议/i.test(normalized);

  if (hasScriptWord && hasScriptIntent && !isStrategyHeading) {
    return {
      title: normalized.length <= 28 ? normalized : "客户话术",
      firstLine: ""
    };
  }

  return null;
}

function extractCustomerQuoteLine(line: string): CustomerQuoteLine | null {
  const normalized = line
    .trim()
    .replace(/^>\s*/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+[.、]\s*/, "")
    .trim();
  const quoteMatch = normalized.match(/^[“"]([\s\S]{8,1200}?)[”"]\s*([\s\S]*)$/);

  if (!quoteMatch) {
    return null;
  }

  return {
    text: quoteMatch[1].trim(),
    trailingText: quoteMatch[2]?.trim() ?? ""
  };
}

function hasCustomerScriptContext(markdownLines: string[]) {
  const context = markdownLines
    .slice(-5)
    .map((line) => normalizeScriptHeadingText(line))
    .join("\n");

  return /客户|话术|回复|发给|复制|微信|私聊|跟.*说|这样说|这样跟|共情|接住|安抚|回应|沟通/.test(context);
}

function isLikelyCustomerScriptQuote(text: string) {
  const normalized = text.replace(/\s+/g, "");

  if (normalized.length < 16) {
    return false;
  }

  const hasDirectAddress = /姐|哥|兄弟|姐妹|宝|您好|你好|您|你/.test(normalized);
  const hasConversationTone = /理解|别急|不用担心|我帮你|我们|一起|可以|先|调整|回复|感觉|情况|问题|身体/.test(normalized);

  return hasDirectAddress && hasConversationTone;
}

function inferCustomerScriptTitle(markdownLines: string[]) {
  const heading = [...markdownLines]
    .reverse()
    .map((line) => normalizeScriptHeadingText(line).replace(/[：:]$/, ""))
    .find((line) => line.length > 0 && line.length <= 36 && /客户|话术|回复|共情|安抚|回应|沟通|情绪/.test(line));

  return heading || "客户话术";
}

function isNaturalAnswerSectionHeading(line: string) {
  const normalized = normalizeScriptHeadingText(line).replace(/[：:]$/, "");

  if (!normalized) {
    return false;
  }

  if (/^#{1,6}\s+/.test(line.trim())) {
    return true;
  }

  if (
    normalized.length <= 36
    && /(?:沟通要点|话术背后的策略|背后的策略|策略说明|使用建议|注意事项|下一步建议)/i.test(normalized)
  ) {
    return true;
  }

  return /^(核心结论|一句话思路|详细分析|使用前建议|使用建议|注意事项|下一步(?:动作|建议)?|补充说明|引用来源|总结|诊断|处理建议|行动建议)$/i.test(normalized);
}

function appendMarkdownSegment(segments: NaturalAnswerSegment[], text: string) {
  const normalized = text.trim();

  if (!normalized) {
    return;
  }

  const previous = segments[segments.length - 1];

  if (previous?.kind === "markdown") {
    previous.text = `${previous.text}\n\n${normalized}`.trim();
    return;
  }

  segments.push({ kind: "markdown", text: normalized });
}

function appendCustomerScriptSegment(segments: NaturalAnswerSegment[], title: string, text: string) {
  const normalized = text.trim();

  if (!normalized) {
    appendMarkdownSegment(segments, title);
    return;
  }

  segments.push({
    kind: "customerScript",
    title: title.trim() || "客户话术",
    text: normalized
  });
}

function splitMarkdownScriptHeadings(markdown: string) {
  const segments: NaturalAnswerSegment[] = [];
  const markdownLines: string[] = [];
  let activeScript: { title: string; lines: string[] } | null = null;

  function flushMarkdown() {
    appendMarkdownSegment(segments, markdownLines.join("\n"));
    markdownLines.length = 0;
  }

  function flushScript() {
    if (!activeScript) {
      return;
    }

    appendCustomerScriptSegment(segments, activeScript.title, activeScript.lines.join("\n"));
    activeScript = null;
  }

  for (const line of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const scriptHeading = parseCustomerScriptHeading(line);

    if (scriptHeading) {
      flushScript();
      flushMarkdown();
      activeScript = {
        title: scriptHeading.title,
        lines: scriptHeading.firstLine ? [scriptHeading.firstLine] : []
      };
      continue;
    }

    const quoteLine = extractCustomerQuoteLine(line);

    if (
      !activeScript
      && quoteLine
      && hasCustomerScriptContext(markdownLines)
      && isLikelyCustomerScriptQuote(quoteLine.text)
    ) {
      const title = inferCustomerScriptTitle(markdownLines);

      flushMarkdown();
      appendCustomerScriptSegment(segments, title, quoteLine.text);

      if (quoteLine.trailingText) {
        markdownLines.push(quoteLine.trailingText);
      }

      continue;
    }

    if (activeScript && isNaturalAnswerSectionHeading(line)) {
      flushScript();
      markdownLines.push(line);
      continue;
    }

    if (activeScript) {
      activeScript.lines.push(line);
      continue;
    }

    markdownLines.push(line);
  }

  flushScript();
  flushMarkdown();

  return segments;
}

const inlineCustomerScriptPattern =
  /(^|\n|[ \t。；;，,])(?:[✅☑️]\s*)?(?:[（(]\s*)?((?:标准(?:回应|回复)(?:要点|话术)?|标准回复(?:话术)?|客户(?:可复制)?话术|客户回复|对外话术|外发话术|回复文案|沟通文案|可直接(?:复制)?(?:发给|给)客户|复制给客户|直接复制(?:使用)?|您可以这样发给客户|可以这样发给客户)(?:[（(][^）)]{0,36}(?:可直接(?:复制)?(?:发给|给)客户|微信|私聊|发送|外发)[^）)]{0,36}[）)])?)(?:\s*[）)])?\s*[：:，,]\s*[“"]([\s\S]{8,1200}?)[”"]/g;

export function splitNaturalAnswerForCustomerScriptCards(text: string): NaturalAnswerSegment[] {
  const segments: NaturalAnswerSegment[] = [];
  let lastIndex = 0;
  inlineCustomerScriptPattern.lastIndex = 0;

  let match: RegExpExecArray | null = inlineCustomerScriptPattern.exec(text);

  while (match) {
    const boundary = match[1] ?? "";
    const index = match.index + boundary.length;

    splitMarkdownScriptHeadings(text.slice(lastIndex, index)).forEach((segment) => segments.push(segment));
    appendCustomerScriptSegment(segments, match[2] || "客户话术", match[3] || "");
    lastIndex = match.index + match[0].length;
    match = inlineCustomerScriptPattern.exec(text);
  }

  splitMarkdownScriptHeadings(text.slice(lastIndex)).forEach((segment) => segments.push(segment));

  return segments.length > 0 ? segments : [{ kind: "markdown", text }];
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

function CustomerScriptInlineCard({
  title,
  text,
  index
}: {
  title: string;
  text: string;
  index: number;
}) {
  return (
    <section className="not-prose my-3 rounded-2xl border border-emerald-100 bg-white px-4 py-3 shadow-sm shadow-emerald-950/5">
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-900">
          <MessageSquareText className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          <span>{title || `客户话术 ${index + 1}`}</span>
        </div>
        <CopyMiniButton text={text} label="复制话术" />
      </div>
      <div className="prose prose-slate max-w-none text-[15px] leading-7 prose-headings:mb-2 prose-headings:mt-3 prose-headings:text-[15px] prose-headings:font-semibold prose-p:my-2 prose-li:my-1">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents()}>
          {text}
        </ReactMarkdown>
      </div>
    </section>
  );
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
    () => getFinalNaturalMarkdownAnswerText(answerForDisplay, [rawAnswerText]),
    [answerForDisplay, rawAnswerText]
  );
  const naturalAnswerSegments = React.useMemo(
    () => naturalAnswerText ? splitNaturalAnswerForCustomerScriptCards(naturalAnswerText) : [],
    [naturalAnswerText]
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

          <div className="space-y-4 text-[15px] leading-7">
            {naturalAnswerSegments.map((segment, index) => (
              segment.kind === "customerScript" ? (
                <CustomerScriptInlineCard
                  key={`script-${index}`}
                  title={segment.title}
                  text={segment.text}
                  index={index}
                />
              ) : (
                <div
                  key={`markdown-${index}`}
                  className="prose prose-slate max-w-none prose-headings:mb-2 prose-headings:mt-4 prose-headings:text-[15px] prose-headings:font-semibold prose-headings:text-slate-950 prose-p:my-2 prose-li:my-1"
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents()}>
                    {segment.text}
                  </ReactMarkdown>
                </div>
              )
            ))}
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
