-- Add source tracking metadata to knowledge items.
ALTER TABLE "knowledge_items"
ADD COLUMN "sourceTitle" TEXT,
ADD COLUMN "sourceUrl" TEXT,
ADD COLUMN "sourceMessageId" TEXT;

-- Preserve legacy sourceType text as a display title before normalizing it.
UPDATE "knowledge_items"
SET "sourceTitle" = COALESCE("sourceTitle", "sourceType")
WHERE "sourceTitle" IS NULL;

UPDATE "knowledge_items"
SET "sourceType" = 'manual_note'
WHERE "sourceType" NOT IN ('chat_input', 'manual_note', 'web_url', 'document', 'imported_text');

ALTER TABLE "knowledge_items"
ADD CONSTRAINT "knowledge_items_sourceType_check"
CHECK ("sourceType" IN ('chat_input', 'manual_note', 'web_url', 'document', 'imported_text'));

CREATE INDEX "knowledge_items_sourceType_sourceMessageId_idx"
ON "knowledge_items"("sourceType", "sourceMessageId");
