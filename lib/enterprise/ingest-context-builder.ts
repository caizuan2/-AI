"use client";

import type {
  IngestConversationMessage
} from "@/lib/enterprise/ingest-conversation-state";
import {
  compressConversationContext,
  estimateTokens
} from "@/lib/enterprise/ingest-context-compressor";

function withoutTerminalPrompt(messages: IngestConversationMessage[], prompt: string) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (message.role !== "user" && message.role !== "assistant") {
      continue;
    }

    if (message.role === "user" && message.content.trim() === prompt) {
      return messages.filter((_, messageIndex) => messageIndex !== index);
    }

    break;
  }

  return messages;
}

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
  const historyMessages = withoutTerminalPrompt(input.messages, prompt);
  const compressed = compressConversationContext(historyMessages, {
    maxMessages: input.maxMessages ?? 12,
    maxChars: input.maxChars ?? 12000,
    keepRecentFullMessages: 8
  });
  const messages = compressed.messages;
  const contextSummary = compressed.contextSummary;
  const promptChars = prompt.length;
  const requestContextChars = compressed.diagnostics.contextChars + promptChars;
  const requestContextText = `${contextSummary ?? ""}\n${messages.map((message) => message.content).join("\n")}\n${prompt}`;

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
    estimatedTokens: estimateTokens(requestContextText),
    compacted: compressed.compacted,
    contextDiagnostics: {
      ...compressed.diagnostics,
      promptChars,
      requestContextChars,
      requestEstimatedTokens: estimateTokens(requestContextText)
    },
    mode: "ingest_chat" as const
  };
}
