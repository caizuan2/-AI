import { prisma } from "@/lib/prisma";
import { checkIngestSchema } from "@/lib/db/ingest-schema";
import { getSafeDatabaseUrlInfo } from "@/lib/safe-db-url";
import {
  getEmbeddingModel,
  getEmbeddingProviderName,
  getChatModelForProvider,
  getFallbackAIProvider,
  getPrimaryAIProvider,
  getSecondaryFallbackAIProvider,
  CHAT_MIN_RELEVANT_SIMILARITY,
  CHAT_TOP_K,
  RAG_ENABLE_RERANK,
  RAG_MAX_CONTEXT_CHUNKS,
  RAG_MAX_CONTEXT_CHARS,
  hasDatabaseUrl,
  hasUsableDeepSeekKey,
  hasUsableOpenAIKey,
  hasUsableQwenKey
} from "@/lib/server-config-core";

type VectorCheckRow = {
  pgvectorEnabled: boolean;
  matchFunctionExists: boolean;
};

function exists(name: string) {
  return Boolean(process.env[name]?.trim());
}

async function main() {
  const live = process.env.RAG_CHECK_LIVE === "true";
  const env = {
    DATABASE_URL: exists("DATABASE_URL"),
    DIRECT_URL: exists("DIRECT_URL"),
    SESSION_SECRET: exists("SESSION_SECRET"),
    QWEN_API_KEY: hasUsableQwenKey(),
    OPENAI_API_KEY: hasUsableOpenAIKey(),
    DEEPSEEK_API_KEY: hasUsableDeepSeekKey(),
    LLM_PROVIDER: exists("LLM_PROVIDER"),
    LLM_MODEL: exists("LLM_MODEL"),
    EMBEDDING_PROVIDER: exists("EMBEDDING_PROVIDER"),
    EMBEDDING_MODEL: exists("EMBEDDING_MODEL"),
    OPENAI_EMBEDDING_MODEL: exists("OPENAI_EMBEDDING_MODEL"),
    NEXT_PUBLIC_SUPABASE_URL: exists("NEXT_PUBLIC_SUPABASE_URL"),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: exists("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  };
  const databaseTarget = getSafeDatabaseUrlInfo();

  console.log(JSON.stringify({
    step: "env",
    env,
    provider: {
      primary: getPrimaryAIProvider(),
      model: getChatModelForProvider(getPrimaryAIProvider()),
      fallback: getFallbackAIProvider(),
      secondaryFallback: getSecondaryFallbackAIProvider(),
      embeddingProvider: getEmbeddingProviderName(),
      embeddingModel: getEmbeddingModel()
    },
    rag: {
      topK: CHAT_TOP_K,
      minSimilarity: CHAT_MIN_RELEVANT_SIMILARITY,
      maxContextChunks: RAG_MAX_CONTEXT_CHUNKS,
      maxContextChars: RAG_MAX_CONTEXT_CHARS,
      rerank: RAG_ENABLE_RERANK
    },
    databaseTarget
  }, null, 2));

  if (!hasDatabaseUrl()) {
    console.log("RAG_CHECK_FAILED: DATABASE_URL missing or invalid.");
    process.exitCode = 1;
    return;
  }

  await prisma.$queryRaw`SELECT 1`;
  const schema = await checkIngestSchema(prisma);
  const vectorRows = await prisma.$queryRaw<VectorCheckRow[]>`
    SELECT
      EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector') AS "pgvectorEnabled",
      EXISTS(
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'match_knowledge_chunks'
      ) AS "matchFunctionExists"
  `;
  const vector = vectorRows[0] ?? {
    pgvectorEnabled: false,
    matchFunctionExists: false
  };

  console.log(JSON.stringify({
    step: "database",
    connected: true,
    schema,
    vector: {
      ...vector,
      embeddingDimension: 1536
    }
  }, null, 2));

  if (!schema.schemaReady || !vector.pgvectorEnabled) {
    console.log("RAG_CHECK_FAILED: schema or pgvector is not ready.");
    process.exitCode = 1;
    return;
  }

  if (!live) {
    console.log("RAG_CHECK_OK: dry-run passed. Set RAG_CHECK_LIVE=true to test real AI calls.");
    return;
  }

  if (!hasUsableOpenAIKey()) {
    console.log("RAG_CHECK_FAILED: live mode requires OPENAI_API_KEY for embeddings.");
    process.exitCode = 1;
    return;
  }

  const { createEmbedding } = await import("@/lib/ai/embeddings");
  const embedding = await createEmbedding("RAG health check", {
    requestId: "rag-check-live",
    operation: "rag_check_embedding"
  });

  console.log(JSON.stringify({
    step: "live_embedding",
    provider: embedding.provider,
    model: embedding.model,
    dimensions: embedding.dimensions
  }, null, 2));
  console.log("RAG_CHECK_OK: live checks passed.");
}

main()
  .catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      message: error instanceof Error ? error.message : "Unknown check error"
    }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
