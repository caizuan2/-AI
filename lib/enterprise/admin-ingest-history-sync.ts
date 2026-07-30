import type {
  IngestChatAgent,
  IngestChatMessage,
  IngestKnowledgeDraft
} from "@/lib/enterprise/mock-chat";
import type { IngestAgentConversation } from "@/lib/enterprise/mock-agent-conversations";
import {
  mergeAdminIngestConversationRuntimeStatusMaps,
  normalizeAdminIngestConversationRuntimeStatusMap,
  type AdminIngestConversationRuntimeStatusMap
} from "@/lib/enterprise/admin-ingest-conversation-runtime-status";

export type AdminIngestConversationSyncSnapshot = {
  agents: IngestChatAgent[];
  agentConversations: IngestAgentConversation[];
  activeAgentId: string;
  activeConversationId: string;
  conversationMessagesById: Record<string, IngestChatMessage[]>;
  conversationDraftsById: Record<string, IngestKnowledgeDraft>;
  conversationRuntimeStatusById: AdminIngestConversationRuntimeStatusMap;
  pinnedAgentIds: string[];
  expandedAgentIds: string[];
  expandedConversationAgentIds: string[];
};

export type AdminIngestConversationSyncResponse = {
  ok?: boolean;
  success?: boolean;
  historyScope?: string;
  revision?: number;
  currentRevision?: number;
  runtimeRevision?: number;
  state?: AdminIngestConversationSyncSnapshot;
  errorCode?: string;
  message?: string;
};

export type AdminIngestConversationSyncWriteRequest = {
  historyScope: string;
  baseRevision: number;
  state: AdminIngestConversationSyncSnapshot;
};

export type AdminIngestConversationMessageMergeRequest = {
  operation: "merge_conversation_messages";
  historyScope: string;
  conversationId: string;
  messages: IngestChatMessage[];
};

export type AdminIngestHistoryStorageKeys = {
  snapshotEnvelope: string;
  revision: string;
  snapshotFingerprint: string;
  syncedFingerprint: string;
  agents: string;
  conversations: string;
  activeAgent: string;
  activeConversation: string;
  messages: string;
  drafts: string;
  pinnedAgents: string;
  expandedAgents: string;
  expandedConversationAgents: string;
};

export type AdminIngestHistoryStorageReader = {
  getItem: (key: string) => string | null;
};

export type AdminIngestHistoryStorageWriter = AdminIngestHistoryStorageReader & {
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

export type AdminIngestScopedLocalSnapshot = {
  keys: AdminIngestHistoryStorageKeys;
  revisionMatches: boolean;
  hasUnsyncedChanges: boolean;
  state: AdminIngestConversationSyncSnapshot;
};

const HISTORY_SCOPE_PATTERN = /^[a-zA-Z0-9_-]{20,80}$/;
const HISTORY_STORAGE_VERSION = "v2";
const ACCOUNT_SCOPE_INDEX_VERSION = "v1";
const ACCOUNT_SCOPE_INDEX_KEY_BASE = "ai-kb-ingest-account-history-scope";
const EMPTY_HISTORY_MESSAGE_PREFIX = "empty-history-";
const EMPTY_HISTORY_MESSAGE_CONTENT = "暂无历史内容";

const HISTORY_STORAGE_KEY_BASES = {
  snapshotEnvelope: "ai-kb-ingest-history-snapshot",
  revision: "ai-kb-ingest-history-revision",
  snapshotFingerprint: "ai-kb-ingest-history-snapshot-fingerprint",
  syncedFingerprint: "ai-kb-ingest-history-synced-fingerprint",
  agents: "ai-kb-ingest-agents",
  conversations: "ai-kb-ingest-conversations",
  activeAgent: "ai-kb-ingest-active-agent",
  activeConversation: "ai-kb-ingest-active-conversation",
  messages: "ai-kb-ingest-conversation-messages",
  drafts: "ai-kb-ingest-conversation-drafts",
  pinnedAgents: "ai-kb-ingest-pinned-agents",
  expandedAgents: "ai-kb-ingest-expanded-agents",
  expandedConversationAgents: "ai-kb-ingest-expanded-conversation-agents"
} as const;

export function normalizeAdminIngestHistoryScope(value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : "";

  return HISTORY_SCOPE_PATTERN.test(normalized) ? normalized : "";
}

export function readAdminIngestHistoryScopeFromApiResponse(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }

  const root = value as Record<string, unknown>;
  const source = root.data && typeof root.data === "object"
    && !Array.isArray(root.data)
    ? root.data as Record<string, unknown>
    : root;

  return normalizeAdminIngestHistoryScope(source.historyScope);
}

export function createAdminIngestHistoryStorageKeys(
  historyScope: string
): AdminIngestHistoryStorageKeys | null {
  const normalizedScope = normalizeAdminIngestHistoryScope(historyScope);

  if (!normalizedScope) {
    return null;
  }

  const scopedKey = (baseKey: string) =>
    `${baseKey}:${HISTORY_STORAGE_VERSION}:${normalizedScope}`;

  return {
    snapshotEnvelope: scopedKey(HISTORY_STORAGE_KEY_BASES.snapshotEnvelope),
    revision: scopedKey(HISTORY_STORAGE_KEY_BASES.revision),
    snapshotFingerprint: scopedKey(
      HISTORY_STORAGE_KEY_BASES.snapshotFingerprint
    ),
    syncedFingerprint: scopedKey(HISTORY_STORAGE_KEY_BASES.syncedFingerprint),
    agents: scopedKey(HISTORY_STORAGE_KEY_BASES.agents),
    conversations: scopedKey(HISTORY_STORAGE_KEY_BASES.conversations),
    activeAgent: scopedKey(HISTORY_STORAGE_KEY_BASES.activeAgent),
    activeConversation: scopedKey(HISTORY_STORAGE_KEY_BASES.activeConversation),
    messages: scopedKey(HISTORY_STORAGE_KEY_BASES.messages),
    drafts: scopedKey(HISTORY_STORAGE_KEY_BASES.drafts),
    pinnedAgents: scopedKey(HISTORY_STORAGE_KEY_BASES.pinnedAgents),
    expandedAgents: scopedKey(HISTORY_STORAGE_KEY_BASES.expandedAgents),
    expandedConversationAgents: scopedKey(HISTORY_STORAGE_KEY_BASES.expandedConversationAgents)
  };
}

export function createEmptyAdminIngestConversationSyncSnapshot(): AdminIngestConversationSyncSnapshot {
  return {
    agents: [],
    agentConversations: [],
    activeAgentId: "",
    activeConversationId: "",
    conversationMessagesById: {},
    conversationDraftsById: {},
    conversationRuntimeStatusById: {},
    pinnedAgentIds: [],
    expandedAgentIds: [],
    expandedConversationAgentIds: []
  };
}

function readStoredJson<T>(
  storage: AdminIngestHistoryStorageReader,
  key: string,
  fallback: T
) {
  try {
    const raw = storage.getItem(key);

    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function readStoredString(
  storage: AdminIngestHistoryStorageReader,
  key: string
) {
  try {
    return storage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function fingerprintString(value: string) {
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    left = Math.imul(left ^ code, 0x01000193);
    right = Math.imul(right ^ code, 0x85ebca6b);
  }

  return `${(left >>> 0).toString(16).padStart(8, "0")}${(right >>> 0).toString(16).padStart(8, "0")}:${value.length}`;
}

function createAdminIngestAccountScopeIndexKey(registeredAccount: string) {
  const normalizedAccount = registeredAccount.trim().toLowerCase();

  if (!normalizedAccount) {
    return "";
  }

  return `${ACCOUNT_SCOPE_INDEX_KEY_BASE}:${ACCOUNT_SCOPE_INDEX_VERSION}:${fingerprintString(normalizedAccount)}`;
}

export function readAdminIngestAccountHistoryScope(input: {
  storage: AdminIngestHistoryStorageReader;
  registeredAccount: string;
}) {
  const key = createAdminIngestAccountScopeIndexKey(input.registeredAccount);

  return key
    ? normalizeAdminIngestHistoryScope(readStoredString(input.storage, key))
    : "";
}

export function writeAdminIngestAccountHistoryScope(input: {
  storage: Pick<AdminIngestHistoryStorageWriter, "setItem">;
  registeredAccount: string;
  historyScope: string;
}) {
  const key = createAdminIngestAccountScopeIndexKey(input.registeredAccount);
  const historyScope = normalizeAdminIngestHistoryScope(input.historyScope);

  if (!key || !historyScope) {
    return;
  }

  input.storage.setItem(key, historyScope);
}

export function readAdminIngestScopedLocalSnapshotForDisplay(input: {
  historyScope: string;
  includeDrafts: boolean;
  storage: AdminIngestHistoryStorageReader;
}): AdminIngestScopedLocalSnapshot | null {
  const keys = createAdminIngestHistoryStorageKeys(input.historyScope);

  if (!keys) {
    return null;
  }

  const rawEnvelope = readStoredString(input.storage, keys.snapshotEnvelope);

  if (!rawEnvelope) {
    return null;
  }

  try {
    const envelope = JSON.parse(rawEnvelope) as {
      revision?: unknown;
    };
    const revision = envelope.revision;

    if (
      typeof revision !== "number"
      || !Number.isSafeInteger(revision)
      || revision < 0
    ) {
      return null;
    }

    const snapshot = readAdminIngestScopedLocalSnapshot({
      historyScope: input.historyScope,
      remoteRevision: revision,
      includeDrafts: input.includeDrafts,
      storage: input.storage,
      allowMerge: false
    });

    return snapshot?.revisionMatches ? snapshot : null;
  } catch {
    return null;
  }
}

export function fingerprintAdminIngestConversationSyncSnapshot(
  input: {
    historyScope: string;
    revision: number;
    state: AdminIngestConversationSyncSnapshot;
  }
) {
  return fingerprintString(JSON.stringify({
    version: HISTORY_STORAGE_VERSION,
    historyScope: normalizeAdminIngestHistoryScope(input.historyScope),
    revision: input.revision,
    state: input.state
  }));
}

export function readAdminIngestScopedLocalSnapshot(input: {
  historyScope: string;
  remoteRevision: number;
  includeDrafts: boolean;
  storage: AdminIngestHistoryStorageReader;
  allowMerge?: boolean;
}): AdminIngestScopedLocalSnapshot | null {
  const keys = createAdminIngestHistoryStorageKeys(input.historyScope);

  if (!keys) {
    return null;
  }

  const rawEnvelope = readStoredString(input.storage, keys.snapshotEnvelope);
  const envelope = rawEnvelope
    ? (() => {
        try {
          return JSON.parse(rawEnvelope) as {
            version?: string;
            historyScope?: string;
            revision?: number;
            state?: AdminIngestConversationSyncSnapshot;
            snapshotFingerprint?: string;
            syncedFingerprint?: string;
          };
        } catch {
          return null;
        }
      })()
    : null;
  /*
   * The envelope is the atomic source of truth. Mirrored keys only support
   * pre-envelope scoped caches; they must never rescue a corrupted envelope.
   */
  const envelopeWasPresent = Boolean(rawEnvelope);
  /*
   * Keep this shape explicit so malformed browser data cannot be mistaken for
   * an account-safe snapshot.
   */
  const typedEnvelope = envelope as {
    version?: string;
    historyScope?: string;
    revision?: number;
    state?: AdminIngestConversationSyncSnapshot;
    snapshotFingerprint?: string;
    syncedFingerprint?: string;
  } | null;
  const envelopeScope = normalizeAdminIngestHistoryScope(
    typedEnvelope?.historyScope
  );
  const envelopeRevision = typedEnvelope?.revision;
  const envelopeState = typedEnvelope?.state
    ? normalizeAdminIngestConversationSyncSnapshot(typedEnvelope.state, {
        includeDrafts: input.includeDrafts
      })
    : null;
  const envelopeFingerprint = envelopeState
    && typeof envelopeRevision === "number"
    && Number.isSafeInteger(envelopeRevision)
    ? fingerprintAdminIngestConversationSyncSnapshot({
        historyScope: envelopeScope,
        revision: envelopeRevision,
        state: envelopeState
      })
    : "";
  const envelopeIsValid = Boolean(
    typedEnvelope
    && typedEnvelope.version === HISTORY_STORAGE_VERSION
    && envelopeScope === normalizeAdminIngestHistoryScope(input.historyScope)
    && envelopeRevision === input.remoteRevision
    && envelopeFingerprint
    && typedEnvelope.snapshotFingerprint === envelopeFingerprint
  );

  if (envelopeIsValid && envelopeState) {
    return {
      keys,
      revisionMatches: true,
      hasUnsyncedChanges:
        typedEnvelope?.syncedFingerprint !== envelopeFingerprint,
      state: envelopeState
    };
  }

  if (envelopeWasPresent) {
    return {
      keys,
      revisionMatches: false,
      hasUnsyncedChanges: false,
      state: createEmptyAdminIngestConversationSyncSnapshot()
    };
  }

  const storedRevision = Number(readStoredString(input.storage, keys.revision));
  const revisionMatches = input.allowMerge !== false
    && Number.isSafeInteger(storedRevision)
    && storedRevision === input.remoteRevision;

  if (!revisionMatches) {
    return {
      keys,
      revisionMatches: false,
      hasUnsyncedChanges: false,
      state: createEmptyAdminIngestConversationSyncSnapshot()
    };
  }

  const state = normalizeAdminIngestConversationSyncSnapshot({
      agents: readStoredJson<IngestChatAgent[]>(input.storage, keys.agents, []),
      agentConversations: readStoredJson<IngestAgentConversation[]>(
        input.storage,
        keys.conversations,
        []
      ),
      activeAgentId: readStoredString(input.storage, keys.activeAgent),
      activeConversationId: readStoredString(
        input.storage,
        keys.activeConversation
      ),
      conversationMessagesById: readStoredJson<
        Record<string, IngestChatMessage[]>
      >(input.storage, keys.messages, {}),
      conversationDraftsById: input.includeDrafts
        ? readStoredJson<Record<string, IngestKnowledgeDraft>>(
            input.storage,
            keys.drafts,
            {}
          )
        : {},
      pinnedAgentIds: readStoredJson<string[]>(
        input.storage,
        keys.pinnedAgents,
        []
      ),
      expandedAgentIds: readStoredJson<string[]>(
        input.storage,
        keys.expandedAgents,
        []
      ),
      expandedConversationAgentIds: readStoredJson<string[]>(
        input.storage,
        keys.expandedConversationAgents,
        []
      )
    }, {
      includeDrafts: input.includeDrafts
    });
  const stateFingerprint = fingerprintAdminIngestConversationSyncSnapshot({
    historyScope: input.historyScope,
    revision: storedRevision,
    state
  });
  const storedSyncedFingerprint = readStoredString(
    input.storage,
    keys.syncedFingerprint
  );
  const storedSnapshotFingerprint = readStoredString(
    input.storage,
    keys.snapshotFingerprint
  ) || storedSyncedFingerprint;
  const fingerprintMatches = Boolean(storedSnapshotFingerprint)
    && storedSnapshotFingerprint === stateFingerprint;

  return {
    keys,
    revisionMatches: fingerprintMatches,
    hasUnsyncedChanges: fingerprintMatches
      && storedSyncedFingerprint !== stateFingerprint,
    state: fingerprintMatches
      ? state
      : createEmptyAdminIngestConversationSyncSnapshot()
  };
}

export function writeAdminIngestScopedLocalSnapshot(input: {
  storage: AdminIngestHistoryStorageWriter;
  historyScope: string;
  keys: AdminIngestHistoryStorageKeys;
  revision: number;
  state: AdminIngestConversationSyncSnapshot;
  markSynced?: boolean;
}) {
  const {
    storage,
    historyScope,
    keys,
    revision,
    state,
    markSynced = false
  } = input;
  const snapshotFingerprint = fingerprintAdminIngestConversationSyncSnapshot({
    historyScope,
    revision,
    state
  });
  const previousEnvelope = readStoredJson<{
    syncedFingerprint?: string;
  } | null>(storage, keys.snapshotEnvelope, null);
  const previousSyncedFingerprint = previousEnvelope?.syncedFingerprint
    || readStoredString(storage, keys.syncedFingerprint);
  const syncedFingerprint = markSynced
    ? snapshotFingerprint
    : previousSyncedFingerprint;

  storage.setItem(keys.snapshotEnvelope, JSON.stringify({
    version: HISTORY_STORAGE_VERSION,
    historyScope: normalizeAdminIngestHistoryScope(historyScope),
    revision,
    state,
    snapshotFingerprint,
    syncedFingerprint
  }));

  storage.setItem(keys.agents, JSON.stringify(state.agents));
  storage.setItem(
    keys.conversations,
    JSON.stringify(state.agentConversations)
  );
  if (state.activeAgentId) {
    storage.setItem(keys.activeAgent, state.activeAgentId);
  } else {
    storage.removeItem(keys.activeAgent);
  }
  if (state.activeConversationId) {
    storage.setItem(keys.activeConversation, state.activeConversationId);
  } else {
    storage.removeItem(keys.activeConversation);
  }
  storage.setItem(
    keys.messages,
    JSON.stringify(state.conversationMessagesById)
  );
  storage.setItem(
    keys.drafts,
    JSON.stringify(state.conversationDraftsById)
  );
  storage.setItem(keys.pinnedAgents, JSON.stringify(state.pinnedAgentIds));
  storage.setItem(keys.expandedAgents, JSON.stringify(state.expandedAgentIds));
  storage.setItem(
    keys.expandedConversationAgents,
    JSON.stringify(state.expandedConversationAgentIds)
  );
  storage.setItem(keys.revision, JSON.stringify(revision));

  storage.setItem(
    keys.snapshotFingerprint,
    snapshotFingerprint
  );
  if (markSynced) {
    storage.setItem(keys.syncedFingerprint, snapshotFingerprint);
  }
}

export function hasAdminIngestHistoryScopeChanged(
  currentScope: unknown,
  nextScope: unknown
) {
  const normalizedCurrent = normalizeAdminIngestHistoryScope(currentScope);
  const normalizedNext = normalizeAdminIngestHistoryScope(nextScope);

  return Boolean(
    normalizedCurrent
    && normalizedNext
    && normalizedCurrent !== normalizedNext
  );
}

export function clearAdminIngestScopedLocalSnapshot(input: {
  storage: Pick<AdminIngestHistoryStorageWriter, "removeItem">;
  keys: AdminIngestHistoryStorageKeys;
}) {
  for (const key of Object.values(input.keys)) {
    input.storage.removeItem(key);
  }
}

function normalizeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function normalizeRecord<T>(value: unknown): Record<string, T> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, T>
    : {};
}

export function countEffectiveAdminIngestHistoryMessages(
  messages: readonly IngestChatMessage[] | null | undefined
) {
  if (!Array.isArray(messages)) {
    return 0;
  }

  return messages.filter((message) => {
    if (!message || typeof message !== "object") {
      return false;
    }

    const candidate = message as Partial<IngestChatMessage>;
    const content = typeof candidate.content === "string"
      ? candidate.content.trim()
      : "";
    const id = typeof candidate.id === "string" ? candidate.id : "";

    return Boolean(
      content
      && content !== EMPTY_HISTORY_MESSAGE_CONTENT
      && candidate.status !== "failed"
      && !id.startsWith(EMPTY_HISTORY_MESSAGE_PREFIX)
    );
  }).length;
}

export function reconcileAdminIngestConversationMessageCounts(
  conversations: IngestAgentConversation[],
  messagesByConversationId: Record<string, IngestChatMessage[]>
): IngestAgentConversation[] {
  let changed = false;
  const reconciled = conversations.map((conversation) => {
    const messageCount = countEffectiveAdminIngestHistoryMessages(
      messagesByConversationId[conversation.id]
    );

    if (conversation.messageCount === messageCount) {
      return conversation;
    }

    changed = true;

    return {
      ...conversation,
      messageCount
    };
  });

  return changed ? reconciled : conversations;
}

function serializedValuesMatch(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isCompletedMessageWithContent(message: IngestChatMessage) {
  return message.status === "completed"
    && typeof message.content === "string"
    && message.content.trim().length > 0;
}

function hasValidMessageIdentity(
  message: IngestChatMessage
): message is IngestChatMessage {
  return Boolean(
    message
    && typeof message === "object"
    && typeof message.id === "string"
    && message.id.trim()
    && typeof message.content === "string"
  );
}

function chooseConcurrentMessage(
  local: IngestChatMessage,
  remote: IngestChatMessage
) {
  const localIsCompleted = isCompletedMessageWithContent(local);
  const remoteIsCompleted = isCompletedMessageWithContent(remote);

  if (localIsCompleted !== remoteIsCompleted) {
    return localIsCompleted ? local : remote;
  }

  const localHasContent = typeof local.content === "string"
    && local.content.trim().length > 0;
  const remoteHasContent = typeof remote.content === "string"
    && remote.content.trim().length > 0;

  if (localHasContent !== remoteHasContent) {
    return localHasContent ? local : remote;
  }

  /*
   * When two completed copies disagree, keep the already-persisted remote
   * original. A base-aware merge below still accepts a legitimate local
   * completion when the remote copy is unchanged from the shared base.
   */
  return remote;
}

export function mergeAdminIngestConversationMessages(
  remoteMessages: readonly IngestChatMessage[],
  localMessages: readonly IngestChatMessage[],
  baseMessages: readonly IngestChatMessage[] = []
) {
  const safeBaseMessages = baseMessages.filter(hasValidMessageIdentity);
  const safeLocalMessages = localMessages.filter(hasValidMessageIdentity);
  const safeRemoteMessages = remoteMessages.filter(hasValidMessageIdentity);
  const baseById = new Map(
    safeBaseMessages.map((message) => [message.id, message])
  );
  const localById = new Map(
    safeLocalMessages.map((message) => [message.id, message])
  );
  const remoteById = new Map(
    safeRemoteMessages.map((message) => [message.id, message])
  );
  const orderedIds = [
    ...safeRemoteMessages.map((message) => message.id),
    ...safeLocalMessages.map((message) => message.id)
  ].filter((id, index, values) => values.indexOf(id) === index);

  return orderedIds.flatMap((id) => {
    const local = localById.get(id);
    const remote = remoteById.get(id);

    if (!local) {
      return remote ? [remote] : [];
    }

    if (!remote) {
      return [local];
    }

    if (serializedValuesMatch(local, remote)) {
      return [local];
    }

    const base = baseById.get(id);

    if (base && serializedValuesMatch(local, base)) {
      return [remote];
    }

    if (base && serializedValuesMatch(remote, base)) {
      return [local];
    }

    return [chooseConcurrentMessage(local, remote)];
  });
}

function mergeEntityArrayById<T extends { id: string }>(
  base: readonly T[],
  local: readonly T[],
  remote: readonly T[]
) {
  const baseById = new Map(base.map((item) => [item.id, item]));
  const localById = new Map(local.map((item) => [item.id, item]));
  const remoteById = new Map(remote.map((item) => [item.id, item]));
  const orderedIds = [
    ...local.map((item) => item.id),
    ...remote.map((item) => item.id)
  ].filter((id, index, values) => values.indexOf(id) === index);

  return orderedIds.flatMap((id) => {
    const baseItem = baseById.get(id);
    const localItem = localById.get(id);
    const remoteItem = remoteById.get(id);

    if (baseItem && (!localItem || !remoteItem)) {
      return [];
    }

    if (!localItem) {
      return remoteItem ? [remoteItem] : [];
    }

    if (!remoteItem) {
      return [localItem];
    }

    if (baseItem && serializedValuesMatch(localItem, baseItem)) {
      return [remoteItem];
    }

    if (baseItem && serializedValuesMatch(remoteItem, baseItem)) {
      return [localItem];
    }

    return [localItem];
  });
}

function mergeRecordThreeWay<T>(
  base: Record<string, T>,
  local: Record<string, T>,
  remote: Record<string, T>
) {
  const result: Record<string, T> = {};
  const keys = new Set([
    ...Object.keys(base),
    ...Object.keys(local),
    ...Object.keys(remote)
  ]);

  for (const key of Array.from(keys)) {
    const baseValue = base[key];
    const localValue = local[key];
    const remoteValue = remote[key];

    if (baseValue !== undefined && (
      localValue === undefined || remoteValue === undefined
    )) {
      continue;
    }

    if (localValue === undefined) {
      if (remoteValue !== undefined) {
        result[key] = remoteValue;
      }
      continue;
    }

    if (remoteValue === undefined) {
      result[key] = localValue;
      continue;
    }

    result[key] = baseValue !== undefined
      && serializedValuesMatch(localValue, baseValue)
      ? remoteValue
      : localValue;
  }

  return result;
}

export function mergeAdminIngestConversationSyncConflict(input: {
  base: AdminIngestConversationSyncSnapshot;
  local: AdminIngestConversationSyncSnapshot;
  remote: AdminIngestConversationSyncSnapshot;
  includeDrafts: boolean;
}) {
  const base = normalizeAdminIngestConversationSyncSnapshot(input.base, {
    includeDrafts: input.includeDrafts
  });
  const local = normalizeAdminIngestConversationSyncSnapshot(input.local, {
    includeDrafts: input.includeDrafts
  });
  const remote = normalizeAdminIngestConversationSyncSnapshot(input.remote, {
    includeDrafts: input.includeDrafts
  });
  const agentConversations = mergeEntityArrayById(
    base.agentConversations,
    local.agentConversations,
    remote.agentConversations
  );
  const agents = mergeEntityArrayById(base.agents, local.agents, remote.agents);
  const activeAgentId = agents.some(
    (agent) => agent.id === local.activeAgentId
  )
    ? local.activeAgentId
    : agents.some((agent) => agent.id === remote.activeAgentId)
      ? remote.activeAgentId
      : agents[0]?.id ?? "";
  const activeConversationId = agentConversations.some(
    (conversation) => (
      conversation.id === local.activeConversationId
      && conversation.status !== "archived"
    )
  )
    ? local.activeConversationId
    : agentConversations.some((conversation) => (
        conversation.id === remote.activeConversationId
        && conversation.status !== "archived"
      ))
      ? remote.activeConversationId
      : agentConversations.find((conversation) => (
          conversation.agentId === activeAgentId
          && conversation.status !== "archived"
        ))?.id ?? "";
  const validConversationIds = new Set(
    agentConversations.map((conversation) => conversation.id)
  );
  const conversationMessagesById: Record<string, IngestChatMessage[]> = {};

  for (const conversationId of Array.from(validConversationIds)) {
    const mergedMessages = mergeAdminIngestConversationMessages(
      remote.conversationMessagesById[conversationId] ?? [],
      local.conversationMessagesById[conversationId] ?? [],
      base.conversationMessagesById[conversationId] ?? []
    );

    if (mergedMessages.length > 0) {
      conversationMessagesById[conversationId] = mergedMessages;
    }
  }

  return normalizeAdminIngestConversationSyncSnapshot({
    agents,
    agentConversations,
    activeAgentId,
    activeConversationId,
    conversationMessagesById,
    conversationDraftsById: input.includeDrafts
      ? mergeRecordThreeWay(
          base.conversationDraftsById,
          local.conversationDraftsById,
          remote.conversationDraftsById
        )
      : {},
    conversationRuntimeStatusById:
      mergeAdminIngestConversationRuntimeStatusMaps(
        remote.conversationRuntimeStatusById,
        local.conversationRuntimeStatusById
      ),
    pinnedAgentIds: Array.from(new Set([
      ...remote.pinnedAgentIds,
      ...local.pinnedAgentIds
    ])),
    /*
     * Expansion is a per-device presentation choice. Keep the current page
     * stable instead of letting another device open or close its drawers.
     */
    expandedAgentIds: local.expandedAgentIds,
    expandedConversationAgentIds: local.expandedConversationAgentIds
  }, {
    includeDrafts: input.includeDrafts
  });
}

export function normalizeAdminIngestConversationSyncSnapshot(
  value: unknown,
  options: { includeDrafts: boolean }
): AdminIngestConversationSyncSnapshot {
  const source = value && typeof value === "object"
    ? value as Partial<AdminIngestConversationSyncSnapshot>
    : {};
  const conversationMessagesById = normalizeRecord<IngestChatMessage[]>(
    source.conversationMessagesById
  );
  const agentConversations = reconcileAdminIngestConversationMessageCounts(
    normalizeArray<IngestAgentConversation>(source.agentConversations),
    conversationMessagesById
  );

  return {
    agents: normalizeArray<IngestChatAgent>(source.agents),
    agentConversations,
    activeAgentId: typeof source.activeAgentId === "string" ? source.activeAgentId : "",
    activeConversationId: typeof source.activeConversationId === "string"
      ? source.activeConversationId
      : "",
    conversationMessagesById,
    conversationDraftsById: options.includeDrafts
      ? normalizeRecord<IngestKnowledgeDraft>(source.conversationDraftsById)
      : {},
    conversationRuntimeStatusById:
      normalizeAdminIngestConversationRuntimeStatusMap(
        source.conversationRuntimeStatusById
      ),
    pinnedAgentIds: normalizeArray<string>(source.pinnedAgentIds),
    expandedAgentIds: normalizeArray<string>(source.expandedAgentIds),
    expandedConversationAgentIds: normalizeArray<string>(
      source.expandedConversationAgentIds
    )
  };
}

export function hasAdminIngestConversationSyncContent(
  state: AdminIngestConversationSyncSnapshot | null | undefined
) {
  return Boolean(
    state
    && (
      state.agents.length
      || state.agentConversations.length
      || state.pinnedAgentIds.length
      || state.expandedAgentIds.length
      || state.expandedConversationAgentIds.length
      || Object.keys(state.conversationMessagesById).length
      || Object.keys(state.conversationDraftsById).length
      || Object.keys(state.conversationRuntimeStatusById).length
    )
  );
}
