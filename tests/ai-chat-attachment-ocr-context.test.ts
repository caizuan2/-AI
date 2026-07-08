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

  function now() {
    return new Date("2026-06-06T12:00:00.000Z");
  }

  const db = {
    knowledgeChunk: {
      findMany: async () => state.chunks as never
    },
    conversation: {
      findFirst: async () => null,
      findMany: async () => [],
      create: async ({ data }: { data: AnyRecord }) => {
        const conversation = {
          id: `conv_${state.conversations.length + 1}`,
          ...data,
          createdAt: now(),
          updatedAt: now()
        };

        state.conversations.push(conversation);
        return conversation;
      },
      update: async ({ where, data }: { where: { id: string }; data: AnyRecord }) => {
        const conversation = state.conversations.find((item) => item.id === where.id);

        assert.ok(conversation);
        Object.assign(conversation, data, { updatedAt: now() });
        return conversation;
      }
    },
    message: {
      create: async ({ data }: { data: AnyRecord }) => {
        const message = {
          id: `msg_${state.messages.length + 1}`,
          ...data,
          createdAt: now()
        };

        state.messages.push(message);
        return message;
      }
    },
    auditLog: {
      create: async ({ data }: { data: AnyRecord }) => {
        const log = {
          id: `audit_${state.auditLogs.length + 1}`,
          ...data,
          createdAt: now()
        };

        state.auditLogs.push(log);
        return log;
      }
    }
  } satisfies AiChatDb;

  return { db, state };
}

async function main() {
  const fake = createFakeDb();

  fake.state.chunks.push({
    id: "chunk_refund_1",
    fileId: "file_refund",
    knowledgeItemId: "knowledge_refund",
    metadata: {
      agentId: "chief",
      knowledgeBaseId: "kb:chief",
      namespace: "agent:chief:kb:kb:chief",
      published: true,
      sharedToUserApp: true
    },
    chunkText: "客户申请退款时，需要先核对订单号、付款时间和售后原因，再由负责人确认退款范围。",
    summary: "退款流程",
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    knowledgeItem: {
      id: "knowledge_refund",
      userId: "user_1",
      title: "退款处理流程",
      summary: "退款处理流程",
      tags: ["退款", "售后"],
      category: "售后",
      sourceType: "admin_text",
      sourceTitle: "退款处理流程",
      sourceUrl: null,
      importance: 3,
      deletedAt: null
    },
    file: {
      id: "file_refund",
      originalName: "refund.md",
      deletedAt: null
    }
  });

  const result = await handleAiChatAsk({
    id: "user_1",
    role: "user"
  }, {
    question: "这张微信截图里的客户怎么回复？",
    mode: "expert",
    attachments: [
      {
        type: "image",
        name: "wechat.png",
        filename: "wechat.png",
        mime_type: "image/png",
        metadata: {
          ocrStatus: "ok",
          ocrText: "客户在微信截图里说：我想申请退款，订单号要在哪里找？"
        }
      }
    ]
  }, {
    db: fake.db,
    providerConfigured: true,
    answerProvider: async ({ businessExecutionContext, contexts }) => {
      assert.match(businessExecutionContext ?? "", /USER_IMAGE_OCR_CONTEXT/);
      assert.match(businessExecutionContext ?? "", /我想申请退款/);
      assert.equal(contexts.some((context) => context.sourceId === "chunk_refund_1"), true);

      return {
        answer: "先安抚客户，再引导客户提供订单号并说明退款处理流程。",
        providerUsed: "test",
        modelUsed: "test-model",
        fallbackUsed: false
      };
    }
  });

  assert.equal(result.provider_status, "ok");
  assert.equal(result.sources.some((source) => source.chunk_id === "chunk_refund_1"), true);
  assert.equal(
    fake.state.messages.some((message) => (
      message.role === "USER" &&
      (message.metadata as AnyRecord | undefined)?.attachmentOcrApplied === true
    )),
    true
  );

  const ocrOnlyFake = createFakeDb();
  const ocrOnlyResult = await handleAiChatAsk({
    id: "user_1",
    role: "user"
  }, {
    question: "这张微信截图里的客户怎么回复？",
    mode: "expert",
    attachments: [
      {
        type: "image",
        name: "wechat-only.png",
        filename: "wechat-only.png",
        mime_type: "image/png",
        metadata: {
          ocrStatus: "ok",
          ocrText: "客户说：我现在不想继续沟通了，先不用联系我。"
        }
      }
    ]
  }, {
    db: ocrOnlyFake.db,
    providerConfigured: true,
    answerProvider: async ({ businessExecutionContext, contexts }) => {
      assert.match(businessExecutionContext ?? "", /我现在不想继续沟通/);
      assert.equal(contexts.some((context) => context.sourceType === "attachment_ocr"), true);

      return {
        answer: "可以先尊重客户边界，简短表达理解，再留一个低压力的后续入口。",
        providerUsed: "test",
        modelUsed: "test-model",
        fallbackUsed: false
      };
    }
  });

  assert.equal(ocrOnlyResult.provider_status, "ok");
  assert.equal(ocrOnlyResult.sources.length, 0);

  console.log("AI chat attachment OCR context tests passed.");
}

void main();
