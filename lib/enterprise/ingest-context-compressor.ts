"use client";

import type { IngestConversationMessage } from "@/lib/enterprise/ingest-conversation-state";

export type CompactIngestMessage = {
  role: "user" | "assistant";
  content: string;
};

export type CompressedIngestContext = {
  messages: CompactIngestMessage[];
  contextSummary?: string;
  estimatedTokens: number;
  originalMessageCount: number;
  compacted: boolean;
};

export function estimateTokens(text: string) {
  return Math.ceil((text || "").length / 3.5);
}

function toCompactMessage(message: IngestConversationMessage): CompactIngestMessage | null {
  if (message.role !== "user" && message.role !== "assistant") {
    return null;
  }

  const content = message.content.trim();

  if (!content || (message.status === "failed" && !content)) {
    return null;
  }

  return {
    role: message.role,
    content
  };
}

export function buildCompactContextSummary(messages: IngestConversationMessage[]) {
  return messages
    .map((message) => {
      const content = message.content.trim();

      if (!content || (message.role !== "user" && message.role !== "assistant")) {
        return "";
      }

      const label = message.role === "user" ? "用户" : "助手";
      const clipped = content.length > 500 ? `${content.slice(0, 500)}...` : content;

      return `${label}：${clipped}`;
    })
    .filter(Boolean)
    .join("\n");
}

export function compressConversationContext(
  messages: IngestConversationMessage[],
  options: {
    maxMessages?: number;
    maxChars?: number;
    keepRecentFullMessages?: number;
  } = {}
): CompressedIngestContext {
  const maxMessages = options.maxMessages ?? 12;
  const maxChars = options.maxChars ?? 12000;
  const keepRecentFullMessages = options.keepRecentFullMessages ?? 8;
  const validMessages = messages
    .map(toCompactMessage)
    .filter((message): message is CompactIngestMessage => Boolean(message));
  const recent = validMessages.slice(-maxMessages);
  const recentChars = recent.reduce((sum, message) => sum + message.content.length, 0);

  if (recentChars <= maxChars) {
    return {
      messages: recent,
      estimatedTokens: estimateTokens(recent.map((message) => message.content).join("\n")),
      originalMessageCount: validMessages.length,
      compacted: validMessages.length > recent.length
    };
  }

  const fullRecent = recent.slice(-keepRecentFullMessages);
  const earlierCount = Math.max(0, messages.length - fullRecent.length);
  const earlier = messages.slice(0, earlierCount);
  const contextSummary = buildCompactContextSummary(earlier);

  return {
    messages: fullRecent,
    contextSummary,
    estimatedTokens: estimateTokens(`${contextSummary}\n${fullRecent.map((message) => message.content).join("\n")}`),
    originalMessageCount: validMessages.length,
    compacted: true
  };
}
