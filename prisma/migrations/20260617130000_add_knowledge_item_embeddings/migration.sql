-- AlterTable
ALTER TABLE "knowledge_items" ADD COLUMN IF NOT EXISTS "embedding" JSONB;
ALTER TABLE "knowledge_items" ADD COLUMN IF NOT EXISTS "embeddingModel" TEXT;
ALTER TABLE "knowledge_items" ADD COLUMN IF NOT EXISTS "indexed_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "knowledge_items_embeddingModel_idx" ON "knowledge_items"("embeddingModel");
CREATE INDEX IF NOT EXISTS "knowledge_items_indexed_at_idx" ON "knowledge_items"("indexed_at");
CREATE INDEX IF NOT EXISTS "knowledge_items_tenant_indexed_at_idx" ON "knowledge_items"("tenant_id", "indexed_at");
