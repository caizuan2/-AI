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

test("compact display cache keeps normal visible bodies and removes heavy OCR metadata", () => {
  const historyScope = "fastbodyaccountscope0001";
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
  const state = createLargeHistoryState();

  assert.ok(keys);
  state.conversationMessagesById["conversation-a"] = [{
    id: "message-user",
    role: "user",
    content: "请根据微信截图回复客户",
    status: "completed",
    time: "00:58",
    attachments: [{
      id: "attachment-a",
      fileName: "微信长截图.jpg",
      fileType: "image/jpeg",
      fileSize: 1024,
      isImage: true,
      previewUrl: "/api/admin/ingest-images/preview.jpg",
      persistentUrl: "/api/admin/ingest-images/permanent.jpg",
      extractedText: "不应进入快速正文缓存".repeat(10_000),
      pageSummaries: ["大段 OCR 摘要".repeat(1_000)],
      status: "attached",
      source: "admin_ingest",
      platform: "web",
      syncTarget: ["web"],
      createdAt: "2026-07-31T00:58:00.000Z"
    }]
  }, {
    id: "message-assistant",
    role: "assistant",
    content: "姐，视频发布后可以先问客户最关注哪类反馈。",
    status: "completed",
    time: "00:58"
  }];

  writeAdminIngestScopedLocalDisplaySnapshot({
    storage,
    historyScope,
    keys,
    revision: 8,
    state
  });

  const display = readAdminIngestScopedLocalSnapshotForDisplay({
    historyScope,
    includeDrafts: true,
    storage
  });
  const messages =
    display?.state.conversationMessagesById["conversation-a"] ?? [];
  const serializedDisplay = values.get(keys.displaySnapshotEnvelope) ?? "";

  assert.equal(messages.length, 2);
  assert.equal(messages[0]?.content, "请根据微信截图回复客户");
  assert.equal(
    messages[0]?.attachments?.[0]?.persistentUrl,
    "/api/admin/ingest-images/permanent.jpg"
  );
  assert.equal(messages[0]?.attachments?.[0]?.extractedText, undefined);
  assert.equal(serializedDisplay.includes("不应进入快速正文缓存"), false);
  assert.ok(serializedDisplay.length < 30_000);
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
  assert.match(
    source,
    /writeAdminIngestScopedLocalDisplaySnapshot\(\{[\s\S]*conversationMessagesById,/
  );
  assert.doesNotMatch(
    source,
    /writeAdminIngestScopedLocalDisplaySnapshot\(\{[\s\S]{0,800}conversationMessagesById:\s*\{\}/
  );
});
