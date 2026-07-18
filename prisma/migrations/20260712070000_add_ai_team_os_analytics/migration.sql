-- CreateEnum
CREATE TYPE "BusinessMetricType" AS ENUM ('TASK', 'CRM', 'TRAINING', 'AI_USAGE');

-- CreateTable
CREATE TABLE "analytics_snapshots" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "task_completion_rate" DOUBLE PRECISION,
    "customer_conversion_rate" DOUBLE PRECISION,
    "employee_average_score" DOUBLE PRECISION,
    "training_completion_rate" DOUBLE PRECISION,
    "ai_usage_count" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "analytics_snapshots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "analytics_snapshots_company_id_not_blank_check" CHECK (btrim("company_id") <> ''),
    CONSTRAINT "analytics_snapshots_task_completion_rate_check" CHECK ("task_completion_rate" IS NULL OR ("task_completion_rate" >= 0 AND "task_completion_rate" <= 100)),
    CONSTRAINT "analytics_snapshots_customer_conversion_rate_check" CHECK ("customer_conversion_rate" IS NULL OR ("customer_conversion_rate" >= 0 AND "customer_conversion_rate" <= 100)),
    CONSTRAINT "analytics_snapshots_employee_average_score_check" CHECK ("employee_average_score" IS NULL OR ("employee_average_score" >= 0 AND "employee_average_score" <= 100)),
    CONSTRAINT "analytics_snapshots_training_completion_rate_check" CHECK ("training_completion_rate" IS NULL OR ("training_completion_rate" >= 0 AND "training_completion_rate" <= 100)),
    CONSTRAINT "analytics_snapshots_ai_usage_count_check" CHECK ("ai_usage_count" IS NULL OR "ai_usage_count" >= 0)
);

-- CreateTable
CREATE TABLE "employee_growth_metrics" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "skill_score" DOUBLE PRECISION,
    "task_score" DOUBLE PRECISION,
    "training_score" DOUBLE PRECISION,
    "customer_score" DOUBLE PRECISION,
    "growth_level" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "employee_growth_metrics_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "employee_growth_metrics_company_id_not_blank_check" CHECK (btrim("company_id") <> ''),
    CONSTRAINT "employee_growth_metrics_team_id_not_blank_check" CHECK (btrim("team_id") <> ''),
    CONSTRAINT "employee_growth_metrics_user_id_not_blank_check" CHECK (btrim("user_id") <> ''),
    CONSTRAINT "employee_growth_metrics_skill_score_check" CHECK ("skill_score" IS NULL OR ("skill_score" >= 0 AND "skill_score" <= 100)),
    CONSTRAINT "employee_growth_metrics_task_score_check" CHECK ("task_score" IS NULL OR ("task_score" >= 0 AND "task_score" <= 100)),
    CONSTRAINT "employee_growth_metrics_training_score_check" CHECK ("training_score" IS NULL OR ("training_score" >= 0 AND "training_score" <= 100)),
    CONSTRAINT "employee_growth_metrics_customer_score_check" CHECK ("customer_score" IS NULL OR ("customer_score" >= 0 AND "customer_score" <= 100)),
    CONSTRAINT "employee_growth_metrics_growth_level_not_blank_check" CHECK (btrim("growth_level") <> '')
);

-- CreateTable
CREATE TABLE "business_metrics" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "metric_type" "BusinessMetricType" NOT NULL,
    "metric_value" DOUBLE PRECISION NOT NULL,
    "date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "business_metrics_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "business_metrics_company_id_not_blank_check" CHECK (btrim("company_id") <> ''),
    CONSTRAINT "business_metrics_metric_value_check" CHECK ("metric_value" >= 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "analytics_snapshots_company_id_date_key" ON "analytics_snapshots"("company_id", "date");

-- CreateIndex
CREATE INDEX "analytics_snapshots_date_idx" ON "analytics_snapshots"("date");

-- CreateIndex
CREATE UNIQUE INDEX "employee_growth_metrics_company_id_team_id_user_id_date_key" ON "employee_growth_metrics"("company_id", "team_id", "user_id", "date");

-- CreateIndex
CREATE INDEX "employee_growth_metrics_company_id_team_id_date_idx" ON "employee_growth_metrics"("company_id", "team_id", "date");

-- CreateIndex
CREATE INDEX "employee_growth_metrics_user_id_date_idx" ON "employee_growth_metrics"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "business_metrics_company_id_metric_type_date_key" ON "business_metrics"("company_id", "metric_type", "date");

-- CreateIndex
CREATE INDEX "business_metrics_metric_type_date_idx" ON "business_metrics"("metric_type", "date");

-- CreateIndex
CREATE INDEX "business_metrics_date_idx" ON "business_metrics"("date");
