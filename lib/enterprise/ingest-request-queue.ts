"use client";

export type IngestQueuedRequest = {
  conversationId: string;
  prompt: string;
  createdAt: number;
};

export type IngestQueueEntry = {
  activeRequestId?: string;
  lastAttemptAt?: number;
  pending?: IngestQueuedRequest;
};

export type IngestRequestQueueState = Record<string, IngestQueueEntry>;

const DEFAULT_DEBOUNCE_MS = 800;

function readEntry(state: IngestRequestQueueState, conversationId: string): IngestQueueEntry {
  return state[conversationId] ?? {};
}

export function createIngestQueueState(): IngestRequestQueueState {
  return {};
}

export function canStartRequest(state: IngestRequestQueueState, conversationId: string) {
  return !readEntry(state, conversationId).activeRequestId;
}

export function isDuplicateSendAttempt(
  state: IngestRequestQueueState,
  conversationId: string,
  now = Date.now(),
  debounceMs = DEFAULT_DEBOUNCE_MS
) {
  const lastAttemptAt = readEntry(state, conversationId).lastAttemptAt;

  return Boolean(lastAttemptAt && now - lastAttemptAt < debounceMs);
}

export function recordSendAttempt(
  state: IngestRequestQueueState,
  conversationId: string,
  now = Date.now()
): IngestRequestQueueState {
  return {
    ...state,
    [conversationId]: {
      ...readEntry(state, conversationId),
      lastAttemptAt: now
    }
  };
}

export function enqueueRequest(
  state: IngestRequestQueueState,
  request: IngestQueuedRequest
): IngestRequestQueueState {
  return {
    ...state,
    [request.conversationId]: {
      ...readEntry(state, request.conversationId),
      pending: request
    }
  };
}

export function startRequest(
  state: IngestRequestQueueState,
  conversationId: string,
  requestId: string
): IngestRequestQueueState {
  return {
    ...state,
    [conversationId]: {
      ...readEntry(state, conversationId),
      activeRequestId: requestId,
      pending: undefined
    }
  };
}

export function completeRequest(
  state: IngestRequestQueueState,
  conversationId: string,
  requestId: string
): IngestRequestQueueState {
  const entry = readEntry(state, conversationId);

  if (entry.activeRequestId && entry.activeRequestId !== requestId) {
    return state;
  }

  return {
    ...state,
    [conversationId]: {
      ...entry,
      activeRequestId: undefined
    }
  };
}

export function failRequest(
  state: IngestRequestQueueState,
  conversationId: string,
  requestId: string
): IngestRequestQueueState {
  return completeRequest(state, conversationId, requestId);
}

export function cancelRequest(
  state: IngestRequestQueueState,
  conversationId: string,
  requestId: string
): IngestRequestQueueState {
  return completeRequest(state, conversationId, requestId);
}

export function getNextQueuedRequest(state: IngestRequestQueueState, conversationId: string) {
  return readEntry(state, conversationId).pending ?? null;
}
