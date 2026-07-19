-- CreateEnum
CREATE TYPE "CustomerStage" AS ENUM ('LEAD', 'CONTACTED', 'INTERESTED', 'NEGOTIATING', 'CUSTOMER', 'LOST');

-- CreateEnum
CREATE TYPE "CustomerLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "CustomerFollowUpType" AS ENUM ('CHAT', 'CALL', 'MEETING', 'OTHER');

-- CreateEnum
CREATE TYPE "CustomerRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "CustomerIntent" AS ENUM ('HIGH_INTENT', 'HESITANT', 'REGULAR', 'CHURN_RISK');

-- CreateTable
CREATE TABLE "crm_customers" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "wechat" TEXT,
    "source" TEXT NOT NULL,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "stage" "CustomerStage" NOT NULL DEFAULT 'LEAD',
    "level" "CustomerLevel" NOT NULL DEFAULT 'LOW',
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "crm_customers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "crm_customers_company_id_not_blank_check" CHECK (btrim("company_id") <> ''),
    CONSTRAINT "crm_customers_team_id_not_blank_check" CHECK (btrim("team_id") <> ''),
    CONSTRAINT "crm_customers_owner_id_not_blank_check" CHECK (btrim("owner_id") <> ''),
    CONSTRAINT "crm_customers_name_not_blank_check" CHECK (btrim("name") <> ''),
    CONSTRAINT "crm_customers_source_not_blank_check" CHECK (btrim("source") <> ''),
    CONSTRAINT "crm_customers_contact_required_check" CHECK (
      NULLIF(btrim("phone"), '') IS NOT NULL OR NULLIF(btrim("wechat"), '') IS NOT NULL
    )
);

-- CreateTable
CREATE TABLE "customer_follow_ups" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" "CustomerFollowUpType" NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "next_plan" TEXT NOT NULL DEFAULT '',
    "ai_suggestion" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customer_follow_ups_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customer_follow_ups_customer_id_not_blank_check" CHECK (btrim("customer_id") <> ''),
    CONSTRAINT "customer_follow_ups_user_id_not_blank_check" CHECK (btrim("user_id") <> ''),
    CONSTRAINT "customer_follow_ups_content_not_blank_check" CHECK (btrim("content") <> '')
);

-- CreateTable
CREATE TABLE "customer_ai_profiles" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "intent" "CustomerIntent" NOT NULL,
    "pain_points" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "risk_level" "CustomerRiskLevel" NOT NULL,
    "purchase_probability" INTEGER NOT NULL,
    "next_action" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customer_ai_profiles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customer_ai_profiles_customer_id_not_blank_check" CHECK (btrim("customer_id") <> ''),
    CONSTRAINT "customer_ai_profiles_probability_check" CHECK ("purchase_probability" >= 0 AND "purchase_probability" <= 100),
    CONSTRAINT "customer_ai_profiles_next_action_not_blank_check" CHECK (btrim("next_action") <> '')
);

-- CreateIndex
CREATE UNIQUE INDEX "team_organizations_id_company_id_key" ON "team_organizations"("id", "company_id");

-- CreateIndex
CREATE INDEX "crm_customers_company_id_team_id_updated_at_idx" ON "crm_customers"("company_id", "team_id", "updated_at");

-- CreateIndex
CREATE INDEX "crm_customers_company_id_owner_id_updated_at_idx" ON "crm_customers"("company_id", "owner_id", "updated_at");

-- CreateIndex
CREATE INDEX "crm_customers_company_id_stage_level_updated_at_idx" ON "crm_customers"("company_id", "stage", "level", "updated_at");

-- CreateIndex
CREATE INDEX "crm_customers_company_id_phone_idx" ON "crm_customers"("company_id", "phone");

-- CreateIndex
CREATE INDEX "crm_customers_company_id_wechat_idx" ON "crm_customers"("company_id", "wechat");

-- CreateIndex
CREATE INDEX "crm_customers_tags_idx" ON "crm_customers" USING GIN ("tags");

-- CreateIndex
CREATE INDEX "customer_follow_ups_customer_id_created_at_idx" ON "customer_follow_ups"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "customer_follow_ups_user_id_created_at_idx" ON "customer_follow_ups"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "customer_ai_profiles_customer_id_key" ON "customer_ai_profiles"("customer_id");

-- AddForeignKey
ALTER TABLE "crm_customers" ADD CONSTRAINT "crm_customers_team_id_company_id_fkey" FOREIGN KEY ("team_id", "company_id") REFERENCES "team_organizations"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_follow_ups" ADD CONSTRAINT "customer_follow_ups_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "crm_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_ai_profiles" ADD CONSTRAINT "customer_ai_profiles_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "crm_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
