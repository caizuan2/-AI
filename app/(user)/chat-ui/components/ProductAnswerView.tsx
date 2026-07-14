"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Brain,
  Check,
  Copy,
  Loader2,
  MessageSquareText,
  Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";
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
  careerMentorMode?: boolean;
  className?: string;
}

type CustomerScriptVariant = "default" | "careerAi" | "careerKnowledge";

type NaturalAnswerSegment =
  | { kind: "markdown"; text: string }
  | { kind: "customerScript"; title: string; text: string; variant: CustomerScriptVariant };

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
    .replace(/^[-*+•·‣▪▫]\s+/, "")
    .replace(/^\d+[.、]\s*/, "")
    .replace(/^[一二三四五六七八九十]+[.、]\s*/, "")
    .replace(/^[\s💡📌✅☑️⭐🌟🔥👉➡️•·‣▪▫]+/, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitInlineCustomerScriptItems(line: string) {
  const itemPattern = /第[一二三四五六七八九十\d]+条(?:[（(][^）)]{1,60}[）)])?\s*[：:]/g;
  const matches: RegExpExecArray[] = [];
  let match = itemPattern.exec(line);

  while (match) {
    matches.push(match);
    match = itemPattern.exec(line);
  }

  if (matches.length <= 1) {
    return [line];
  }

  const parts: string[] = [];
  const firstIndex = matches[0].index ?? 0;

  if (firstIndex > 0) {
    parts.push(line.slice(0, firstIndex).trimEnd());
  }

  matches.forEach((match, index) => {
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? line.length;
    const part = line.slice(start, end).trim();

    if (part) {
      parts.push(part);
    }
  });

  return parts.filter((part) => part.length > 0);
}

function isCustomerScriptContextOnlyLine(line: string) {
  const normalized = normalizeScriptHeadingText(line).replace(/[：:]$/, "");

  return /^(?:参考|参考话术|参考场景|场景参考|适用场景|客户场景|场景说明|话术说明)(?:$|[：:（(、\s])/.test(normalized);
}

function isCustomerScriptAnalysisLine(line: string) {
  const normalized = normalizeScriptHeadingText(line).replace(/[：:]$/, "");

  return /^(?:核心作用|作用|核心技巧|技巧|核心策略|策略|沟通策略|使用技巧|关键点|关键提醒|为什么有效|为什么这样说|话术背后的策略|背后的策略|使用建议|注意事项|执行要点|原则|低压力推进的关键原则|思路|分析|方案(?:[A-ZＡ-Ｚ一二三四五六七八九十\d])?|目的|提醒(?:你|您)?的?(?:伙伴|同伴)?一句话)(?:$|[：:（(、\s])/.test(normalized);
}

function parseCustomerScriptHeading(line: string, strictHeading = false) {
  const normalized = normalizeScriptHeadingText(line);

  if (!normalized) {
    return null;
  }

  const labelPatterns = [
    /^(第[一二三四五六七八九十\d]+条(?:[（(][^）)]{1,60}[）)])?)\s*[：:]\s*(.*)$/i,
    /^(核心话术|客户核心话术|可直接(?:复制)?(?:发给|给)客户|复制给客户|客户(?:可复制)?话术|客户回复|标准(?:回应|回复)(?:要点|话术)?(?:[（(][^）)]{1,36}[）)])?|标准回复(?:话术)?|直接复制(?:使用)?|对外话术|外发话术|您可以这样发给客户|可以这样发给客户)\s*[：:]?\s*(.*)$/i,
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
  const isHeadingLike = normalized.length <= 36 && !/[。！？!?]/.test(normalized);

  if (hasScriptWord && hasScriptIntent && !isStrategyHeading && (!strictHeading || isHeadingLike)) {
    return {
      title: normalized.length <= 28 ? normalized : "客户话术",
      firstLine: ""
    };
  }

  return null;
}

function parseCustomerScriptContainerHeading(line: string) {
  const normalized = normalizeScriptHeadingText(line).replace(/[：:]$/, "");

  if (
    normalized === "客户话术"
    || /(?:完整话术|可直接(?:复制)?(?:发给|给)客户|直接复制(?:可用|使用)?|发给客户的.*话术)/.test(normalized)
  ) {
    return "客户话术";
  }

  return null;
}

function parseCareerMentorScriptSectionVariant(line: string): CustomerScriptVariant | null {
  const normalized = normalizeScriptHeadingText(line).replace(/[：:]$/, "");

  if (/^AI思考回复话术(?:$|[（(、\s])/.test(normalized)) {
    return "careerAi";
  }

  if (/^(?:可复制给客户|可直接复制给客户|客户可复制话术)(?:$|[（(、\s])/.test(normalized)) {
    return "careerKnowledge";
  }

  return null;
}

function parseCareerMentorAiScriptHeading(line: string) {
  const normalized = normalizeScriptHeadingText(line);
  const match = normalized.match(/^(AI(?:建议|思考)话术\s*(?:[一二三四五六七八九十\d]+)?(?:[（(][^）)]{1,24}[）)])?)\s*[：:]?\s*(.*)$/i);

  if (!match) {
    return null;
  }

  return {
    title: match[1].replace(/[：:]$/, "").trim() || "AI建议话术",
    firstLine: match[2]?.trim() ?? ""
  };
}

function extractCustomerQuoteLine(line: string): CustomerQuoteLine | null {
  const normalized = line
    .trim()
    .replace(/^>\s*/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+[.、]\s*/, "")
    .trim();
  const quoteMatch =
    normalized.match(/^[“"]([\s\S]{8,1200}?)[”"]\s*([\s\S]*)$/)
    ?? normalized.match(/^[^“"]{0,90}[：:]\s*[“"]([\s\S]{8,1200}?)[”"]\s*([\s\S]*)$/);

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

  return /客户|话术|回复|发给|复制|微信|私聊|跟.*说|这样说|这样跟|共情|接住|安抚|回应|沟通|参考|第[一二三四五六七八九十\d]+条|完整话术/.test(context);
}

function isLikelyCustomerScriptQuote(text: string) {
  const normalized = text.replace(/\s+/g, "");

  if (normalized.length < 16) {
    return false;
  }

  const hasDirectAddress = /姐|哥|兄弟|姐妹|宝|您好|你好|您|你/.test(normalized);
  const hasConversationTone = /理解|别急|不用担心|我帮你|我们|一起|可以|先|调整|回复|感觉|情况|问题|身体|方案|合作|资源|对接|门槛|细节|方便|聊|看看|产品|客户/.test(normalized);

  return hasDirectAddress && hasConversationTone;
}

function stripCustomerScriptListPrefix(line: string) {
  return line
    .trim()
    .replace(/^>\s*/, "")
    .replace(/^[-*+•·‣▪▫]\s+/, "")
    .replace(/^\d+[.、]\s*/, "")
    .replace(/^[一二三四五六七八九十]+[.、]\s*/, "")
    .trim();
}

function trimCustomerScriptMetaSuffix(text: string) {
  return text
    .replace(/\s*(?:——|--|—)\s*(?:目的|目的是|核心作用|核心技巧|思路|策略|用意|提醒|关键点)[\s\S]*$/, "")
    .replace(/\s*(?:目的|目的是|核心作用|核心技巧|思路|策略|用意|提醒|关键点)[：:][\s\S]*$/, "")
    .trim();
}

function isUsableCustomerScriptText(text: string) {
  const normalized = text.replace(/\s+/g, "");

  return normalized.length >= 8
    && !/^(?:核心作用|核心技巧|思路|策略|目的|目的是|方案[A-ZＡ-Ｚ一二三四五六七八九十\d]|适合|阶段|提醒你的伙伴|提醒您?的伙伴)[：:]/.test(normalized)
    && !/(?:价格辩论|细节商讨)/.test(normalized);
}

function extractLabeledCustomerScriptLine(line: string) {
  const normalized = stripCustomerScriptListPrefix(line);
  const match = normalized.match(/^(?:模板|话术模板|参考模板|示例话术)\s*[：:]\s*([\s\S]+)$/);

  if (!match) {
    return null;
  }

  const text = trimCustomerScriptMetaSuffix(match[1]);
  return isUsableCustomerScriptText(text) ? text : null;
}

function extractDirectedCustomerScriptQuotes(line: string) {
  const normalized = stripCustomerScriptListPrefix(line);
  const scripts: string[] = [];
  const directivePattern =
    /(?:你要回|您要回|你可以回|您可以回|可以回|直接回|回复|回他|回她|回客户|配一句|发一句|发一段|补一句|加一句|这样(?:说|回复)|可以这样(?:说|回复)|建议这样(?:说|回复))\s*[：:，,]?\s*[“"]([\s\S]{8,1200}?)[”"]/g;
  let match = directivePattern.exec(normalized);

  while (match) {
    const text = trimCustomerScriptMetaSuffix(match[1]);

    if (isUsableCustomerScriptText(text)) {
      scripts.push(text);
    }

    match = directivePattern.exec(normalized);
  }

  return scripts;
}

function parseCustomerScriptLeadIn(line: string) {
  const normalized = normalizeScriptHeadingText(line);

  if (!normalized || /(?:为什么有效|背后|策略|要点|下一步建议|使用建议|注意事项)/.test(normalized)) {
    return null;
  }

  if (
    /(?:可以|可|建议|你可以|您可以|直接|就)(?:这样|这么|按这个|照这个).{0,16}(?:说|回复|发|讲|开口|开始对话|跟客户|给他|给她|给客户)/.test(normalized)
    || /(?:可以这样说|你可以这样说|您可以这样说|可以这样开始对话|可以直接复制使用)/.test(normalized)
  ) {
    return "客户话术";
  }

  return null;
}

function isLikelyCustomerScriptParagraph(line: string) {
  const normalized = normalizeScriptHeadingText(line);

  if (
    normalized.length < 24
    || /^(?:场景|方案|第[一二三四五六七八九十\d]+步|[一二三四五六七八九十]+、|这个话术为什么有效|为什么|关键点|你的下一步|最后给你)/.test(normalized)
  ) {
    return false;
  }

  const hasDirectAddress = /姐|哥|兄弟|姐妹|宝|朋友|您好|你好|您|你/.test(normalized);
  const hasConversationTone = /理解|别急|不用|不要|放心|我帮|我们|一起|可以|先|调整|感觉|情况|试过|没用|担心|反弹|坚持|产品|方案/.test(normalized);

  return hasDirectAddress && hasConversationTone;
}

function inferCustomerScriptTitle(markdownLines: string[]) {
  const heading = [...markdownLines]
    .reverse()
    .map((line) => normalizeScriptHeadingText(line).replace(/[：:]$/, ""))
    .find((line) => line.length > 0 && line.length <= 36 && /客户|话术|回复|共情|安抚|回应|沟通|情绪/.test(line));

  return heading || "客户话术";
}

function isNaturalAnswerSectionHeading(line: string, activeScriptTitle = "") {
  const normalized = normalizeScriptHeadingText(line).replace(/[：:]$/, "");

  if (!normalized) {
    return false;
  }

  if (isCustomerScriptAnalysisLine(line)) {
    return true;
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

  if (/^(?:这个话术为什么有效|这段话术为什么有效|为什么(?:这样说|有效)?|关键点|核心策略|你的下一步行动|下一步行动|最后给你的建议|最后建议)(?:$|[：:、\s])/.test(normalized)) {
    return true;
  }

  if (
    /核心话术|客户话术|可以这样说/.test(activeScriptTitle)
    && /^(?:场景|方案)[一二三四五六七八九十\d]+(?:$|[：:、\s])/.test(normalized)
  ) {
    return true;
  }

  return /^(核心结论|一句话思路|详细分析|使用前建议|使用建议|注意事项|下一步(?:动作|建议)?|补充说明|引用来源|总结|诊断|处理建议|行动建议)$/i.test(normalized);
}

function cleanCustomerScriptText(text: string) {
  const lines: string[] = [];

  for (const rawLine of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trim();

    if (!line) {
      if (lines.length > 0 && lines[lines.length - 1] !== "") {
        lines.push("");
      }

      continue;
    }

    const directedQuotes = extractDirectedCustomerScriptQuotes(line);

    if (directedQuotes.length > 0) {
      lines.push(...directedQuotes);
      continue;
    }

    const quoteLine = extractCustomerQuoteLine(line);

    if (quoteLine && isLikelyCustomerScriptQuote(quoteLine.text)) {
      lines.push(quoteLine.text);
      continue;
    }

    const labeledScriptLine = extractLabeledCustomerScriptLine(line);

    if (labeledScriptLine) {
      lines.push(labeledScriptLine);
      continue;
    }

    if (isCustomerScriptContextOnlyLine(line) || isCustomerScriptAnalysisLine(line)) {
      continue;
    }

    const cleaned = trimCustomerScriptMetaSuffix(stripCustomerScriptListPrefix(line));

    if (isUsableCustomerScriptText(cleaned)) {
      lines.push(cleaned);
    }
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
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

function appendCustomerScriptSegment(
  segments: NaturalAnswerSegment[],
  title: string,
  text: string,
  variant: CustomerScriptVariant = "default"
) {
  const normalized = cleanCustomerScriptText(text);

  if (!normalized) {
    appendMarkdownSegment(segments, title);
    return;
  }

  segments.push({
    kind: "customerScript",
    title: title.trim() || "客户话术",
    text: normalized,
    variant
  });
}

function normalizeCustomerScriptDedupeText(text: string) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s#>*_`~[\]{}()（）【】《》“”‘’"'：:，,。.!！?？；;、\\/\-]+/g, "");
}

function hasNormalizedCustomerScriptOverlap(first: string, second: string) {
  const firstKey = normalizeCustomerScriptDedupeText(first);
  const secondKey = normalizeCustomerScriptDedupeText(second);

  if (firstKey.length < 8 || secondKey.length < 8) {
    return false;
  }

  return firstKey === secondKey || firstKey.includes(secondKey) || secondKey.includes(firstKey);
}

function splitMarkdownScriptHeadings(
  markdown: string,
  options: { strictHeading?: boolean; careerMentorMode?: boolean } = {}
) {
  const segments: NaturalAnswerSegment[] = [];
  const markdownLines: string[] = [];
  const strictHeading = options.strictHeading === true;
  let activeVariant: CustomerScriptVariant = options.careerMentorMode ? "careerAi" : "default";
  let activeScript: { title: string; lines: string[]; variant: CustomerScriptVariant } | null = null;
  let pendingScriptTitle: string | null = null;

  function flushMarkdown() {
    appendMarkdownSegment(segments, markdownLines.join("\n"));
    markdownLines.length = 0;
  }

  function flushScript() {
    if (!activeScript) {
      return;
    }

    appendCustomerScriptSegment(
      segments,
      activeScript.title,
      activeScript.lines.join("\n"),
      activeScript.variant
    );
    activeScript = null;
  }

  const lines = markdown
    .replace(/\r\n/g, "\n")
    .split("\n")
    .flatMap((line) => splitInlineCustomerScriptItems(line));

  for (const line of lines) {
    const careerSectionVariant = options.careerMentorMode
      ? parseCareerMentorScriptSectionVariant(line)
      : null;

    if (careerSectionVariant) {
      flushScript();
      markdownLines.push(line);
      pendingScriptTitle = null;
      activeVariant = careerSectionVariant;
      continue;
    }

    const containerHeading = parseCustomerScriptContainerHeading(line);

    if (containerHeading) {
      flushScript();
      markdownLines.push(line);
      pendingScriptTitle = containerHeading;
      continue;
    }

    const leadInTitle = parseCustomerScriptLeadIn(line);

    if (!activeScript && leadInTitle) {
      markdownLines.push(line);
      pendingScriptTitle = leadInTitle;
      continue;
    }

    const scriptHeading = options.careerMentorMode && activeVariant === "careerAi"
      ? parseCareerMentorAiScriptHeading(line) ?? parseCustomerScriptHeading(line, strictHeading)
      : parseCustomerScriptHeading(line, strictHeading);

    if (scriptHeading) {
      flushScript();
      flushMarkdown();
      pendingScriptTitle = null;
      activeScript = {
        title: scriptHeading.title,
        lines: scriptHeading.firstLine ? [scriptHeading.firstLine] : [],
        variant: activeVariant
      };
      continue;
    }

    const directedQuoteScripts = extractDirectedCustomerScriptQuotes(line);

    if (!activeScript && pendingScriptTitle && directedQuoteScripts.length > 0) {
      const scriptTitle = pendingScriptTitle;

      markdownLines.push(line);
      flushMarkdown();
      directedQuoteScripts.forEach((script) => appendCustomerScriptSegment(
        segments,
        scriptTitle,
        script,
        activeVariant
      ));
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
      appendCustomerScriptSegment(segments, title, quoteLine.text, activeVariant);
      pendingScriptTitle = null;

      if (quoteLine.trailingText) {
        markdownLines.push(quoteLine.trailingText);
      }

      continue;
    }

    if (!activeScript && pendingScriptTitle && isLikelyCustomerScriptParagraph(line)) {
      flushMarkdown();
      activeScript = {
        title: pendingScriptTitle,
        lines: [line],
        variant: activeVariant
      };
      pendingScriptTitle = null;
      continue;
    }

    if (activeScript && directedQuoteScripts.length > 0) {
      const scriptTitle = activeScript.title;

      flushScript();
      markdownLines.push(line);
      flushMarkdown();
      directedQuoteScripts.forEach((script) => appendCustomerScriptSegment(
        segments,
        scriptTitle,
        script,
        activeVariant
      ));
      continue;
    }

    const activeQuoteLine = activeScript ? extractCustomerQuoteLine(line) : null;

    if (activeScript && activeQuoteLine && isLikelyCustomerScriptQuote(activeQuoteLine.text)) {
      activeScript.lines.push(activeQuoteLine.text);

      if (activeQuoteLine.trailingText) {
        flushScript();
        markdownLines.push(activeQuoteLine.trailingText);
      }

      continue;
    }

    if (activeScript && isCustomerScriptContextOnlyLine(line)) {
      if (activeScript.lines.length > 0) {
        flushScript();
      } else {
        activeScript = null;
      }

      markdownLines.push(line);
      pendingScriptTitle = "客户话术";
      continue;
    }

    if (activeScript && isNaturalAnswerSectionHeading(line, activeScript.title)) {
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

export function splitNaturalAnswerForCustomerScriptCards(
  text: string,
  options: { careerMentorMode?: boolean } = {}
): NaturalAnswerSegment[] {
  const segments: NaturalAnswerSegment[] = [];
  let lastIndex = 0;
  inlineCustomerScriptPattern.lastIndex = 0;

  let match: RegExpExecArray | null = inlineCustomerScriptPattern.exec(text);

  while (match) {
    const boundary = match[1] ?? "";
    const index = match.index + boundary.length;

    splitMarkdownScriptHeadings(
      text.slice(lastIndex, index),
      {
        strictHeading: options.careerMentorMode === true,
        careerMentorMode: options.careerMentorMode === true
      }
    ).forEach((segment) => segments.push(segment));
    appendCustomerScriptSegment(
      segments,
      match[2] || "客户话术",
      match[3] || "",
      options.careerMentorMode ? "careerAi" : "default"
    );
    lastIndex = match.index + match[0].length;
    match = inlineCustomerScriptPattern.exec(text);
  }

  splitMarkdownScriptHeadings(
    text.slice(lastIndex),
    {
      strictHeading: options.careerMentorMode === true,
      careerMentorMode: options.careerMentorMode === true
    }
  ).forEach((segment) => segments.push(segment));

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
  index,
  variant = "default"
}: {
  title: string;
  text: string;
  index: number;
  variant?: CustomerScriptVariant;
}) {
  const careerAi = variant === "careerAi";
  const careerKnowledge = variant === "careerKnowledge";

  return (
    <section
      data-script-origin={careerAi ? "career-ai" : careerKnowledge ? "career-knowledge" : "default"}
      className={cn(
        "not-prose my-3 rounded-2xl border px-4 py-3 shadow-sm",
        careerAi
          ? "border-teal-200 bg-white shadow-teal-950/5"
          : careerKnowledge
            ? "border-emerald-200 bg-white shadow-emerald-950/5"
            : "border-emerald-100 bg-white shadow-emerald-950/5"
      )}
    >
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className={cn(
          "inline-flex items-center gap-2 text-sm font-semibold",
          careerAi ? "text-teal-950" : "text-emerald-900"
        )}>
          <MessageSquareText
            className={cn("h-4 w-4", careerAi ? "text-teal-600" : "text-emerald-600")}
            aria-hidden="true"
          />
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
  careerMentorMode = false,
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
    () => naturalAnswerText
      ? splitNaturalAnswerForCustomerScriptCards(naturalAnswerText, { careerMentorMode })
      : [],
    [careerMentorMode, naturalAnswerText]
  );
  const structuredCustomerReply = answerForDisplay?.customerReply?.trim() ?? "";
  const naturalKnowledgeScripts = naturalAnswerSegments
    .filter((segment): segment is Extract<NaturalAnswerSegment, { kind: "customerScript" }> => (
      segment.kind === "customerScript"
      && (!careerMentorMode || segment.variant === "careerKnowledge")
    ))
    .map((segment) => segment.text);
  const shouldAppendStructuredCustomerReply = Boolean(
    careerMentorMode
    && naturalAnswerText
    && structuredCustomerReply
    && naturalKnowledgeScripts.length === 0
    && !hasNormalizedCustomerScriptOverlap(naturalAnswerText, structuredCustomerReply)
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
                  variant={segment.variant}
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
            {shouldAppendStructuredCustomerReply ? (
              <CustomerScriptInlineCard
                title="可直接复制给客户"
                text={structuredCustomerReply}
                index={naturalAnswerSegments.length}
                variant="careerKnowledge"
              />
            ) : null}
          </div>
        </section>
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
    </article>
  );
}
