import { prisma } from "@/lib/prisma";
import { createChunkEmbeddings, splitContentIntoChunks } from "@/lib/knowledge/chunks";
import { toVectorLiteral } from "@/lib/knowledge/vector";
import { estimateTokenCount } from "@/lib/logger";

function readLimit() {
  const value = Number(process.env.REINDEX_LIMIT);

  return Number.isInteger(value) && value > 0 ? value : undefined;
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

  console.log(`Rebuilding RAG index for ${items.length} knowledge item(s).`);

  for (const item of items) {
    const chunks = splitContentIntoChunks(item.content, {
      title: item.title,
      category: item.category,
      tags: item.tags,
      summary: item.summary,
      sourceType: item.sourceType,
      sourceTitle: item.sourceTitle,
      sourceUrl: item.sourceUrl
    });
    const embeddings = await createChunkEmbeddings(chunks, {
      operation: "knowledge_reindex_chunk_embedding",
      userId: item.userId
    });
    const embeddingsByIndex = new Map(embeddings.map((embedding) => [embedding.chunkIndex, embedding]));

    await prisma.$transaction(async (tx) => {
      await tx.knowledgeChunk.deleteMany({
        where: { knowledgeItemId: item.id }
      });

      const created = await tx.knowledgeItem.update({
        where: { id: item.id },
        data: {
          chunks: {
            create: chunks.map((chunk) => {
              const embedding = embeddingsByIndex.get(chunk.chunkIndex);

              return {
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
            })
          }
        },
        include: {
          chunks: {
            orderBy: { chunkIndex: "asc" }
          }
        }
      });

      for (const chunk of created.chunks) {
        const embedding = embeddingsByIndex.get(chunk.chunkIndex)?.embedding;

        if (!embedding) {
          continue;
        }

        await tx.$executeRaw`
          UPDATE "knowledge_chunks"
          SET "embedding" = ${toVectorLiteral(embedding)}::vector
          WHERE "id" = ${chunk.id}
        `;
      }
    });

    console.log(`Reindexed ${item.id} "${item.title}" with ${chunks.length} chunk(s).`);
  }

  console.log("RAG index rebuild complete.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
