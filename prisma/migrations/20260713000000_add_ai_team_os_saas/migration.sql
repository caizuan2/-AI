-- CreateEnum
CREATE TYPE "TenantCompanyStatus" AS ENUM ('ACTIVE', 'DISABLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TenantSubscriptionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SubscriptionPlanStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateTable
CREATE TABLE "team_os_tenant_companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logo" TEXT,
    "industry" TEXT,
    "owner_id" TEXT NOT NULL,
    "status" "TenantCompanyStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_os_tenant_companies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "team_os_tenant_companies_id_not_blank_check" CHECK (btrim("id") <> ''),
    CONSTRAINT "team_os_tenant_companies_name_not_blank_check" CHECK (btrim("name") <> ''),
    CONSTRAINT "team_os_tenant_companies_logo_not_blank_check" CHECK ("logo" IS NULL OR btrim("logo") <> ''),
    CONSTRAINT "team_os_tenant_companies_industry_not_blank_check" CHECK ("industry" IS NULL OR btrim("industry") <> ''),
    CONSTRAINT "team_os_tenant_companies_owner_id_not_blank_check" CHECK (btrim("owner_id") <> '')
);

-- CreateTable
CREATE TABLE "team_os_subscription_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "max_users" INTEGER NOT NULL,
    "max_storage" INTEGER NOT NULL,
    "features" JSONB NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "status" "SubscriptionPlanStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "team_os_subscription_plans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "team_os_subscription_plans_id_not_blank_check" CHECK (btrim("id") <> ''),
    CONSTRAINT "team_os_subscription_plans_name_not_blank_check" CHECK (btrim("name") <> ''),
    CONSTRAINT "team_os_subscription_plans_max_users_check" CHECK ("max_users" >= 0),
    CONSTRAINT "team_os_subscription_plans_max_storage_check" CHECK ("max_storage" >= 0),
    CONSTRAINT "team_os_subscription_plans_price_check" CHECK ("price" >= 0)
);

-- CreateTable
CREATE TABLE "team_os_tenant_subscriptions" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "status" "TenantSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_os_tenant_subscriptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "team_os_tenant_subscriptions_id_not_blank_check" CHECK (btrim("id") <> ''),
    CONSTRAINT "team_os_tenant_subscriptions_company_id_not_blank_check" CHECK (btrim("company_id") <> ''),
    CONSTRAINT "team_os_tenant_subscriptions_plan_id_not_blank_check" CHECK (btrim("plan_id") <> ''),
    CONSTRAINT "team_os_tenant_subscriptions_date_range_check" CHECK ("end_date" > "start_date")
);

-- CreateTable
CREATE TABLE "team_os_feature_permissions" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "feature_key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "team_os_feature_permissions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "team_os_feature_permissions_id_not_blank_check" CHECK (btrim("id") <> ''),
    CONSTRAINT "team_os_feature_permissions_plan_id_not_blank_check" CHECK (btrim("plan_id") <> ''),
    CONSTRAINT "team_os_feature_permissions_feature_key_not_blank_check" CHECK (btrim("feature_key") <> '')
);

-- Backfill the Team OS commercial sidecar without changing legacy tenant or team data.
INSERT INTO "team_os_tenant_companies" (
    "id",
    "name",
    "logo",
    "industry",
    "owner_id",
    "status",
    "created_at",
    "updated_at"
)
SELECT
    organization."company_id",
    COALESCE(
      NULLIF(btrim(tenant."name"), ''),
      NULLIF(btrim(first_organization."name"), ''),
      organization."company_id"
    ),
    NULL,
    NULL,
    first_organization."owner_id",
    CASE
      WHEN bool_or(organization."status" = 'ACTIVE') THEN 'ACTIVE'::"TenantCompanyStatus"
      ELSE 'DISABLED'::"TenantCompanyStatus"
    END,
    MIN(organization."created_at"),
    MAX(organization."updated_at")
FROM "team_organizations" AS organization
LEFT JOIN "tenants" AS tenant
  ON tenant."id" = organization."company_id"
JOIN LATERAL (
    SELECT
      candidate."name",
      candidate."owner_id"
    FROM "team_organizations" AS candidate
    WHERE candidate."company_id" = organization."company_id"
    ORDER BY candidate."created_at" ASC, candidate."id" ASC
    LIMIT 1
) AS first_organization ON TRUE
GROUP BY
    organization."company_id",
    tenant."name",
    first_organization."name",
    first_organization."owner_id";

-- CreateIndex
CREATE INDEX "team_os_tenant_companies_owner_id_status_idx" ON "team_os_tenant_companies"("owner_id", "status");

-- CreateIndex
CREATE INDEX "team_os_tenant_companies_status_updated_at_idx" ON "team_os_tenant_companies"("status", "updated_at");

-- CreateIndex
CREATE INDEX "team_os_subscription_plans_status_idx" ON "team_os_subscription_plans"("status");

-- CreateIndex
CREATE INDEX "team_os_tenant_subscriptions_company_id_status_end_date_idx" ON "team_os_tenant_subscriptions"("company_id", "status", "end_date");

-- CreateIndex
CREATE INDEX "team_os_tenant_subscriptions_plan_id_status_idx" ON "team_os_tenant_subscriptions"("plan_id", "status");

-- CreateIndex
CREATE INDEX "team_os_tenant_subscriptions_status_end_date_idx" ON "team_os_tenant_subscriptions"("status", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "team_os_tenant_subscriptions_one_active_company_key"
ON "team_os_tenant_subscriptions"("company_id")
WHERE "status" = 'ACTIVE';

-- CreateIndex
CREATE UNIQUE INDEX "team_os_feature_permissions_plan_id_feature_key_key" ON "team_os_feature_permissions"("plan_id", "feature_key");

-- CreateIndex
CREATE INDEX "team_os_feature_permissions_feature_key_enabled_idx" ON "team_os_feature_permissions"("feature_key", "enabled");

-- AddForeignKey
ALTER TABLE "team_os_tenant_subscriptions"
ADD CONSTRAINT "team_os_tenant_subscriptions_company_id_fkey"
FOREIGN KEY ("company_id") REFERENCES "team_os_tenant_companies"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_tenant_subscriptions"
ADD CONSTRAINT "team_os_tenant_subscriptions_plan_id_fkey"
FOREIGN KEY ("plan_id") REFERENCES "team_os_subscription_plans"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_feature_permissions"
ADD CONSTRAINT "team_os_feature_permissions_plan_id_fkey"
FOREIGN KEY ("plan_id") REFERENCES "team_os_subscription_plans"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
