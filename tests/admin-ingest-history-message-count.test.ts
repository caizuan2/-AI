import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  countEffectiveAdminIngestHistoryMessages,
  normalizeAdminIngestConversationSyncSnapshot
} from "../lib/enterprise/admin-ingest-history-sync";
import type { IngestAgentConversation } from "../lib/enterprise/mock-agent-conversations";
import type { IngestChatMessage } from "../lib/enterprise/mock-chat";

function createConversation(messageCount: number): IngestAgentConversation {
  return {
    id: "conversation-career",
    agentId: "agent-career",
    title: "沟通五步骤是什么",
    createdAt: "2026-07-29T00:00:00.000Z",
    updatedAt: "2026-07-29T00:00:00.000Z",
    updatedLabel: "刚刚",
    messageCount,
    status: "active",
    source: "admin_ingest",
    platform: "web",
    syncTarget: ["web"]
  };
}

function createMessage(
  id: string,
  content: string,
  overrides: Partial<IngestChatMessage> = {}
): IngestChatMessage {
  return {
    id,
    role: "assistant",
    content,
    time: "刚刚",
    status: "completed",
    ...overrides
  };
}

test("history counts only messages with effective body content", () => {
  const messages = [
    createMessage("user-1", "沟通五步骤是什么", { role: "user" }),
    createMessage("assistant-1", "第一步是建立连接。"),
    createMessage("empty-content", "   "),
    createMessage("empty-history-conversation-career", "暂无历史内容"),
    createMessage("failed-assistant", "请求失败，请重试。", {
      status: "failed"
    })
  ];

  assert.equal(countEffectiveAdminIngestHistoryMessages(messages), 2);
  assert.equal(countEffectiveAdminIngestHistoryMessages(undefined), 0);
});

test("history snapshot repairs stale message counts from the stored bodies", () => {
  const conversation = createConversation(22);
  const normalizedWithBodies = normalizeAdminIngestConversationSyncSnapshot({
    agents: [],
    agentConversations: [conversation],
    conversationMessagesById: {
      [conversation.id]: [
        createMessage("user-1", "沟通五步骤是什么", { role: "user" }),
        createMessage("assistant-1", "第一步是建立连接。"),
        createMessage("failed-assistant", "请求失败，请重试。", {
          status: "failed"
        })
      ]
    }
  }, {
    includeDrafts: false
  });

  assert.equal(normalizedWithBodies.agentConversations[0]?.messageCount, 2);

  const normalizedWithoutBodies = normalizeAdminIngestConversationSyncSnapshot({
    agents: [],
    agentConversations: [conversation],
    conversationMessagesById: {}
  }, {
    includeDrafts: false
  });

  assert.equal(normalizedWithoutBodies.agentConversations[0]?.messageCount, 0);
});

test("admin ingest runtime reconciles counts instead of incrementing a detached total", () => {
  const source = readFileSync(
    "components/enterprise-admin/IngestModeToggle.tsx",
    "utf8"
  );

  assert.match(source, /reconcileAdminIngestConversationMessageCounts/);
  assert.doesNotMatch(
    source,
    /messageCount:\s*Math\.max\(conversation\.messageCount\s*\+\s*2,\s*2\)/
  );
  assert.doesNotMatch(source, /app\/\(user\)\/chat-ui/);
});
