CREATE TYPE "AnalyticsEventType" AS ENUM ('CHAT_QUESTION', 'RAG_RETRIEVAL', 'AI_CALL', 'FILE_UPLOAD');

CREATE TABLE "analytics_events" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "type" "AnalyticsEventType" NOT NULL,
  "numericValue" DOUBLE PRECISION,
  "metadata" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "analytics_events_userId_idx" ON "analytics_events"("userId");
CREATE INDEX "analytics_events_userId_occurredAt_idx" ON "analytics_events"("userId", "occurredAt");
CREATE INDEX "analytics_events_type_idx" ON "analytics_events"("type");
CREATE INDEX "analytics_events_type_occurredAt_idx" ON "analytics_events"("type", "occurredAt");
CREATE INDEX "analytics_events_occurredAt_idx" ON "analytics_events"("occurredAt");

ALTER TABLE "analytics_events"
ADD CONSTRAINT "analytics_events_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
