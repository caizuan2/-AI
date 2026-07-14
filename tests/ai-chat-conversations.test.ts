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
        messages: []
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

  assert.deepEqual(history.conversation.metadata, activeConversation.metadata);
  assert.equal(
    JSON.stringify(history.conversation.metadata).includes(LARGE_METADATA_SENTINEL),
    true
  );

  console.log("AI chat conversation list tests passed.");
}

void main();
