import "server-only";

import { prisma } from "@/lib/prisma";

export interface RegistrationSchemaStatus {
  ready: boolean;
  requiredTables: string[];
  missingTables: string[];
  missingColumns: Array<{
    table: string;
    column: string;
  }>;
  licenseKeyStatusEnum: boolean;
}

const requiredSchema: Record<string, string[]> = {
  users: [
    "id",
    "phone",
    "passwordHash",
    "name",
    "isActive",
    "licenseActivated",
    "createdAt",
    "updatedAt"
  ],
  sessions: ["id", "userId", "tokenHash", "expiresAt", "createdAt"],
  license_keys: ["id", "keyHash", "status", "redeemedByUserId", "redeemedAt", "expiresAt", "createdAt"],
  activation_logs: ["id", "codeHash", "userId", "success", "message", "ip", "userAgent", "createdAt"]
};

const registrationBootstrapStatements = [
  `DO $$
  BEGIN
    CREATE TYPE "LicenseKeyStatus" AS ENUM ('UNUSED', 'USED', 'DISABLED');
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$`,
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
  `CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "users_phone_key" ON "users"("phone")`,
  `CREATE INDEX IF NOT EXISTS "users_licenseActivated_idx" ON "users"("licenseActivated")`,
  `CREATE INDEX IF NOT EXISTS "users_isActive_idx" ON "users"("isActive")`,
  `CREATE TABLE IF NOT EXISTS "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
  )`,
  `ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "userId" TEXT`,
  `ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "tokenHash" TEXT`,
  `ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3)`,
  `ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
  `ALTER TABLE "sessions" ALTER COLUMN "userId" SET NOT NULL`,
  `ALTER TABLE "sessions" ALTER COLUMN "tokenHash" SET NOT NULL`,
  `ALTER TABLE "sessions" ALTER COLUMN "expiresAt" SET NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "sessions_tokenHash_key" ON "sessions"("tokenHash")`,
  `CREATE INDEX IF NOT EXISTS "sessions_userId_idx" ON "sessions"("userId")`,
  `CREATE INDEX IF NOT EXISTS "sessions_expiresAt_idx" ON "sessions"("expiresAt")`,
  `DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'sessions_userId_fkey'
    ) THEN
      ALTER TABLE "sessions"
      ADD CONSTRAINT "sessions_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$`,
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
  `ALTER TABLE "license_keys" ADD COLUMN IF NOT EXISTS "keyHash" TEXT`,
  `ALTER TABLE "license_keys" ADD COLUMN IF NOT EXISTS "status" "LicenseKeyStatus" NOT NULL DEFAULT 'UNUSED'`,
  `ALTER TABLE "license_keys" ADD COLUMN IF NOT EXISTS "redeemedByUserId" TEXT`,
  `ALTER TABLE "license_keys" ADD COLUMN IF NOT EXISTS "redeemedAt" TIMESTAMP(3)`,
  `ALTER TABLE "license_keys" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3)`,
  `ALTER TABLE "license_keys" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
  `ALTER TABLE "license_keys" ALTER COLUMN "keyHash" SET NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "license_keys_keyHash_key" ON "license_keys"("keyHash")`,
  `CREATE INDEX IF NOT EXISTS "license_keys_status_idx" ON "license_keys"("status")`,
  `CREATE INDEX IF NOT EXISTS "license_keys_redeemedByUserId_idx" ON "license_keys"("redeemedByUserId")`,
  `CREATE INDEX IF NOT EXISTS "license_keys_expiresAt_idx" ON "license_keys"("expiresAt")`,
  `DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'license_keys_redeemedByUserId_fkey'
    ) THEN
      ALTER TABLE "license_keys"
      ADD CONSTRAINT "license_keys_redeemedByUserId_fkey"
      FOREIGN KEY ("redeemedByUserId") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
  END $$`,
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
  `ALTER TABLE "activation_logs" ADD COLUMN IF NOT EXISTS "codeHash" TEXT`,
  `ALTER TABLE "activation_logs" ADD COLUMN IF NOT EXISTS "userId" TEXT`,
  `ALTER TABLE "activation_logs" ADD COLUMN IF NOT EXISTS "success" BOOLEAN`,
  `ALTER TABLE "activation_logs" ADD COLUMN IF NOT EXISTS "message" TEXT`,
  `ALTER TABLE "activation_logs" ADD COLUMN IF NOT EXISTS "ip" TEXT`,
  `ALTER TABLE "activation_logs" ADD COLUMN IF NOT EXISTS "userAgent" TEXT`,
  `ALTER TABLE "activation_logs" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
  `ALTER TABLE "activation_logs" ALTER COLUMN "codeHash" SET NOT NULL`,
  `ALTER TABLE "activation_logs" ALTER COLUMN "userId" SET NOT NULL`,
  `ALTER TABLE "activation_logs" ALTER COLUMN "success" SET NOT NULL`,
  `ALTER TABLE "activation_logs" ALTER COLUMN "message" SET NOT NULL`,
  `CREATE INDEX IF NOT EXISTS "activation_logs_codeHash_idx" ON "activation_logs"("codeHash")`,
  `CREATE INDEX IF NOT EXISTS "activation_logs_userId_idx" ON "activation_logs"("userId")`,
  `CREATE INDEX IF NOT EXISTS "activation_logs_success_idx" ON "activation_logs"("success")`,
  `CREATE INDEX IF NOT EXISTS "activation_logs_createdAt_idx" ON "activation_logs"("createdAt")`
];

let registrationSchemaReady = false;
let ensureRegistrationSchemaPromise: Promise<RegistrationSchemaStatus> | null = null;

export async function checkRegistrationSchema(): Promise<RegistrationSchemaStatus> {
  const requiredTables = Object.keys(requiredSchema);
  const tableRows = await prisma.$queryRaw<Array<{ tableName: string }>>`
    SELECT table_name AS "tableName"
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('users', 'sessions', 'license_keys', 'activation_logs')
  `;
  const existingTables = new Set(tableRows.map((row) => row.tableName));
  const missingTables = requiredTables.filter((table) => !existingTables.has(table));

  const columnRows = await prisma.$queryRaw<Array<{ tableName: string; columnName: string }>>`
    SELECT table_name AS "tableName", column_name AS "columnName"
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('users', 'sessions', 'license_keys', 'activation_logs')
  `;
  const existingColumns = new Set(columnRows.map((row) => `${row.tableName}.${row.columnName}`));
  const missingColumns = Object.entries(requiredSchema).flatMap(([table, columns]) =>
    columns
      .filter((column) => existingTables.has(table) && !existingColumns.has(`${table}.${column}`))
      .map((column) => ({ table, column }))
  );
  const enumRows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM pg_type
      WHERE typname = 'LicenseKeyStatus'
    ) AS "exists"
  `;
  const licenseKeyStatusEnum = Boolean(enumRows[0]?.exists);
  const ready = missingTables.length === 0 && missingColumns.length === 0 && licenseKeyStatusEnum;

  return {
    ready,
    requiredTables,
    missingTables,
    missingColumns,
    licenseKeyStatusEnum
  };
}

export async function ensureRegistrationSchema() {
  if (registrationSchemaReady) {
    return checkRegistrationSchema();
  }

  if (ensureRegistrationSchemaPromise) {
    return ensureRegistrationSchemaPromise;
  }

  ensureRegistrationSchemaPromise = (async () => {
    const current = await checkRegistrationSchema();

    if (current.ready) {
      registrationSchemaReady = true;
      return current;
    }

    for (const statement of registrationBootstrapStatements) {
      await prisma.$executeRawUnsafe(statement);
    }

    const next = await checkRegistrationSchema();
    registrationSchemaReady = next.ready;

    return next;
  })().finally(() => {
    ensureRegistrationSchemaPromise = null;
  });

  return ensureRegistrationSchemaPromise;
}
