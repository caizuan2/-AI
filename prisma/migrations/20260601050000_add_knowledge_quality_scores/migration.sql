ALTER TABLE "knowledge_items"
ADD COLUMN "clarityScore" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN "completenessScore" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN "usefulnessScore" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN "confidenceScore" INTEGER NOT NULL DEFAULT 3;

ALTER TABLE "knowledge_items"
ADD CONSTRAINT "knowledge_items_clarityScore_check" CHECK ("clarityScore" BETWEEN 1 AND 5);

ALTER TABLE "knowledge_items"
ADD CONSTRAINT "knowledge_items_completenessScore_check" CHECK ("completenessScore" BETWEEN 1 AND 5);

ALTER TABLE "knowledge_items"
ADD CONSTRAINT "knowledge_items_usefulnessScore_check" CHECK ("usefulnessScore" BETWEEN 1 AND 5);

ALTER TABLE "knowledge_items"
ADD CONSTRAINT "knowledge_items_confidenceScore_check" CHECK ("confidenceScore" BETWEEN 1 AND 5);

CREATE INDEX "knowledge_items_quality_scores_idx"
ON "knowledge_items"("clarityScore", "completenessScore", "usefulnessScore", "confidenceScore");
