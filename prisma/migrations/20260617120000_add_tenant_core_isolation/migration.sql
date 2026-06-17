-- CreateTable
CREATE TABLE IF NOT EXISTS "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'starter',
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
ALTER TABLE "knowledge_items" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
ALTER TABLE "ingestion_jobs" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
ALTER TABLE "knowledge_query_logs" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "tenants_status_idx" ON "tenants"("status");
CREATE INDEX IF NOT EXISTS "tenants_plan_idx" ON "tenants"("plan");
CREATE INDEX IF NOT EXISTS "users_tenant_id_idx" ON "users"("tenant_id");
CREATE INDEX IF NOT EXISTS "knowledge_items_tenant_id_idx" ON "knowledge_items"("tenant_id");
CREATE INDEX IF NOT EXISTS "knowledge_items_tenant_status_expires_idx" ON "knowledge_items"("tenant_id", "status", "expiresAt");
CREATE INDEX IF NOT EXISTS "knowledge_items_tenant_review_next_idx" ON "knowledge_items"("tenant_id", "reviewStatus", "nextReviewAt");
CREATE INDEX IF NOT EXISTS "ingestion_jobs_tenant_id_idx" ON "ingestion_jobs"("tenant_id");
CREATE INDEX IF NOT EXISTS "knowledge_query_logs_tenant_id_idx" ON "knowledge_query_logs"("tenant_id");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_tenant_id_fkey'
  ) THEN
    ALTER TABLE "users"
    ADD CONSTRAINT "users_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_items_tenant_id_fkey'
  ) THEN
    ALTER TABLE "knowledge_items"
    ADD CONSTRAINT "knowledge_items_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ingestion_jobs_tenant_id_fkey'
  ) THEN
    ALTER TABLE "ingestion_jobs"
    ADD CONSTRAINT "ingestion_jobs_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_query_logs_tenant_id_fkey'
  ) THEN
    ALTER TABLE "knowledge_query_logs"
    ADD CONSTRAINT "knowledge_query_logs_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
