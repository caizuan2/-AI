-- Non-destructive v1 scale/RAG support.
-- This migration only creates missing extension/index/function/table objects and adds nullable columns.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "user_settings"
ADD COLUMN IF NOT EXISTS "preferredProvider" TEXT,
ADD COLUMN IF NOT EXISTS "preferredModel" TEXT,
ADD COLUMN IF NOT EXISTS "ragTopK" INTEGER,
ADD COLUMN IF NOT EXISTS "ragMinScore" DOUBLE PRECISION;

ALTER TABLE "knowledge_chunks"
ADD COLUMN IF NOT EXISTS "tokenCount" INTEGER,
ADD COLUMN IF NOT EXISTS "charCount" INTEGER,
ADD COLUMN IF NOT EXISTS "embeddingModel" TEXT;

CREATE TABLE IF NOT EXISTS "knowledge_query_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "providerUsed" TEXT NOT NULL,
    "modelUsed" TEXT NOT NULL,
    "topK" INTEGER NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "tokenUsage" JSONB,
    "cached" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "knowledge_query_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ai_cache" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_cache_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "rate_limit_events" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rate_limit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "knowledge_query_logs_userId_idx" ON "knowledge_query_logs"("userId");
CREATE INDEX IF NOT EXISTS "knowledge_query_logs_createdAt_idx" ON "knowledge_query_logs"("createdAt");
CREATE INDEX IF NOT EXISTS "knowledge_query_logs_cached_idx" ON "knowledge_query_logs"("cached");

CREATE UNIQUE INDEX IF NOT EXISTS "ai_cache_cacheKey_key" ON "ai_cache"("cacheKey");
CREATE INDEX IF NOT EXISTS "ai_cache_expiresAt_idx" ON "ai_cache"("expiresAt");

CREATE UNIQUE INDEX IF NOT EXISTS "rate_limit_events_subject_bucket_key" ON "rate_limit_events"("subject", "bucket");
CREATE INDEX IF NOT EXISTS "rate_limit_events_resetAt_idx" ON "rate_limit_events"("resetAt");

CREATE INDEX IF NOT EXISTS "knowledge_chunks_embedding_hnsw_idx"
ON "knowledge_chunks"
USING hnsw ("embedding" vector_cosine_ops)
WHERE "embedding" IS NOT NULL;

CREATE OR REPLACE FUNCTION match_knowledge_chunks(
  query_embedding vector(1536),
  match_count int DEFAULT 8,
  similarity_threshold float DEFAULT 0.72
)
RETURNS TABLE (
  chunk_id text,
  knowledge_item_id text,
  content text,
  similarity float,
  metadata jsonb
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    kc."id" AS chunk_id,
    kc."knowledgeItemId" AS knowledge_item_id,
    kc."chunkText" AS content,
    1 - (kc."embedding" <=> query_embedding) AS similarity,
    kc."metadata" AS metadata
  FROM "knowledge_chunks" kc
  WHERE kc."embedding" IS NOT NULL
    AND 1 - (kc."embedding" <=> query_embedding) >= similarity_threshold
  ORDER BY kc."embedding" <=> query_embedding
  LIMIT match_count;
$$;
