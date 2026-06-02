CREATE TYPE "FeedbackType" AS ENUM ('ISSUE', 'SUGGESTION', 'BUG', 'RAG_HELPFUL', 'RAG_NOT_HELPFUL');

CREATE TYPE "FeedbackStatus" AS ENUM ('OPEN', 'REVIEWING', 'RESOLVED', 'ARCHIVED');

CREATE TABLE "feedback" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "FeedbackType" NOT NULL,
  "content" TEXT NOT NULL,
  "status" "FeedbackStatus" NOT NULL DEFAULT 'OPEN',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "feedback_userId_idx" ON "feedback"("userId");
CREATE INDEX "feedback_type_idx" ON "feedback"("type");
CREATE INDEX "feedback_status_idx" ON "feedback"("status");
CREATE INDEX "feedback_createdAt_idx" ON "feedback"("createdAt");

ALTER TABLE "feedback"
ADD CONSTRAINT "feedback_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
