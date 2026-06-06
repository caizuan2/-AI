import assert from "node:assert/strict";
import {
  canAccessAdminApiRole,
  canAccessKnowledgeManagementRole,
  canSoftDeleteKnowledgeRole
} from "../lib/rbac/roles";
import { softDeleteKnowledgeItem } from "../lib/knowledge/soft-delete";

type FakeKnowledgeRecord = {
  id: string;
  userId: string;
  title: string;
  sourceType: string;
  sourceId: string | null;
  sourceTitle: string | null;
  deletedAt: Date | null;
};

function createFakeSoftDeleteDb(initial: FakeKnowledgeRecord | null) {
  let record = initial;
  const calls = {
    updates: [] as unknown[],
    auditLogs: [] as unknown[],
    physicalDeletes: 0,
    fileDeletes: 0
  };
  const tx = {
    knowledgeItem: {
      findUnique: async () => record,
      update: async (args: { data: { deletedAt: Date } }) => {
        calls.updates.push(args);

        if (!record) {
          throw new Error("record missing");
        }

        record = {
          ...record,
          deletedAt: args.data.deletedAt
        };

        return {
          id: record.id,
          deletedAt: record.deletedAt
        };
      },
      delete: async () => {
        calls.physicalDeletes += 1;
      },
      deleteMany: async () => {
        calls.physicalDeletes += 1;
      }
    },
    auditLog: {
      create: async (args: unknown) => {
        calls.auditLogs.push(args);
      }
    },
    fileStorage: {
      delete: async () => {
        calls.fileDeletes += 1;
      }
    }
  };

  return {
    calls,
    db: {
      $transaction: async <T>(action: (transaction: typeof tx) => Promise<T>) => action(tx)
    }
  };
}

assert.equal(canSoftDeleteKnowledgeRole("user"), false);
assert.equal(canSoftDeleteKnowledgeRole("kb_admin"), false);
assert.equal(canSoftDeleteKnowledgeRole("super_admin"), true);

assert.equal(canAccessAdminApiRole("user"), false);
assert.equal(canAccessAdminApiRole("kb_admin"), false);
assert.equal(canAccessAdminApiRole("super_admin"), true);

assert.equal(canAccessKnowledgeManagementRole("user"), false);
assert.equal(canAccessKnowledgeManagementRole("kb_admin"), true);
assert.equal(canAccessKnowledgeManagementRole("super_admin"), true);

async function main() {
  const request = new Request("https://example.test/api/knowledge/k_1", {
    headers: {
      "x-forwarded-for": "203.0.113.7",
      "user-agent": "rbac-test"
    }
  });
  const fake = createFakeSoftDeleteDb({
    id: "k_1",
    userId: "owner_1",
    title: "历史知识库文件",
    sourceType: "document",
    sourceId: "uploads/original-file.pdf",
    sourceTitle: "original-file.pdf",
    deletedAt: null
  });
  const result = await softDeleteKnowledgeItem({
    knowledgeItemId: "k_1",
    actor: {
      id: "admin_1",
      role: "super_admin"
    },
    request,
    reason: "security test"
  }, fake.db);

  assert.equal(result.id, "k_1");
  assert.equal(result.deleted, true);
  assert.equal(result.alreadyDeleted, false);
  assert.equal(fake.calls.updates.length, 1);
  assert.equal(fake.calls.physicalDeletes, 0);
  assert.equal(fake.calls.fileDeletes, 0);
  assert.equal(fake.calls.auditLogs.length, 1);

  const updateArgs = fake.calls.updates[0] as {
    data: {
      status: string;
      deletedAt: Date;
      deletedByUserId: string;
      deleteReason: string;
    };
  };
  assert.equal(updateArgs.data.status, "archived");
  assert.ok(updateArgs.data.deletedAt instanceof Date);
  assert.equal(updateArgs.data.deletedByUserId, "admin_1");
  assert.equal(updateArgs.data.deleteReason, "security test");

  const auditArgs = fake.calls.auditLogs[0] as {
    data: {
      userId: string;
      role: string;
      action: string;
      targetType: string;
      targetId: string;
      ip: string;
      userAgent: string;
      metadata: {
        ownerUserId: string;
        sourceId: string;
        sourceTitle: string;
        reason: string;
      };
    };
  };
  assert.equal(auditArgs.data.userId, "admin_1");
  assert.equal(auditArgs.data.role, "super_admin");
  assert.equal(auditArgs.data.action, "KNOWLEDGE_SOFT_DELETE_SUCCESS");
  assert.equal(auditArgs.data.targetType, "knowledge_item");
  assert.equal(auditArgs.data.targetId, "k_1");
  assert.equal(auditArgs.data.ip, "203.0.113.7");
  assert.equal(auditArgs.data.userAgent, "rbac-test");
  assert.equal(auditArgs.data.metadata.ownerUserId, "owner_1");
  assert.equal(auditArgs.data.metadata.sourceId, "uploads/original-file.pdf");
  assert.equal(auditArgs.data.metadata.sourceTitle, "original-file.pdf");
  assert.equal(auditArgs.data.metadata.reason, "security test");

  const alreadyDeletedAt = new Date("2026-06-06T00:00:00.000Z");
  const alreadyDeleted = createFakeSoftDeleteDb({
    id: "k_2",
    userId: "owner_1",
    title: "已软删知识",
    sourceType: "manual_note",
    sourceId: null,
    sourceTitle: null,
    deletedAt: alreadyDeletedAt
  });
  const alreadyDeletedResult = await softDeleteKnowledgeItem({
    knowledgeItemId: "k_2",
    actor: {
      id: "admin_1",
      role: "super_admin"
    }
  }, alreadyDeleted.db);

  assert.equal(alreadyDeletedResult.alreadyDeleted, true);
  assert.equal(alreadyDeletedResult.deletedAt.toISOString(), alreadyDeletedAt.toISOString());
  assert.equal(alreadyDeleted.calls.updates.length, 0);
  assert.equal(alreadyDeleted.calls.physicalDeletes, 0);
  assert.equal(alreadyDeleted.calls.fileDeletes, 0);
  assert.equal(alreadyDeleted.calls.auditLogs.length, 1);

  console.log("RBAC knowledge delete protection tests passed.");
}

void main();
