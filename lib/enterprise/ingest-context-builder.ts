"use client";

import type {
  IngestConversationMessage
} from "@/lib/enterprise/ingest-conversation-state";
import {
  compressConversationContext
} from "@/lib/enterprise/ingest-context-compressor";

export function buildIngestContextPayload(input: {
  conversationId: string;
  agentId?: string;
  knowledgeBaseId?: string;
  messages: IngestConversationMessage[];
  prompt: string;
  maxMessages?: number;
  maxChars?: number;
  memoryContextText?: string;
  usedMemoryIds?: string[];
  agentLearningInstruction?: string;
}) {
  const prompt = input.prompt.trim();
  const compressed = compressConversationContext(input.messages, {
    maxMessages: input.maxMessages ?? 12,
    maxChars: input.maxChars ?? 12000,
    keepRecentFullMessages: 8
  });
  const compactMessages = compressed.messages;
  const last = compactMessages[compactMessages.length - 1];
  const messages = last?.role === "user" && last.content === prompt
    ? compactMessages
    : [...compactMessages, { role: "user" as const, content: prompt }];
  const naturalSummary = messages
    .slice(0, -1)
    .map((message) => `${message.role === "user" ? "用户" : "助手"}：${message.content}`)
    .join("\n");
  const memoryContext = [
    input.agentLearningInstruction,
    input.memoryContextText
  ].filter(Boolean).join("\n\n");
  const contextSummary = [
    memoryContext,
    compressed.contextSummary,
    naturalSummary
  ].filter(Boolean).join("\n\n");

  return {
    conversationId: input.conversationId,
    agentId: input.agentId,
    knowledgeBaseId: input.knowledgeBaseId,
    prompt,
    messages,
    contextSummary: contextSummary || undefined,
    memoryContextText: input.memoryContextText,
    usedMemoryIds: input.usedMemoryIds ?? [],
    agentLearningInstruction: input.agentLearningInstruction,
    estimatedTokens: compressed.estimatedTokens,
    compacted: compressed.compacted,
    mode: "ingest_chat" as const
  };
}
