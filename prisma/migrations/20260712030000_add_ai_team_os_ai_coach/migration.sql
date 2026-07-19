-- CreateTable
CREATE TABLE "employee_analysis_reports" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "submission_id" TEXT,
    "score" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "problems" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "suggestions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "training_plan" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "employee_analysis_reports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "employee_analysis_reports_score_check" CHECK ("score" >= 0 AND "score" <= 100)
);

-- CreateTable
CREATE TABLE "employee_skill_scores" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "skill_name" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "level" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "employee_skill_scores_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "employee_skill_scores_score_check" CHECK ("score" >= 0 AND "score" <= 20),
    CONSTRAINT "employee_skill_scores_skill_name_check" CHECK ("skill_name" IN ('ice_breaking', 'needs_discovery', 'product_presentation', 'objection_handling', 'closing_progress'))
);

-- CreateIndex
CREATE UNIQUE INDEX "employee_analysis_reports_submission_id_key" ON "employee_analysis_reports"("submission_id");

-- CreateIndex
CREATE INDEX "employee_analysis_reports_user_id_created_at_idx" ON "employee_analysis_reports"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "employee_analysis_reports_team_id_created_at_idx" ON "employee_analysis_reports"("team_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "employee_skill_scores_report_id_skill_name_key" ON "employee_skill_scores"("report_id", "skill_name");

-- CreateIndex
CREATE INDEX "employee_skill_scores_user_id_created_at_idx" ON "employee_skill_scores"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "employee_analysis_reports" ADD CONSTRAINT "employee_analysis_reports_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_analysis_reports" ADD CONSTRAINT "employee_analysis_reports_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "task_submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_skill_scores" ADD CONSTRAINT "employee_skill_scores_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "employee_analysis_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
