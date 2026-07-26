"use client";

export type AdminIngestConversationRuntimeStatus =
  | {
    state: "generating";
    requestId?: string;
    updatedAt: number;
  }
  | {
    state: "completed_unread";
    requestId: string;
    updatedAt: number;
  };

export type AdminIngestConversationRuntimeStatusMap = Record<
  string,
  AdminIngestConversationRuntimeStatus
>;

function withoutConversation(
  current: AdminIngestConversationRuntimeStatusMap,
  conversationId: string
) {
  if (!current[conversationId]) {
    return current;
  }

  const next = { ...current };
  delete next[conversationId];
  return next;
}

export function markAdminIngestConversationGenerating(
  current: AdminIngestConversationRuntimeStatusMap,
  input: {
    conversationId: string;
    requestId?: string;
    now?: number;
  }
) {
  const previous = current[input.conversationId];

  if (
    previous?.state === "generating"
    && previous.requestId === input.requestId
  ) {
    return current;
  }

  return {
    ...current,
    [input.conversationId]: {
      state: "generating" as const,
      requestId: input.requestId,
      updatedAt: input.now ?? Date.now()
    }
  };
}

export function markAdminIngestConversationCompleted(
  current: AdminIngestConversationRuntimeStatusMap,
  input: {
    conversationId: string;
    requestId: string;
    isVisible: boolean;
    now?: number;
  }
) {
  const previous = current[input.conversationId];

  if (
    previous?.state === "generating"
    && previous.requestId
    && previous.requestId !== input.requestId
  ) {
    return current;
  }

  if (input.isVisible) {
    return withoutConversation(current, input.conversationId);
  }

  return {
    ...current,
    [input.conversationId]: {
      state: "completed_unread" as const,
      requestId: input.requestId,
      updatedAt: input.now ?? Date.now()
    }
  };
}

export function clearAdminIngestConversationRuntimeStatus(
  current: AdminIngestConversationRuntimeStatusMap,
  input: {
    conversationId: string;
    requestId?: string;
  }
) {
  const previous = current[input.conversationId];

  if (
    input.requestId
    && previous?.state === "generating"
    && previous.requestId
    && previous.requestId !== input.requestId
  ) {
    return current;
  }

  return withoutConversation(current, input.conversationId);
}

export function markAdminIngestConversationRead(
  current: AdminIngestConversationRuntimeStatusMap,
  conversationId: string
) {
  return current[conversationId]?.state === "completed_unread"
    ? withoutConversation(current, conversationId)
    : current;
}

export function removeAdminIngestConversationRuntimeStatus(
  current: AdminIngestConversationRuntimeStatusMap,
  conversationId: string
) {
  return withoutConversation(current, conversationId);
}
