"use client";

import type { IngestConversationMessage } from "@/lib/enterprise/ingest-conversation-state";

export const DEFAULT_INGEST_CONTEXT_MAX_MESSAGES = 12;
export const DEFAULT_INGEST_CONTEXT_MAX_CHARS = 12000;
export const DEFAULT_INGEST_CONTEXT_RECENT_FULL_MESSAGES = 8;
export const MAX_INGEST_CONTEXT_CHARS = 48000;

const MIN_INGEST_CONTEXT_CHARS = 1024;
const MIN_LONG_CONTEXT_SUMMARY_CHARS = 512;
const MAX_LONG_CONTEXT_GROUPS = 64;

export type CompactIngestMessage = {
  role: "user" | "assistant";
  content: string;
};

export type IngestContextDiagnostics = {
  maxContextChars: number;
  sourceMessageCount: number;
  sourceChars: number;
  recentMessageCount: number;
  recentChars: number;
  summarizedMessageCount: number;
  summarizedSourceChars: number;
  summaryChars: number;
  summaryGroupCount: number;
  summaryTruncatedMessageCount: number;
  contextChars: number;
  capacityExceeded: boolean;
};

export type CompressedIngestContext = {
  messages: CompactIngestMessage[];
  contextSummary?: string;
  estimatedTokens: number;
  originalMessageCount: number;
  compacted: boolean;
  diagnostics: IngestContextDiagnostics;
};

type LongContextSummary = {
  text?: string;
  groupCount: number;
  truncatedMessageCount: number;
};

export function estimateTokens(text: string) {
  return Math.ceil((text || "").length / 3.5);
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.floor(value)));
}

function toCompactMessage(message: IngestConversationMessage): CompactIngestMessage | null {
  if (message.role !== "user" && message.role !== "assistant") {
    return null;
  }

  const content = message.content.trim();

  if (!content) {
    return null;
  }

  return {
    role: message.role,
    content
  };
}

function checksumText(text: string) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash.toString(16).padStart(8, "0");
}

function messageSourceText(message: CompactIngestMessage) {
  return `${message.role === "user" ? "用户" : "助手"}：${message.content}`;
}

function clipPreservingEdges(text: string, maxChars: number) {
  if (maxChars <= 0) {
    return "";
  }

  if (text.length <= maxChars) {
    return text;
  }

  const marker = "\n…[中段已确定性压缩]…\n";

  if (maxChars <= marker.length + 8) {
    return text.slice(0, maxChars);
  }

  const available = maxChars - marker.length;
  const headLength = Math.ceil(available * 0.6);
  const tailLength = available - headLength;

  return `${text.slice(0, headLength)}${marker}${text.slice(-tailLength)}`;
}

function partitionMessages(messages: CompactIngestMessage[], groupCount: number) {
  return Array.from({ length: groupCount }, (_, groupIndex) => {
    const start = Math.floor((groupIndex * messages.length) / groupCount);
    const end = Math.floor(((groupIndex + 1) * messages.length) / groupCount);

    return {
      start,
      end,
      messages: messages.slice(start, end)
    };
  });
}

function buildGroupLabel(input: {
  start: number;
  end: number;
  messages: CompactIngestMessage[];
}) {
  const userCount = input.messages.filter((message) => message.role === "user").length;
  const assistantCount = input.messages.length - userCount;
  const sourceText = input.messages.map(messageSourceText).join("\n");

  return `[历史第${input.start + 1}-${input.end}条｜用户${userCount}/助手${assistantCount}｜原文${sourceText.length}字｜校验${checksumText(sourceText)}]`;
}

function buildBoundedLongContextSummary(
  messages: CompactIngestMessage[],
  maxChars: number
): LongContextSummary {
  if (messages.length === 0 || maxChars <= 0) {
    return {
      groupCount: 0,
      truncatedMessageCount: messages.length
    };
  }

  const sourceText = messages.map(messageSourceText).join("\n");
  const compactHeader = `【更早对话长上下文】共${messages.length}条，原文${sourceText.length}字，校验${checksumText(sourceText)}。`;
  const explanatoryHeader = `${compactHeader}\n以下按原始时间顺序排列；省略标记表示该组已做首尾有界压缩，未展示的中段不可据此臆测。`;
  const header = explanatoryHeader.length <= maxChars ? explanatoryHeader : compactHeader.slice(0, maxChars);

  if (header.length >= maxChars) {
    return {
      text: header,
      groupCount: 0,
      truncatedMessageCount: messages.length
    };
  }

  const fullTimeline = `${header}\n${sourceText}`;

  if (fullTimeline.length <= maxChars) {
    return {
      text: fullTimeline,
      groupCount: messages.length,
      truncatedMessageCount: 0
    };
  }

  let groupCount = Math.min(messages.length, MAX_LONG_CONTEXT_GROUPS);
  let groups = partitionMessages(messages, groupCount);
  let labels = groups.map(buildGroupLabel);

  while (
    groupCount > 1
    && header.length + labels.reduce((sum, label) => sum + label.length, 0) + groupCount > maxChars
  ) {
    groupCount -= 1;
    groups = partitionMessages(messages, groupCount);
    labels = groups.map(buildGroupLabel);
  }

  const labelChars = labels.reduce((sum, label) => sum + label.length, 0);
  const joinChars = groupCount;
  const remainingForExcerpts = Math.max(0, maxChars - header.length - labelChars - joinChars);
  const excerptSlotChars = groupCount > 0 ? Math.floor(remainingForExcerpts / groupCount) : 0;
  let truncatedMessageCount = 0;
  const blocks = groups.map((group, index) => {
    const groupSource = group.messages.map(messageSourceText).join("\n");
    const excerptBudget = Math.max(0, excerptSlotChars - 1);
    const excerpt = clipPreservingEdges(groupSource, excerptBudget);

    if (excerpt.length < groupSource.length) {
      truncatedMessageCount += group.messages.length;
    }

    return excerpt ? `${labels[index]}\n${excerpt}` : labels[index];
  });
  const text = [header, ...blocks].join("\n");

  return {
    text,
    groupCount,
    truncatedMessageCount
  };
}

export function buildCompactContextSummary(
  messages: IngestConversationMessage[],
  maxChars = DEFAULT_INGEST_CONTEXT_MAX_CHARS
) {
  const validMessages = messages
    .map(toCompactMessage)
    .filter((message): message is CompactIngestMessage => Boolean(message));
  const boundedMaxChars = clampInteger(maxChars, MIN_INGEST_CONTEXT_CHARS, MAX_INGEST_CONTEXT_CHARS);

  return buildBoundedLongContextSummary(validMessages, boundedMaxChars).text ?? "";
}

export function compressConversationContext(
  messages: IngestConversationMessage[],
  options: {
    maxMessages?: number;
    maxChars?: number;
    keepRecentFullMessages?: number;
  } = {}
): CompressedIngestContext {
  const maxMessages = clampInteger(
    options.maxMessages ?? DEFAULT_INGEST_CONTEXT_MAX_MESSAGES,
    1,
    64
  );
  const maxChars = clampInteger(
    options.maxChars ?? DEFAULT_INGEST_CONTEXT_MAX_CHARS,
    MIN_INGEST_CONTEXT_CHARS,
    MAX_INGEST_CONTEXT_CHARS
  );
  const keepRecentFullMessages = clampInteger(
    options.keepRecentFullMessages ?? DEFAULT_INGEST_CONTEXT_RECENT_FULL_MESSAGES,
    1,
    maxMessages
  );
  const validMessages = messages
    .map(toCompactMessage)
    .filter((message): message is CompactIngestMessage => Boolean(message));
  const sourceChars = validMessages.reduce((sum, message) => sum + message.content.length, 0);
  let recentCount = Math.min(maxMessages, validMessages.length);
  let recent = validMessages.slice(-recentCount);
  let recentChars = recent.reduce((sum, message) => sum + message.content.length, 0);
  const needsCompaction = validMessages.length > recentCount || recentChars > maxChars;
  const summaryReserve = needsCompaction
    ? Math.min(Math.max(MIN_LONG_CONTEXT_SUMMARY_CHARS, Math.floor(maxChars * 0.35)), Math.floor(maxChars * 0.6))
    : 0;
  const recentBudget = Math.max(0, maxChars - summaryReserve);

  if (recentChars > recentBudget && recentCount > keepRecentFullMessages) {
    recentCount = keepRecentFullMessages;
    recent = validMessages.slice(-recentCount);
    recentChars = recent.reduce((sum, message) => sum + message.content.length, 0);
  }

  while (recentCount > 1 && recentChars > recentBudget) {
    recentCount -= 1;
    recent = validMessages.slice(-recentCount);
    recentChars = recent.reduce((sum, message) => sum + message.content.length, 0);
  }

  const earlier = validMessages.slice(0, validMessages.length - recentCount);
  const summarizedSourceChars = earlier.reduce((sum, message) => sum + message.content.length, 0);
  const availableSummaryChars = Math.max(0, maxChars - recentChars);
  const summaryBudget = earlier.length > 0
    ? Math.max(Math.min(MIN_LONG_CONTEXT_SUMMARY_CHARS, maxChars), availableSummaryChars)
    : 0;
  const summary = buildBoundedLongContextSummary(earlier, summaryBudget);
  const contextSummary = summary.text;
  const summaryChars = contextSummary?.length ?? 0;
  const contextChars = recentChars + summaryChars;
  const diagnostics: IngestContextDiagnostics = {
    maxContextChars: maxChars,
    sourceMessageCount: validMessages.length,
    sourceChars,
    recentMessageCount: recent.length,
    recentChars,
    summarizedMessageCount: earlier.length,
    summarizedSourceChars,
    summaryChars,
    summaryGroupCount: summary.groupCount,
    summaryTruncatedMessageCount: summary.truncatedMessageCount,
    contextChars,
    capacityExceeded: contextChars > maxChars
  };

  return {
    messages: recent,
    contextSummary,
    estimatedTokens: estimateTokens(`${contextSummary ?? ""}\n${recent.map((message) => message.content).join("\n")}`),
    originalMessageCount: validMessages.length,
    compacted: earlier.length > 0 || summary.truncatedMessageCount > 0,
    diagnostics
  };
}
