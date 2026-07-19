-- CreateEnum
CREATE TYPE "AIAssistantRole" AS ENUM ('EMPLOYEE_ASSISTANT', 'MANAGER_ASSISTANT', 'OWNER_ASSISTANT');

-- CreateEnum
CREATE TYPE "AIInsightType" AS ENUM ('TASK', 'CRM', 'TRAINING', 'TEAM', 'BUSINESS');

-- CreateEnum
CREATE TYPE "AIInsightPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "AIInsightStatus" AS ENUM ('ACTIVE', 'DISMISSED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "AIRecommendationStatus" AS ENUM ('ACTIVE', 'DISMISSED', 'COMPLETED');

-- CreateTable
CREATE TABLE "ai_assistant_sessions" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "AIAssistantRole" NOT NULL,
    "conversation" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_assistant_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ai_assistant_sessions_id_not_blank_check" CHECK (btrim("id") <> ''),
    CONSTRAINT "ai_assistant_sessions_company_id_not_blank_check" CHECK (btrim("company_id") <> ''),
    CONSTRAINT "ai_assistant_sessions_user_id_not_blank_check" CHECK (btrim("user_id") <> ''),
    CONSTRAINT "ai_assistant_sessions_conversation_array_check" CHECK (jsonb_typeof("conversation") = 'array')
);

-- CreateTable
CREATE TABLE "ai_insights" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "team_id" TEXT,
    "target_user_id" TEXT NOT NULL,
    "role" "AIAssistantRole" NOT NULL,
    "source_key" TEXT NOT NULL,
    "type" "AIInsightType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "priority" "AIInsightPriority" NOT NULL,
    "status" "AIInsightStatus" NOT NULL DEFAULT 'ACTIVE',
    "notified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_insights_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ai_insights_id_not_blank_check" CHECK (btrim("id") <> ''),
    CONSTRAINT "ai_insights_company_id_not_blank_check" CHECK (btrim("company_id") <> ''),
    CONSTRAINT "ai_insights_team_id_not_blank_check" CHECK ("team_id" IS NULL OR btrim("team_id") <> ''),
    CONSTRAINT "ai_insights_target_user_id_not_blank_check" CHECK (btrim("target_user_id") <> ''),
    CONSTRAINT "ai_insights_source_key_not_blank_check" CHECK (btrim("source_key") <> ''),
    CONSTRAINT "ai_insights_title_not_blank_check" CHECK (btrim("title") <> ''),
    CONSTRAINT "ai_insights_content_not_blank_check" CHECK (btrim("content") <> '')
);

-- CreateTable
CREATE TABLE "ai_task_recommendations" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "team_id" TEXT,
    "user_id" TEXT NOT NULL,
    "role" "AIAssistantRole" NOT NULL,
    "source" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "status" "AIRecommendationStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_task_recommendations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ai_task_recommendations_id_not_blank_check" CHECK (btrim("id") <> ''),
    CONSTRAINT "ai_task_recommendations_company_id_not_blank_check" CHECK (btrim("company_id") <> ''),
    CONSTRAINT "ai_task_recommendations_team_id_not_blank_check" CHECK ("team_id" IS NULL OR btrim("team_id") <> ''),
    CONSTRAINT "ai_task_recommendations_user_id_not_blank_check" CHECK (btrim("user_id") <> ''),
    CONSTRAINT "ai_task_recommendations_source_not_blank_check" CHECK (btrim("source") <> ''),
    CONSTRAINT "ai_task_recommendations_content_not_blank_check" CHECK (btrim("recommendation") <> '')
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_assistant_sessions_company_id_user_id_role_key" ON "ai_assistant_sessions"("company_id", "user_id", "role");

-- CreateIndex
CREATE INDEX "ai_assistant_sessions_company_id_role_updated_at_idx" ON "ai_assistant_sessions"("company_id", "role", "updated_at");

-- CreateIndex
CREATE INDEX "ai_assistant_sessions_user_id_updated_at_idx" ON "ai_assistant_sessions"("user_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_insights_company_id_target_user_id_role_source_key_key" ON "ai_insights"("company_id", "target_user_id", "role", "source_key");

-- CreateIndex
CREATE INDEX "ai_insights_company_id_target_user_id_status_created_at_idx" ON "ai_insights"("company_id", "target_user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "ai_insights_company_id_team_id_role_priority_idx" ON "ai_insights"("company_id", "team_id", "role", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "ai_task_recommendations_company_id_user_id_role_source_key" ON "ai_task_recommendations"("company_id", "user_id", "role", "source");

-- CreateIndex
CREATE INDEX "ai_task_recs_company_user_status_created_idx" ON "ai_task_recommendations"("company_id", "user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "ai_task_recommendations_company_id_team_id_role_status_idx" ON "ai_task_recommendations"("company_id", "team_id", "role", "status");
