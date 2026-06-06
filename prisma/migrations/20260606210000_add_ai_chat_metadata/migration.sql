-- AlterTable
ALTER TABLE "conversations"
ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'fast',
ADD COLUMN "metadata" JSONB;

-- AlterTable
ALTER TABLE "messages"
ADD COLUMN "user_id" TEXT,
ADD COLUMN "attachments" JSONB,
ADD COLUMN "sources" JSONB;

-- CreateIndex
CREATE INDEX "messages_user_id_idx" ON "messages"("user_id");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
