import assert from "node:assert/strict";
import { ValidationError } from "../lib/errors";
import {
  createAdminKbTextIngestion,
  decodeAdminKbTextFile,
  retryAdminKbIngestionJob,
  validateAdminKbUpload,
  adminKbUploadLimits
} from "../lib/admin-kb/ingestion";
import {
  canAccessKnowledgeManagementRole,
  canDeleteKnowledgeFileRole
} from "../lib/rbac/roles";

type AnyRecord = Record<string, unknown>;

function createFakeDb() {
  const state = {
    jobSeq: 0,
    itemSeq: 0,
    fileSeq: 0,
    jobs: [] as AnyRecord[],
    items: [] as AnyRecord[],
    files: [] as AnyRecord[],
    chunks: [] as AnyRecord[],
    auditLogs: [] as AnyRecord[]
  };

  function now() {
    return new Date("2026-06-06T12:00:00.000Z");
  }

  const tx = {
    ingestionJob: {
      create: async ({ data }: { data: AnyRecord }) => {
        const job = {
          id: `job_${++state.jobSeq}`,
          ...data,
          sourceId: data.sourceId ?? null,
          fileId: data.fileId ?? null,
          knowledgeItemId: data.knowledgeItemId ?? null,
          errorMessage: data.errorMessage ?? null,
          createdAt: now(),
          updatedAt: now(),
          finishedAt: data.finishedAt ?? null
        };

        state.jobs.push(job);
        return job;
      },
      update: async ({ where, data }: { where: { id: string }; data: AnyRecord }) => {
        const job = state.jobs.find((item) => item.id === where.id);

        assert.ok(job);
        Object.assign(job, data, { updatedAt: now() });
        return job;
      }
    },
    knowledgeItem: {
      create: async ({ data }: { data: AnyRecord }) => {
        const item: AnyRecord & { chunks: AnyRecord[] } = {
          id: `item_${++state.itemSeq}`,
          ...data,
          createdAt: now(),
          updatedAt: now(),
          chunks: []
        };
        const createChunks = ((data.chunks as AnyRecord | undefined)?.create ?? []) as AnyRecord[];

        item.chunks = createChunks.map((chunk) => ({
          id: `chunk_${state.chunks.length + 1}`,
          knowledgeItemId: item.id,
          ...chunk,
          createdAt: now()
        }));
        state.items.push(item);
        state.chunks.push(...(item.chunks as AnyRecord[]));
        return item;
      }
    },
    knowledgeFile: {
      create: async ({ data }: { data: AnyRecord }) => {
        const file = {
          id: `file_${++state.fileSeq}`,
          ...data,
          createdAt: now(),
          updatedAt: now(),
          deletedAt: null
        };

        state.files.push(file);
        return file;
      },
      update: async ({ where, data }: { where: { id: string }; data: AnyRecord }) => {
        const file = state.files.find((item) => item.id === where.id);

        assert.ok(file);
        Object.assign(file, data, { updatedAt: now() });
        return file;
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
  };
  const db = {
    $transaction: async <T>(action: (transaction: typeof tx) => Promise<T>) => action(tx),
    ingestionJob: {
      findFirst: async ({ where }: { where: { id: string; createdByUserId?: string } }) => {
        return state.jobs.find((job) => (
          job.id === where.id &&
          (where.createdByUserId === undefined || job.createdByUserId === where.createdByUserId)
        )) ?? null;
      },
      update: async ({ where, data }: { where: { id: string }; data: AnyRecord }) => {
        const job = state.jobs.find((item) => item.id === where.id);

        assert.ok(job);
        Object.assign(job, data, { updatedAt: now() });
        return job;
      }
    },
    auditLog: tx.auditLog
  };

  return { db, state };
}

async function assertRejectsValidation(action: () => Promise<unknown>) {
  await assert.rejects(action, (error) => error instanceof ValidationError);
}

async function main() {
  assert.equal(canAccessKnowledgeManagementRole("user"), false);
  assert.equal(canAccessKnowledgeManagementRole("kb_admin"), true);
  assert.equal(canAccessKnowledgeManagementRole("super_admin"), true);
  assert.equal(canDeleteKnowledgeFileRole("kb_admin"), false);
  assert.equal(canDeleteKnowledgeFileRole("super_admin"), false);

  const kbAdminDb = createFakeDb();
  const kbAdminResult = await createAdminKbTextIngestion({
    id: "kb_admin_1",
    role: "kb_admin"
  }, {
    title: "门店 SOP",
    content: "开店前检查库存、设备和排班。\n遇到异常先记录，再通知负责人。",
    categoryId: "运营",
    tags: ["SOP", "门店"]
  }, kbAdminDb.db);

  assert.equal(kbAdminResult.job.status, "completed");
  assert.equal(kbAdminResult.knowledgeItem.chunkCount, 1);
  assert.equal(kbAdminDb.state.jobs.length, 1);
  assert.equal(kbAdminDb.state.items.length, 1);
  assert.equal(kbAdminDb.state.chunks.length, 1);
  assert.equal(kbAdminDb.state.auditLogs.some((log) => log.action === "INGEST_TEXT_CREATE"), true);
  assert.equal(kbAdminDb.state.auditLogs.some((log) => log.action === "INGEST_JOB_SUCCESS"), true);

  const superAdminDb = createFakeDb();
  const superAdminResult = await createAdminKbTextIngestion({
    id: "super_admin_1",
    role: "super_admin"
  }, {
    title: "制度说明",
    content: "超级管理员可以投喂知识，但删除仍然只能软删除。",
    categoryId: "安全"
  }, superAdminDb.db);

  assert.equal(superAdminResult.job.status, "completed");
  assert.equal(superAdminDb.state.items.length, 1);

  await assertRejectsValidation(() => createAdminKbTextIngestion({
    id: "kb_admin_1",
    role: "kb_admin"
  }, {
    content: "   "
  }, createFakeDb().db));

  assert.throws(() => validateAdminKbUpload({
    originalName: "unsafe.exe",
    mimeType: "application/x-msdownload",
    size: 100
  }), ValidationError);

  assert.throws(() => validateAdminKbUpload({
    originalName: "large.txt",
    mimeType: "text/plain",
    size: adminKbUploadLimits.maxFileSizeBytes + 1
  }), ValidationError);

  const utf8Decoded = decodeAdminKbTextFile(new TextEncoder().encode("瘦身KKS TXT 解析测试"));
  assert.equal(utf8Decoded.text, "瘦身KKS TXT 解析测试");
  assert.equal(utf8Decoded.encoding, "utf-8");

  const gb18030Decoded = decodeAdminKbTextFile(Uint8Array.from([0xd6, 0xd0, 0xce, 0xc4, 0xb2, 0xe2, 0xca, 0xd4]));
  assert.equal(gb18030Decoded.text, "中文测试");
  assert.equal(gb18030Decoded.encoding, "gb18030");

  assert.equal(validateAdminKbUpload({
    originalName: "招商资料.pdf",
    mimeType: "application/octet-stream",
    size: 100
  }).processor, "pdf");

  const retryDb = createFakeDb();
  retryDb.state.jobs.push({
    id: "failed_job",
    sourceType: "text",
    sourceId: null,
    status: "failed",
    progress: 50,
    errorMessage: "processor failed",
    createdByUserId: "kb_admin_1",
    createdAt: new Date("2026-06-06T10:00:00.000Z"),
    updatedAt: new Date("2026-06-06T10:00:00.000Z"),
    finishedAt: new Date("2026-06-06T10:01:00.000Z")
  });

  const retryResult = await retryAdminKbIngestionJob({
    id: "kb_admin_1",
    role: "kb_admin"
  }, "failed_job", retryDb.db);

  assert.equal(retryResult.job.status, "pending");
  assert.equal(retryResult.job.progress, 0);
  assert.equal(retryDb.state.auditLogs.some((log) => log.action === "INGEST_JOB_RETRY"), true);

  console.log("Admin KB ingestion tests passed.");
}

void main();
