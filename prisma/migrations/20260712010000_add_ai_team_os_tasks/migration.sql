-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskSubmissionStatus" AS ENUM ('SUBMITTED', 'REVIEWING', 'ANALYZED');

-- CreateTable
CREATE TABLE "team_tasks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "target_count" INTEGER NOT NULL DEFAULT 1,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "team_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_submissions" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "images" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "attachments" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "summary" TEXT NOT NULL,
    "status" "TaskSubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "task_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "team_tasks_team_id_idx" ON "team_tasks"("team_id");

-- CreateIndex
CREATE INDEX "team_tasks_creator_id_idx" ON "team_tasks"("creator_id");

-- CreateIndex
CREATE INDEX "team_tasks_status_idx" ON "team_tasks"("status");

-- CreateIndex
CREATE INDEX "team_tasks_deadline_idx" ON "team_tasks"("deadline");

-- CreateIndex
CREATE INDEX "task_submissions_task_id_idx" ON "task_submissions"("task_id");

-- CreateIndex
CREATE INDEX "task_submissions_user_id_idx" ON "task_submissions"("user_id");

-- CreateIndex
CREATE INDEX "task_submissions_status_idx" ON "task_submissions"("status");

-- CreateIndex
CREATE INDEX "task_submissions_created_at_idx" ON "task_submissions"("created_at");

-- AddForeignKey
ALTER TABLE "team_tasks" ADD CONSTRAINT "team_tasks_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "team_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
