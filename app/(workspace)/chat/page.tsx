"use client";

import { Component, FormEvent, Suspense, useMemo, useState, type ErrorInfo, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bot,
  CheckCircle2,
  Copy,
  Loader2,
  MessageCircleQuestion,
  SendHorizontal,
  ThumbsDown,
  ThumbsUp,
  TriangleAlert,
  UserRound
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { TopSearchBar } from "@/components/product/top-search-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { unwrapApiResponse } from "@/lib/api/client";
import {
  extractAnswerFromResponse,
  extractAnswerFromSseText,
  normalizeAnswerMarkdown,
  normalizeCodeLanguage,
  NUMBERED_HEADING_PATTERN,
  NUMBERED_TITLE_WORD_PATTERN,
  parseAnswerBlocks,
  SCHEME_HEADING_PATTERN
} from "@/lib/ai/answer-render-utils";
import { copyText as writeClipboardText, extractCustomerScript, markdownToPlainTextForCopy } from "@/lib/ai/rag-copy";
import { suggestedQuestions } from "@/lib/mock/product-ui";
import { cn } from "@/lib/utils";

type ChatSource = {
  citationIndex: number;
  chunkId: string;
  knowledgeItemId: string;
  title: string;
  summary: string;
  chunkText: string;
  category: string;
  sourceType: string;
  sourceTitle: string | null;
  sourceUrl: string | null;
  createdAt: string;
  similarity?: number;
  score?: number;
};

type ChatRetrievalInfo = {
  mode: string;
  answerMode: "none" | "partial" | "full";
  confidence: number;
  intent: string;
  totalCandidates: number;
  filteredCandidates: number;
  returnedSourceCount: number;
  usedSourceCount: number;
  queries: string[];
  suggestedKnowledgeTypes: string[];
  relaxedRetrievalUsed: boolean;
  keywordFallbackUsed: boolean;
};

type ChatApiResponse = {
  answer: string;
  finalAnswer?: string;
  customerAnswer?: string;
  customerAnswerParagraphs?: CustomerAnswerParagraph[];
  rawAnswer?: string;
  sources: ChatSource[];
  retrievalMessage: string | null;
  retrieval?: ChatRetrievalInfo;
  providerUsed?: string;
  modelUsed?: string;
  fallbackUsed?: boolean;
  cached?: boolean;
  latencyMs?: number;
  requestId?: string;
};

type ChatMessageContent = string | {
  answer?: string;
  content?: string;
  customerAnswer?: string;
  customerAnswerParagraphs?: CustomerAnswerParagraph[];
  finalAnswer?: string;
  rawAnswer?: string;
  sources?: ChatSource[];
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: ChatMessageContent;
  createdAt: string;
  question?: string;
  answer?: string;
  finalAnswer?: string;
  customerAnswer?: string;
  customerAnswerParagraphs?: CustomerAnswerParagraph[];
  rawAnswer?: string;
  sources?: ChatSource[];
  providerUsed?: string;
  modelUsed?: string;
  fallbackUsed?: boolean;
  cached?: boolean;
  latencyMs?: number;
  requestId?: string;
  retrieval?: ChatRetrievalInfo;
  pending?: boolean;
  status?: string;
};
type FeedbackChoice = "helpful" | "not_helpful";
type AnswerFeedbackState = {
  submitted?: FeedbackChoice;
  submitting?: boolean;
  reasonOpen?: boolean;
  reason?: string;
  error?: string;
};
type CopyState = "idle" | "copied" | "failed";

type AnswerParts = {
  finalAnswer: string;
  customerAnswer: string | null;
  customerAnswerParagraphs: CustomerAnswerParagraph[];
  rawAnswer: string;
  sources: ChatSource[];
};

type CustomerAnswerParagraph = {
  id: string;
  label?: string;
  text: string;
};

const DEBUG_MARKDOWN_ANSWER = [
  "接下来按这个顺序做：",
  "",
  "1. 先执行重建索引",
  "",
  "在本地 PowerShell 执行：",
  "",
  "```PowerShell",
  "pnpm rag:reindex",
  "```",
  "",
  "等它跑完。",
  "",
  "2. 去问答页测试新文档",
  "",
  "问这些问题：",
  "",
  "```text",
  "脂达人控车问答管理画册了什么？",
  "```",
  "",
  "```text",
  "脂达人谷蔬多肽适合哪些人？",
  "```",
  "",
  "3. 本地通过后再部署",
  "",
  "执行：",
  "",
  "```PowerShell",
  "git status",
  "git add .",
  "git commit -m \"优化代码块和 Markdown 说明文字渲染\"",
  "git push",
  "```",
  "",
  "主要作用",
  "",
  "•",
  "更重要的是，它能够为您补充构建皮肤弹性的核心物质——弹性纤维与胶原蛋白，让细胞更新换代的过程更加顺畅、充满活力。",
  "",
  "•",
  "正是这种由内而外的综合调理，才能让您自然而然地收获更红润、更紧致、更清透的健康光彩。",
  "",
  "注意",
  "",
  "•",
  "对于年长或体质偏弱的朋友，建议每日食用至5袋，为身体提供均衡的营养基础。",
  "",
  "•",
  "不能代替药物或正规医疗方案。"
].join("\n");

const DEBUG_CUSTOMER_ANSWER = [
  "这是开发环境 Markdown 渲染测试，用于确认小标题、列表和代码块样式已生效。",
  "",
  "请在正式问答中继续检查客户答案模块，确保每段话术简洁、自然、方便复制。",
  "",
  "每段右侧应有「复制本段」按钮，顶部仍保留「复制客户答案」按钮。"
].join("\n");

const DEBUG_MARKDOWN_MESSAGE: ChatMessage = {
  id: "debug-markdown-ai-message",
  role: "assistant",
  content: DEBUG_MARKDOWN_ANSWER,
  finalAnswer: DEBUG_MARKDOWN_ANSWER,
  rawAnswer: DEBUG_MARKDOWN_ANSWER,
  customerAnswer: DEBUG_CUSTOMER_ANSWER,
  createdAt: "Debug"
};

function getNowLabel() {
  return new Date().toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function stripMarkdownForSummary(content: unknown, maxLength = 80) {
  const summary = markdownToPlainTextForCopy(content)
    .replace(/\s+/g, " ")
    .trim();

  return summary.length > maxLength ? `${summary.slice(0, maxLength)}...` : summary;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readPayloadPath(payload: unknown, path: string[]) {
  return path.reduce<unknown>((current, key) => {
    if (isRecord(current) && key in current) {
      return current[key];
    }

    return undefined;
  }, payload);
}

async function readResponseText(response: Response) {
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("text/event-stream") || !response.body?.getReader) {
    return response.text();
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      text += decoder.decode(value, { stream: true });

      if (text.includes("data: [DONE]")) {
        await reader.cancel().catch(() => undefined);
        break;
      }
    }

    text += decoder.decode();
    return text;
  } catch (error) {
    console.error("chat.read_stream_failed", error);
    return text;
  }
}

function parseJsonPayload(text: string) {
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function extractErrorMessageFromPayload(payload: unknown, response: Response, fallback: string) {
  const code = readPayloadPath(payload, ["error", "code"]) ?? readPayloadPath(payload, ["code"]);
  const message = readPayloadPath(payload, ["error", "message"]) ?? readPayloadPath(payload, ["message"]);
  const requestId = readPayloadPath(payload, ["error", "requestId"]) ?? readPayloadPath(payload, ["requestId"]) ?? response.headers.get("x-request-id");
  const stage = readPayloadPath(payload, ["error", "stage"]) ?? readPayloadPath(payload, ["stage"]);
  const suggestion = readPayloadPath(payload, ["error", "suggestion"]) ?? readPayloadPath(payload, ["suggestion"]);
  const lines = [`请求处理失败：${typeof message === "string" && message.trim() ? message.trim() : fallback}`];

  if (typeof stage === "string" && stage.trim()) {
    lines.push(`失败阶段：${stage.trim()}`);
  }

  if (typeof suggestion === "string" && suggestion.trim()) {
    lines.push(`建议操作：${suggestion.trim()}`);
  }

  if (typeof code === "string" && code.trim()) {
    lines.push(`错误码：${code.trim()}`);
  } else {
    lines.push(`HTTP 状态：${response.status}`);
  }

  if (typeof requestId === "string" && requestId.trim()) {
    lines.push(`请求ID：${requestId.trim()}`);
  }

  return lines.join("\n");
}

function getChatPayload(payload: unknown) {
  if (isRecord(payload) && payload.success === true && isRecord(payload.data)) {
    return payload.data;
  }

  if (isRecord(payload) && isRecord(payload.result)) {
    return payload.result;
  }

  return payload;
}

function toOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function extractArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function readStringFromRecord(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];

  return typeof value === "string" && value.trim() ? value.trim() : "";
}

const CUSTOMER_PARAGRAPH_LABELS = ["核心说明", "主要价值", "使用建议", "温馨提示", "补充提醒", "沟通边界"];
const CUSTOMER_SECTION_TITLE_PATTERN = /^(?:#{1,6}\s*)?(?:\*\*)?(?:主要作用|注意|核心内容|需要谨慎确认的情况|适合人群|使用提醒|注意事项|沟通重点|可以发给客户这样说|可以这样回复客户|客户话术|可直接复制给客户)[：:]?(?:\*\*)?$/;
const CUSTOMER_DEBUG_PATTERN = /根据知识库|AI认为|作为\s*AI|综上所述|引用来源|Provider|Model|fallback|chunk|score|source|sources|检索|相似度/i;

function countCustomerChineseChars(value: string) {
  return (value.match(/[\u3400-\u9fff]/g) ?? []).length;
}

function cleanCustomerAnswerText(text?: unknown) {
  const withoutCode = String(text ?? "").replace(/```[\s\S]*?```/g, "");

  return markdownToPlainTextForCopy(withoutCode)
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line
      .trim()
      .replace(/^>\s*/, "")
      .replace(/^[-*+•]\s+/, "")
      .replace(/^\d+[.)、）]\s+/, "")
      .replace(/^#{1,6}\s+/, "")
      .replace(/^\*\*(.+?)\*\*$/, "$1")
      .replace(/^[「"]?(?:段落\s*\d+|第\s*[一二三四五六]\s*段)[」"]?\s*[：:]\s*/, "")
      .trim())
    .filter(Boolean)
    .filter((line) => !CUSTOMER_SECTION_TITLE_PATTERN.test(line))
    .filter((line) => !CUSTOMER_DEBUG_PATTERN.test(line))
    .join("\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripCustomerParagraphLabel(text: string) {
  const trimmed = text.trim();
  const match = /^(核心说明|主要价值|使用建议|温馨提示|补充提醒|沟通边界|注意事项|主要作用|适合场景)\s*[：:]\s*(.+)$/.exec(trimmed);

  if (!match?.[2]) {
    return { text: trimmed };
  }

  return {
    label: match[1],
    text: match[2].trim()
  };
}

function isCustomerParagraphWithinLimit(text: string) {
  return countCustomerChineseChars(text) <= 100 && Array.from(text).length <= 130;
}

function compactCustomerText(text: string) {
  return text
    .replace(/\s+/g, " ")
    .replace(/^[，,、；;：:。！？!?]+/, "")
    .replace(/[，,、；;：:]+$/, "")
    .trim();
}

function splitCustomerByPattern(text: string, pattern: RegExp) {
  return text.match(pattern)?.map(compactCustomerText).filter(Boolean) ?? [compactCustomerText(text)].filter(Boolean);
}

function packCustomerParts(parts: string[]) {
  const packed: string[] = [];
  let current = "";

  for (const part of parts) {
    const next = compactCustomerText(current ? `${current}${part}` : part);

    if (!current || isCustomerParagraphWithinLimit(next)) {
      current = next;
      continue;
    }

    packed.push(current);
    current = part;
  }

  if (current) {
    packed.push(compactCustomerText(current));
  }

  return packed.filter(Boolean);
}

function hardSplitCustomerText(text: string) {
  const segments: string[] = [];
  let current = "";
  let chineseCount = 0;

  for (const char of Array.from(text)) {
    const nextChineseCount = chineseCount + (/[\u3400-\u9fff]/.test(char) ? 1 : 0);
    const nextText = `${current}${char}`;

    if (current && (nextChineseCount > 100 || Array.from(nextText).length > 130)) {
      segments.push(compactCustomerText(current));
      current = char;
      chineseCount = /[\u3400-\u9fff]/.test(char) ? 1 : 0;
      continue;
    }

    current = nextText;
    chineseCount = nextChineseCount;
  }

  if (current) {
    segments.push(compactCustomerText(current));
  }

  return segments.filter(Boolean);
}

function splitCustomerParagraphText(text: string) {
  const normalized = compactCustomerText(text);

  if (!normalized) {
    return [];
  }

  if (isCustomerParagraphWithinLimit(normalized)) {
    return [normalized];
  }

  const sentenceParts = splitCustomerByPattern(normalized, /[^。！？!?；;]+[。！？!?；;]?/g);
  const sentencePacked = packCustomerParts(sentenceParts);
  const commaSplit = sentencePacked.flatMap((part) => (
    isCustomerParagraphWithinLimit(part)
      ? [part]
      : packCustomerParts(splitCustomerByPattern(part, /[^，,、]+[，,、]?/g))
  ));

  return commaSplit.flatMap((part) => (
    isCustomerParagraphWithinLimit(part) ? [part] : hardSplitCustomerText(part)
  ));
}

function extractCustomerParagraphCandidates(text: string) {
  return cleanCustomerAnswerText(text)
    .split(/\n+/)
    .map((line) => stripCustomerParagraphLabel(line))
    .map((item) => ({
      label: item.label,
      text: compactCustomerText(item.text)
    }))
    .filter((item) => item.text && !CUSTOMER_SECTION_TITLE_PATTERN.test(item.text));
}

function generateCustomerAnswerPreview(answer: string) {
  const candidates = extractCustomerParagraphCandidates(answer)
    .map((item) => item.text)
    .filter((text) => !/[？?]$/.test(text))
    .filter((text) => countCustomerChineseChars(text) >= 8);

  return candidates.slice(0, 4).join("\n\n") || cleanCustomerAnswerText(answer).slice(0, 260);
}

function dedupeCustomerParagraphs(paragraphs: CustomerAnswerParagraph[]) {
  const seen = new Set<string>();
  const result: CustomerAnswerParagraph[] = [];

  for (const paragraph of paragraphs) {
    const fingerprint = paragraph.text.replace(/\s+/g, "");

    if (!fingerprint || seen.has(fingerprint)) {
      continue;
    }

    seen.add(fingerprint);
    result.push(paragraph);
  }

  return result;
}

function assignCustomerParagraphLabels(texts: Array<{ label?: string; text: string }>) {
  return texts.map((item, index) => {
    const fallbackLabel = CUSTOMER_PARAGRAPH_LABELS[Math.min(index, CUSTOMER_PARAGRAPH_LABELS.length - 1)];

    return {
      id: `p${index + 1}`,
      label: item.label || fallbackLabel,
      text: item.text
    };
  });
}

function generateCustomerAnswerParagraphs(customerAnswer: string, finalAnswer = ""): CustomerAnswerParagraph[] {
  const source = normalizeCustomerAnswer(customerAnswer) || generateCustomerAnswerPreview(finalAnswer);
  let candidates = extractCustomerParagraphCandidates(source);

  if (candidates.length === 0 && finalAnswer) {
    candidates = extractCustomerParagraphCandidates(generateCustomerAnswerPreview(finalAnswer));
  }

  const paragraphTexts = candidates.flatMap((candidate) => (
    splitCustomerParagraphText(candidate.text).map((text, splitIndex) => ({
      label: splitIndex === 0 ? candidate.label : undefined,
      text
    }))
  ));

  return dedupeCustomerParagraphs(assignCustomerParagraphLabels(paragraphTexts)).slice(0, 6);
}

function normalizeCustomerAnswerParagraphs(value: unknown): CustomerAnswerParagraph[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const items = value.flatMap((item) => {
    if (typeof item === "string") {
      return splitCustomerParagraphText(cleanCustomerAnswerText(item)).map((text) => ({ text }));
    }

    if (!isRecord(item)) {
      return [];
    }

    const text = cleanCustomerAnswerText(item.text ?? item.content ?? item.answer);
    const label = toOptionalString(item.label ?? item.title);

    return splitCustomerParagraphText(text).map((paragraphText, index) => ({
      label: index === 0 ? label : undefined,
      text: paragraphText
    }));
  });

  return dedupeCustomerParagraphs(assignCustomerParagraphLabels(items)).slice(0, 6);
}

function getMessageText(message: Pick<ChatMessage, "content">) {
  if (typeof message.content === "string") {
    return message.content;
  }

  const contentObject = isRecord(message.content) ? message.content : null;

  return readStringFromRecord(contentObject, "content") ||
    readStringFromRecord(contentObject, "answer") ||
    readStringFromRecord(contentObject, "finalAnswer") ||
    readStringFromRecord(contentObject, "rawAnswer");
}

function normalizeAnswerParts(message: Partial<ChatMessage>): AnswerParts {
  const contentObject = isRecord(message.content) ? message.content : null;
  const contentText = typeof message.content === "string" ? message.content : "";
  const explicitFinalAnswer = toOptionalString(message.finalAnswer) ||
    readStringFromRecord(contentObject, "finalAnswer");
  const explicitAnswer = toOptionalString(message.answer) ||
    readStringFromRecord(contentObject, "answer");
  const nestedContent = readStringFromRecord(contentObject, "content");
  const finalAnswer = explicitFinalAnswer || explicitAnswer || nestedContent || contentText;
  const rawAnswer = toOptionalString(message.rawAnswer) ||
    readStringFromRecord(contentObject, "rawAnswer") ||
    explicitAnswer ||
    finalAnswer;
  const explicitCustomerAnswer = toOptionalString(message.customerAnswer) ||
    readStringFromRecord(contentObject, "customerAnswer");
  const explicitCustomerAnswerParagraphs = normalizeCustomerAnswerParagraphs(
    message.customerAnswerParagraphs ?? contentObject?.customerAnswerParagraphs
  );
  const baseCustomerAnswer = explicitCustomerAnswer ||
    safeExtractCustomerScript(rawAnswer || finalAnswer) ||
    generateCustomerAnswerPreview(finalAnswer);
  const customerAnswerParagraphs = explicitCustomerAnswerParagraphs.length > 0
    ? explicitCustomerAnswerParagraphs
    : generateCustomerAnswerParagraphs(baseCustomerAnswer, finalAnswer);
  const extractedCustomerAnswer = customerAnswerParagraphs.map((paragraph) => paragraph.text).join("\n\n");
  const sources = message.sources ??
    extractArray<ChatSource>(contentObject?.sources);

  return {
    finalAnswer,
    customerAnswer: extractedCustomerAnswer || null,
    customerAnswerParagraphs,
    rawAnswer,
    sources
  };
}

function getFinalAnswer(message: Partial<ChatMessage>) {
  return normalizeAnswerParts(message).finalAnswer;
}

function getCustomerAnswer(message: Partial<ChatMessage>) {
  return normalizeAnswerParts(message).customerAnswer;
}

function getCustomerAnswerParagraphs(message: Partial<ChatMessage>) {
  return normalizeAnswerParts(message).customerAnswerParagraphs;
}

async function readChatResponse(response: Response): Promise<ChatApiResponse> {
  const contentType = response.headers.get("content-type") || "";
  const responseText = await readResponseText(response);
  const eventStreamAnswer = contentType.includes("text/event-stream") ? extractAnswerFromSseText(responseText) : "";
  const parsedPayload = eventStreamAnswer ? { answer: eventStreamAnswer } : parseJsonPayload(responseText);

  if (!response.ok) {
    console.error("chat.request_failed", {
      status: response.status,
      contentType,
      body: parsedPayload ?? responseText.slice(0, 1000)
    });

    throw new Error(extractErrorMessageFromPayload(parsedPayload, response, "生成回答失败。"));
  }

  if (isRecord(parsedPayload) && (parsedPayload.ok === false || parsedPayload.success === false)) {
    console.error("chat.api_failed", parsedPayload);
    throw new Error(extractErrorMessageFromPayload(parsedPayload, response, "生成回答失败。"));
  }

  const payload = getChatPayload(parsedPayload);
  const answer = extractAnswerFromResponse(payload) ||
    extractAnswerFromResponse(parsedPayload) ||
    (contentType.includes("text/plain") ? responseText.trim() : "");
  const finalAnswer = toOptionalString(isRecord(payload) ? payload.finalAnswer : undefined) ||
    toOptionalString(isRecord(payload) ? payload.answer : undefined) ||
    answer;
  const customerAnswer = toOptionalString(isRecord(payload) ? payload.customerAnswer : undefined);
  const customerAnswerParagraphs = normalizeCustomerAnswerParagraphs(isRecord(payload) ? payload.customerAnswerParagraphs : undefined);
  const rawAnswer = toOptionalString(isRecord(payload) ? payload.rawAnswer : undefined) || answer;

  if (!answer) {
    console.error("chat.answer_missing", {
      contentType,
      payload: parsedPayload,
      responseText: responseText.slice(0, 1000)
    });
    throw new Error("生成回答失败：接口已返回，但没有可显示的 answer/content/message。");
  }

  return {
    answer,
    finalAnswer,
    customerAnswer,
    customerAnswerParagraphs,
    rawAnswer,
    sources: extractArray<ChatSource>(isRecord(payload) ? payload.sources : undefined),
    retrievalMessage: isRecord(payload) && typeof payload.retrievalMessage === "string" ? payload.retrievalMessage : null,
    retrieval: isRecord(payload) && isRecord(payload.retrieval) ? payload.retrieval as ChatRetrievalInfo : undefined,
    providerUsed: toOptionalString(isRecord(payload) ? payload.providerUsed : undefined),
    modelUsed: toOptionalString(isRecord(payload) ? payload.modelUsed : undefined),
    fallbackUsed: isRecord(payload) && typeof payload.fallbackUsed === "boolean" ? payload.fallbackUsed : undefined,
    cached: isRecord(payload) && typeof payload.cached === "boolean" ? payload.cached : undefined,
    latencyMs: isRecord(payload) && typeof payload.latencyMs === "number" ? payload.latencyMs : undefined,
    requestId: toOptionalString(isRecord(payload) ? payload.requestId : undefined)
  };
}

function extractNodeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }

  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(extractNodeText).join("");
  }

  if (typeof node === "object" && "props" in node) {
    return extractNodeText((node as { props?: { children?: ReactNode } }).props?.children);
  }

  return "";
}

function getCodeLanguageFromClassName(className: unknown) {
  if (typeof className !== "string") {
    return "text";
  }

  const match = /language-([a-zA-Z0-9_-]+)/.exec(className);

  return match?.[1] ?? "text";
}

function getPreCodeProps(children: ReactNode) {
  const node = Array.isArray(children) ? children[0] : children;

  if (node && typeof node === "object" && "props" in node) {
    const props = (node as { props?: { children?: ReactNode; className?: string } }).props;

    return {
      code: extractNodeText(props?.children).trimEnd(),
      language: getCodeLanguageFromClassName(props?.className)
    };
  }

  return {
    code: extractNodeText(children).trimEnd(),
    language: "text"
  };
}

function CodeBlock({
  code,
  language = "text"
}: {
  code: string;
  language?: string;
}) {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const languageLabel = normalizeCodeLanguage(language);

  async function copyCode() {
    try {
      const copied = await writeClipboardText(code);

      setCopyState(copied ? "copied" : "failed");
    } catch {
      setCopyState("failed");
    } finally {
      window.setTimeout(() => setCopyState("idle"), 1800);
    }
  }

  return (
    <div className="mb-[18px] mt-[14px] max-w-full overflow-hidden rounded-2xl border border-[#E5E7EB] bg-[#F6F7F9] shadow-[0_1px_2px_rgba(15,23,42,0.035)]">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 bg-[#F6F7F9] px-4 pb-1.5 pt-3">
        <span className="min-w-0 truncate font-mono text-[11px] font-semibold tracking-wide text-slate-500 sm:text-xs">
          {languageLabel}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={copyCode}
          className="h-7 shrink-0 px-2 text-xs text-slate-600 hover:bg-white"
        >
          {copyState === "copied" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败" : "复制"}
        </Button>
      </div>
      <pre className="m-0 max-w-full overflow-x-auto whitespace-pre bg-transparent px-4 pb-4 pt-2 font-mono text-[13px] leading-[1.6] text-slate-800">
        <code className="block min-w-max font-mono">{code}</code>
      </pre>
    </div>
  );
}

function GrayInfoCard({
  title,
  content
}: {
  title?: string;
  content: string;
}) {
  const [copyState, setCopyState] = useState<CopyState>("idle");

  async function copyCard() {
    try {
      const text = markdownToPlainTextForCopy([title, content].filter(Boolean).join("\n"));
      const copied = await writeClipboardText(text);

      setCopyState(copied ? "copied" : "failed");
    } catch {
      setCopyState("failed");
    } finally {
      window.setTimeout(() => setCopyState("idle"), 1800);
    }
  }

  return (
    <section className="my-3.5 rounded-2xl border border-black/[0.04] bg-[#f7f7f8] px-4 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <div className="mb-2.5 flex items-start justify-between gap-3">
        {title ? (
          <h3 className="text-[15px] font-bold leading-7 text-slate-950">{title}</h3>
        ) : (
          <span className="sr-only">说明块</span>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={copyCard}
          className="h-7 shrink-0 px-2 text-xs text-slate-600 hover:bg-white"
        >
          {copyState === "copied" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败" : "复制"}
        </Button>
      </div>
      <div className="space-y-2.5">
        <MarkdownAnswerRenderer content={content} tone="card" />
      </div>
    </section>
  );
}

function AnswerDivider() {
  return <hr className="my-6 border-0 border-t border-black/[0.08]" />;
}

function MarkdownAnswerRenderer({
  content,
  tone = "default"
}: {
  content: string;
  tone?: "default" | "card" | "script";
}) {
  const isScript = tone === "script";
  const normalizedContent = useMemo(() => normalizeAnswerMarkdown(content), [content]);

  return (
    <div data-renderer="active-ai-markdown-renderer">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
        p: ({ children }) => <p className="mb-3 text-[15px] leading-[1.75] text-[#172033] last:mb-0 sm:text-base">{children}</p>,
        strong: ({ children }) => <strong className="font-bold text-slate-950">{children}</strong>,
        ul: ({ children }) => (
          <ul className="my-3 block list-outside list-disc space-y-1.5 pl-5 text-[15px] leading-[1.75] text-[#172033] marker:text-slate-500 last:mb-0 sm:text-base">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="my-3 block list-outside list-decimal space-y-1.5 pl-5 text-[15px] leading-[1.75] text-[#172033] marker:text-base marker:font-bold marker:text-slate-800 last:mb-0 sm:text-base">
            {children}
          </ol>
        ),
        li: ({ children }) => {
          const text = extractNodeText(children).trim();
          const looksLikeShortTitle = text.length >= 4 && text.length <= 42 && !/[。！？!?；;]$/.test(text) && NUMBERED_TITLE_WORD_PATTERN.test(text);

          return (
            <li className={cn("my-1.5 list-item whitespace-normal pl-0.5 leading-[1.75] [&>p]:m-0", looksLikeShortTitle ? "font-bold text-slate-950" : "")}>
              {children}
            </li>
          );
        },
        blockquote: ({ children }) => (
          <blockquote
            className={cn(
              "rounded-2xl border-l-4 px-4 py-3.5 text-slate-700",
              isScript
                ? "border-teal-400 bg-white/65"
                : "border-slate-300 bg-[#f7f7f8]"
            )}
          >
            <div className="space-y-2.5">{children}</div>
          </blockquote>
        ),
        h1: ({ children }) => <h1 className="mb-3 mt-6 text-[20px] font-extrabold leading-8 text-slate-950 first:mt-0 sm:text-[22px]">{children}</h1>,
        h2: ({ children }) => <h2 className="mb-3 mt-6 text-lg font-extrabold leading-8 text-slate-950 first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-2.5 mt-5 text-base font-bold leading-7 text-slate-950 first:mt-0">{children}</h3>,
        h4: ({ children }) => <h4 className="mb-2 mt-5 text-[15px] font-bold leading-7 text-slate-950 first:mt-0">{children}</h4>,
        a: ({ children, href }) => (
          <a href={href} target="_blank" rel="noreferrer" className="font-medium text-teal-700 underline underline-offset-2">
            {children}
          </a>
        ),
        hr: () => <AnswerDivider />,
        pre: ({ children }) => {
          const { code, language } = getPreCodeProps(children);

          return <CodeBlock code={code} language={language} />;
        },
        code: ({ children, className }) => (
          <code className={className ? className : "rounded-md bg-[#F6F7F9] px-1.5 py-0.5 font-mono text-[0.92em] text-slate-800 ring-1 ring-black/[0.04]"}>
            {children}
          </code>
        ),
        table: ({ children }) => (
          <div className="my-4 overflow-x-auto rounded-xl border border-[#E5E7EB]">
            <table className="min-w-full border-collapse text-left text-sm leading-6 text-[#172033]">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-[#F6F7F9] text-slate-900">{children}</thead>,
        th: ({ children }) => <th className="border-b border-r border-[#E5E7EB] px-3 py-2 font-bold last:border-r-0">{children}</th>,
        td: ({ children }) => <td className="border-b border-r border-[#E5E7EB] px-3 py-2 align-top last:border-r-0">{children}</td>,
        tr: ({ children }) => <tr className="last:[&>td]:border-b-0">{children}</tr>
        }}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
}

class AnswerRenderErrorBoundary extends Component<
  {
    children: ReactNode;
    fallback: ReactNode;
    label: string;
    resetKey: string;
  },
  {
    hasError: boolean;
  }
> {
  state = {
    hasError: false
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    console.error(`answer.render_failed.${this.props.label}`, {
      error,
      componentStack: errorInfo.componentStack
    });
  }

  componentDidUpdate(previousProps: { resetKey: string }) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function AnswerContent({
  content,
  className
}: {
  content: string;
  className?: string;
}) {
  const blocks = useMemo(() => content ? parseAnswerBlocks(content) : [], [content]);

  return (
    <div data-renderer="active-ai-markdown-renderer" className={cn("break-words text-sm leading-6", className)}>
      {blocks.map((block, index) => {
        if (block.type === "divider") {
          return <AnswerDivider key={`${block.type}-${index}`} />;
        }

        if (block.type === "intro" || block.type === "paragraph" || block.type === "list") {
          return (
            <div key={`${block.type}-${index}`} className="space-y-3.5 text-[15px] leading-7">
              <MarkdownAnswerRenderer content={block.content} />
            </div>
          );
        }

        if (block.type === "heading") {
          const isNumberedHeading = NUMBERED_HEADING_PATTERN.test(block.title ?? "");
          const isSchemeHeading = SCHEME_HEADING_PATTERN.test(block.title ?? "");

          return (
            <h2
              key={`${block.type}-${block.title}-${index}`}
              className={cn(
                "mb-2 mt-5 leading-7 text-[#172033] first:mt-0",
                isNumberedHeading || isSchemeHeading
                  ? "text-lg font-extrabold sm:text-xl"
                  : "text-base font-bold"
              )}
            >
              {block.title}
            </h2>
          );
        }

        if (block.type === "codeCard") {
          return (
            <CodeBlock
              key={`${block.type}-${block.language}-${index}`}
              code={block.content}
              language={block.language}
            />
          );
        }

        if (block.type === "customerScript") {
          return (
            <div
              key={`${block.type}-${block.title}-${index}`}
              className="space-y-3.5 text-[15px] leading-7"
            >
              <MarkdownAnswerRenderer
                content={[
                  block.title ? `**${block.title}：**` : "**可以发给客户这样说：**",
                  block.content
                ].join("\n\n")}
              />
            </div>
          );
        }

        if (block.type === "grayBox") {
          return <GrayInfoCard key={`${block.type}-${block.title}-${index}`} title={block.title} content={block.content} />;
        }

        return (
          <div key={`${block.type}-${index}`} className="space-y-3.5 text-[15px] leading-7">
            <MarkdownAnswerRenderer content={block.content} />
          </div>
        );
      })}
    </div>
  );
}

function PlainTextAnswer({ answer }: { answer: string }) {
  return (
    <pre className="whitespace-pre-wrap break-words rounded-2xl bg-white p-0 font-sans text-[15px] leading-7 text-slate-700">
      {answer}
    </pre>
  );
}

function MarkdownFallbackAnswer({ answer }: { answer: string }) {
  return (
    <AnswerRenderErrorBoundary
      label="markdown"
      resetKey={answer}
      fallback={<PlainTextAnswer answer={answer} />}
    >
      <div className="space-y-3.5 text-[15px] leading-7">
        <MarkdownAnswerRenderer content={answer} />
      </div>
    </AnswerRenderErrorBoundary>
  );
}

function SafeAnswerRenderer({ answer }: {
  answer: string;
}) {
  if (!answer) {
    return null;
  }

  return (
    <AnswerRenderErrorBoundary
      label="blocks"
      resetKey={answer}
      fallback={<MarkdownFallbackAnswer answer={answer} />}
    >
      <AnswerContent content={answer} />
    </AnswerRenderErrorBoundary>
  );
}

function safeExtractCustomerScript(content: string) {
  try {
    return extractCustomerScript(content);
  } catch (error) {
    console.error("answer.extract_customer_script_failed", error);
    return null;
  }
}

function normalizeCustomerAnswer(input?: unknown) {
  return cleanCustomerAnswerText(normalizeAnswerMarkdown(input));
}

function CustomerAnswerParagraphCard({ paragraph }: { paragraph: CustomerAnswerParagraph }) {
  const [copyState, setCopyState] = useState<CopyState>("idle");

  async function copyParagraph() {
    try {
      const copied = await writeClipboardText(paragraph.text);

      setCopyState(copied ? "copied" : "failed");
    } catch {
      setCopyState("failed");
    } finally {
      window.setTimeout(() => setCopyState("idle"), 1500);
    }
  }

  return (
    <article className="rounded-xl border border-emerald-200/70 bg-white/60 px-3.5 py-3 shadow-[0_1px_2px_rgba(16,185,129,0.04)]">
      <div className="mb-1.5 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs font-bold leading-5 text-emerald-950">{paragraph.label}</span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={copyParagraph}
          className="h-7 w-fit px-2 text-xs text-emerald-800 hover:bg-emerald-50"
        >
          {copyState === "copied" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败" : "复制本段"}
        </Button>
      </div>
      <p className="m-0 break-words text-[14px] leading-[1.75] text-emerald-950">
        {paragraph.text}
      </p>
    </article>
  );
}

function CustomerAnswerRenderer({ paragraphs }: { paragraphs: CustomerAnswerParagraph[] }) {
  return (
    <div data-renderer="customer-answer-renderer" className="space-y-2.5">
      {paragraphs.map((paragraph) => (
        <CustomerAnswerParagraphCard key={paragraph.id} paragraph={paragraph} />
      ))}
    </div>
  );
}

function CustomerAnswerBox({
  paragraphs,
  customerAnswer
}: {
  paragraphs: CustomerAnswerParagraph[];
  customerAnswer?: string | null;
}) {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const plainAnswer = customerAnswer || paragraphs.map((paragraph) => paragraph.text).join("\n\n");

  if (!plainAnswer) {
    return null;
  }

  async function copyCustomerAnswer() {
    try {
      const copied = await writeClipboardText(plainAnswer);

      setCopyState(copied ? "copied" : "failed");
    } catch {
      setCopyState("failed");
    } finally {
      window.setTimeout(() => setCopyState("idle"), 1800);
    }
  }

  return (
    <section className="mt-4 rounded-2xl border border-[#BBF7D0] bg-[#ECFDF3] px-4 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.035)]">
      <div className="mb-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-[15px] font-bold leading-6 text-emerald-950">可直接复制给客户</h3>
          <p className="text-xs leading-5 text-emerald-700/85">已整理为适合对外沟通的简洁答案</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={copyCustomerAnswer}
          className="h-8 w-fit border-[#A7F3D0] bg-white/80 px-2.5 text-xs text-emerald-800 hover:bg-white"
        >
          {copyState === "copied" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败" : "复制客户答案"}
        </Button>
      </div>
      <div className="rounded-xl border border-emerald-100/80 bg-white/55 px-3.5 py-3">
        <CustomerAnswerRenderer paragraphs={paragraphs} />
      </div>
    </section>
  );
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

function AIMessageCard({
  message,
  feedbackState,
  onSubmitFeedback,
  onOpenFeedbackReason,
  onFeedbackReasonChange,
  onCancelFeedbackReason
}: {
  message: ChatMessage;
  feedbackState?: AnswerFeedbackState;
  onSubmitFeedback?: (message: ChatMessage, choice: FeedbackChoice, reason?: string) => void;
  onOpenFeedbackReason?: (messageId: string) => void;
  onFeedbackReasonChange?: (messageId: string, reason: string) => void;
  onCancelFeedbackReason?: (messageId: string) => void;
}) {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const answerFeedbackState = feedbackState ?? {};
  const answerParts = useMemo(() => normalizeAnswerParts(message), [message]);
  const customerAnswer = useMemo(() => getCustomerAnswer(message), [message]);
  const customerAnswerParagraphs = useMemo(() => getCustomerAnswerParagraphs(message), [message]);

  async function copyFullAnswer() {
    try {
      const text = markdownToPlainTextForCopy(answerParts.rawAnswer || answerParts.finalAnswer);
      const copied = await writeClipboardText(text);

      setCopyState(copied ? "copied" : "failed");
    } catch {
      setCopyState("failed");
    } finally {
      window.setTimeout(() => setCopyState("idle"), 1800);
    }
  }

  return (
    <>
      <div className="border-y border-[#E5E7EB] py-4 sm:py-5">
        <SafeAnswerRenderer answer={answerParts.finalAnswer} />
      </div>

      <CustomerAnswerBox paragraphs={customerAnswerParagraphs} customerAnswer={customerAnswer} />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={copyFullAnswer}
          className="h-8 px-2 text-xs"
        >
          {copyState === "copied" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败，请手动复制" : "复制"}
        </Button>
        <span className="text-xs text-muted">{message.createdAt}</span>
      </div>

      <AnswerFeedback
        state={answerFeedbackState}
        onHelpful={() => onSubmitFeedback?.(message, "helpful")}
        onOpenReason={() => onOpenFeedbackReason?.(message.id)}
        onReasonChange={(reason) => onFeedbackReasonChange?.(message.id, reason)}
        onCancelReason={() => onCancelFeedbackReason?.(message.id)}
        onSubmitReason={() => onSubmitFeedback?.(message, "not_helpful", answerFeedbackState.reason)}
      />
    </>
  );
}

function ChatBubble({
  message,
  feedbackState,
  onSubmitFeedback,
  onOpenFeedbackReason,
  onFeedbackReasonChange,
  onCancelFeedbackReason
}: {
  message: ChatMessage;
  feedbackState?: AnswerFeedbackState;
  onSubmitFeedback?: (message: ChatMessage, choice: FeedbackChoice, reason?: string) => void;
  onOpenFeedbackReason?: (messageId: string) => void;
  onFeedbackReasonChange?: (messageId: string, reason: string) => void;
  onCancelFeedbackReason?: (messageId: string) => void;
}) {
  const isUser = message.role === "user";
  const userContent = getMessageText(message);

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
          <p className="whitespace-pre-wrap">{userContent}</p>
        ) : message.pending ? (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            {message.status || "正在检索知识..."}
          </div>
        ) : (
          <AIMessageCard
            message={message}
            feedbackState={feedbackState}
            onSubmitFeedback={onSubmitFeedback}
            onOpenFeedbackReason={onOpenFeedbackReason}
            onFeedbackReasonChange={onFeedbackReasonChange}
            onCancelFeedbackReason={onCancelFeedbackReason}
          />
        )}
        {isUser || message.pending ? (
          <div className={cn("mt-2 text-xs", isUser ? "text-slate-300" : "text-muted")}>{message.createdAt}</div>
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

function ChatWorkspace() {
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState(searchParams.get("q") ?? "");
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState("");
  const [error, setError] = useState("");
  const [feedbackByMessageId, setFeedbackByMessageId] = useState<Record<string, AnswerFeedbackState>>({});
  const showDebugMarkdown = process.env.NODE_ENV !== "production" && searchParams.get("debugMarkdown") === "1";
  const visibleMessages = showDebugMarkdown ? [DEBUG_MARKDOWN_MESSAGE, ...messages] : messages;
  const questionHistory = messages
    .map((message, index) => ({ message, index }))
    .filter(({ message }) => message.role === "user")
    .map(({ message, index }) => ({
      question: message,
      answer: messages.slice(index + 1).find((item) => item.role === "assistant")
    }))
    .reverse();

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
            answer: getFinalAnswer(message),
            sourceCount: normalizeAnswerParts(message).sources.length,
            sources: normalizeAnswerParts(message).sources.map((source) => ({
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

  async function submitQuestion(question: string) {
    if (!question) {
      setError("请输入问题后再发送。");
      return;
    }

    const now = getNowLabel();
    const messageStamp = Date.now();
    const userMessage: ChatMessage = {
      id: `msg-user-${messageStamp}`,
      role: "user",
      content: question,
      createdAt: now
    };
    const assistantMessageId = `msg-ai-${messageStamp}`;
    const loadingAssistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      createdAt: now,
      question,
      pending: true,
      status: "正在检索知识..."
    };
    const stageTimers: number[] = [];
    const setPendingStatus = (status: string) => {
      setLoadingStage(status);
      setMessages((current) => current.map((message) => message.id === assistantMessageId
        ? { ...message, status }
        : message));
    };

    setMessages((current) => [...current, userMessage, loadingAssistantMessage]);
    setInput("");
    setError("");
    setLoading(true);
    setLoadingStage("正在检索知识...");
    stageTimers.push(window.setTimeout(() => setPendingStatus("正在整理业务答案..."), 1200));
    stageTimers.push(window.setTimeout(() => setPendingStatus("正在生成回复..."), 3500));
    stageTimers.push(window.setTimeout(() => setPendingStatus("内容较多，正在继续整理..."), 8000));
    stageTimers.push(window.setTimeout(() => setPendingStatus("本次回答较复杂，请稍等..."), 20000));
    stageTimers.push(window.setTimeout(() => setPendingStatus("仍在等待模型响应，可能需要更久..."), 60000));

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          question,
          stream: false,
          mode: "fast"
        })
      });

      const data = await readChatResponse(response);
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: "assistant",
        content: data.finalAnswer ?? data.answer,
        answer: data.answer,
        finalAnswer: data.finalAnswer ?? data.answer,
        customerAnswer: data.customerAnswer,
        customerAnswerParagraphs: data.customerAnswerParagraphs,
        rawAnswer: data.rawAnswer ?? data.answer,
        createdAt: getNowLabel(),
        question,
        sources: data.sources,
        providerUsed: data.providerUsed,
        modelUsed: data.modelUsed,
        fallbackUsed: data.fallbackUsed,
        cached: data.cached,
        latencyMs: data.latencyMs,
        requestId: data.requestId,
        retrieval: data.retrieval
      };

      setMessages((current) => current.map((message) => message.id === assistantMessageId ? assistantMessage : message));
    } catch (caughtError) {
      console.error("chat.submit_failed", caughtError);
      setMessages((current) => current.filter((message) => message.id !== assistantMessageId));
      setError(caughtError instanceof Error ? caughtError.message : "生成回答失败。");
    } finally {
      for (const timer of stageTimers) {
        window.clearTimeout(timer);
      }
      setLoading(false);
      setLoadingStage("");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitQuestion(input.trim());
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-line bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <TopSearchBar
          value={input}
          onChange={setInput}
          onSubmit={() => submitQuestion(input.trim())}
          placeholder="直接提问：例如 销售遇到安全审计问题时怎么回复？"
        />
        {loading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            {loadingStage || "正在检索知识..."}
          </div>
        ) : null}
        {messages.length === 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {suggestedQuestions.map((question) => (
              <button
                key={question}
                type="button"
                onClick={() => setInput(question)}
                className="focus-ring rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-100"
              >
                {question}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <section className="grid min-h-[680px] gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="flex min-h-0 flex-col">
        <CardHeader className="border-b border-line">
          <CardTitle>知识库问答</CardTitle>
          <CardDescription>直接提问，获取自然、清晰的业务回答。</CardDescription>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col p-0">
          <div className="flex-1 space-y-5 overflow-y-auto bg-canvas/60 p-4 sm:p-5">
            {visibleMessages.length === 0 ? (
              <div className="rounded-lg border border-dashed border-line bg-white p-8 text-center text-sm text-muted">
                暂无会话，输入一个问题开始。
              </div>
            ) : (
              visibleMessages.map((message) => {
                const isDebugMessage = message.id === DEBUG_MARKDOWN_MESSAGE.id;

                return (
                <ChatBubble
                  key={message.id}
                  message={message}
                  feedbackState={feedbackByMessageId[message.id]}
                  onSubmitFeedback={isDebugMessage ? undefined : submitAnswerFeedback}
                  onOpenFeedbackReason={isDebugMessage ? undefined : openFeedbackReason}
                  onFeedbackReasonChange={isDebugMessage ? undefined : (messageId, reason) => updateFeedbackState(messageId, { reason })}
                  onCancelFeedbackReason={isDebugMessage ? undefined : cancelFeedbackReason}
                />
                );
              })
            )}

            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                {loadingStage || "正在检索知识..."}
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
                <article
                  key={question.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setInput(getMessageText(question))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      setInput(getMessageText(question));
                    }
                  }}
                  className="cursor-pointer rounded-lg border border-line bg-white p-4 transition hover:border-teal-200 hover:bg-teal-50/40"
                >
                  <p className="text-sm font-semibold text-ink">{getMessageText(question)}</p>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted">
                    {answer && !answer.pending ? stripMarkdownForSummary(getFinalAnswer(answer)) : "等待生成回答"}
                  </p>
                  <p className="mt-3 text-xs text-muted">{question.createdAt}</p>
                </article>
              ))
            )}
          </CardContent>
        </Card>
      </div>
      </section>
    </div>
  );
}

export default function ChatPage() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="Chat"
        title="知识库问答"
        description="基于知识库提问，获得自然、清晰、可直接使用的业务答案。"
      />
      <Suspense fallback={<div className="rounded-lg border border-line bg-white p-6 text-sm text-muted">加载问答页...</div>}>
        <ChatWorkspace />
      </Suspense>
    </div>
  );
}
