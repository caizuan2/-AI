import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  mergeAdminIngestConversationSyncMessages,
  readAdminIngestConversationSyncSnapshot,
  writeAdminIngestConversationSyncState
} from "../lib/enterprise/admin-ingest-conversation-sync-store";
import {
  createEmptyAdminIngestConversationSyncSnapshot,
  mergeAdminIngestConversationMessages,
  mergeAdminIngestConversationSyncConflict
} from "../lib/enterprise/admin-ingest-history-sync";
import type { IngestAgentConversation } from "../lib/enterprise/mock-agent-conversations";
import type { IngestChatMessage } from "../lib/enterprise/mock-chat";

function createMessage(
  id: string,
  content: string,
  status: IngestChatMessage["status"]
): IngestChatMessage {
  return {
    id,
    role: id.startsWith("user-") ? "user" : "assistant",
    content,
    time: "刚刚",
    status
  };
}

function createConversation(): IngestAgentConversation {
  return {
    id: "conversation-sync",
    agentId: "agent-sync",
    title: "跨端同步",
    createdAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z",
    updatedLabel: "刚刚",
    messageCount: 0,
    status: "active",
    source: "admin_ingest",
    platform: "web",
    syncTarget: ["web", "exe", "apk"]
  };
}

test("completed local body survives a concurrent remote history update", () => {
  const baseMessages = [
    createMessage("user-request", "请分析客户情况", "completed"),
    createMessage("assistant-result-request", "正在生成", "streaming")
  ];
  const remoteMessages = [
    ...baseMessages,
    createMessage("user-other-device", "另一端的新消息", "completed")
  ];
  const localMessages = [
    baseMessages[0],
    createMessage(
      "assistant-result-request",
      "这是模型返回的完整原始正文。",
      "completed"
    )
  ];
  const merged = mergeAdminIngestConversationMessages(
    remoteMessages,
    localMessages,
    baseMessages
  );

  assert.equal(
    merged.find((message) => message.id === "assistant-result-request")?.content,
    "这是模型返回的完整原始正文。"
  );
  assert.equal(
    merged.some((message) => message.id === "user-other-device"),
    true
  );
});

test("a stale streaming snapshot cannot downgrade a persisted completed body", () => {
  const persisted = [
    createMessage(
      "assistant-result-request",
      "已经持久化的模型原始正文。",
      "completed"
    )
  ];
  const stale = [
    createMessage("assistant-result-request", "半截正文", "streaming")
  ];

  assert.deepEqual(
    mergeAdminIngestConversationMessages(persisted, stale),
    persisted
  );
});

test("three-way snapshot merge keeps local answer and remote conversation data", () => {
  const conversation = createConversation();
  const base = {
    ...createEmptyAdminIngestConversationSyncSnapshot(),
    agentConversations: [conversation],
    activeConversationId: conversation.id,
    conversationMessagesById: {
      [conversation.id]: [
        createMessage("assistant-result-request", "正在生成", "streaming")
      ]
    }
  };
  const local = {
    ...base,
    conversationMessagesById: {
      [conversation.id]: [
        createMessage(
          "assistant-result-request",
          "本机刚完成的原始正文。",
          "completed"
        )
      ]
    }
  };
  const remote = {
    ...base,
    pinnedAgentIds: ["agent-sync"],
    conversationMessagesById: {
      [conversation.id]: [
        ...base.conversationMessagesById[conversation.id],
        createMessage("user-remote", "远端新增消息", "completed")
      ]
    }
  };
  const merged = mergeAdminIngestConversationSyncConflict({
    base,
    local,
    remote,
    includeDrafts: false
  });

  assert.equal(
    merged.conversationMessagesById[conversation.id]?.find(
      (message) => message.id === "assistant-result-request"
    )?.content,
    "本机刚完成的原始正文。"
  );
  assert.equal(
    merged.conversationMessagesById[conversation.id]?.some(
      (message) => message.id === "user-remote"
    ),
    true
  );
  assert.deepEqual(merged.pinnedAgentIds, ["agent-sync"]);
});

test("atomic message merge is idempotent and rejects later stale snapshot overwrite", async () => {
  const previousDir = process.env.ADMIN_INGEST_CONVERSATION_DIR;
  const testDir = await mkdtemp(
    join(tmpdir(), "admin-ingest-sync-conflict-recovery-")
  );
  process.env.ADMIN_INGEST_CONVERSATION_DIR = testDir;

  try {
    const ownerUserId = "sync-conflict-owner";
    const conversation = createConversation();
    const initial = await writeAdminIngestConversationSyncState(
      ownerUserId,
      {
        ...createEmptyAdminIngestConversationSyncSnapshot(),
        agentConversations: [conversation],
        activeConversationId: conversation.id,
        conversationMessagesById: {
          [conversation.id]: [
            createMessage("assistant-result-request", "正在生成", "streaming")
          ]
        }
      },
      {
        expectedRevision: 0,
        includeDrafts: true
      }
    );
    const completedMessages = [
      createMessage(
        "assistant-result-request",
        "原子保存后的完整原始正文。",
        "completed"
      )
    ];
    const finalized = await mergeAdminIngestConversationSyncMessages(
      ownerUserId,
      {
        conversationId: conversation.id,
        messages: completedMessages
      }
    );
    const duplicate = await mergeAdminIngestConversationSyncMessages(
      ownerUserId,
      {
        conversationId: conversation.id,
        messages: completedMessages
      }
    );

    assert.equal(initial.revision, 1);
    assert.equal(finalized.revision, 2);
    assert.equal(duplicate.revision, 2);
    await assert.rejects(
      writeAdminIngestConversationSyncState(
        ownerUserId,
        initial,
        {
          expectedRevision: 1,
          includeDrafts: true
        }
      ),
      /历史记录已在其他页面更新/
    );

    const persisted = await readAdminIngestConversationSyncSnapshot(
      ownerUserId
    );
    assert.equal(
      persisted.state.conversationMessagesById[conversation.id]?.[0]?.content,
      "原子保存后的完整原始正文。"
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

test("client only reloads for account scope changes and uses atomic PATCH for body", () => {
  const componentSource = readFileSync(
    "components/enterprise-admin/IngestModeToggle.tsx",
    "utf8"
  );
  const routeSource = readFileSync(
    "app/api/admin/ingest-conversations/route.ts",
    "utf8"
  );

  assert.match(
    componentSource,
    /payload\.errorCode === "INGEST_HISTORY_SCOPE_MISMATCH"[\s\S]*?reloadForAccountHistoryChange\(\)/
  );
  assert.doesNotMatch(
    componentSource,
    /response\.status === 409[\s\S]{0,240}reloadForAccountHistoryChange\(\)/
  );
  assert.match(
    componentSource,
    /response\.status === 409[\s\S]*?mergeAdminIngestConversationSyncConflict/
  );
  assert.match(
    componentSource,
    /operation:\s*"merge_conversation_messages"/
  );
  assert.match(componentSource, /method:\s*"PATCH"/);
  assert.match(routeSource, /export async function PATCH/);
  assert.match(routeSource, /mergeAdminIngestConversationSyncMessages/);
  assert.doesNotMatch(routeSource, /prisma/i);
});
