import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isConversationActionNotFoundError,
  isConversationActionTerminalPinMigrationError,
  updateConversationPin
} from "../app/(user)/chat-ui/api";
import {
  getAiChatHistory,
  listAiChatConversations,
  type AiChatDb
} from "../lib/ai-chat/ask";

type FindManyArgs = {
  where?: {
    id?: {
      in?: string[];
    };
  };
  take?: number;
};

const pinnedAt = new Date("2026-07-16T06:00:00.000Z");
const pinnedConversation = {
  id: "conversation-pinned-old",
  userId: "user-1",
  title: "较早但已置顶的会话",
  type: "CHAT",
  mode: "fast",
  metadata: null,
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
  updatedAt: new Date("2026-06-01T01:00:00.000Z"),
  _count: {
    messages: 2
  }
};
const recentConversation = {
  id: "conversation-recent",
  userId: "user-1",
  title: "最近会话",
  type: "CHAT",
  mode: "fast",
  metadata: null,
  createdAt: new Date("2026-07-16T05:00:00.000Z"),
  updatedAt: new Date("2026-07-16T05:30:00.000Z"),
  _count: {
    messages: 1
  }
};

async function main() {
  const conversationFindManyCalls: FindManyArgs[] = [];
  let pinFindManyTake: number | undefined;
  const db = {
    conversation: {
      findMany: async (args: FindManyArgs) => {
        conversationFindManyCalls.push(args);

        if (args.where?.id?.in) {
          return args.where.id.in.includes(pinnedConversation.id)
            ? [pinnedConversation]
            : [];
        }

        return [recentConversation];
      }
    },
    userConversationPin: {
      findMany: async (args: { take?: number }) => {
        pinFindManyTake = args.take;

        return [{
          conversationId: pinnedConversation.id,
          pinnedAt
        }];
      }
    }
  } as unknown as AiChatDb;
  const result = await listAiChatConversations({
    id: "user-1",
    role: "user"
  }, db);

  assert.deepEqual(
    result.conversations.map((conversation) => conversation.id),
    [pinnedConversation.id, recentConversation.id]
  );
  assert.equal(result.conversations[0]?.pinned, true);
  assert.equal(result.conversations[0]?.pinned_at, pinnedAt.toISOString());
  assert.equal(result.conversations[1]?.pinned, false);
  assert.equal(result.conversations[1]?.pinned_at, null);
  assert.equal(conversationFindManyCalls[0]?.take, 50);
  assert.equal(pinFindManyTake, 100);
  assert.deepEqual(
    conversationFindManyCalls[1]?.where?.id?.in,
    [pinnedConversation.id]
  );

  const localOnlyCompatibleDb = {
    conversation: {
      findMany: async () => [recentConversation]
    }
  } as unknown as AiChatDb;
  const localOnlyCompatibleResult = await listAiChatConversations({
    id: "user-1",
    role: "user"
  }, localOnlyCompatibleDb);

  assert.equal(localOnlyCompatibleResult.conversations[0]?.pinned, false);
  assert.equal(localOnlyCompatibleResult.conversations[0]?.pinned_at, null);

  const historyResult = await getAiChatHistory({
    id: "user-1",
    role: "user"
  }, pinnedConversation.id, {
    conversation: {
      findFirst: async () => ({
        ...pinnedConversation,
        messages: []
      })
    },
    userConversationPin: {
      findMany: async () => [{
        conversationId: pinnedConversation.id,
        pinnedAt
      }]
    }
  } as unknown as AiChatDb);

  assert.equal(historyResult.conversation.pinned, true);
  assert.equal(historyResult.conversation.pinned_at, pinnedAt.toISOString());

  const originalFetch = globalThis.fetch;
  const originalConsoleWarn = console.warn;

  try {
    console.warn = () => undefined;
    globalThis.fetch = async () => new Response(JSON.stringify({
      ok: false,
      success: false,
      code: "NOT_FOUND",
      message: "会话不存在。",
      error: {
        code: "NOT_FOUND",
        message: "会话不存在。"
      }
    }), {
      status: 404,
      headers: {
        "Content-Type": "application/json"
      }
    });

    await assert.rejects(
      updateConversationPin("missing-conversation", true),
      (error: unknown) => (
        isConversationActionNotFoundError(error) &&
        isConversationActionTerminalPinMigrationError(error)
      )
    );

    globalThis.fetch = async () => new Response(JSON.stringify({
      ok: false,
      success: false,
      code: "VALIDATION_ERROR",
      message: "最多可置顶 100 个会话。"
    }), {
      status: 400,
      headers: {
        "Content-Type": "application/json"
      }
    });

    await assert.rejects(
      updateConversationPin("over-limit-conversation", true),
      (error: unknown) => isConversationActionTerminalPinMigrationError(error)
    );
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalConsoleWarn;
  }

  const schemaSource = readFileSync("prisma/schema.prisma", "utf8");
  const migrationSource = readFileSync(
    "prisma/migrations/20260716150000_add_user_conversation_pins/migration.sql",
    "utf8"
  );
  const routeSource = readFileSync("app/api/user/conversations/[id]/pin/route.ts", "utf8");
  const operationsSource = readFileSync("lib/conversation-control/operations.ts", "utf8");
  const featureFlagsSource = readFileSync("lib/conversation-control/feature-flags.ts", "utf8");

  assert.match(schemaSource, /model UserConversationPin/);
  assert.match(schemaSource, /@@unique\(\[userId, conversationId\]/);
  assert.match(schemaSource, /@@index\(\[userId, pinnedAt\]/);
  assert.match(migrationSource, /CREATE TABLE "user_conversation_pins"/);
  assert.match(migrationSource, /ON DELETE CASCADE ON UPDATE CASCADE/);
  assert.match(routeSource, /export async function PUT/);
  assert.match(routeSource, /requireConversationUser/);
  assert.match(routeSource, /setConversationPin/);
  assert.match(operationsSource, /prisma\.\$transaction/);
  assert.match(operationsSource, /pg_advisory_xact_lock/);
  assert.match(operationsSource, /transaction\.userConversationPin\.upsert/);
  assert.match(operationsSource, /transaction\.userConversationPin\.deleteMany/);
  assert.match(operationsSource, /softDeleteConversation[\s\S]*transaction\.userConversationPin\.deleteMany/);
  assert.match(operationsSource, /MAX_PINNED_CONVERSATIONS = 100/);
  assert.match(operationsSource, /transaction\.userConversationPin\.count/);
  assert.match(featureFlagsSource, /releasedConversationFeatureFloor[\s\S]*pinCloudSync: true/);

  console.log("AI chat conversation pin tests passed");
}

void main();
