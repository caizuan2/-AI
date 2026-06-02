CREATE TABLE "knowledge_completion_suggestions" (
  "id" TEXT NOT NULL,
  "knowledgeItemId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "detail" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "priority" INTEGER NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'local',
  "model" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "knowledge_completion_suggestions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "knowledge_completion_suggestions"
ADD CONSTRAINT "knowledge_completion_suggestions_knowledgeItemId_fkey"
FOREIGN KEY ("knowledgeItemId")
REFERENCES "knowledge_items"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "knowledge_completion_suggestions"
ADD CONSTRAINT "knowledge_completion_suggestions_priority_check"
CHECK ("priority" BETWEEN 1 AND 5);

ALTER TABLE "knowledge_completion_suggestions"
ADD CONSTRAINT "knowledge_completion_suggestions_mode_check"
CHECK ("mode" IN ('ai', 'local'));

CREATE INDEX "knowledge_completion_suggestions_knowledgeItemId_idx"
ON "knowledge_completion_suggestions"("knowledgeItemId");

CREATE INDEX "knowledge_completion_suggestions_updatedAt_idx"
ON "knowledge_completion_suggestions"("updatedAt");

CREATE INDEX "knowledge_completion_suggestions_mode_idx"
ON "knowledge_completion_suggestions"("mode");
