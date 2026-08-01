import "server-only";

import { createHash, randomUUID } from "node:crypto";
import {
  createEmptyAdminIngestConversationSyncSnapshot,
  mergeAdminIngestConversationMessages,
  normalizeAdminIngestConversationSyncSnapshot,
  reconcileAdminIngestConversationMessageCounts,
  type AdminIngestConversationSyncSnapshot
} from "@/lib/enterprise/admin-ingest-history-sync";
import type { IngestChatMessage } from "@/lib/enterprise/mock-chat";
import type { IngestAgentConversation } from "@/lib/enterprise/mock-agent-conversations";
import {
  clearAdminIngestConversationRuntimeStatus,
  markAdminIngestConversationGenerating,
  markAdminIngestConversationVisibleCompleted,
  mergeAdminIngestConversationRuntimeStatusMaps,
  normalizeAdminIngestConversationRuntimeStatusMap,
  type AdminIngestConversationRuntimeStatusMap
} from "@/lib/enterprise/admin-ingest-conversation-runtime-status";

export type AdminIngestConversationSyncState = AdminIngestConversationSyncSnapshot & {
  source: "admin-ingest-conversation-sync-v2";
  version: 2;
  ownerUserId: string;
  revision: number;
  updatedAt: number;
};

export type AdminIngestConversationSyncReadResult = {
  state: AdminIngestConversationSyncState;
  revision: number;
  exists: boolean;
};

export class AdminIngestConversationSyncRevisionConflictError extends Error {
  readonly code = "INGEST_HISTORY_REVISION_CONFLICT";
  readonly statusCode = 409;

  constructor(readonly currentRevision: number) {
    super("历史记录已在其他页面更新，请刷新后再继续。");
    this.name = "AdminIngestConversationSyncRevisionConflictError";
  }
}

const ownerWriteQueues = new Map<string, Promise<void>>();

export function createEmptyAdminIngestConversationSyncState(
  ownerUserId: string
): AdminIngestConversationSyncState {
  return {
    source: "admin-ingest-conversation-sync-v2",
    version: 2,
    ownerUserId,
    revision: 0,
    updatedAt: 0,
    ...createEmptyAdminIngestConversationSyncSnapshot()
  };
}

function readEnvConversationDir(): string {
  return (
    process.env.ADMIN_INGEST_CONVERSATION_DIR
    || process.env.AI_KB_ADMIN_INGEST_CONVERSATION_DIR
    || ""
  ).trim();
}

function safeOwnerId(ownerUserId: string) {
  return ownerUserId.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "anonymous";
}

function isRollbackCompatibleLegacyOwner(ownerUserId: string) {
  return ownerUserId.length > 0
    && ownerUserId.length <= 120
    && safeOwnerId(ownerUserId) === ownerUserId;
}

function ownerFileDigest(ownerUserId: string) {
  return createHash("sha256").update(ownerUserId, "utf8").digest("hex");
}

async function getAdminIngestConversationDir() {
  const path = await import("node:path");
  const envDir = readEnvConversationDir();

  if (envDir) {
    return path.isAbsolute(envDir) ? envDir : path.resolve(process.cwd(), envDir);
  }

  if (
    process.platform !== "win32"
    && process.cwd().startsWith("/var/www/ai-knowledge-main-")
  ) {
    return "/var/www/ai-knowledge-shared/admin-ingest/conversations";
  }

  return path.join(process.cwd(), "artifacts", "admin-ingest", "conversations");
}

async function getConversationSyncFilePath(ownerUserId: string) {
  const path = await import("node:path");
  const dir = await getAdminIngestConversationDir();

  return path.join(dir, `user-${ownerFileDigest(ownerUserId)}.json`);
}

async function getLegacyConversationSyncFilePath(ownerUserId: string) {
  const path = await import("node:path");
  const dir = await getAdminIngestConversationDir();

  return path.join(dir, `user-${safeOwnerId(ownerUserId)}.json`);
}

function normalizePersistedState(
  ownerUserId: string,
  value: unknown,
  options: { fileExists: boolean }
): AdminIngestConversationSyncState {
  const source = value && typeof value === "object"
    ? value as {
        revision?: unknown;
        updatedAt?: unknown;
      }
    : {};
  const snapshot = normalizeAdminIngestConversationSyncSnapshot(value, {
    includeDrafts: true
  });
  const legacyRevision = options.fileExists ? 1 : 0;
  const revision = typeof source.revision === "number"
    && Number.isSafeInteger(source.revision)
    && source.revision >= legacyRevision
    ? source.revision
    : legacyRevision;
  const updatedAt = typeof source.updatedAt === "number"
    && Number.isFinite(source.updatedAt)
    && source.updatedAt >= 0
    ? source.updatedAt
    : 0;

  return {
    source: "admin-ingest-conversation-sync-v2",
    version: 2,
    ownerUserId,
    revision,
    updatedAt,
    ...snapshot
  };
}

function isMissingFileError(error: unknown) {
  return Boolean(
    error
    && typeof error === "object"
    && "code" in error
    && (error as { code?: unknown }).code === "ENOENT"
  );
}

type PersistedStateCandidate = {
  state: AdminIngestConversationSyncState;
  hasExplicitRevision: boolean;
};

async function readPersistedStateCandidate(
  filePath: string,
  ownerUserId: string,
  options: {
    ignoreOwnerMismatch: boolean;
  }
): Promise<PersistedStateCandidate | null> {
  const fs = await import("node:fs/promises");

  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const persistedOwnerId = parsed && typeof parsed === "object"
      && !Array.isArray(parsed)
      && typeof (parsed as { ownerUserId?: unknown }).ownerUserId === "string"
      ? (parsed as { ownerUserId: string }).ownerUserId
      : "";

    if (persistedOwnerId !== ownerUserId) {
      if (options.ignoreOwnerMismatch) {
        return null;
      }

      throw new Error("INGEST_HISTORY_OWNER_MISMATCH");
    }

    return {
      state: normalizePersistedState(ownerUserId, parsed, {
        fileExists: true
      }),
      hasExplicitRevision: Boolean(
        parsed
        && typeof parsed === "object"
        && !Array.isArray(parsed)
        && typeof (parsed as { revision?: unknown }).revision === "number"
        && Number.isSafeInteger(
          (parsed as { revision: number }).revision
        )
      )
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }

    throw error;
  }
}

async function readStateFromDisk(
  ownerUserId: string
): Promise<AdminIngestConversationSyncReadResult> {
  const canonicalPath = await getConversationSyncFilePath(ownerUserId);
  const legacyPath = await getLegacyConversationSyncFilePath(ownerUserId);
  const canonicalCandidate = await readPersistedStateCandidate(
    canonicalPath,
    ownerUserId,
    {
      ignoreOwnerMismatch: false
    }
  );
  let legacyCandidate: PersistedStateCandidate | null = null;

  if (!canonicalCandidate || isRollbackCompatibleLegacyOwner(ownerUserId)) {
    try {
      legacyCandidate = await readPersistedStateCandidate(
        legacyPath,
        ownerUserId,
        {
          ignoreOwnerMismatch: true
        }
      );
    } catch (error) {
      if (!canonicalCandidate) {
        throw error;
      }
    }
  }

  let selectedCandidate: PersistedStateCandidate | null =
    canonicalCandidate ?? legacyCandidate;

  if (canonicalCandidate && legacyCandidate) {
    if (
      legacyCandidate.state.updatedAt
      > canonicalCandidate.state.updatedAt
    ) {
      selectedCandidate = legacyCandidate;

      if (
        !legacyCandidate.hasExplicitRevision
        || legacyCandidate.state.revision
          <= canonicalCandidate.state.revision
      ) {
        selectedCandidate.state.revision =
          canonicalCandidate.state.revision + 1;
      }
    } else if (
      canonicalCandidate.state.updatedAt
      > legacyCandidate.state.updatedAt
    ) {
      selectedCandidate = canonicalCandidate;
    } else {
      selectedCandidate = legacyCandidate.state.revision
        > canonicalCandidate.state.revision
        ? legacyCandidate
        : canonicalCandidate;
    }
  }

  if (selectedCandidate) {
    return {
      state: selectedCandidate.state,
      revision: selectedCandidate.state.revision,
      exists: true
    };
  }

  const state = createEmptyAdminIngestConversationSyncState(ownerUserId);

  return {
    state,
    revision: 0,
    exists: false
  };
}

type OwnerFileLockMetadata = {
  pid: number;
  createdAt: number;
  token: string | null;
};

function parseOwnerFileLockMetadata(value: string): OwnerFileLockMetadata | null {
  try {
    const parsed = JSON.parse(value) as Partial<OwnerFileLockMetadata>;

    if (
      !Number.isSafeInteger(parsed.pid)
      || Number(parsed.pid) <= 0
      || !Number.isFinite(parsed.createdAt)
      || Number(parsed.createdAt) <= 0
      || (
        parsed.token !== undefined
        && (
          typeof parsed.token !== "string"
          || parsed.token.length === 0
        )
      )
    ) {
      return null;
    }

    return {
      pid: Number(parsed.pid),
      createdAt: Number(parsed.createdAt),
      token: typeof parsed.token === "string" ? parsed.token : null
    };
  } catch {
    return null;
  }
}

async function readOwnerFileLockMetadata(lockPath: string) {
  const fs = await import("node:fs/promises");

  try {
    return parseOwnerFileLockMetadata(await fs.readFile(lockPath, "utf8"));
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error
      ? (error as { code?: unknown }).code
      : "";

    return code !== "ESRCH";
  }
}

async function removeDeadStaleOwnerFileLock(lockPath: string) {
  const fs = await import("node:fs/promises");
  const lockStat = await fs.stat(lockPath).catch(() => null);

  if (!lockStat || Date.now() - lockStat.mtimeMs <= 60_000) {
    return false;
  }

  const metadata = await readOwnerFileLockMetadata(lockPath);

  if (!metadata) {
    const latestStat = await fs.stat(lockPath).catch(() => null);

    if (
      !latestStat
      || latestStat.mtimeMs !== lockStat.mtimeMs
      || latestStat.size !== lockStat.size
      || Date.now() - latestStat.mtimeMs <= 60_000
    ) {
      return false;
    }

    return fs.unlink(lockPath).then(
      () => true,
      () => false
    );
  }

  if (isProcessAlive(metadata.pid)) {
    return false;
  }

  const latestMetadata = await readOwnerFileLockMetadata(lockPath);

  if (
    !latestMetadata
    || (
      metadata.token
        ? latestMetadata.token !== metadata.token
        : (
          latestMetadata.pid !== metadata.pid
          || latestMetadata.createdAt !== metadata.createdAt
        )
    )
  ) {
    return false;
  }

  return fs.unlink(lockPath).then(
    () => true,
    () => false
  );
}

async function withOwnerFileLock<T>(
  ownerUserId: string,
  action: () => Promise<T>
) {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const filePath = await getConversationSyncFilePath(ownerUserId);
  const lockPath = `${filePath}.lock`;
  const startedAt = Date.now();
  const lockToken = randomUUID();
  let lockHandle: Awaited<ReturnType<typeof fs.open>> | null = null;

  await fs.mkdir(path.dirname(filePath), { recursive: true });

  while (!lockHandle) {
    try {
      const candidateHandle = await fs.open(lockPath, "wx");

      try {
        await candidateHandle.writeFile(
          `${JSON.stringify({
            pid: process.pid,
            createdAt: Date.now(),
            token: lockToken
          })}\n`,
          "utf8"
        );
        await candidateHandle.sync();
        lockHandle = candidateHandle;
      } catch (error) {
        await candidateHandle.close().catch(() => undefined);
        await fs.unlink(lockPath).catch(() => undefined);
        throw error;
      }
    } catch (error) {
      if (
        !error
        || typeof error !== "object"
        || !("code" in error)
        || (error as { code?: unknown }).code !== "EEXIST"
      ) {
        throw error;
      }

      if (await removeDeadStaleOwnerFileLock(lockPath)) {
        continue;
      }

      if (Date.now() - startedAt > 10_000) {
        throw new Error("INGEST_HISTORY_LOCK_TIMEOUT");
      }

      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  }

  try {
    return await action();
  } finally {
    await lockHandle.close().catch(() => undefined);
    const currentMetadata = await readOwnerFileLockMetadata(lockPath);

    if (currentMetadata?.token === lockToken) {
      await fs.unlink(lockPath).catch(() => undefined);
    }
  }
}

async function withOwnerWriteLock<T>(
  ownerUserId: string,
  action: () => Promise<T>
) {
  const previous = ownerWriteQueues.get(ownerUserId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => gate);

  ownerWriteQueues.set(ownerUserId, queued);
  await previous;

  try {
    return await action();
  } finally {
    release();

    if (ownerWriteQueues.get(ownerUserId) === queued) {
      ownerWriteQueues.delete(ownerUserId);
    }
  }
}

async function replaceFileAtomically(filePath: string, content: string) {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  let temporaryHandle: Awaited<ReturnType<typeof fs.open>> | null = null;

  await fs.mkdir(path.dirname(filePath), { recursive: true });

  try {
    temporaryHandle = await fs.open(temporaryPath, "wx");
    await temporaryHandle.writeFile(content, "utf8");
    await temporaryHandle.sync();
    await temporaryHandle.close();
    temporaryHandle = null;

    try {
      await fs.rename(temporaryPath, filePath);
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error
        ? (error as { code?: unknown }).code
        : "";

      if (
        process.platform !== "win32"
        || (code !== "EEXIST" && code !== "EPERM")
      ) {
        throw error;
      }

      const backupPath = `${filePath}.${process.pid}.${randomUUID()}.bak`;
      let hasBackup = false;

      try {
        try {
          await fs.rename(filePath, backupPath);
          hasBackup = true;
        } catch (backupError) {
          if (!isMissingFileError(backupError)) {
            throw backupError;
          }
        }

        await fs.rename(temporaryPath, filePath);

        if (hasBackup) {
          await fs.unlink(backupPath).catch(() => undefined);
        }
      } catch (replacementError) {
        if (hasBackup) {
          await fs.rename(backupPath, filePath).catch(() => undefined);
        }

        throw replacementError;
      }
    }
  } finally {
    await temporaryHandle?.close().catch(() => undefined);
    await fs.unlink(temporaryPath).catch(() => undefined);
  }
}

export async function readAdminIngestConversationSyncSnapshot(
  ownerUserId: string
) {
  return readStateFromDisk(ownerUserId);
}

export async function readAdminIngestConversationSyncState(ownerUserId: string) {
  return (await readStateFromDisk(ownerUserId)).state;
}

export async function writeAdminIngestConversationSyncState(
  ownerUserId: string,
  state: unknown,
  options: {
    expectedRevision?: number;
    includeDrafts?: boolean;
  } = {}
) {
  return withOwnerWriteLock(ownerUserId, () => withOwnerFileLock(ownerUserId, async () => {
    const current = await readStateFromDisk(ownerUserId);

    if (
      options.expectedRevision !== undefined
      && options.expectedRevision !== current.revision
    ) {
      throw new AdminIngestConversationSyncRevisionConflictError(
        current.revision
      );
    }

    const includeDrafts = options.includeDrafts ?? true;
    const snapshot = normalizeAdminIngestConversationSyncSnapshot(state, {
      includeDrafts
    });

    if (!includeDrafts) {
      snapshot.conversationDraftsById = {
        ...current.state.conversationDraftsById
      };
    }
    snapshot.conversationRuntimeStatusById =
      mergeAdminIngestConversationRuntimeStatusMaps(
        current.state.conversationRuntimeStatusById,
        snapshot.conversationRuntimeStatusById
      );
    const nextRevision = current.revision + 1;
    const normalized: AdminIngestConversationSyncState = {
      source: "admin-ingest-conversation-sync-v2",
      version: 2,
      ownerUserId,
      revision: nextRevision,
      updatedAt: Math.max(Date.now(), current.state.updatedAt + 1),
      ...snapshot
    };
    const filePath = await getConversationSyncFilePath(ownerUserId);
    const serializedState = `${JSON.stringify(normalized, null, 2)}\n`;

    if (isRollbackCompatibleLegacyOwner(ownerUserId)) {
      await replaceFileAtomically(
        await getLegacyConversationSyncFilePath(ownerUserId),
        serializedState
      );
    }

    await replaceFileAtomically(filePath, serializedState);

    return normalized;
  }));
}

export async function mergeAdminIngestConversationSyncMessages(
  ownerUserId: string,
  input: {
    conversationId: string;
    messages: IngestChatMessage[];
    conversation?: IngestAgentConversation;
    includeDrafts?: boolean;
  }
) {
  const conversationId = input.conversationId.trim();

  if (!conversationId || !Array.isArray(input.messages)) {
    throw new Error("INGEST_HISTORY_MESSAGE_MERGE_INVALID");
  }

  return withOwnerWriteLock(ownerUserId, () => withOwnerFileLock(ownerUserId, async () => {
    const current = await readStateFromDisk(ownerUserId);
    const sanitized = normalizeAdminIngestConversationSyncSnapshot({
      conversationMessagesById: {
        [conversationId]: input.messages
      }
    }, {
      includeDrafts: false
    });
    const incomingMessages =
      sanitized.conversationMessagesById[conversationId] ?? [];
    const incomingConversation = input.conversation
      ? normalizeAdminIngestConversationSyncSnapshot({
          agentConversations: [input.conversation]
        }, {
          includeDrafts: false
        }).agentConversations.find(
          (conversation) => conversation.id === conversationId
        )
      : undefined;
    const nextMessages = mergeAdminIngestConversationMessages(
      current.state.conversationMessagesById[conversationId] ?? [],
      incomingMessages
    );
    const conversationExists = current.state.agentConversations.some(
      (conversation) => conversation.id === conversationId
    );
    const messagesUnchanged = JSON.stringify(nextMessages)
      === JSON.stringify(
        current.state.conversationMessagesById[conversationId] ?? []
      );

    if (messagesUnchanged && (conversationExists || !incomingConversation)) {
      return current.state;
    }

    const conversationMessagesById = {
      ...current.state.conversationMessagesById,
      [conversationId]: nextMessages
    };
    const conversationsWithIncoming = !conversationExists && incomingConversation
      ? [...current.state.agentConversations, incomingConversation]
      : current.state.agentConversations;
    const agentConversations =
      reconcileAdminIngestConversationMessageCounts(
        conversationsWithIncoming,
        conversationMessagesById
      );
    const nextRevision = current.revision + 1;
    const normalized: AdminIngestConversationSyncState = {
      ...current.state,
      source: "admin-ingest-conversation-sync-v2",
      version: 2,
      ownerUserId,
      revision: nextRevision,
      updatedAt: Math.max(Date.now(), current.state.updatedAt + 1),
      agentConversations,
      conversationMessagesById
    };
    const filePath = await getConversationSyncFilePath(ownerUserId);
    const serializedState = `${JSON.stringify(normalized, null, 2)}\n`;

    if (isRollbackCompatibleLegacyOwner(ownerUserId)) {
      await replaceFileAtomically(
        await getLegacyConversationSyncFilePath(ownerUserId),
        serializedState
      );
    }

    await replaceFileAtomically(filePath, serializedState);

    return normalized;
  }));
}

async function getConversationRuntimeStatusFilePath(ownerUserId: string) {
  return `${await getConversationSyncFilePath(ownerUserId)}.runtime.json`;
}

async function updateAdminIngestConversationRuntimeStatus(
  ownerUserId: string,
  update: (
    current: AdminIngestConversationRuntimeStatusMap
  ) => AdminIngestConversationRuntimeStatusMap
) {
  return withOwnerWriteLock(ownerUserId, () => withOwnerFileLock(ownerUserId, async () => {
    const current = await readAdminIngestConversationRuntimeStatusSnapshot(
      ownerUserId
    );
    const nextRuntimeStatusById = update(current.statusById);

    if (nextRuntimeStatusById === current.statusById) {
      return current;
    }

    const normalized = {
      source: "admin-ingest-conversation-runtime-v1" as const,
      version: 1 as const,
      ownerUserId,
      revision: current.revision + 1,
      updatedAt: Math.max(Date.now(), current.updatedAt + 1),
      statusById: nextRuntimeStatusById
    };
    const filePath = await getConversationRuntimeStatusFilePath(ownerUserId);
    const serializedState = `${JSON.stringify(normalized, null, 2)}\n`;

    await replaceFileAtomically(filePath, serializedState);

    return normalized;
  }));
}

export async function markAdminIngestConversationRequestGenerating(
  ownerUserId: string,
  input: {
    conversationId: string;
    requestId: string;
    startedAt?: number;
  }
) {
  const conversationId = input.conversationId.trim();
  const requestId = input.requestId.trim();

  if (!conversationId || !requestId) {
    throw new Error("INGEST_HISTORY_RUNTIME_STATUS_INVALID");
  }

  return updateAdminIngestConversationRuntimeStatus(
    ownerUserId,
    (current) => markAdminIngestConversationGenerating(current, {
      conversationId,
      requestId,
      now: input.startedAt
    })
  );
}

export async function clearAdminIngestConversationRequestRuntimeStatus(
  ownerUserId: string,
  input: {
    conversationId: string;
    requestId: string;
  }
) {
  const conversationId = input.conversationId.trim();
  const requestId = input.requestId.trim();

  if (!conversationId || !requestId) {
    throw new Error("INGEST_HISTORY_RUNTIME_STATUS_INVALID");
  }

  return updateAdminIngestConversationRuntimeStatus(
    ownerUserId,
    (current) => clearAdminIngestConversationRuntimeStatus(current, {
      conversationId,
      requestId
    })
  );
}

export async function markAdminIngestConversationRequestVisibleCompleted(
  ownerUserId: string,
  input: {
    conversationId: string;
    requestId: string;
    completedAt?: number;
  }
) {
  const conversationId = input.conversationId.trim();
  const requestId = input.requestId.trim();

  if (!conversationId || !requestId) {
    throw new Error("INGEST_HISTORY_RUNTIME_STATUS_INVALID");
  }

  return updateAdminIngestConversationRuntimeStatus(
    ownerUserId,
    (current) => markAdminIngestConversationVisibleCompleted(current, {
      conversationId,
      requestId,
      now: input.completedAt
    })
  );
}

export async function readAdminIngestConversationRuntimeStatusSnapshot(
  ownerUserId: string
): Promise<{
  revision: number;
  updatedAt: number;
  statusById: AdminIngestConversationRuntimeStatusMap;
}> {
  const fs = await import("node:fs/promises");

  try {
    const raw = await fs.readFile(
      await getConversationRuntimeStatusFilePath(ownerUserId),
      "utf8"
    );
    const parsed = JSON.parse(raw) as {
      ownerUserId?: unknown;
      revision?: unknown;
      updatedAt?: unknown;
      statusById?: unknown;
    };

    if (parsed.ownerUserId !== ownerUserId) {
      throw new Error("INGEST_HISTORY_OWNER_MISMATCH");
    }

    return {
      revision: typeof parsed.revision === "number"
        && Number.isSafeInteger(parsed.revision)
        && parsed.revision >= 0
        ? parsed.revision
        : 0,
      updatedAt: typeof parsed.updatedAt === "number"
        && Number.isFinite(parsed.updatedAt)
        && parsed.updatedAt >= 0
        ? parsed.updatedAt
        : 0,
      statusById: normalizeAdminIngestConversationRuntimeStatusMap(
        parsed.statusById
      )
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return {
        revision: 0,
        updatedAt: 0,
        statusById: {}
      };
    }

    throw error;
  }
}
