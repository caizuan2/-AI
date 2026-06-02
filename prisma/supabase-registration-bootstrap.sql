-- Supabase registration bootstrap.
-- Use only when Prisma migrate deploy cannot reach the Supabase Direct connection.
-- Safe intent: create or patch the minimum tables/columns required by phone registration,
-- login sessions, and license activation. This script does not drop data.

CREATE EXTENSION IF NOT EXISTS vector;

DO $$
BEGIN
  CREATE TYPE "LicenseKeyStatus" AS ENUM ('UNUSED', 'USED', 'DISABLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "users" (
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
);

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT NOT NULL DEFAULT '';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "licenseActivated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "users" ALTER COLUMN "name" DROP NOT NULL;

WITH numbered AS (
  SELECT "id", row_number() OVER (ORDER BY "createdAt", "id") AS rn
  FROM "users"
  WHERE "phone" IS NULL
)
UPDATE "users"
SET "phone" = '+1999' || lpad(numbered.rn::text, 10, '0')
FROM numbered
WHERE "users"."id" = numbered."id";

ALTER TABLE "users" ALTER COLUMN "phone" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "users_phone_key" ON "users"("phone");
CREATE INDEX IF NOT EXISTS "users_licenseActivated_idx" ON "users"("licenseActivated");
CREATE INDEX IF NOT EXISTS "users_isActive_idx" ON "users"("isActive");

CREATE TABLE IF NOT EXISTS "sessions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "tokenHash" TEXT;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "sessions" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "sessions" ALTER COLUMN "tokenHash" SET NOT NULL;
ALTER TABLE "sessions" ALTER COLUMN "expiresAt" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "sessions_tokenHash_key" ON "sessions"("tokenHash");
CREATE INDEX IF NOT EXISTS "sessions_userId_idx" ON "sessions"("userId");
CREATE INDEX IF NOT EXISTS "sessions_expiresAt_idx" ON "sessions"("expiresAt");

DO $$
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
END $$;

CREATE TABLE IF NOT EXISTS "license_keys" (
  "id" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "status" "LicenseKeyStatus" NOT NULL DEFAULT 'UNUSED',
  "redeemedByUserId" TEXT,
  "redeemedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "license_keys_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "license_keys" ADD COLUMN IF NOT EXISTS "keyHash" TEXT;
ALTER TABLE "license_keys" ADD COLUMN IF NOT EXISTS "status" "LicenseKeyStatus" NOT NULL DEFAULT 'UNUSED';
ALTER TABLE "license_keys" ADD COLUMN IF NOT EXISTS "redeemedByUserId" TEXT;
ALTER TABLE "license_keys" ADD COLUMN IF NOT EXISTS "redeemedAt" TIMESTAMP(3);
ALTER TABLE "license_keys" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
ALTER TABLE "license_keys" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "license_keys" ALTER COLUMN "keyHash" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "license_keys_keyHash_key" ON "license_keys"("keyHash");
CREATE INDEX IF NOT EXISTS "license_keys_status_idx" ON "license_keys"("status");
CREATE INDEX IF NOT EXISTS "license_keys_redeemedByUserId_idx" ON "license_keys"("redeemedByUserId");
CREATE INDEX IF NOT EXISTS "license_keys_expiresAt_idx" ON "license_keys"("expiresAt");

DO $$
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
END $$;
