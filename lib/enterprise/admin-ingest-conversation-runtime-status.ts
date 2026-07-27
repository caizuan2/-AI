export type AdminIngestConversationRuntimeStatus =
  | {
    state: "generating";
    requestId?: string;
    startedAt: number;
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

const MAX_GENERATING_STATUS_AGE_MS = 15 * 60 * 1000;
const MAX_COMPLETED_STATUS_AGE_MS = 24 * 60 * 60 * 1000;

function readTimestamp(value: unknown) {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value > 0
    ? value
    : null;
}

export function normalizeAdminIngestConversationRuntimeStatusMap(
  value: unknown,
  now = Date.now()
): AdminIngestConversationRuntimeStatusMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const next: AdminIngestConversationRuntimeStatusMap = {};

  for (const [conversationId, rawStatus] of Object.entries(value)) {
    if (
      !conversationId
      || !rawStatus
      || typeof rawStatus !== "object"
      || Array.isArray(rawStatus)
    ) {
      continue;
    }

    const status = rawStatus as Record<string, unknown>;
    const rawUpdatedAt = readTimestamp(status.updatedAt);
    const requestId = typeof status.requestId === "string"
      ? status.requestId.trim()
      : "";

    if (!rawUpdatedAt) {
      continue;
    }

    const updatedAt = Math.min(rawUpdatedAt, now);

    if (status.state === "generating") {
      const startedAt = Math.min(
        readTimestamp(status.startedAt) ?? updatedAt,
        now
      );

      if (now - updatedAt > MAX_GENERATING_STATUS_AGE_MS) {
        continue;
      }

      next[conversationId] = {
        state: "generating",
        requestId: requestId || undefined,
        startedAt,
        updatedAt
      };
      continue;
    }

    if (
      status.state === "completed_unread"
      && requestId
      && now - updatedAt <= MAX_COMPLETED_STATUS_AGE_MS
    ) {
      next[conversationId] = {
        state: "completed_unread",
        requestId,
        updatedAt
      };
    }
  }

  return next;
}

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
  const now = input.now ?? Date.now();

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
      startedAt: now,
      updatedAt: now
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
