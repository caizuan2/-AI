const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Client } = require("pg");

const REQUIRED_TABLES = [
  "users",
  "sessions",
  "license_keys",
  "activation_logs",
  "user_settings",
  "conversations",
  "messages",
  "knowledge_items",
  "knowledge_chunks",
  "knowledge_merge_histories",
  "knowledge_completion_suggestions",
  "feedback",
  "analytics_events"
];

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,x-admin-token",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

function getHeader(event, name) {
  const headers = event.headers || {};
  return headers[name] || headers[name.toLowerCase()] || "";
}

function requireAdmin(event) {
  const serverToken = process.env.ADMIN_TOKEN?.trim();
  const requestToken = String(getHeader(event, "x-admin-token") || "").trim();

  if (!serverToken) {
    return {
      ok: false,
      response: json(500, {
        ok: false,
        error: "MISSING_ADMIN_TOKEN",
        message: "Netlify 环境变量 ADMIN_TOKEN 未配置"
      })
    };
  }

  if (requestToken !== serverToken) {
    return {
      ok: false,
      response: json(401, {
        ok: false,
        error: "INVALID_ADMIN_TOKEN",
        message: "管理员 token 错误",
        token_length: requestToken.length,
        has_server_admin_token: Boolean(serverToken)
      })
    };
  }

  return { ok: true };
}

function getPgClient() {
  const connectionString = process.env.DATABASE_URL?.trim();

  if (!connectionString) {
    throw new Error("Netlify 环境变量 DATABASE_URL 未配置");
  }

  const parsedUrl = new URL(connectionString);
  const sslmode = parsedUrl.searchParams.get("sslmode");
  const isSupabase = parsedUrl.hostname.includes("supabase.com");

  return new Client({
    connectionString,
    ssl: sslmode === "disable" ? false : (isSupabase || sslmode === "require" ? { rejectUnauthorized: false } : undefined)
  });
}

function getMigrationDirectories() {
  const candidates = [
    path.join(process.cwd(), "prisma", "migrations"),
    path.join(__dirname, "..", "..", "prisma", "migrations"),
    path.join(__dirname, "prisma", "migrations")
  ];
  const migrationsDir = candidates.find((candidate) => fs.existsSync(candidate));

  if (!migrationsDir) {
    return [];
  }

  return fs.readdirSync(migrationsDir)
    .filter((name) => fs.existsSync(path.join(migrationsDir, name, "migration.sql")))
    .sort()
    .map((name) => {
      const sql = fs.readFileSync(path.join(migrationsDir, name, "migration.sql"), "utf8");

      return {
        name,
        checksum: crypto.createHash("sha256").update(sql).digest("hex")
      };
    });
}

async function getSchemaStatus(client) {
  const rows = await client.query(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1)
    `,
    [REQUIRED_TABLES]
  );
  const existingTables = rows.rows.map((row) => row.table_name).sort();
  const missingTables = REQUIRED_TABLES.filter((table) => !existingTables.includes(table));

  return {
    existingTables,
    missingTables,
    ready: missingTables.length === 0
  };
}

const requiredStatements = [
  `CREATE EXTENSION IF NOT EXISTS vector`,
  `DO $$ BEGIN CREATE TYPE "ConversationType" AS ENUM ('INGEST', 'CHAT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE "KnowledgeSaveStrategy" AS ENUM ('MANUAL_CONFIRM', 'AUTO_SAVE_AFTER_AI', 'ANALYZE_ONLY'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE "KnowledgeReviewStatus" AS ENUM ('NEEDS_REVIEW', 'MASTERED', 'EXPIRED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE "FeedbackType" AS ENUM ('ISSUE', 'SUGGESTION', 'BUG', 'RAG_HELPFUL', 'RAG_NOT_HELPFUL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE "FeedbackStatus" AS ENUM ('OPEN', 'REVIEWING', 'RESOLVED', 'ARCHIVED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE "AnalyticsEventType" AS ENUM ('CHAT_QUESTION', 'RAG_RETRIEVAL', 'AI_CALL', 'FILE_UPLOAD'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE "LicenseKeyStatus" AS ENUM ('UNUSED', 'USED', 'DISABLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE TABLE IF NOT EXISTS "users" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL DEFAULT '',
    "name" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "licenseActivated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
  )`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email" TEXT`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" TEXT`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "name" TEXT`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "licenseActivated" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
  `ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL`,
  `ALTER TABLE "users" ALTER COLUMN "name" DROP NOT NULL`,
  `WITH numbered AS (
    SELECT "id", row_number() OVER (ORDER BY "createdAt", "id") AS rn
    FROM "users"
    WHERE "phone" IS NULL
  )
  UPDATE "users"
  SET "phone" = '+1999' || lpad(numbered.rn::text, 10, '0')
  FROM numbered
  WHERE "users"."id" = numbered."id"`,
  `ALTER TABLE "users" ALTER COLUMN "phone" SET NOT NULL`,
  `CREATE TABLE IF NOT EXISTS "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "license_keys" (
    "id" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "status" "LicenseKeyStatus" NOT NULL DEFAULT 'UNUSED',
    "redeemedByUserId" TEXT,
    "redeemedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "license_keys_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "activation_logs" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "message" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activation_logs_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "user_settings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "saveStrategy" "KnowledgeSaveStrategy" NOT NULL DEFAULT 'MANUAL_CONFIRM',
    "defaultExpireDays" INTEGER NOT NULL DEFAULT 90,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id")
  )`,
  `ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "defaultExpireDays" INTEGER NOT NULL DEFAULT 90`,
  `CREATE TABLE IF NOT EXISTS "conversations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "ConversationType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "knowledge_items" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category" TEXT NOT NULL,
    "importance" INTEGER NOT NULL,
    "clarityScore" INTEGER NOT NULL DEFAULT 3,
    "completenessScore" INTEGER NOT NULL DEFAULT 3,
    "usefulnessScore" INTEGER NOT NULL DEFAULT 3,
    "confidenceScore" INTEGER NOT NULL DEFAULT 3,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "sourceTitle" TEXT,
    "sourceUrl" TEXT,
    "sourceMessageId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "reviewStatus" "KnowledgeReviewStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "lastReviewedAt" TIMESTAMP(3),
    "nextReviewAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "knowledge_items_pkey" PRIMARY KEY ("id")
  )`,
  `ALTER TABLE "knowledge_items" ADD COLUMN IF NOT EXISTS "sourceTitle" TEXT`,
  `ALTER TABLE "knowledge_items" ADD COLUMN IF NOT EXISTS "sourceUrl" TEXT`,
  `ALTER TABLE "knowledge_items" ADD COLUMN IF NOT EXISTS "sourceMessageId" TEXT`,
  `ALTER TABLE "knowledge_items" ADD COLUMN IF NOT EXISTS "clarityScore" INTEGER NOT NULL DEFAULT 3`,
  `ALTER TABLE "knowledge_items" ADD COLUMN IF NOT EXISTS "completenessScore" INTEGER NOT NULL DEFAULT 3`,
  `ALTER TABLE "knowledge_items" ADD COLUMN IF NOT EXISTS "usefulnessScore" INTEGER NOT NULL DEFAULT 3`,
  `ALTER TABLE "knowledge_items" ADD COLUMN IF NOT EXISTS "confidenceScore" INTEGER NOT NULL DEFAULT 3`,
  `ALTER TABLE "knowledge_items" ADD COLUMN IF NOT EXISTS "reviewStatus" "KnowledgeReviewStatus" NOT NULL DEFAULT 'NEEDS_REVIEW'`,
  `ALTER TABLE "knowledge_items" ADD COLUMN IF NOT EXISTS "lastReviewedAt" TIMESTAMP(3)`,
  `ALTER TABLE "knowledge_items" ADD COLUMN IF NOT EXISTS "nextReviewAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP`,
  `ALTER TABLE "knowledge_items" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3)`,
  `ALTER TABLE "knowledge_items" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active'`,
  `CREATE TABLE IF NOT EXISTS "knowledge_merge_histories" (
    "id" TEXT NOT NULL,
    "knowledgeItemId" TEXT NOT NULL,
    "incomingTitle" TEXT NOT NULL,
    "incomingSummary" TEXT NOT NULL,
    "incomingContent" TEXT NOT NULL,
    "incomingTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "incomingCategory" TEXT NOT NULL,
    "incomingImportance" INTEGER NOT NULL,
    "incomingSourceType" TEXT NOT NULL,
    "incomingSourceTitle" TEXT,
    "incomingSourceUrl" TEXT,
    "incomingSourceMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "knowledge_merge_histories_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "knowledge_completion_suggestions" (
    "id" TEXT NOT NULL,
    "knowledgeItemId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'local',
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "knowledge_completion_suggestions_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "feedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "FeedbackType" NOT NULL,
    "content" TEXT NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'OPEN',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "analytics_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "type" "AnalyticsEventType" NOT NULL,
    "numericValue" DOUBLE PRECISION,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "knowledge_chunks" (
    "id" TEXT NOT NULL,
    "knowledgeItemId" TEXT NOT NULL,
    "chunkText" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "metadata" JSONB,
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id")
  )`
];

const indexStatements = [
  `CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "users_phone_key" ON "users"("phone")`,
  `CREATE INDEX IF NOT EXISTS "users_licenseActivated_idx" ON "users"("licenseActivated")`,
  `CREATE INDEX IF NOT EXISTS "users_isActive_idx" ON "users"("isActive")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "sessions_tokenHash_key" ON "sessions"("tokenHash")`,
  `CREATE INDEX IF NOT EXISTS "sessions_userId_idx" ON "sessions"("userId")`,
  `CREATE INDEX IF NOT EXISTS "sessions_expiresAt_idx" ON "sessions"("expiresAt")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "license_keys_keyHash_key" ON "license_keys"("keyHash")`,
  `CREATE INDEX IF NOT EXISTS "license_keys_status_idx" ON "license_keys"("status")`,
  `CREATE INDEX IF NOT EXISTS "license_keys_redeemedByUserId_idx" ON "license_keys"("redeemedByUserId")`,
  `CREATE INDEX IF NOT EXISTS "license_keys_expiresAt_idx" ON "license_keys"("expiresAt")`,
  `CREATE INDEX IF NOT EXISTS "activation_logs_codeHash_idx" ON "activation_logs"("codeHash")`,
  `CREATE INDEX IF NOT EXISTS "activation_logs_userId_idx" ON "activation_logs"("userId")`,
  `CREATE INDEX IF NOT EXISTS "activation_logs_success_idx" ON "activation_logs"("success")`,
  `CREATE INDEX IF NOT EXISTS "activation_logs_createdAt_idx" ON "activation_logs"("createdAt")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "user_settings_userId_key" ON "user_settings"("userId")`,
  `CREATE INDEX IF NOT EXISTS "user_settings_saveStrategy_idx" ON "user_settings"("saveStrategy")`,
  `CREATE INDEX IF NOT EXISTS "conversations_userId_idx" ON "conversations"("userId")`,
  `CREATE INDEX IF NOT EXISTS "conversations_type_idx" ON "conversations"("type")`,
  `CREATE INDEX IF NOT EXISTS "conversations_updatedAt_idx" ON "conversations"("updatedAt")`,
  `CREATE INDEX IF NOT EXISTS "messages_conversationId_idx" ON "messages"("conversationId")`,
  `CREATE INDEX IF NOT EXISTS "messages_createdAt_idx" ON "messages"("createdAt")`,
  `CREATE INDEX IF NOT EXISTS "knowledge_items_userId_idx" ON "knowledge_items"("userId")`,
  `CREATE INDEX IF NOT EXISTS "knowledge_items_category_idx" ON "knowledge_items"("category")`,
  `CREATE INDEX IF NOT EXISTS "knowledge_items_importance_idx" ON "knowledge_items"("importance")`,
  `CREATE INDEX IF NOT EXISTS "knowledge_items_status_idx" ON "knowledge_items"("status")`,
  `CREATE INDEX IF NOT EXISTS "knowledge_items_expiresAt_idx" ON "knowledge_items"("expiresAt")`,
  `CREATE INDEX IF NOT EXISTS "knowledge_items_userId_status_expiresAt_idx" ON "knowledge_items"("userId", "status", "expiresAt")`,
  `CREATE INDEX IF NOT EXISTS "knowledge_items_reviewStatus_idx" ON "knowledge_items"("reviewStatus")`,
  `CREATE INDEX IF NOT EXISTS "knowledge_items_nextReviewAt_idx" ON "knowledge_items"("nextReviewAt")`,
  `CREATE INDEX IF NOT EXISTS "knowledge_items_userId_reviewStatus_nextReviewAt_idx" ON "knowledge_items"("userId", "reviewStatus", "nextReviewAt")`,
  `CREATE INDEX IF NOT EXISTS "knowledge_items_sourceType_sourceId_idx" ON "knowledge_items"("sourceType", "sourceId")`,
  `CREATE INDEX IF NOT EXISTS "knowledge_items_sourceType_sourceMessageId_idx" ON "knowledge_items"("sourceType", "sourceMessageId")`,
  `CREATE INDEX IF NOT EXISTS "knowledge_items_updatedAt_idx" ON "knowledge_items"("updatedAt")`,
  `CREATE INDEX IF NOT EXISTS "knowledge_merge_histories_knowledgeItemId_idx" ON "knowledge_merge_histories"("knowledgeItemId")`,
  `CREATE INDEX IF NOT EXISTS "knowledge_merge_histories_createdAt_idx" ON "knowledge_merge_histories"("createdAt")`,
  `CREATE INDEX IF NOT EXISTS "knowledge_completion_suggestions_knowledgeItemId_idx" ON "knowledge_completion_suggestions"("knowledgeItemId")`,
  `CREATE INDEX IF NOT EXISTS "knowledge_completion_suggestions_updatedAt_idx" ON "knowledge_completion_suggestions"("updatedAt")`,
  `CREATE INDEX IF NOT EXISTS "knowledge_completion_suggestions_mode_idx" ON "knowledge_completion_suggestions"("mode")`,
  `CREATE INDEX IF NOT EXISTS "feedback_userId_idx" ON "feedback"("userId")`,
  `CREATE INDEX IF NOT EXISTS "feedback_type_idx" ON "feedback"("type")`,
  `CREATE INDEX IF NOT EXISTS "feedback_status_idx" ON "feedback"("status")`,
  `CREATE INDEX IF NOT EXISTS "feedback_createdAt_idx" ON "feedback"("createdAt")`,
  `CREATE INDEX IF NOT EXISTS "analytics_events_userId_idx" ON "analytics_events"("userId")`,
  `CREATE INDEX IF NOT EXISTS "analytics_events_userId_occurredAt_idx" ON "analytics_events"("userId", "occurredAt")`,
  `CREATE INDEX IF NOT EXISTS "analytics_events_type_idx" ON "analytics_events"("type")`,
  `CREATE INDEX IF NOT EXISTS "analytics_events_type_occurredAt_idx" ON "analytics_events"("type", "occurredAt")`,
  `CREATE INDEX IF NOT EXISTS "analytics_events_occurredAt_idx" ON "analytics_events"("occurredAt")`,
  `CREATE INDEX IF NOT EXISTS "knowledge_chunks_knowledgeItemId_idx" ON "knowledge_chunks"("knowledgeItemId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "knowledge_chunks_knowledgeItemId_chunkIndex_key" ON "knowledge_chunks"("knowledgeItemId", "chunkIndex")`
];

const optionalStatements = [
  `CREATE INDEX IF NOT EXISTS "knowledge_chunks_embedding_hnsw_idx"
    ON "knowledge_chunks"
    USING hnsw ("embedding" vector_cosine_ops)
    WHERE "embedding" IS NOT NULL`
];

const foreignKeyStatements = [
  ["sessions_userId_fkey", `ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`],
  ["license_keys_redeemedByUserId_fkey", `ALTER TABLE "license_keys" ADD CONSTRAINT "license_keys_redeemedByUserId_fkey" FOREIGN KEY ("redeemedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`],
  ["user_settings_userId_fkey", `ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`],
  ["conversations_userId_fkey", `ALTER TABLE "conversations" ADD CONSTRAINT "conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`],
  ["messages_conversationId_fkey", `ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE`],
  ["knowledge_items_userId_fkey", `ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`],
  ["knowledge_chunks_knowledgeItemId_fkey", `ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_knowledgeItemId_fkey" FOREIGN KEY ("knowledgeItemId") REFERENCES "knowledge_items"("id") ON DELETE CASCADE ON UPDATE CASCADE`],
  ["knowledge_merge_histories_knowledgeItemId_fkey", `ALTER TABLE "knowledge_merge_histories" ADD CONSTRAINT "knowledge_merge_histories_knowledgeItemId_fkey" FOREIGN KEY ("knowledgeItemId") REFERENCES "knowledge_items"("id") ON DELETE CASCADE ON UPDATE CASCADE`],
  ["knowledge_completion_suggestions_knowledgeItemId_fkey", `ALTER TABLE "knowledge_completion_suggestions" ADD CONSTRAINT "knowledge_completion_suggestions_knowledgeItemId_fkey" FOREIGN KEY ("knowledgeItemId") REFERENCES "knowledge_items"("id") ON DELETE CASCADE ON UPDATE CASCADE`],
  ["feedback_userId_fkey", `ALTER TABLE "feedback" ADD CONSTRAINT "feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`],
  ["analytics_events_userId_fkey", `ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`]
];

async function ensureForeignKeys(client) {
  for (const [name, statement] of foreignKeyStatements) {
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = '${name.replace(/'/g, "''")}'
        ) THEN
          ${statement};
        END IF;
      END $$;
    `);
  }
}

async function ensurePrismaMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) NOT NULL PRIMARY KEY,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    )
  `);
}

async function markMigrationsApplied(client) {
  const migrations = getMigrationDirectories();

  await ensurePrismaMigrationsTable(client);

  const existingRows = await client.query(`
    SELECT "migration_name"
    FROM "_prisma_migrations"
    WHERE "rolled_back_at" IS NULL
  `);
  const existingNames = new Set(existingRows.rows.map((row) => row.migration_name));
  const marked = [];

  for (const migration of migrations) {
    if (existingNames.has(migration.name)) {
      continue;
    }

    await client.query(
      `
        INSERT INTO "_prisma_migrations" (
          "id",
          "checksum",
          "finished_at",
          "migration_name",
          "logs",
          "rolled_back_at",
          "started_at",
          "applied_steps_count"
        )
        VALUES ($1, $2, now(), $3, NULL, NULL, now(), 1)
        ON CONFLICT ("id") DO NOTHING
      `,
      [crypto.randomUUID(), migration.checksum, migration.name]
    );
    marked.push(migration.name);
  }

  return marked;
}

async function repairSchema(client) {
  const warnings = [];

  await client.query("BEGIN");
  try {
    for (const statement of requiredStatements) {
      await client.query(statement);
    }

    for (const statement of indexStatements) {
      await client.query(statement);
    }

    await ensureForeignKeys(client);
    const markedMigrations = await markMigrationsApplied(client);

    await client.query("COMMIT");

    for (const statement of optionalStatements) {
      try {
        await client.query(statement);
      } catch (error) {
        warnings.push(error instanceof Error ? error.message : "可选索引创建失败");
      }
    }

    return { warnings, markedMigrations };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function parseBody(event) {
  if (!event.body) {
    return {};
  }

  try {
    return JSON.parse(event.body);
  } catch {
    return {};
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: json(204, {}).headers,
      body: ""
    };
  }

  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return json(405, {
      ok: false,
      error: "METHOD_NOT_ALLOWED",
      message: "只支持 GET、POST、OPTIONS 请求。"
    });
  }

  const admin = requireAdmin(event);

  if (!admin.ok) {
    return admin.response;
  }

  const client = getPgClient();

  try {
    await client.connect();

    if (event.httpMethod === "GET") {
      const status = await getSchemaStatus(client);

      return json(200, {
        ok: true,
        action: "status",
        ...status
      });
    }

    const body = await parseBody(event);

    if (body.confirm !== "REPAIR_DATABASE_SCHEMA") {
      return json(400, {
        ok: false,
        error: "MISSING_CONFIRMATION",
        message: "请提交 {\"confirm\":\"REPAIR_DATABASE_SCHEMA\"} 后再执行修复。"
      });
    }

    const before = await getSchemaStatus(client);
    const result = await repairSchema(client);
    const after = await getSchemaStatus(client);

    return json(200, {
      ok: after.ready,
      action: "repair",
      before,
      after,
      warnings: result.warnings,
      markedMigrations: result.markedMigrations
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error: "DB_REPAIR_FAILED",
      message: error instanceof Error ? error.message : "数据库表结构修复失败"
    });
  } finally {
    await client.end().catch(() => undefined);
  }
};
