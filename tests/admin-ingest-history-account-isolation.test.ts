import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  unlink,
  utimes,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  AdminIngestConversationSyncRevisionConflictError,
  readAdminIngestConversationSyncSnapshot,
  writeAdminIngestConversationSyncState
} from "../lib/enterprise/admin-ingest-conversation-sync-store";
import {
  createAdminIngestHistoryScope,
  matchesAdminIngestHistoryScope
} from "../lib/enterprise/admin-ingest-history-scope";
import {
  createAdminIngestHistoryStorageKeys,
  createEmptyAdminIngestConversationSyncSnapshot,
  hasAdminIngestHistoryScopeChanged,
  normalizeAdminIngestConversationSyncSnapshot,
  readAdminIngestScopedLocalSnapshot,
  writeAdminIngestScopedLocalSnapshot
} from "../lib/enterprise/admin-ingest-history-sync";

const originalSessionSecret = process.env.SESSION_SECRET;
const originalConversationDir = process.env.ADMIN_INGEST_CONVERSATION_DIR;

process.env.SESSION_SECRET = "history-isolation-test-secret";

test.after(() => {
  if (originalSessionSecret === undefined) {
    delete process.env.SESSION_SECRET;
  } else {
    process.env.SESSION_SECRET = originalSessionSecret;
  }

  if (originalConversationDir === undefined) {
    delete process.env.ADMIN_INGEST_CONVERSATION_DIR;
  } else {
    process.env.ADMIN_INGEST_CONVERSATION_DIR = originalConversationDir;
  }
});

test("history scopes are opaque, account-specific and reject a stale account scope", () => {
  const accountAScope = createAdminIngestHistoryScope("account-a");
  const accountBScope = createAdminIngestHistoryScope("account-b");

  assert.notEqual(accountAScope, accountBScope);
  assert.equal(accountAScope.includes("account-a"), false);
  assert.equal(accountBScope.includes("account-b"), false);
  assert.equal(matchesAdminIngestHistoryScope("account-a", accountAScope), true);
  assert.equal(matchesAdminIngestHistoryScope("account-b", accountAScope), false);
  assert.equal(matchesAdminIngestHistoryScope("account-b", accountBScope), true);
});

test("browser storage keys never reuse another account or the legacy global cache", () => {
  const accountAKeys = createAdminIngestHistoryStorageKeys(
    createAdminIngestHistoryScope("account-a")
  );
  const accountBKeys = createAdminIngestHistoryStorageKeys(
    createAdminIngestHistoryScope("account-b")
  );

  assert.ok(accountAKeys);
  assert.ok(accountBKeys);

  for (const keyName of Object.keys(accountAKeys) as Array<keyof typeof accountAKeys>) {
    assert.notEqual(accountAKeys[keyName], accountBKeys[keyName]);
    assert.match(accountAKeys[keyName], /:v2:/);
    assert.match(accountBKeys[keyName], /:v2:/);
  }

  const browserValues = new Map<string, string>([
    [
      "ai-kb-ingest-conversations",
      JSON.stringify([{ id: "legacy-account-a-conversation" }])
    ]
  ]);
  const accessedKeys: string[] = [];
  const browserStorage = {
    getItem(key: string) {
      accessedKeys.push(key);
      return browserValues.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      browserValues.set(key, value);
    },
    removeItem(key: string) {
      browserValues.delete(key);
    }
  };
  const accountAState = {
    ...createEmptyAdminIngestConversationSyncSnapshot(),
    pinnedAgentIds: ["account-a-agent"]
  };

  writeAdminIngestScopedLocalSnapshot({
    storage: browserStorage,
    historyScope: createAdminIngestHistoryScope("account-a"),
    keys: accountAKeys,
    revision: 1,
    state: accountAState,
    markSynced: true
  });
  accessedKeys.length = 0;

  const accountBRead = readAdminIngestScopedLocalSnapshot({
    historyScope: createAdminIngestHistoryScope("account-b"),
    remoteRevision: 1,
    includeDrafts: true,
    storage: browserStorage
  });

  assert.ok(accountBRead);
  assert.equal(accountBRead.revisionMatches, false);
  assert.deepEqual(
    accountBRead.state,
    createEmptyAdminIngestConversationSyncSnapshot()
  );
  assert.deepEqual(accessedKeys, [
    accountBKeys.snapshotEnvelope,
    accountBKeys.revision
  ]);
  assert.equal(
    accessedKeys.includes("ai-kb-ingest-conversations"),
    false,
    "legacy global history must never be read during account hydration"
  );

  const accountARead = readAdminIngestScopedLocalSnapshot({
    historyScope: createAdminIngestHistoryScope("account-a"),
    remoteRevision: 1,
    includeDrafts: true,
    storage: browserStorage
  });

  assert.ok(accountARead);
  assert.equal(accountARead.revisionMatches, true);
  assert.equal(accountARead.hasUnsyncedChanges, false);
  assert.equal(
    accountARead.state.pinnedAgentIds[0],
    "account-a-agent"
  );
  assert.equal(
    browserValues.get("ai-kb-ingest-conversations")?.includes("account-a"),
    true,
    "the legacy global cache may still exist but must never become account B's scoped key"
  );

  const tamperedEnvelope = JSON.parse(
    browserValues.get(accountAKeys.snapshotEnvelope) ?? "{}"
  ) as {
    state?: { pinnedAgentIds?: string[] };
  };
  tamperedEnvelope.state = {
    ...(tamperedEnvelope.state ?? {}),
    pinnedAgentIds: ["stale-conflicting-agent"]
  };
  browserValues.set(
    accountAKeys.snapshotEnvelope,
    JSON.stringify(tamperedEnvelope)
  );
  const staleAccountARead = readAdminIngestScopedLocalSnapshot({
    historyScope: createAdminIngestHistoryScope("account-a"),
    remoteRevision: 1,
    includeDrafts: true,
    storage: browserStorage
  });

  assert.ok(staleAccountARead);
  assert.equal(
    staleAccountARead.revisionMatches,
    false,
    "a mixed revision/content cache must never bypass the server CAS"
  );

  writeAdminIngestScopedLocalSnapshot({
    storage: browserStorage,
    historyScope: createAdminIngestHistoryScope("account-a"),
    keys: accountAKeys,
    revision: 1,
    state: {
      ...accountAState,
      activeAgentId: "unsynced-account-a-agent"
    },
    markSynced: false
  });
  const unsyncedAccountARead = readAdminIngestScopedLocalSnapshot({
    historyScope: createAdminIngestHistoryScope("account-a"),
    remoteRevision: 1,
    includeDrafts: true,
    storage: browserStorage
  });

  assert.ok(unsyncedAccountARead);
  assert.equal(unsyncedAccountARead.revisionMatches, true);
  assert.equal(unsyncedAccountARead.hasUnsyncedChanges, true);
  assert.equal(
    unsyncedAccountARead.state.activeAgentId,
    "unsynced-account-a-agent"
  );

  browserValues.set(accountAKeys.revision, JSON.stringify(2));
  const transplantedRevisionRead = readAdminIngestScopedLocalSnapshot({
    historyScope: createAdminIngestHistoryScope("account-a"),
    remoteRevision: 2,
    includeDrafts: true,
    storage: browserStorage
  });

  assert.ok(transplantedRevisionRead);
  assert.equal(
    transplantedRevisionRead.revisionMatches,
    false,
    "a revision transplanted onto an older signed snapshot must be rejected"
  );

  assert.equal(
    hasAdminIngestHistoryScopeChanged(
      createAdminIngestHistoryScope("account-a"),
      createAdminIngestHistoryScope("account-a")
    ),
    false
  );
  assert.equal(
    hasAdminIngestHistoryScopeChanged(
      createAdminIngestHistoryScope("account-a"),
      createAdminIngestHistoryScope("account-b")
    ),
    true
  );
  assert.equal(
    hasAdminIngestHistoryScopeChanged(
      "",
      createAdminIngestHistoryScope("account-b")
    ),
    false
  );

  const crashScope = createAdminIngestHistoryScope("account-crash-recovery");
  const crashKeys = createAdminIngestHistoryStorageKeys(crashScope);
  const crashValues = new Map<string, string>();
  let crashWriteCount = 0;

  assert.ok(crashKeys);
  assert.throws(() => writeAdminIngestScopedLocalSnapshot({
    storage: {
      getItem(key: string) {
        return crashValues.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        crashWriteCount += 1;
        if (crashWriteCount === 2) {
          throw new Error("simulated localStorage interruption");
        }
        crashValues.set(key, value);
      },
      removeItem(key: string) {
        crashValues.delete(key);
      }
    },
    historyScope: crashScope,
    keys: crashKeys,
    revision: 0,
    state: {
      ...createEmptyAdminIngestConversationSyncSnapshot(),
      activeAgentId: "unsynced-before-crash"
    },
    markSynced: false
  }));
  const crashRecovered = readAdminIngestScopedLocalSnapshot({
    historyScope: crashScope,
    remoteRevision: 0,
    includeDrafts: true,
    storage: {
      getItem(key: string) {
        return crashValues.get(key) ?? null;
      }
    }
  });

  assert.ok(crashRecovered);
  assert.equal(crashRecovered.revisionMatches, true);
  assert.equal(crashRecovered.hasUnsyncedChanges, true);
  assert.equal(
    crashRecovered.state.activeAgentId,
    "unsynced-before-crash",
    "the atomic envelope must preserve unsynced edits if mirror keys fail"
  );
});

test("server storage isolates owners, enforces revisions and strips chat-only drafts", async () => {
  const testDir = await mkdtemp(join(tmpdir(), "admin-ingest-history-scope-"));
  process.env.ADMIN_INGEST_CONVERSATION_DIR = testDir;

  try {
    const emptyA = await readAdminIngestConversationSyncSnapshot("account-a");
    const emptyB = await readAdminIngestConversationSyncSnapshot("account-b");

    assert.equal(emptyA.exists, false);
    assert.equal(emptyA.revision, 0);
    assert.deepEqual(
      normalizeAdminIngestConversationSyncSnapshot(emptyA.state, {
        includeDrafts: true
      }),
      createEmptyAdminIngestConversationSyncSnapshot()
    );
    assert.equal(emptyB.exists, false);
    assert.equal(emptyB.revision, 0);

    const accountAState = await writeAdminIngestConversationSyncState(
      "account-a",
      {
        ...createEmptyAdminIngestConversationSyncSnapshot(),
        agents: [{ id: "agent-a", name: "Account A Agent" }],
        agentConversations: [{
          id: "conversation-a",
          agentId: "agent-a",
          title: "Account A private history"
        }],
        activeAgentId: "agent-a",
        activeConversationId: "conversation-a",
        conversationMessagesById: {
          "conversation-a": [{
            id: "message-a",
            role: "user",
            content: "Account A private message"
          }]
        },
        conversationDraftsById: {
          "conversation-a": {
            title: "Account A private draft"
          }
        }
      },
      {
        expectedRevision: 0,
        includeDrafts: true
      }
    );

    assert.equal(accountAState.revision, 1);
    assert.equal(
      accountAState.conversationMessagesById["conversation-a"]?.[0]?.id,
      "message-a"
    );
    const reloadedA = await readAdminIngestConversationSyncSnapshot("account-a");

    assert.equal(reloadedA.exists, true);
    assert.equal(reloadedA.revision, 1);
    assert.equal(
      reloadedA.state.conversationMessagesById["conversation-a"]?.[0]?.content,
      "Account A private message"
    );

    const stillEmptyB = await readAdminIngestConversationSyncSnapshot("account-b");

    assert.equal(stillEmptyB.exists, false);
    assert.equal(stillEmptyB.revision, 0);
    assert.equal(stillEmptyB.state.agents.length, 0);
    assert.equal(
      Object.keys(stillEmptyB.state.conversationMessagesById).length,
      0
    );

    await assert.rejects(
      writeAdminIngestConversationSyncState(
        "account-a",
        createEmptyAdminIngestConversationSyncSnapshot(),
        {
          expectedRevision: 0,
          includeDrafts: true
        }
      ),
      (error: unknown) => (
        error instanceof AdminIngestConversationSyncRevisionConflictError
        && error.currentRevision === 1
      )
    );

    const chatOnlyAccountAState = await writeAdminIngestConversationSyncState(
      "account-a",
      {
        ...createEmptyAdminIngestConversationSyncSnapshot(),
        agents: [{ id: "agent-a", name: "Account A Agent" }],
        conversationDraftsById: {
          "conversation-a": {
            title: "Chat-only write must not replace the protected draft"
          }
        }
      },
      {
        expectedRevision: 1,
        includeDrafts: false
      }
    );

    assert.equal(chatOnlyAccountAState.revision, 2);
    assert.equal(
      chatOnlyAccountAState.conversationDraftsById["conversation-a"]?.title,
      "Account A private draft",
      "chat-only updates must preserve full-ingest drafts already on the server"
    );

    const accountBState = await writeAdminIngestConversationSyncState(
      "account-b",
      {
        ...createEmptyAdminIngestConversationSyncSnapshot(),
        agents: [{ id: "agent-b", name: "Account B Agent" }],
        conversationDraftsById: {
          "conversation-b": {
            title: "Chat-only draft must not persist"
          }
        }
      },
      {
        expectedRevision: 0,
        includeDrafts: false
      }
    );

    assert.equal(accountBState.revision, 1);
    assert.deepEqual(accountBState.conversationDraftsById, {});

    let persistedFiles = await readdir(testDir);

    assert.equal(
      persistedFiles.some((fileName) => fileName === "user-account-b.json"),
      true,
      "safe owner ids must keep the rollback-compatible legacy file current"
    );
    const accountBCanonicalFileName = `user-${
      createHash("sha256").update("account-b", "utf8").digest("hex")
    }.json`;
    const accountBLegacyState = JSON.parse(
      await readFile(join(testDir, "user-account-b.json"), "utf8")
    ) as { ownerUserId?: string; revision?: number; activeAgentId?: string };
    const accountBCanonicalState = JSON.parse(
      await readFile(join(testDir, accountBCanonicalFileName), "utf8")
    ) as { ownerUserId?: string; revision?: number; activeAgentId?: string };

    assert.deepEqual(
      accountBLegacyState,
      accountBCanonicalState,
      "legacy must be written before canonical with identical rollback-compatible state"
    );
    assert.equal(accountBLegacyState.ownerUserId, "account-b");
    assert.equal(accountBLegacyState.revision, 1);

    const [concurrentLeft, concurrentRight] = await Promise.allSettled([
      writeAdminIngestConversationSyncState(
        "concurrent-account",
        {
          ...createEmptyAdminIngestConversationSyncSnapshot(),
          activeAgentId: "left"
        },
        { expectedRevision: 0 }
      ),
      writeAdminIngestConversationSyncState(
        "concurrent-account",
        {
          ...createEmptyAdminIngestConversationSyncSnapshot(),
          activeAgentId: "right"
        },
        { expectedRevision: 0 }
      )
    ]);
    const concurrentResults = [concurrentLeft, concurrentRight];

    assert.equal(
      concurrentResults.filter((result) => result.status === "fulfilled").length,
      1
    );
    assert.equal(
      concurrentResults.filter((result) => (
        result.status === "rejected"
        && result.reason instanceof AdminIngestConversationSyncRevisionConflictError
      )).length,
      1
    );
    assert.equal(
      (await readAdminIngestConversationSyncSnapshot("concurrent-account")).revision,
      1
    );

    await writeAdminIngestConversationSyncState(
      "acct/a",
      {
        ...createEmptyAdminIngestConversationSyncSnapshot(),
        activeAgentId: "slash-owner"
      },
      { expectedRevision: 0 }
    );
    await writeAdminIngestConversationSyncState(
      "acct?a",
      {
        ...createEmptyAdminIngestConversationSyncSnapshot(),
        activeAgentId: "question-owner"
      },
      { expectedRevision: 0 }
    );

    assert.equal(
      (await readAdminIngestConversationSyncSnapshot("acct/a")).state.activeAgentId,
      "slash-owner"
    );
    assert.equal(
      (await readAdminIngestConversationSyncSnapshot("acct?a")).state.activeAgentId,
      "question-owner"
    );
    persistedFiles = await readdir(testDir);
    assert.equal(
      persistedFiles.includes("user-acct_a.json"),
      false,
      "unsafe or colliding owner ids must never write a shared legacy file"
    );

    await writeFile(
      join(testDir, "user-unsafe_mismatch.json"),
      `${JSON.stringify({
        ownerUserId: "some-other-owner",
        activeAgentId: "must-not-leak"
      })}\n`,
      "utf8"
    );
    const mismatchedLegacyState = await readAdminIngestConversationSyncSnapshot(
      "unsafe/mismatch"
    );

    assert.equal(
      mismatchedLegacyState.exists,
      false,
      "a colliding legacy file owned by someone else must behave as no history"
    );
    assert.equal(mismatchedLegacyState.state.activeAgentId, "");

    await writeFile(
      join(testDir, "user-legacy-account.json"),
      `${JSON.stringify({
        source: "admin-ingest-conversation-sync-v1",
        version: 1,
        ownerUserId: "legacy-account",
        agents: [{ id: "legacy-agent", name: "Legacy Agent" }],
        agentConversations: [],
        activeAgentId: "legacy-agent",
        activeConversationId: "",
        conversationMessagesById: {},
        conversationDraftsById: {},
        pinnedAgentIds: [],
        expandedAgentIds: [],
        expandedConversationAgentIds: [],
        updatedAt: 100
      })}\n`,
      "utf8"
    );
    const legacyState = await readAdminIngestConversationSyncSnapshot(
      "legacy-account"
    );

    assert.equal(legacyState.exists, true);
    assert.equal(legacyState.revision, 1);
    assert.equal(legacyState.state.agents[0]?.id, "legacy-agent");

    const migratedLegacyState = await writeAdminIngestConversationSyncState(
      "legacy-account",
      {
        ...legacyState.state,
        activeAgentId: "migrated-agent"
      },
      {
        expectedRevision: 1
      }
    );
    const legacyCanonicalFileName = `user-${
      createHash("sha256").update("legacy-account", "utf8").digest("hex")
    }.json`;
    const rollbackFileAfterMigration = JSON.parse(
      await readFile(join(testDir, "user-legacy-account.json"), "utf8")
    ) as {
      ownerUserId?: string;
      revision?: number;
      activeAgentId?: string;
      updatedAt?: number;
    };
    const canonicalFileAfterMigration = JSON.parse(
      await readFile(join(testDir, legacyCanonicalFileName), "utf8")
    ) as { ownerUserId?: string; revision?: number; activeAgentId?: string };

    assert.equal(migratedLegacyState.revision, 2);
    assert.deepEqual(rollbackFileAfterMigration, canonicalFileAfterMigration);
    assert.equal(rollbackFileAfterMigration.activeAgentId, "migrated-agent");

    const rollbackWrittenState = {
      ...rollbackFileAfterMigration,
      source: "admin-ingest-conversation-sync-v1",
      version: 1,
      activeAgentId: "rollback-period-agent",
      updatedAt: Number(rollbackFileAfterMigration.updatedAt ?? 0) + 1_000
    } as Record<string, unknown>;

    delete rollbackWrittenState.revision;
    await writeFile(
      join(testDir, "user-legacy-account.json"),
      `${JSON.stringify(rollbackWrittenState, null, 2)}\n`,
      "utf8"
    );
    const restoredAfterRollbackWrite =
      await readAdminIngestConversationSyncSnapshot("legacy-account");

    assert.equal(
      restoredAfterRollbackWrite.state.activeAgentId,
      "rollback-period-agent",
      "history written during a direct rollback must win after upgrading again"
    );
    assert.equal(
      restoredAfterRollbackWrite.revision,
      3,
      "a newer rollback write without a revision must be promoted past canonical"
    );
    const resyncedAfterRollback = await writeAdminIngestConversationSyncState(
      "legacy-account",
      restoredAfterRollbackWrite.state,
      {
        expectedRevision: restoredAfterRollbackWrite.revision
      }
    );

    assert.equal(resyncedAfterRollback.revision, 4);
    assert.equal(resyncedAfterRollback.activeAgentId, "rollback-period-agent");

    const lockOwnerId = "active-lock-account";
    const lockFileName = `user-${
      createHash("sha256").update(lockOwnerId, "utf8").digest("hex")
    }.json.lock`;
    const lockFilePath = join(testDir, lockFileName);
    const activeLockToken = "existing-active-lock";

    await writeFile(
      lockFilePath,
      `${JSON.stringify({
        pid: process.pid,
        createdAt: Date.now() - 120_000,
        token: activeLockToken
      })}\n`,
      "utf8"
    );
    const oldLockTime = new Date(Date.now() - 120_000);

    await utimes(lockFilePath, oldLockTime, oldLockTime);
    const blockedWrite = writeAdminIngestConversationSyncState(
      lockOwnerId,
      createEmptyAdminIngestConversationSyncSnapshot(),
      {
        expectedRevision: 0
      }
    );

    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(
      JSON.parse(await readFile(lockFilePath, "utf8")).token,
      activeLockToken,
      "a stale-looking lock owned by a live process must not be removed"
    );
    await unlink(lockFilePath);
    await blockedWrite;

    const child = spawn(process.execPath, ["-e", "process.exit(0)"], {
      stdio: "ignore"
    });
    const deadPid = child.pid;

    assert.ok(deadPid);
    await new Promise<void>((resolve, reject) => {
      child.once("exit", () => resolve());
      child.once("error", reject);
    });

    const deadLockOwnerId = "dead-lock-account";
    const deadLockFilePath = join(
      testDir,
      `user-${
        createHash("sha256").update(deadLockOwnerId, "utf8").digest("hex")
      }.json.lock`
    );

    await writeFile(
      deadLockFilePath,
      `${JSON.stringify({
        pid: deadPid,
        createdAt: Date.now() - 120_000
      })}\n`,
      "utf8"
    );
    await utimes(deadLockFilePath, oldLockTime, oldLockTime);
    await writeAdminIngestConversationSyncState(
      deadLockOwnerId,
      createEmptyAdminIngestConversationSyncSnapshot(),
      {
        expectedRevision: 0
      }
    );
    await assert.rejects(
      stat(deadLockFilePath),
      (error: unknown) => (
        error !== null
        && typeof error === "object"
        && "code" in error
        && (error as { code?: unknown }).code === "ENOENT"
      ),
      "a stale lock is removable only after its owner process is confirmed dead"
    );
  } finally {
    await rm(testDir, { recursive: true, force: true });
  }
});

test("route and client contracts keep owner ids private and refuse old-page writes", async () => {
  const routeSource = await readFile(
    "app/api/admin/ingest-conversations/route.ts",
    "utf8"
  );
  const componentSource = await readFile(
    "components/enterprise-admin/IngestModeToggle.tsx",
    "utf8"
  );
  const authMeSource = await readFile(
    "app/api/ingest/auth/me/route.ts",
    "utf8"
  );
  const licenseGateSource = await readFile(
    "components/enterprise-admin/IngestLicenseInvalidGate.tsx",
    "utf8"
  );
  const getHandler = routeSource.slice(
    routeSource.indexOf("export async function GET"),
    routeSource.indexOf("export async function PUT")
  );

  assert.match(getHandler, /historyScope/);
  assert.match(getHandler, /revision/);
  assert.doesNotMatch(getHandler, /ownerUserId/);
  assert.match(routeSource, /INGEST_HISTORY_SCOPE_MISMATCH/);
  assert.match(routeSource, /baseRevision/);
  assert.match(routeSource, /access\.accessTier === "full_ingest"/);
  assert.match(routeSource, /includeDrafts:\s*access\.accessTier === "full_ingest"/);

  assert.match(componentSource, /createAdminIngestHistoryStorageKeys/);
  assert.match(componentSource, /readAdminIngestScopedLocalSnapshot/);
  assert.match(componentSource, /writeAdminIngestScopedLocalSnapshot/);
  assert.match(componentSource, /verifyCurrentAccountHistoryScope/);
  assert.match(componentSource, /AdminIngestConversationSyncWriteRequest/);
  assert.match(
    componentSource,
    /\.\.\.pending\.state,[\s\S]*historyScope:\s*pending\.historyScope,[\s\S]*state:\s*pending\.state/,
    "the v2 client must remain write-compatible with a directly rolled-back v1 server"
  );
  assert.match(componentSource, /isAccountTransitioningRef\.current = true/);
  assert.match(componentSource, /conversationSyncAbortControllersRef\.current/);
  assert.match(componentSource, /\|\| !conversationSyncLoaded/);
  assert.match(componentSource, /reloadForAccountHistoryChange/);
  assert.match(componentSource, /retryCount/);
  assert.doesNotMatch(
    componentSource,
    /clearAdminIngestScopedLocalSnapshot/,
    "account switches must not delete the original account's unsynced scoped recovery envelope"
  );
  assert.doesNotMatch(
    componentSource,
    /const INGEST_(?:AGENTS|CONVERSATIONS|ACTIVE_AGENT|ACTIVE_CONVERSATION|CONVERSATION_MESSAGES|CONVERSATION_DRAFTS|PINNED_AGENTS|EXPANDED_AGENTS)_STORAGE_KEY/
  );
  assert.doesNotMatch(componentSource, /loadRemoteConversationState/);

  assert.match(authMeSource, /historyScope/);
  assert.match(authMeSource, /createAdminIngestHistoryScope\(user\.id\)/);
  assert.match(licenseGateSource, /hasAdminIngestHistoryScopeChanged/);
  assert.match(licenseGateSource, /window\.location\.reload\(\)/);
});
