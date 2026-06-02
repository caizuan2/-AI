CREATE TABLE "knowledge_merge_histories" (
  "id" TEXT NOT NULL,
  "knowledgeItemId" TEXT NOT NULL,
  "incomingTitle" TEXT NOT NULL,
  "incomingSummary" TEXT NOT NULL,
  "incomingContent" TEXT NOT NULL,
  "incomingTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "incomingCategory" TEXT NOT NULL,
  "incomingImportance" INTEGER NOT NULL,
  "incomingSourceType" TEXT NOT NULL,
  "incomingSourceTitle" TEXT,
  "incomingSourceUrl" TEXT,
  "incomingSourceMessageId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "knowledge_merge_histories_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "knowledge_merge_histories"
ADD CONSTRAINT "knowledge_merge_histories_knowledgeItemId_fkey"
FOREIGN KEY ("knowledgeItemId") REFERENCES "knowledge_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "knowledge_merge_histories"
ADD CONSTRAINT "knowledge_merge_histories_incomingSourceType_check"
CHECK ("incomingSourceType" IN ('chat_input', 'manual_note', 'web_url', 'document', 'imported_text'));

CREATE INDEX "knowledge_merge_histories_knowledgeItemId_idx"
ON "knowledge_merge_histories"("knowledgeItemId");

CREATE INDEX "knowledge_merge_histories_createdAt_idx"
ON "knowledge_merge_histories"("createdAt");
