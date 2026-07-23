"use client";

export type IngestRole = "user" | "assistant" | "system";

export type IngestConversationMessage = {
  id: string;
  role: IngestRole;
  content: string;
  status?: "draft" | "streaming" | "completed" | "failed";
  requestId?: string;
  conversationId: string;
  agentId?: string;
  knowledgeBaseId?: string;
  createdAt: number;
  updatedAt?: number;
  meta?: Record<string, unknown>;
};

export type IngestConversationState = {
  conversationId: string;
  agentId?: string;
  knowledgeBaseId?: string;
  messages: IngestConversationMessage[];
  activeRequestId?: string;
  lastCompletedRequestId?: string;
  isGenerating: boolean;
  transientError?: string | null;
  updatedAt: number;
};

function makeId(prefix: string) {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `${prefix}-${crypto.randomUUID()}`;
    }
  } catch {
    // Older embedded shells can expose partial crypto implementations.
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createConversationId() {
  return makeId("ingest-conversation");
}

export function createMessageId() {
  return makeId("ingest-message");
}

function mergeMessages(
  current: IngestConversationMessage[],
  incoming: IngestConversationMessage[] = []
) {
  const byId = new Map<string, IngestConversationMessage>();

  for (const message of current) {
    byId.set(message.id, message);
  }

  for (const message of incoming) {
    const existing = byId.get(message.id);

    byId.set(message.id, existing ? { ...existing, ...message } : message);
  }

  return Array.from(byId.values()).sort((left, right) => left.createdAt - right.createdAt);
}

export function createEmptyConversationState(input: {
  conversationId?: string;
  agentId?: string;
  knowledgeBaseId?: string;
  messages?: IngestConversationMessage[];
} = {}): IngestConversationState {
  const now = Date.now();

  return {
    conversationId: input.conversationId ?? createConversationId(),
    agentId: input.agentId,
    knowledgeBaseId: input.knowledgeBaseId,
    messages: input.messages ?? [],
    isGenerating: false,
    transientError: null,
    updatedAt: now
  };
}

export function ensureConversationState(
  prev: IngestConversationState | null | undefined,
  input: {
    conversationId?: string;
    agentId?: string;
    knowledgeBaseId?: string;
    messages?: IngestConversationMessage[];
  }
): IngestConversationState {
  const conversationId = input.conversationId ?? prev?.conversationId ?? createConversationId();
  const now = Date.now();

  if (!prev || prev.conversationId !== conversationId) {
    return createEmptyConversationState({
      conversationId,
      agentId: input.agentId,
      knowledgeBaseId: input.knowledgeBaseId,
      messages: input.messages
    });
  }

  return {
    ...prev,
    agentId: input.agentId ?? prev.agentId,
    knowledgeBaseId: input.knowledgeBaseId ?? prev.knowledgeBaseId,
    messages: mergeMessages(prev.messages, input.messages),
    updatedAt: now
  };
}

export function markRequestActive(state: IngestConversationState, requestId: string): IngestConversationState {
  return {
    ...state,
    activeRequestId: requestId,
    isGenerating: true,
    transientError: null,
    updatedAt: Date.now()
  };
}

export function markRequestCompleted(state: IngestConversationState, requestId: string): IngestConversationState {
  if (state.activeRequestId && state.activeRequestId !== requestId) {
    return state;
  }

  return {
    ...state,
    activeRequestId: undefined,
    lastCompletedRequestId: requestId,
    isGenerating: false,
    transientError: null,
    updatedAt: Date.now()
  };
}

export function clearTransientError(state: IngestConversationState): IngestConversationState {
  return {
    ...state,
    transientError: null,
    updatedAt: Date.now()
  };
}

export function shouldAcceptRequestEvent(state: IngestConversationState | null | undefined, requestId: string) {
  if (!state) {
    return false;
  }

  return state.activeRequestId === requestId || state.lastCompletedRequestId === requestId;
}

export function isIngestConversationRequestActive(
  state: IngestConversationState | null | undefined
) {
  return Boolean(state?.isGenerating && state.activeRequestId);
}
