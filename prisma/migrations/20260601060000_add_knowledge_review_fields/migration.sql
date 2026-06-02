CREATE TYPE "KnowledgeReviewStatus" AS ENUM ('NEEDS_REVIEW', 'MASTERED', 'EXPIRED');

ALTER TABLE "knowledge_items"
ADD COLUMN "reviewStatus" "KnowledgeReviewStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
ADD COLUMN "lastReviewedAt" TIMESTAMP(3),
ADD COLUMN "nextReviewAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "knowledge_items_reviewStatus_idx"
ON "knowledge_items"("reviewStatus");

CREATE INDEX "knowledge_items_nextReviewAt_idx"
ON "knowledge_items"("nextReviewAt");

CREATE INDEX "knowledge_items_userId_reviewStatus_nextReviewAt_idx"
ON "knowledge_items"("userId", "reviewStatus", "nextReviewAt");
