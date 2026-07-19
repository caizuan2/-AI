-- CreateEnum
CREATE TYPE "TrainingCourseCategory" AS ENUM ('PRODUCT', 'SALES', 'CUSTOMER_SERVICE', 'MANAGEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "TrainingCourseLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "TrainingCourseStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "TrainingRecordStatus" AS ENUM ('STARTED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "TrainingAssignmentStatus" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "training_courses" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "TrainingCourseCategory" NOT NULL,
    "content" TEXT NOT NULL,
    "level" "TrainingCourseLevel" NOT NULL,
    "status" "TrainingCourseStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "training_courses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "training_courses_company_id_not_blank_check" CHECK (btrim("company_id") <> ''),
    CONSTRAINT "training_courses_title_not_blank_check" CHECK (btrim("title") <> ''),
    CONSTRAINT "training_courses_description_not_blank_check" CHECK (btrim("description") <> ''),
    CONSTRAINT "training_courses_content_not_blank_check" CHECK (btrim("content") <> '')
);

-- CreateTable
CREATE TABLE "training_records" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "status" "TrainingRecordStatus" NOT NULL DEFAULT 'STARTED',
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "training_records_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "training_records_course_id_not_blank_check" CHECK (btrim("course_id") <> ''),
    CONSTRAINT "training_records_user_id_not_blank_check" CHECK (btrim("user_id") <> ''),
    CONSTRAINT "training_records_score_check" CHECK ("score" >= 0 AND "score" <= 100),
    CONSTRAINT "training_records_completion_check" CHECK (
      ("status" = 'STARTED' AND "completed_at" IS NULL)
      OR ("status" IN ('COMPLETED', 'FAILED') AND "completed_at" IS NOT NULL)
    ),
    CONSTRAINT "training_records_completed_at_check" CHECK (
      "completed_at" IS NULL OR "completed_at" >= "created_at"
    )
);

-- CreateTable
CREATE TABLE "training_assignments" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "assigned_by" TEXT NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "status" "TrainingAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "training_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "training_assignments_course_id_not_blank_check" CHECK (btrim("course_id") <> ''),
    CONSTRAINT "training_assignments_company_id_not_blank_check" CHECK (btrim("company_id") <> ''),
    CONSTRAINT "training_assignments_team_id_not_blank_check" CHECK (btrim("team_id") <> ''),
    CONSTRAINT "training_assignments_user_id_not_blank_check" CHECK (btrim("user_id") <> ''),
    CONSTRAINT "training_assignments_assigned_by_not_blank_check" CHECK (btrim("assigned_by") <> ''),
    CONSTRAINT "training_assignments_deadline_check" CHECK ("deadline" > "created_at")
);

-- CreateTable
CREATE TABLE "ai_training_evaluations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "feedback" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_training_evaluations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ai_training_evaluations_user_id_not_blank_check" CHECK (btrim("user_id") <> ''),
    CONSTRAINT "ai_training_evaluations_course_id_not_blank_check" CHECK (btrim("course_id") <> ''),
    CONSTRAINT "ai_training_evaluations_question_not_blank_check" CHECK (btrim("question") <> ''),
    CONSTRAINT "ai_training_evaluations_answer_not_blank_check" CHECK (btrim("answer") <> ''),
    CONSTRAINT "ai_training_evaluations_score_check" CHECK ("score" >= 0 AND "score" <= 100),
    CONSTRAINT "ai_training_evaluations_feedback_not_blank_check" CHECK (btrim("feedback") <> '')
);

-- CreateIndex
CREATE UNIQUE INDEX "training_courses_id_company_id_key" ON "training_courses"("id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "training_courses_company_id_title_key" ON "training_courses"("company_id", "title");

-- CreateIndex
CREATE INDEX "training_courses_company_id_status_updated_at_idx" ON "training_courses"("company_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "training_courses_company_id_category_level_status_idx" ON "training_courses"("company_id", "category", "level", "status");

-- CreateIndex
CREATE UNIQUE INDEX "training_records_course_id_user_id_key" ON "training_records"("course_id", "user_id");

-- CreateIndex
CREATE INDEX "training_records_user_id_status_created_at_idx" ON "training_records"("user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "training_records_course_id_status_idx" ON "training_records"("course_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "training_assignments_course_id_team_id_user_id_key" ON "training_assignments"("course_id", "team_id", "user_id");

-- CreateIndex
CREATE INDEX "training_assignments_user_id_status_deadline_idx" ON "training_assignments"("user_id", "status", "deadline");

-- CreateIndex
CREATE INDEX "training_assignments_company_id_team_id_status_deadline_idx" ON "training_assignments"("company_id", "team_id", "status", "deadline");

-- CreateIndex
CREATE INDEX "training_assignments_assigned_by_created_at_idx" ON "training_assignments"("assigned_by", "created_at");

-- CreateIndex
CREATE INDEX "training_assignments_course_id_status_idx" ON "training_assignments"("course_id", "status");

-- CreateIndex
CREATE INDEX "ai_training_evaluations_user_id_created_at_idx" ON "ai_training_evaluations"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_training_evaluations_course_id_created_at_idx" ON "ai_training_evaluations"("course_id", "created_at");

-- AddForeignKey
ALTER TABLE "training_records" ADD CONSTRAINT "training_records_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "training_courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_assignments" ADD CONSTRAINT "training_assignments_course_id_company_id_fkey" FOREIGN KEY ("course_id", "company_id") REFERENCES "training_courses"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_assignments" ADD CONSTRAINT "training_assignments_team_id_company_id_fkey" FOREIGN KEY ("team_id", "company_id") REFERENCES "team_organizations"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_training_evaluations" ADD CONSTRAINT "ai_training_evaluations_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "training_courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
