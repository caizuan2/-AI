-- CreateEnum
CREATE TYPE "IndustryStandardStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateTable
CREATE TABLE "industry_standards" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "IndustryStandardStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "industry_standards_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "industry_standards_company_id_not_blank_check" CHECK (btrim("company_id") <> ''),
    CONSTRAINT "industry_standards_category_not_blank_check" CHECK (btrim("category") <> ''),
    CONSTRAINT "industry_standards_title_not_blank_check" CHECK (btrim("title") <> ''),
    CONSTRAINT "industry_standards_content_not_blank_check" CHECK (btrim("content") <> ''),
    CONSTRAINT "industry_standards_version_positive_check" CHECK ("version" > 0)
);

-- CreateTable
CREATE TABLE "coach_rules" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "rules" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "coach_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "coach_rules_company_id_not_blank_check" CHECK (btrim("company_id") <> ''),
    CONSTRAINT "coach_rules_name_not_blank_check" CHECK (btrim("name") <> ''),
    CONSTRAINT "coach_rules_rules_object_check" CHECK (jsonb_typeof("rules") = 'object')
);

-- AlterTable
ALTER TABLE "employee_analysis_reports"
ADD COLUMN "industry_score" INTEGER,
ADD COLUMN "matched_standards" JSONB,
ADD COLUMN "coach_feedback" TEXT,
ADD COLUMN "improvement_plan" TEXT,
ADD CONSTRAINT "employee_analysis_reports_industry_score_check" CHECK ("industry_score" IS NULL OR ("industry_score" >= 0 AND "industry_score" <= 100)),
ADD CONSTRAINT "employee_analysis_reports_matched_standards_array_check" CHECK ("matched_standards" IS NULL OR jsonb_typeof("matched_standards") = 'array');

-- CreateIndex
CREATE UNIQUE INDEX "industry_standards_company_id_category_title_version_key" ON "industry_standards"("company_id", "category", "title", "version");

-- CreateIndex
CREATE INDEX "industry_standards_company_id_status_updated_at_idx" ON "industry_standards"("company_id", "status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "coach_rules_company_id_name_key" ON "coach_rules"("company_id", "name");

-- CreateIndex
CREATE INDEX "coach_rules_company_id_created_at_idx" ON "coach_rules"("company_id", "created_at");
