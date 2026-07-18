-- CreateEnum
CREATE TYPE "KnowledgeCandidateSourceType" AS ENUM ('CHAT', 'CRM', 'AI_COACH', 'TRAINING', 'WORKFLOW');

-- CreateEnum
CREATE TYPE "KnowledgeCandidateStatus" AS ENUM ('PENDING', 'REVIEWING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "KnowledgeFeedbackType" AS ENUM ('GOOD', 'BAD', 'MISSING');

-- CreateEnum
CREATE TYPE "KnowledgeOptimizationStatus" AS ENUM ('PENDING', 'APPLIED', 'REJECTED');

-- CreateTable
CREATE TABLE "team_os_knowledge_candidates" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "team_id" TEXT,
    "source_type" "KnowledgeCandidateSourceType" NOT NULL,
    "source_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" "KnowledgeCandidateStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "published_knowledge_id" TEXT,
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_os_knowledge_candidates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "knowledge_candidates_company_not_blank_check" CHECK (btrim("company_id") <> ''),
    CONSTRAINT "knowledge_candidates_team_not_blank_check" CHECK ("team_id" IS NULL OR btrim("team_id") <> ''),
    CONSTRAINT "knowledge_candidates_source_not_blank_check" CHECK (btrim("source_id") <> ''),
    CONSTRAINT "knowledge_candidates_title_not_blank_check" CHECK (btrim("title") <> ''),
    CONSTRAINT "knowledge_candidates_content_not_blank_check" CHECK (btrim("content") <> ''),
    CONSTRAINT "knowledge_candidates_category_not_blank_check" CHECK (btrim("category") <> ''),
    CONSTRAINT "knowledge_candidates_review_state_check" CHECK (
      ("status" IN ('PENDING', 'REVIEWING') AND "reviewed_at" IS NULL) OR
      ("status" IN ('APPROVED', 'REJECTED') AND "reviewed_at" IS NOT NULL)
    )
);

-- CreateTable
CREATE TABLE "team_os_knowledge_feedback" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "team_id" TEXT,
    "user_id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "feedback_type" "KnowledgeFeedbackType" NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_os_knowledge_feedback_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "knowledge_feedback_company_not_blank_check" CHECK (btrim("company_id") <> ''),
    CONSTRAINT "knowledge_feedback_team_not_blank_check" CHECK ("team_id" IS NULL OR btrim("team_id") <> ''),
    CONSTRAINT "knowledge_feedback_user_not_blank_check" CHECK (btrim("user_id") <> ''),
    CONSTRAINT "knowledge_feedback_question_not_blank_check" CHECK (btrim("question") <> ''),
    CONSTRAINT "knowledge_feedback_answer_not_blank_check" CHECK (btrim("answer") <> '')
);

-- CreateTable
CREATE TABLE "team_os_knowledge_optimizations" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "team_id" TEXT,
    "knowledge_id" TEXT NOT NULL,
    "suggestion" TEXT NOT NULL,
    "suggestion_key" TEXT NOT NULL,
    "status" "KnowledgeOptimizationStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_os_knowledge_optimizations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "knowledge_optimizations_company_not_blank_check" CHECK (btrim("company_id") <> ''),
    CONSTRAINT "knowledge_optimizations_team_not_blank_check" CHECK ("team_id" IS NULL OR btrim("team_id") <> ''),
    CONSTRAINT "knowledge_optimizations_knowledge_not_blank_check" CHECK (btrim("knowledge_id") <> ''),
    CONSTRAINT "knowledge_optimizations_suggestion_not_blank_check" CHECK (btrim("suggestion") <> ''),
    CONSTRAINT "knowledge_optimizations_key_not_blank_check" CHECK (btrim("suggestion_key") <> '')
);

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_candidates_company_source_key" ON "team_os_knowledge_candidates"("company_id", "source_type", "source_id");
CREATE INDEX "knowledge_candidates_company_status_created_idx" ON "team_os_knowledge_candidates"("company_id", "status", "created_at");
CREATE INDEX "knowledge_candidates_company_team_status_created_idx" ON "team_os_knowledge_candidates"("company_id", "team_id", "status", "created_at");
CREATE INDEX "knowledge_candidates_published_id_idx" ON "team_os_knowledge_candidates"("published_knowledge_id");
CREATE INDEX "knowledge_feedback_company_type_created_idx" ON "team_os_knowledge_feedback"("company_id", "feedback_type", "created_at");
CREATE INDEX "knowledge_feedback_company_team_created_idx" ON "team_os_knowledge_feedback"("company_id", "team_id", "created_at");
CREATE INDEX "knowledge_feedback_user_created_idx" ON "team_os_knowledge_feedback"("user_id", "created_at");
CREATE UNIQUE INDEX "knowledge_optimizations_company_key_key" ON "team_os_knowledge_optimizations"("company_id", "suggestion_key");
CREATE INDEX "knowledge_optimizations_company_status_created_idx" ON "team_os_knowledge_optimizations"("company_id", "status", "created_at");
CREATE INDEX "knowledge_optimizations_company_team_status_created_idx" ON "team_os_knowledge_optimizations"("company_id", "team_id", "status", "created_at");
CREATE INDEX "knowledge_optimizations_knowledge_id_idx" ON "team_os_knowledge_optimizations"("knowledge_id");

-- AddForeignKey
ALTER TABLE "team_os_knowledge_candidates" ADD CONSTRAINT "knowledge_candidates_team_company_fkey" FOREIGN KEY ("team_id", "company_id") REFERENCES "team_organizations"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "team_os_knowledge_feedback" ADD CONSTRAINT "knowledge_feedback_team_company_fkey" FOREIGN KEY ("team_id", "company_id") REFERENCES "team_organizations"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "team_os_knowledge_optimizations" ADD CONSTRAINT "knowledge_optimizations_team_company_fkey" FOREIGN KEY ("team_id", "company_id") REFERENCES "team_organizations"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;
