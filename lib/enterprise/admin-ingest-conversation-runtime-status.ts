export type AdminIngestConversationRuntimeStatus =
  | {
    state: "generating";
    requestId: string;
    startedAt: number;
    updatedAt: number;
  }
  | {
    state: "completed_unread";
    requestId: string;
    updatedAt: number;
  }
  | {
    state: "visible_completed";
    requestId: string;
    updatedAt: number;
  }
  | {
    state: "stop_requested" | "stopped" | "failed" | "timed_out";
    requestId: string;
    updatedAt: number;
  };

export type AdminIngestConversationRuntimeStatusMap = Record<
  string,
  AdminIngestConversationRuntimeStatus
>;

const MAX_GENERATING_STATUS_AGE_MS = 5 * 60 * 1000;
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
      if (!requestId) {
        continue;
      }

      const startedAt = Math.min(
        readTimestamp(status.startedAt) ?? updatedAt,
        now
      );

      if (now - updatedAt > MAX_GENERATING_STATUS_AGE_MS) {
        const timedOutAt = updatedAt + MAX_GENERATING_STATUS_AGE_MS;

        if (now - timedOutAt <= MAX_COMPLETED_STATUS_AGE_MS) {
          next[conversationId] = {
            state: "timed_out",
            requestId,
            updatedAt: timedOutAt
          };
        }
        continue;
      }

      next[conversationId] = {
        state: "generating",
        requestId,
        startedAt,
        updatedAt
      };
      continue;
    }

    if (
      (
        status.state === "completed_unread"
        || status.state === "visible_completed"
        || status.state === "stop_requested"
        || status.state === "stopped"
        || status.state === "failed"
        || status.state === "timed_out"
      )
      && requestId
      && now - updatedAt <= MAX_COMPLETED_STATUS_AGE_MS
    ) {
      next[conversationId] = {
        state: status.state,
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
    requestId: string;
    now?: number;
  }
) {
  const previous = current[input.conversationId];
  const now = input.now ?? Date.now();

  if (
    previous?.state === "generating"
    && previous.requestId === input.requestId
  ) {
    if (previous.updatedAt >= now) {
      return current;
    }

    return {
      ...current,
      [input.conversationId]: {
        ...previous,
        updatedAt: now
      }
    };
  }

  if (
    previous
    && previous.state !== "generating"
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

export function isAdminIngestConversationRequestTerminal(
  status: AdminIngestConversationRuntimeStatus | undefined
) {
  return status?.state === "completed_unread"
    || status?.state === "visible_completed"
    || status?.state === "stopped"
    || status?.state === "failed"
    || status?.state === "timed_out";
}

export function isAdminIngestConversationRequestCancelled(
  status: AdminIngestConversationRuntimeStatus | undefined,
  requestId: string
) {
  return status?.requestId === requestId
    && (
      status.state === "stop_requested"
      || status.state === "stopped"
      || status.state === "timed_out"
    );
}

function getAdminIngestConversationRuntimeStatusPrecedence(
  status: AdminIngestConversationRuntimeStatus
) {
  if (status.state === "generating") {
    return 0;
  }

  if (status.state === "completed_unread" || status.state === "visible_completed") {
    return 1;
  }

  if (status.state === "stop_requested") {
    return 2;
  }

  if (status.state === "failed") {
    return 3;
  }

  if (status.state === "timed_out") {
    return 4;
  }

  return 5;
}

export function markAdminIngestConversationRequestTerminal(
  current: AdminIngestConversationRuntimeStatusMap,
  input: {
    conversationId: string;
    requestId: string;
    state: "stop_requested" | "stopped" | "failed" | "timed_out";
    now?: number;
  }
) {
  const previous = current[input.conversationId];
  const now = input.now ?? Date.now();

  if (previous?.requestId && previous.requestId !== input.requestId) {
    return current;
  }

  if (
    previous?.requestId === input.requestId
    && (
      previous.state === "completed_unread"
      || previous.state === "visible_completed"
      || previous.state === "stopped"
      || previous.state === "failed"
      || previous.state === "timed_out"
    )
  ) {
    return current;
  }

  if (
    previous?.state === input.state
    && previous.requestId === input.requestId
  ) {
    return current;
  }

  return {
    ...current,
    [input.conversationId]: {
      state: input.state,
      requestId: input.requestId,
      updatedAt: now
    }
  };
}

export function markAdminIngestConversationVisibleCompleted(
  current: AdminIngestConversationRuntimeStatusMap,
  input: {
    conversationId: string;
    requestId: string;
    now?: number;
  }
) {
  const previous = current[input.conversationId];
  const now = input.now ?? Date.now();

  if (
    previous?.requestId === input.requestId
    && (
      previous.state === "stop_requested"
      || isAdminIngestConversationRequestTerminal(previous)
    )
  ) {
    return current;
  }

  if (
    previous?.state === "generating"
    && previous.requestId
    && previous.requestId !== input.requestId
  ) {
    return current;
  }

  if (
    previous?.state === "visible_completed"
    && previous.requestId === input.requestId
    && previous.updatedAt >= now
  ) {
    return current;
  }

  if (
    previous
    && previous.state !== "generating"
    && previous.requestId !== input.requestId
    && previous.updatedAt >= now
  ) {
    return current;
  }

  return {
    ...current,
    [input.conversationId]: {
      state: "visible_completed" as const,
      requestId: input.requestId,
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
    previous?.requestId === input.requestId
    && (
      previous.state === "stop_requested"
      || isAdminIngestConversationRequestTerminal(previous)
    )
  ) {
    return current;
  }

  if (
    previous?.state === "generating"
    && previous.requestId
    && previous.requestId !== input.requestId
  ) {
    return current;
  }

  if (input.isVisible) {
    return markAdminIngestConversationVisibleCompleted(current, {
      conversationId: input.conversationId,
      requestId: input.requestId,
      now: input.now
    });
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
    && isAdminIngestConversationRequestCancelled(previous, input.requestId)
  ) {
    return current;
  }

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

export function mergeAdminIngestConversationRuntimeStatusMaps(
  current: AdminIngestConversationRuntimeStatusMap,
  incoming: AdminIngestConversationRuntimeStatusMap
) {
  const next: AdminIngestConversationRuntimeStatusMap = {
    ...incoming
  };

  for (const [conversationId, currentStatus] of Object.entries(current)) {
    const incomingStatus = incoming[conversationId];

    if (!incomingStatus) {
      if (currentStatus.state === "visible_completed") {
        next[conversationId] = currentStatus;
      }
      continue;
    }

    if (currentStatus.requestId === incomingStatus.requestId) {
      const currentPrecedence = getAdminIngestConversationRuntimeStatusPrecedence(
        currentStatus
      );
      const incomingPrecedence = getAdminIngestConversationRuntimeStatusPrecedence(
        incomingStatus
      );

      if (
        currentPrecedence > incomingPrecedence
        || (
          currentPrecedence === incomingPrecedence
          && currentStatus.updatedAt > incomingStatus.updatedAt
        )
      ) {
        next[conversationId] = currentStatus;
      }
      continue;
    }

    if (
      currentStatus.state === "generating"
      && incomingStatus.state !== "generating"
    ) {
      next[conversationId] = currentStatus;
      continue;
    }

    if (currentStatus.updatedAt > incomingStatus.updatedAt) {
      next[conversationId] = currentStatus;
    }
  }

  return next;
}
