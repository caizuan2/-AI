import assert from "node:assert/strict";

import { handleAiChatAsk, type AiChatDb } from "../lib/ai-chat/ask";

type AnyRecord = Record<string, unknown>;

function createFakeDb(): {
  db: AiChatDb;
  state: {
    conversations: AnyRecord[];
    messages: AnyRecord[];
    chunks: AnyRecord[];
    auditLogs: AnyRecord[];
  };
} {
  const state = {
    conversations: [] as AnyRecord[],
    messages: [] as AnyRecord[],
    chunks: [] as AnyRecord[],
    auditLogs: [] as AnyRecord[]
  };

  const db = {
    knowledgeChunk: {
      findMany: async () => state.chunks as never
    },
    conversation: {
      findFirst: async ({ where }: { where: AnyRecord }) => {
        return state.conversations.find((item) => (
          item.id === where.id &&
          item.userId === where.userId &&
          item.type === where.type
        )) ?? null;
      },
      findMany: async () => [],
      create: async ({ data }: { data: AnyRecord }) => {
        const conversation = {
          id: `conv_${state.conversations.length + 1}`,
          ...data,
          createdAt: new Date("2026-06-06T12:00:00.000Z"),
          updatedAt: new Date("2026-06-06T12:00:00.000Z")
        };

        state.conversations.push(conversation);
        return conversation;
      },
      update: async ({ where, data }: { where: { id: string }; data: AnyRecord }) => {
        const conversation = state.conversations.find((item) => item.id === where.id);

        assert.ok(conversation);
        Object.assign(conversation, data, { updatedAt: new Date("2026-06-06T12:05:00.000Z") });
        return conversation;
      }
    },
    message: {
      findMany: async ({ where, take }: { where: AnyRecord; take?: number }) => {
        const allowedUserIds = Array.isArray(where.OR)
          ? new Set(where.OR.map((item) => (item as AnyRecord).userId))
          : null;

        return state.messages
          .filter((message) => message.conversationId === where.conversationId)
          .filter((message) => !allowedUserIds || allowedUserIds.has(message.userId))
          .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
          .slice(0, typeof take === "number" ? take : undefined) as never;
      },
      create: async ({ data }: { data: AnyRecord }) => {
        const message = {
          id: `msg_${state.messages.length + 1}`,
          ...data,
          createdAt: new Date(`2026-06-06T12:${String(state.messages.length + 1).padStart(2, "0")}:00.000Z`)
        };

        state.messages.push(message);
        return message;
      }
    },
    auditLog: {
      create: async ({ data }: { data: AnyRecord }) => {
        state.auditLogs.push(data);
        return data;
      }
    }
  } satisfies AiChatDb;

  return { db, state };
}

async function main() {
  const fake = createFakeDb();

  fake.state.conversations.push(
    {
      id: "conv_current",
      userId: "user_1",
      title: "当前会话",
      type: "CHAT",
      mode: "expert",
      createdAt: new Date("2026-06-06T11:00:00.000Z"),
      updatedAt: new Date("2026-06-06T11:03:00.000Z")
    },
    {
      id: "conv_other",
      userId: "user_1",
      title: "其他会话",
      type: "CHAT",
      mode: "expert",
      createdAt: new Date("2026-06-06T10:00:00.000Z"),
      updatedAt: new Date("2026-06-06T10:01:00.000Z")
    }
  );
  fake.state.messages.push(
    {
      id: "msg_prev_user",
      conversationId: "conv_current",
      userId: "user_1",
      role: "USER",
      content: "客户从加上一直接给我群发广告，该怎么回复？",
      createdAt: new Date("2026-06-06T11:01:00.000Z")
    },
    {
      id: "msg_prev_assistant",
      conversationId: "conv_current",
      userId: "user_1",
      role: "ASSISTANT",
      content: "上一版回答：先接住客户情绪，再用问题引导客户说清楚真实情况。",
      metadata: {
        rawAnswerBeforeFinalizer: "上一版完整回答：先接住客户情绪，再用问题引导客户说清楚真实情况。"
      },
      createdAt: new Date("2026-06-06T11:02:00.000Z")
    },
    {
      id: "msg_other_user",
      conversationId: "conv_other",
      userId: "user_1",
      role: "USER",
      content: "其他窗口内容不应该出现",
      createdAt: new Date("2026-06-06T10:01:00.000Z")
    }
  );
  fake.state.chunks.push({
    id: "chunk_sales_1",
    fileId: "file_sales",
    knowledgeItemId: "knowledge_sales",
    chunkText: "上面的客户沟通问题如果需要换一个风格输出，要参考上一轮客户从加上一直接给我群发广告的上下文，先共情，再追问具体背景，最后给下一步建议。",
    summary: "上面问题换风格输出的客户沟通流程",
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    knowledgeItem: {
      id: "knowledge_sales",
      userId: "user_1",
      title: "上面问题换风格输出客户沟通流程",
      summary: "上面问题换风格输出客户沟通流程",
      tags: ["客户沟通", "换风格"],
      category: "沟通",
      sourceType: "admin_text",
      sourceTitle: "客户沟通流程",
      sourceUrl: null,
      importance: 3,
      status: "active",
      deletedAt: null
    }
  });

  const result = await handleAiChatAsk({
    id: "user_1",
    role: "user"
  }, {
    question: "上面的这个问题，再换一个风格输出",
    mode: "expert",
    conversation_id: "conv_current"
  }, {
    db: fake.db,
    providerConfigured: true,
    answerProvider: async ({ recentConversation }) => {
      const memoryText = recentConversation.map((turn) => turn.content).join("\n");

      assert.match(memoryText, /客户从加上一直接给我群发广告/);
      assert.match(memoryText, /上一版回答/);
      assert.equal(memoryText.includes("其他窗口内容不应该出现"), false);

      return {
        answer: "## 换一种风格\n可以更自然地先接住对方，再轻轻追问具体情况。",
        providerUsed: "test",
        modelUsed: "test-model",
        fallbackUsed: false
      };
    }
  });

  assert.equal(result.provider_status, "ok");
  assert.match(result.answer, /^## 换一种风格/);

  const newConversationResult = await handleAiChatAsk({
    id: "user_1",
    role: "user"
  }, {
    question: "上面的这个问题，再换一个风格输出",
    mode: "expert"
  }, {
    db: fake.db,
    providerConfigured: true,
    answerProvider: async ({ recentConversation }) => {
      assert.equal(recentConversation.length, 0);

      return {
        answer: "新会话没有历史上下文。",
        providerUsed: "test",
        modelUsed: "test-model",
        fallbackUsed: false
      };
    }
  });

  assert.equal(newConversationResult.provider_status, "ok");
  assert.equal(newConversationResult.answer, "新会话没有历史上下文。");

  console.log("AI chat conversation memory tests passed.");
}

void main();
