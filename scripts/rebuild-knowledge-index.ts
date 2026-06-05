import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";
import { createChunkEmbeddings, splitContentIntoChunks, type ChunkDraft, type ChunkEmbedding } from "@/lib/knowledge/chunks";
import { toVectorLiteral } from "@/lib/knowledge/vector";
import { estimateTokenCount } from "@/lib/logger";
import { getDatabaseUrlWithPoolerParams, getSafeDatabaseUrlInfo } from "@/lib/safe-db-url";

const TRANSACTION_OPTIONS = {
  maxWait: 20_000,
  timeout: 120_000
};

function readLimit() {
  const value = Number(process.env.REINDEX_LIMIT);

  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function unquoteEnvValue(value: string) {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function loadLocalEnvFiles() {
  for (const fileName of [".env.local", ".env"]) {
    const filePath = path.join(process.cwd(), fileName);

    if (!existsSync(filePath)) {
      continue;
    }

    const content = readFileSync(filePath, "utf8");

    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();

      if (!line || line.startsWith("#")) {
        continue;
      }

      const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);

      if (!match) {
        continue;
      }

      const key = match[1];

      if (process.env[key] !== undefined) {
        continue;
      }

      process.env[key] = unquoteEnvValue(match[2] ?? "");
    }
  }
}

function readReindexDatabaseUrl() {
  const candidates = [
    ["REINDEX_DATABASE_URL", process.env.REINDEX_DATABASE_URL],
    ["DIRECT_URL", process.env.DIRECT_URL],
    ["DATABASE_URL", process.env.DATABASE_URL]
  ] as const;
  const selected = candidates.find(([, value]) => value?.trim());

  return {
    envName: selected?.[0] ?? null,
    url: selected?.[1]?.trim() ? getDatabaseUrlWithPoolerParams(selected[1].trim()) : undefined
  };
}

function formatDatabaseTarget(url?: string) {
  const info = getSafeDatabaseUrlInfo(url);

  if (!info.present) {
    return "not configured";
  }

  if (info.invalid) {
    return "invalid url";
  }

  return [
    info.host,
    info.port ? `:${info.port}` : "",
    info.database ? `/${info.database}` : "",
    info.isSupabasePooler ? " pooler" : "",
    info.hasPgbouncer ? " pgbouncer" : ""
  ].join("");
}

function truncateForLog(value: string, maxLength = 80) {
  const text = value.replace(/\s+/g, " ").trim();

  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

loadLocalEnvFiles();

const database = readReindexDatabaseUrl();
const prisma = new PrismaClient({
  ...(database.url
    ? {
        datasources: {
          db: {
            url: database.url
          }
        }
      }
    : {}),
  log: ["error", "warn"]
});

function buildChunkRows(itemId: string, chunks: ChunkDraft[], embeddingsByIndex: Map<number, ChunkEmbedding>) {
  return chunks.map((chunk): Prisma.KnowledgeChunkCreateManyInput => {
    const embedding = embeddingsByIndex.get(chunk.chunkIndex);

    return {
      knowledgeItemId: itemId,
      chunkText: chunk.chunkText,
      chunkIndex: chunk.chunkIndex,
      metadata: {
        ...chunk.metadata,
        charLength: chunk.chunkText.length,
        embeddingModel: embedding?.model ?? null,
        embeddingSkipped: embedding?.embedding === null,
        embeddingError: embedding?.errorMessage ?? null,
        embeddingStatus: embedding?.embedding ? "indexed" : "missing",
        regeneratedBy: "rag_reindex_script"
      },
      charCount: chunk.chunkText.length,
      tokenCount: estimateTokenCount(chunk.chunkText),
      embeddingModel: embedding?.model ?? null
    };
  });
}

async function writeChunkRows(itemId: string, rows: Prisma.KnowledgeChunkCreateManyInput[]) {
  await prisma.$transaction(
    async (tx) => {
      await tx.knowledgeChunk.deleteMany({
        where: { knowledgeItemId: itemId }
      });

      if (rows.length > 0) {
        await tx.knowledgeChunk.createMany({
          data: rows
        });
      }

      await tx.knowledgeItem.update({
        where: { id: itemId },
        data: {
          updatedAt: new Date()
        },
        select: {
          id: true
        }
      });
    },
    TRANSACTION_OPTIONS
  );
}

async function writeChunkVectors(itemId: string, embeddingsByIndex: Map<number, ChunkEmbedding>) {
  const chunks = await prisma.knowledgeChunk.findMany({
    where: { knowledgeItemId: itemId },
    select: {
      id: true,
      chunkIndex: true
    },
    orderBy: { chunkIndex: "asc" }
  });
  const chunkIdByIndex = new Map(chunks.map((chunk) => [chunk.chunkIndex, chunk.id]));
  let vectorCount = 0;

  for (const [chunkIndex, embedding] of Array.from(embeddingsByIndex.entries())) {
    if (!embedding.embedding) {
      continue;
    }

    const chunkId = chunkIdByIndex.get(chunkIndex);

    if (!chunkId) {
      throw new Error(`Missing created chunk for chunkIndex=${chunkIndex}.`);
    }

    await prisma.$executeRaw`
      UPDATE "knowledge_chunks"
      SET "embedding" = ${toVectorLiteral(embedding.embedding)}::vector
      WHERE "id" = ${chunkId}
    `;
    vectorCount += 1;
  }

  return vectorCount;
}

async function main() {
  const userId = process.env.REINDEX_USER_ID?.trim();
  const limit = readLimit();
  const items = await prisma.knowledgeItem.findMany({
    where: userId ? { userId } : undefined,
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      id: true,
      userId: true,
      title: true,
      content: true,
      summary: true,
      tags: true,
      category: true,
      sourceType: true,
      sourceTitle: true,
      sourceUrl: true
    }
  });
  const failures: Array<{ itemId: string; reason: string }> = [];

  console.log(`[rag:reindex] database env=${database.envName ?? "DATABASE_URL"} target=${formatDatabaseTarget(database.url)}`);
  console.log(`[rag:reindex] found ${items.length} knowledge items${limit ? ` limit=${limit}` : ""}${userId ? " userId=filtered" : ""}`);

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];

    if (!item) {
      continue;
    }

    const label = `${index + 1}/${items.length}`;

    try {
      console.log(`[rag:reindex] indexing ${label} itemId=${item.id} title=${truncateForLog(item.title)}`);

      const chunks = splitContentIntoChunks(item.content, {
        title: item.title,
        category: item.category,
        tags: item.tags,
        summary: item.summary,
        sourceType: item.sourceType,
        sourceTitle: item.sourceTitle,
        sourceUrl: item.sourceUrl
      });

      console.log(`[rag:reindex] prepared ${chunks.length} chunks itemId=${item.id}`);

      const embeddings = await createChunkEmbeddings(chunks, {
        operation: "knowledge_reindex_chunk_embedding",
        userId: item.userId
      });
      const embeddingsByIndex = new Map(embeddings.map((embedding) => [embedding.chunkIndex, embedding]));
      const chunkRows = buildChunkRows(item.id, chunks, embeddingsByIndex);

      await writeChunkRows(item.id, chunkRows);
      console.log(`[rag:reindex] wrote ${chunkRows.length} chunks for itemId=${item.id}`);

      const vectorCount = await writeChunkVectors(item.id, embeddingsByIndex);
      console.log(`[rag:reindex] wrote ${vectorCount} vectors for itemId=${item.id}`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      failures.push({ itemId: item.id, reason });
      console.error(`[rag:reindex] failed itemId=${item.id} reason=${reason}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`[rag:reindex] completed with ${failures.length} failed item(s).`);
  }

  console.log("[rag:reindex] done");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
