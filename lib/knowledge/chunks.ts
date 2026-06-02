import "server-only";

import { AIError } from "@/lib/errors";
import { hasUsableOpenAIKey, isAIFallbackAllowed } from "@/lib/server-config";

const MIN_CHUNK_SIZE = 800;
const TARGET_CHUNK_SIZE = 1000;
const MAX_CHUNK_SIZE = 1200;

export type ChunkDraft = {
  chunkText: string;
  chunkIndex: number;
};

export type ChunkEmbedding = {
  chunkIndex: number;
  embedding: number[] | null;
  model: string | null;
  errorMessage?: string;
};

export interface CreateChunkEmbeddingsOptions {
  requestId?: string;
  operation?: string;
  userId?: string;
}

function splitLongText(text: string, size = TARGET_CHUNK_SIZE) {
  const chunks: string[] = [];

  for (let start = 0; start < text.length; start += size) {
    chunks.push(text.slice(start, start + size));
  }

  return chunks;
}

export function splitContentIntoChunks(content: string): ChunkDraft[] {
  const paragraphs = content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs.length > 0 ? paragraphs : [content]) {
    if (paragraph.length > MAX_CHUNK_SIZE) {
      if (current) {
        chunks.push(current);
        current = "";
      }

      chunks.push(...splitLongText(paragraph));
      continue;
    }

    const separator = current ? "\n\n" : "";
    const next = `${current}${separator}${paragraph}`;

    if (next.length <= MAX_CHUNK_SIZE) {
      current = next;
      continue;
    }

    if (current) {
      chunks.push(current);
    }

    current = paragraph;
  }

  if (current) {
    chunks.push(current);
  }

  if (chunks.length > 1) {
    const last = chunks[chunks.length - 1];
    const previous = chunks[chunks.length - 2];

    if (last.length < MIN_CHUNK_SIZE && previous.length + last.length + 2 <= MAX_CHUNK_SIZE) {
      chunks.splice(chunks.length - 2, 2, `${previous}\n\n${last}`);
    }
  }

  return chunks.map((chunkText, chunkIndex) => ({
    chunkText,
    chunkIndex
  }));
}

export async function createChunkEmbeddings(
  chunks: ChunkDraft[],
  options: CreateChunkEmbeddingsOptions = {}
): Promise<ChunkEmbedding[]> {
  if (!hasUsableOpenAIKey()) {
    if (!isAIFallbackAllowed()) {
      throw new AIError("生产环境必须配置真实 OPENAI_API_KEY，不能跳过 embedding 生成。");
    }

    return chunks.map((chunk) => ({
      chunkIndex: chunk.chunkIndex,
      embedding: null,
      model: null
    }));
  }

  const { createEmbedding } = await import("@/lib/ai/embeddings");
  const embeddings: ChunkEmbedding[] = [];

  for (const chunk of chunks) {
    try {
      const result = await createEmbedding(chunk.chunkText, {
        requestId: options.requestId,
        operation: options.operation ?? "knowledge_chunk_embedding",
        userId: options.userId
      });

      embeddings.push({
        chunkIndex: chunk.chunkIndex,
        embedding: result.embedding,
        model: result.model
      });
    } catch (error) {
      embeddings.push({
        chunkIndex: chunk.chunkIndex,
        embedding: null,
        model: null,
        errorMessage: error instanceof Error ? error.message : "Embedding generation failed."
      });
    }
  }

  return embeddings;
}
