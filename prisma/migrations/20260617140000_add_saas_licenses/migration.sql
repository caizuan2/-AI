-- CreateTable
CREATE TABLE IF NOT EXISTS "saas_licenses" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'trial',
    "status" TEXT NOT NULL DEFAULT 'unused',
    "user_id" TEXT,
    "tenant_id" TEXT,
    "expires_at" TIMESTAMP(3),
    "activated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saas_licenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "saas_licenses_code_key" ON "saas_licenses"("code");
CREATE INDEX IF NOT EXISTS "saas_licenses_status_idx" ON "saas_licenses"("status");
CREATE INDEX IF NOT EXISTS "saas_licenses_type_idx" ON "saas_licenses"("type");
CREATE INDEX IF NOT EXISTS "saas_licenses_user_id_idx" ON "saas_licenses"("user_id");
CREATE INDEX IF NOT EXISTS "saas_licenses_tenant_id_idx" ON "saas_licenses"("tenant_id");
CREATE INDEX IF NOT EXISTS "saas_licenses_expires_at_idx" ON "saas_licenses"("expires_at");
