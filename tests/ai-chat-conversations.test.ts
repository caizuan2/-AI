import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import {
  getAiChatHistory,
  listAiChatConversations,
  type AiChatActor,
  type AiChatDb
} from "../lib/ai-chat/ask";

type AnyRecord = Record<string, unknown>;

const LARGE_METADATA_SENTINEL = "LIST_METADATA_MUST_NOT_LEAK";
const FULL_HISTORY_ANSWER = "# 完整历史回答\n\n这是需要原样保留的 **DeepSeek/GPT Markdown 正文**。";
const actor: AiChatActor = {
  id: "user_1",
  role: "user"
};

function createConversation(overrides: AnyRecord = {}) {
  return {
    id: "conv_active",
    userId: actor.id,
    title: "正常会话",
    type: "CHAT",
    mode: "expert",
    metadata: {
      finalizedAnswer: `${LARGE_METADATA_SENTINEL}:${"x".repeat(256_000)}`,
      autoSalesAgent: {
        state: "large-payload"
      }
    },
    createdAt: new Date("2026-07-14T10:00:00.000Z"),
    updatedAt: new Date("2026-07-14T10:05:00.000Z"),
    _count: {
      messages: 12
    },
    ...overrides
  };
}

async function main() {
  const captured: { findManyArgs?: AnyRecord } = {};
  const activeConversation = createConversation();
  const deletedConversation = createConversation({
    id: "conv_deleted",
    title: "已删除会话",
    metadata: {
      conversationControl: {
        deletedAt: "2026-07-14T10:06:00.000Z"
      }
    }
  });
  const legacyNullMetadataConversation = createConversation({
    id: "conv_legacy_null",
    title: "旧会话 metadata null",
    metadata: null,
    _count: {
      messages: 2
    }
  });
  const legacyNoControlConversation = createConversation({
    id: "conv_legacy_no_control",
    title: "旧会话无控制字段",
    metadata: {
      legacyFlag: true
    },
    _count: {
      messages: 3
    }
  });
  const legacyEmptyDeletedAtConversation = createConversation({
    id: "conv_legacy_empty_deleted_at",
    title: "旧会话空删除时间",
    metadata: {
      conversationControl: {
        deletedAt: ""
      }
    },
    _count: {
      messages: 4
    }
  });
  const db = {
    conversation: {
      findMany: async (args: AnyRecord) => {
        captured.findManyArgs = args;
        return [
          activeConversation,
          deletedConversation,
          legacyNullMetadataConversation,
          legacyNoControlConversation,
          legacyEmptyDeletedAtConversation
        ].filter((conversation) => {
          const metadata = conversation.metadata;
          const control = metadata && typeof metadata === "object" && !Array.isArray(metadata)
            ? (metadata as AnyRecord).conversationControl
            : null;
          const deletedAt = control && typeof control === "object" && !Array.isArray(control)
            ? (control as AnyRecord).deletedAt
            : null;

          return typeof deletedAt !== "string" || !deletedAt;
        }).map((conversation) => {
          const selectedConversation = { ...conversation };

          Reflect.deleteProperty(selectedConversation, "metadata");
          return selectedConversation;
        });
      },
      findFirst: async () => ({
        ...activeConversation,
        messages: [
          {
            id: "message_1",
            userId: actor.id,
            role: "ASSISTANT",
            content: FULL_HISTORY_ANSWER,
            attachments: [],
            sources: [
              {
                chunk_id: "chunk_1",
                file_id: "file_1",
                title: "破冰资料",
                score: 0.92
              }
            ],
            metadata: {
              responseId: "response_1",
              userQuery: "怎么破冰？",
              behaviorFeedbackSeed: {
                responseId: "response_1"
              },
              customerAnswer: "您好，可以先从共同话题开始。",
              finalizedAnswer: {
                title: "破冰建议",
                problemUnderstanding: "客户刚加好友，需要先建立信任。",
                keyConclusion: "先聊生活场景，再自然承接后续沟通。",
                suggestedSteps: ["观察朋友圈", "选择共同话题"],
                customerReply: "您好，可以先从共同话题开始。",
                nextAction: "等待客户回复后再承接。",
                debug: `${LARGE_METADATA_SENTINEL}:${"d".repeat(128_000)}`,
                salesLoopV2: {
                  internalDiagnostics: `${LARGE_METADATA_SENTINEL}:${"s".repeat(128_000)}`
                }
              },
              aiRuntime: {
                internalDiagnostics: `${LARGE_METADATA_SENTINEL}:${"a".repeat(128_000)}`
              }
            },
            createdAt: new Date("2026-07-14T10:01:00.000Z")
          }
        ]
      })
    }
  } as unknown as AiChatDb;

  const result = await listAiChatConversations(actor, db);

  assert.deepEqual(
    result.conversations.map((conversation) => conversation.id),
    [
      "conv_active",
      "conv_legacy_null",
      "conv_legacy_no_control",
      "conv_legacy_empty_deleted_at"
    ]
  );
  assert.equal(
    result.conversations.some((conversation) => conversation.id === "conv_deleted"),
    false
  );
  assert.equal(
    result.conversations.every((conversation) => conversation.metadata === null),
    true
  );
  assert.equal(JSON.stringify(result).includes(LARGE_METADATA_SENTINEL), false);
  assert.deepEqual(result.conversations[0], {
    id: "conv_active",
    title: "正常会话",
    mode: "expert",
    metadata: null,
    message_count: 12,
    pinned: false,
    pinned_at: null,
    created_at: "2026-07-14T10:00:00.000Z",
    updated_at: "2026-07-14T10:05:00.000Z"
  });

  const findManyArgs = captured.findManyArgs;

  assert.ok(findManyArgs);
  assert.deepEqual(findManyArgs.where, {
    userId: actor.id,
    type: "CHAT",
    OR: [
      {
        metadata: {
          path: ["conversationControl", "deletedAt"],
          equals: Prisma.AnyNull
        }
      },
      {
        metadata: {
          path: ["conversationControl", "deletedAt"],
          equals: ""
        }
      }
    ]
  });
  assert.deepEqual(findManyArgs.orderBy, {
    updatedAt: "desc"
  });
  assert.equal(findManyArgs.take, 50);
  assert.deepEqual(findManyArgs.select, {
    id: true,
    title: true,
    mode: true,
    createdAt: true,
    updatedAt: true,
    _count: {
      select: {
        messages: true
      }
    }
  });
  assert.equal("include" in findManyArgs, false);

  const history = await getAiChatHistory(actor, "conv_active", db);

  assert.equal(history.conversation.metadata, null);
  assert.equal(history.messages.length, 1);
  assert.equal(history.messages[0]?.content, FULL_HISTORY_ANSWER);
  assert.equal(history.messages[0]?.rawContent, FULL_HISTORY_ANSWER);
  assert.equal(history.messages[0]?.customer_answer, "您好，可以先从共同话题开始。");
  assert.deepEqual(history.messages[0]?.metadata, {
    responseId: "response_1",
    userQuery: "怎么破冰？",
    behaviorFeedbackSeed: {
      responseId: "response_1"
    }
  });
  assert.deepEqual(history.messages[0]?.finalized_answer, {
    title: "破冰建议",
    problemUnderstanding: "客户刚加好友，需要先建立信任。",
    keyConclusion: "先聊生活场景，再自然承接后续沟通。",
    suggestedSteps: ["观察朋友圈", "选择共同话题"],
    customerReply: "您好，可以先从共同话题开始。",
    nextAction: "等待客户回复后再承接。"
  });
  assert.equal(JSON.stringify(history).includes(LARGE_METADATA_SENTINEL), false);
  assert.ok(Buffer.byteLength(JSON.stringify(history)) < 10_000);

  console.log("AI chat conversation list and compact history tests passed.");
}

void main();
