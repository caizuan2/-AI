-- Run this in the migration that creates knowledge_chunks before using the embedding column.
CREATE EXTENSION IF NOT EXISTS vector;

-- Prisma schema cannot currently express pgvector ANN indexes directly.
-- Use cosine distance for semantic search over OpenAI-style 1536-dimensional embeddings.
CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_hnsw_idx
ON knowledge_chunks
USING hnsw (embedding vector_cosine_ops)
WHERE embedding IS NOT NULL;
