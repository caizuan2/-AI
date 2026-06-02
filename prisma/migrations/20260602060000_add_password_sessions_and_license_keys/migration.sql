CREATE TYPE "LicenseKeyStatus" AS ENUM ('UNUSED', 'USED', 'DISABLED');

ALTER TABLE "users"
ADD COLUMN "passwordHash" TEXT NOT NULL DEFAULT '',
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "licenseActivated" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "users"
ALTER COLUMN "name" DROP NOT NULL;

WITH numbered AS (
  SELECT "id", row_number() OVER (ORDER BY "createdAt", "id") AS rn
  FROM "users"
  WHERE "phone" IS NULL
)
UPDATE "users"
SET "phone" = '+1999' || lpad(numbered.rn::text, 10, '0')
FROM numbered
WHERE "users"."id" = numbered."id";

ALTER TABLE "users"
ALTER COLUMN "phone" SET NOT NULL;

CREATE TABLE "sessions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "license_keys" (
  "id" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "status" "LicenseKeyStatus" NOT NULL DEFAULT 'UNUSED',
  "redeemedByUserId" TEXT,
  "redeemedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "license_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");
CREATE UNIQUE INDEX "license_keys_keyHash_key" ON "license_keys"("keyHash");
CREATE INDEX "license_keys_status_idx" ON "license_keys"("status");
CREATE INDEX "license_keys_redeemedByUserId_idx" ON "license_keys"("redeemedByUserId");
CREATE INDEX "license_keys_expiresAt_idx" ON "license_keys"("expiresAt");
CREATE INDEX "users_licenseActivated_idx" ON "users"("licenseActivated");
CREATE INDEX "users_isActive_idx" ON "users"("isActive");

DROP INDEX IF EXISTS "users_betaAccess_idx";
DROP INDEX IF EXISTS "users_betaRequestedAt_idx";

ALTER TABLE "users"
DROP COLUMN IF EXISTS "betaAccess",
DROP COLUMN IF EXISTS "betaRequestedAt";

ALTER TABLE "sessions"
ADD CONSTRAINT "sessions_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "license_keys"
ADD CONSTRAINT "license_keys_redeemedByUserId_fkey"
FOREIGN KEY ("redeemedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
