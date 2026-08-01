import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  clearAdminIngestConversationRequestRuntimeStatus,
  markAdminIngestConversationRequestGenerating,
  markAdminIngestConversationRequestVisibleCompleted,
  readAdminIngestConversationRuntimeStatusSnapshot,
  readAdminIngestConversationSyncSnapshot,
  writeAdminIngestConversationSyncState
} from "../lib/enterprise/admin-ingest-conversation-sync-store";
import {
  createEmptyAdminIngestConversationSyncSnapshot
} from "../lib/enterprise/admin-ingest-history-sync";

test("visible completion uses an account-scoped sidecar without changing history CAS revision", async () => {
  const previousDir = process.env.ADMIN_INGEST_CONVERSATION_DIR;
  const testDir = await mkdtemp(
    join(tmpdir(), "admin-ingest-terminal-runtime-")
  );
  process.env.ADMIN_INGEST_CONVERSATION_DIR = testDir;

  try {
    const ownerUserId = "runtime-owner-a";
    const conversationId = "conversation-runtime-a";
    const requestId = "request-runtime-a";
    const startedAt = Date.now() - 1_000;
    const completedAt = Date.now();
    const historyState = await writeAdminIngestConversationSyncState(
      ownerUserId,
      {
        ...createEmptyAdminIngestConversationSyncSnapshot(),
        conversationRuntimeStatusById: {
          [conversationId]: {
            state: "generating",
            requestId,
            startedAt,
            updatedAt: startedAt
          }
        }
      },
      {
        expectedRevision: 0,
        includeDrafts: true
      }
    );

    const terminalState =
      await markAdminIngestConversationRequestVisibleCompleted(ownerUserId, {
        conversationId,
        requestId,
        completedAt
      });
    const persistedHistory =
      await readAdminIngestConversationSyncSnapshot(ownerUserId);
    const runtimeState =
      await readAdminIngestConversationRuntimeStatusSnapshot(ownerUserId);
    const otherOwnerRuntime =
      await readAdminIngestConversationRuntimeStatusSnapshot(
        "runtime-owner-b"
      );

    assert.equal(historyState.revision, 1);
    assert.equal(
      persistedHistory.revision,
      1,
      "runtime completion must not create a history revision conflict"
    );
    assert.equal(terminalState.revision, 1);
    assert.deepEqual(runtimeState.statusById[conversationId], {
      state: "visible_completed",
      requestId,
      updatedAt: completedAt
    });
    assert.deepEqual(
      otherOwnerRuntime.statusById,
      {},
      "runtime completion must stay isolated to the authenticated account"
    );
  } finally {
    if (previousDir === undefined) {
      delete process.env.ADMIN_INGEST_CONVERSATION_DIR;
    } else {
      process.env.ADMIN_INGEST_CONVERSATION_DIR = previousDir;
    }

    await rm(testDir, { recursive: true, force: true });
  }
});

test("generating and stopped states use the account sidecar without advancing history", async () => {
  const previousDir = process.env.ADMIN_INGEST_CONVERSATION_DIR;
  const testDir = await mkdtemp(
    join(tmpdir(), "admin-ingest-generating-runtime-")
  );
  process.env.ADMIN_INGEST_CONVERSATION_DIR = testDir;

  try {
    const ownerUserId = "runtime-generating-owner";
    const conversationId = "conversation-generating";
    const requestId = "request-generating";
    const startedAt = Date.now() - 2_000;
    const initialHistory = await readAdminIngestConversationSyncSnapshot(
      ownerUserId
    );
    const generating = await markAdminIngestConversationRequestGenerating(
      ownerUserId,
      { conversationId, requestId, startedAt }
    );
    const duplicate = await markAdminIngestConversationRequestGenerating(
      ownerUserId,
      { conversationId, requestId, startedAt: Date.now() }
    );
    const secondConversationId = "conversation-generating-second-device";
    const secondRequestId = "request-generating-second-device";
    const concurrent = await markAdminIngestConversationRequestGenerating(
      ownerUserId,
      {
        conversationId: secondConversationId,
        requestId: secondRequestId,
        startedAt
      }
    );
    const stopped = await clearAdminIngestConversationRequestRuntimeStatus(
      ownerUserId,
      { conversationId, requestId }
    );
    const finalHistory = await readAdminIngestConversationSyncSnapshot(
      ownerUserId
    );

    assert.equal(initialHistory.revision, 0);
    assert.equal(finalHistory.revision, 0);
    assert.deepEqual(generating.statusById[conversationId], {
      state: "generating",
      requestId,
      startedAt,
      updatedAt: startedAt
    });
    assert.equal(duplicate.revision, generating.revision);
    assert.deepEqual(concurrent.statusById[secondConversationId], {
      state: "generating",
      requestId: secondRequestId,
      startedAt,
      updatedAt: startedAt
    });
    assert.equal(stopped.statusById[conversationId], undefined);
    assert.deepEqual(
      stopped.statusById[secondConversationId],
      concurrent.statusById[secondConversationId],
      "stopping one device request must not remove another device request"
    );
    assert.equal(stopped.revision, concurrent.revision + 1);
  } finally {
    if (previousDir === undefined) {
      delete process.env.ADMIN_INGEST_CONVERSATION_DIR;
    } else {
      process.env.ADMIN_INGEST_CONVERSATION_DIR = previousDir;
    }

    await rm(testDir, { recursive: true, force: true });
  }
});
