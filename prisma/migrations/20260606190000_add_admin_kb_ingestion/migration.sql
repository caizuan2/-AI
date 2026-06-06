-- AlterTable
ALTER TABLE "knowledge_chunks"
ADD COLUMN "file_id" TEXT,
ADD COLUMN "summary" TEXT,
ADD COLUMN "content_hash" TEXT,
ADD COLUMN "embedding_id" TEXT;

-- CreateTable
CREATE TABLE "knowledge_files" (
    "id" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "storage_path" TEXT NOT NULL,
    "uploader_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'uploaded',
    "category_id" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,
    "delete_reason" TEXT,

    CONSTRAINT "knowledge_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_jobs" (
    "id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "created_by" TEXT NOT NULL,
    "file_id" TEXT,
    "knowledge_item_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "ingestion_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_chunks_file_id_idx" ON "knowledge_chunks"("file_id");

-- CreateIndex
CREATE INDEX "knowledge_chunks_content_hash_idx" ON "knowledge_chunks"("content_hash");

-- CreateIndex
CREATE INDEX "knowledge_files_uploader_id_idx" ON "knowledge_files"("uploader_id");

-- CreateIndex
CREATE INDEX "knowledge_files_status_idx" ON "knowledge_files"("status");

-- CreateIndex
CREATE INDEX "knowledge_files_file_type_idx" ON "knowledge_files"("file_type");

-- CreateIndex
CREATE INDEX "knowledge_files_deleted_at_idx" ON "knowledge_files"("deleted_at");

-- CreateIndex
CREATE INDEX "knowledge_files_created_at_idx" ON "knowledge_files"("created_at");

-- CreateIndex
CREATE INDEX "ingestion_jobs_created_by_idx" ON "ingestion_jobs"("created_by");

-- CreateIndex
CREATE INDEX "ingestion_jobs_source_type_idx" ON "ingestion_jobs"("source_type");

-- CreateIndex
CREATE INDEX "ingestion_jobs_source_id_idx" ON "ingestion_jobs"("source_id");

-- CreateIndex
CREATE INDEX "ingestion_jobs_status_idx" ON "ingestion_jobs"("status");

-- CreateIndex
CREATE INDEX "ingestion_jobs_file_id_idx" ON "ingestion_jobs"("file_id");

-- CreateIndex
CREATE INDEX "ingestion_jobs_knowledge_item_id_idx" ON "ingestion_jobs"("knowledge_item_id");

-- CreateIndex
CREATE INDEX "ingestion_jobs_created_at_idx" ON "ingestion_jobs"("created_at");

-- AddForeignKey
ALTER TABLE "knowledge_files" ADD CONSTRAINT "knowledge_files_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "knowledge_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_knowledge_item_id_fkey" FOREIGN KEY ("knowledge_item_id") REFERENCES "knowledge_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "knowledge_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
