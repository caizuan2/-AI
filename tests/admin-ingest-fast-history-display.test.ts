import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createAdminIngestHistoryStorageKeys,
  createEmptyAdminIngestConversationSyncSnapshot,
  readAdminIngestAccountHistoryScope,
  readAdminIngestScopedLocalSnapshotForDisplay,
  writeAdminIngestAccountHistoryScope,
  writeAdminIngestScopedLocalDisplaySnapshot,
  writeAdminIngestScopedLocalSnapshot,
  type AdminIngestConversationSyncSnapshot
} from "../lib/enterprise/admin-ingest-history-sync";

function createLargeHistoryState(): AdminIngestConversationSyncSnapshot {
  return {
    ...createEmptyAdminIngestConversationSyncSnapshot(),
    agents: [{
      id: "agent-a",
      name: "大健康专家"
    }] as AdminIngestConversationSyncSnapshot["agents"],
    agentConversations: [{
      id: "conversation-a",
      agentId: "agent-a",
      title: "沟通五步骤是什么",
      messageCount: 22,
      status: "active"
    }] as AdminIngestConversationSyncSnapshot["agentConversations"],
    activeAgentId: "agent-a",
    activeConversationId: "conversation-a",
    conversationMessagesById: {
      "conversation-a": [{
        id: "message-a",
        role: "assistant",
        content: "完整正文".repeat(500_000),
        status: "completed",
        time: "刚刚"
      }]
    },
    pinnedAgentIds: ["agent-a"],
    expandedAgentIds: ["agent-a"],
    expandedConversationAgentIds: ["agent-a"]
  };
}

test("compact Agent sidebar cache survives when the full history exceeds browser quota", () => {
  const historyScope = "fastdisplayaccountscope001";
  const keys = createAdminIngestHistoryStorageKeys(historyScope);
  const values = new Map<string, string>();

  assert.ok(keys);

  const storage = {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      if (key === keys.snapshotEnvelope) {
        throw new Error("QuotaExceededError");
      }

      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    }
  };
  const state = createLargeHistoryState();

  writeAdminIngestAccountHistoryScope({
    storage,
    registeredAccount: "13800000000",
    historyScope
  });
  writeAdminIngestScopedLocalDisplaySnapshot({
    storage,
    historyScope,
    keys,
    revision: 7,
    state
  });
  assert.throws(() => writeAdminIngestScopedLocalSnapshot({
    storage,
    historyScope,
    keys,
    revision: 7,
    state,
    markSynced: true
  }), /QuotaExceededError/);

  const indexedScope = readAdminIngestAccountHistoryScope({
    storage,
    registeredAccount: "13800000000"
  });
  const display = readAdminIngestScopedLocalSnapshotForDisplay({
    historyScope: indexedScope,
    includeDrafts: true,
    storage
  });
  const serializedDisplay = values.get(keys.displaySnapshotEnvelope) ?? "";

  assert.equal(indexedScope, historyScope);
  assert.equal(display?.state.agents[0]?.id, "agent-a");
  assert.equal(
    display?.state.agentConversations[0]?.messageCount,
    22,
    "sidebar message counts must not be reset when bodies are intentionally omitted"
  );
  assert.equal(display?.state.activeConversationId, "conversation-a");
  assert.deepEqual(display?.state.conversationMessagesById, {});
  assert.ok(serializedDisplay.length < 20_000);
  assert.equal(serializedDisplay.includes("完整正文"), false);
});

test("tampered compact sidebar cache is rejected without crossing account scope", () => {
  const historyScope = "tampereddisplayaccount001";
  const keys = createAdminIngestHistoryStorageKeys(historyScope);
  const values = new Map<string, string>();
  const storage = {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    }
  };

  assert.ok(keys);
  writeAdminIngestScopedLocalDisplaySnapshot({
    storage,
    historyScope,
    keys,
    revision: 1,
    state: createLargeHistoryState()
  });

  const envelope = JSON.parse(
    values.get(keys.displaySnapshotEnvelope) ?? "{}"
  ) as {
    state?: { activeAgentId?: string };
  };
  envelope.state = {
    ...(envelope.state ?? {}),
    activeAgentId: "another-account-agent"
  };
  values.set(keys.displaySnapshotEnvelope, JSON.stringify(envelope));

  assert.equal(
    readAdminIngestScopedLocalSnapshotForDisplay({
      historyScope,
      includeDrafts: true,
      storage
    }),
    null
  );
});

test("production hydration writes the compact sidebar before the optional full cache", async () => {
  const source = await readFile(
    "components/enterprise-admin/IngestModeToggle.tsx",
    "utf8"
  );
  const compactWrite = source.indexOf(
    "writeAdminIngestScopedLocalDisplaySnapshot({"
  );
  const fullWrite = source.indexOf("writeAdminIngestScopedLocalSnapshot({");

  assert.ok(compactWrite >= 0);
  assert.ok(fullWrite > compactWrite);
  assert.match(
    source,
    /A large message history may exceed[\s\S]*browser storage/
  );
});
