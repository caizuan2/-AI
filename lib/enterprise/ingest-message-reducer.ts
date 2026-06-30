"use client";

import {
  createMessageId,
  markRequestCompleted,
  type IngestConversationMessage,
  type IngestConversationState
} from "@/lib/enterprise/ingest-conversation-state";

function upsertMessage(
  messages: IngestConversationMessage[],
  nextMessage: IngestConversationMessage
) {
  const exists = messages.some((message) => message.id === nextMessage.id);

  if (!exists) {
    return [...messages, nextMessage];
  }

  return messages.map((message) => message.id === nextMessage.id ? { ...message, ...nextMessage } : message);
}

export function appendUserMessage(
  state: IngestConversationState,
  input: {
    id?: string;
    content: string;
    requestId: string;
    createdAt?: number;
    meta?: Record<string, unknown>;
  }
) {
  const now = input.createdAt ?? Date.now();
  const message: IngestConversationMessage = {
    id: input.id ?? createMessageId(),
    role: "user",
    content: input.content,
    status: "completed",
    requestId: input.requestId,
    conversationId: state.conversationId,
    agentId: state.agentId,
    knowledgeBaseId: state.knowledgeBaseId,
    createdAt: now,
    updatedAt: now,
    meta: input.meta
  };

  return {
    ...state,
    messages: upsertMessage(state.messages, message),
    updatedAt: now
  };
}

export function appendAssistantPlaceholder(
  state: IngestConversationState,
  input: {
    id?: string;
    requestId: string;
    createdAt?: number;
    meta?: Record<string, unknown>;
  }
) {
  const now = input.createdAt ?? Date.now();
  const message: IngestConversationMessage = {
    id: input.id ?? createMessageId(),
    role: "assistant",
    content: "",
    status: "streaming",
    requestId: input.requestId,
    conversationId: state.conversationId,
    agentId: state.agentId,
    knowledgeBaseId: state.knowledgeBaseId,
    createdAt: now,
    updatedAt: now,
    meta: input.meta
  };

  return {
    ...state,
    messages: upsertMessage(state.messages, message),
    updatedAt: now
  };
}

export function updateAssistantMessage(
  state: IngestConversationState,
  input: {
    requestId: string;
    messageId?: string;
    content: string;
    meta?: Record<string, unknown>;
  }
) {
  const now = Date.now();
  const messages = state.messages.map((message) => {
    const matches = input.messageId
      ? message.id === input.messageId
      : message.role === "assistant" && message.requestId === input.requestId;

    if (!matches) {
      return message;
    }

    return {
      ...message,
      content: input.content,
      status: "streaming" as const,
      updatedAt: now,
      meta: {
        ...message.meta,
        ...input.meta
      }
    };
  });

  return {
    ...state,
    messages,
    updatedAt: now
  };
}

export function completeAssistantMessage(
  state: IngestConversationState,
  input: {
    requestId: string;
    messageId?: string;
    content?: string;
    meta?: Record<string, unknown>;
  }
) {
  const now = Date.now();
  const messages = state.messages.map((message) => {
    const matches = input.messageId
      ? message.id === input.messageId
      : message.role === "assistant" && message.requestId === input.requestId;

    if (!matches) {
      return message;
    }

    return {
      ...message,
      content: input.content ?? message.content,
      status: "completed" as const,
      updatedAt: now,
      meta: {
        ...message.meta,
        ...input.meta
      }
    };
  });

  return markRequestCompleted({
    ...state,
    messages,
    updatedAt: now
  }, input.requestId);
}

export function failAssistantMessage(
  state: IngestConversationState,
  input: {
    requestId: string;
    message?: string;
  }
) {
  if (state.activeRequestId && state.activeRequestId !== input.requestId) {
    return state;
  }

  const now = Date.now();
  const messages = state.messages.map((message) => {
    if (message.role !== "assistant" || message.requestId !== input.requestId) {
      return message;
    }

    const hasContent = Boolean(message.content.trim());

    return {
      ...message,
      status: hasContent ? "completed" as const : "failed" as const,
      updatedAt: now,
      meta: {
        ...message.meta,
        warning: hasContent ? input.message : undefined,
        error: hasContent ? undefined : input.message
      }
    };
  });

  return {
    ...state,
    messages,
    activeRequestId: undefined,
    isGenerating: false,
    transientError: input.message ?? null,
    updatedAt: now
  };
}

export function trimContextMessages(messages: IngestConversationMessage[], limit = 12) {
  return messages
    .filter((message) => {
      const content = message.content.trim();

      return Boolean(content) && !(message.status === "failed" && !content);
    })
    .slice(-limit);
}
