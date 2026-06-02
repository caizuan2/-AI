ALTER TABLE "user_settings"
ADD COLUMN "defaultExpireDays" INTEGER NOT NULL DEFAULT 90;

ALTER TABLE "user_settings"
ADD CONSTRAINT "user_settings_defaultExpireDays_check" CHECK ("defaultExpireDays" BETWEEN 1 AND 3650);

ALTER TABLE "knowledge_items"
ADD COLUMN "expiresAt" TIMESTAMP(3),
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';

UPDATE "knowledge_items"
SET "expiresAt" = "updatedAt" + INTERVAL '90 days'
WHERE "expiresAt" IS NULL;

ALTER TABLE "knowledge_items"
ADD CONSTRAINT "knowledge_items_status_check" CHECK ("status" IN ('active', 'stale', 'archived'));

CREATE INDEX "knowledge_items_status_idx"
ON "knowledge_items"("status");

CREATE INDEX "knowledge_items_expiresAt_idx"
ON "knowledge_items"("expiresAt");

CREATE INDEX "knowledge_items_userId_status_expiresAt_idx"
ON "knowledge_items"("userId", "status", "expiresAt");
