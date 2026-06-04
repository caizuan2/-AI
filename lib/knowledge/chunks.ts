import "server-only";

import { AppError } from "@/lib/errors";
import {
  INGEST_BATCH_SIZE,
  INGEST_CHUNK_OVERLAP_CHARS,
  INGEST_MAX_CHUNK_CHARS,
  hasUsableOpenAIKey,
  isAIFallbackAllowed
} from "@/lib/server-config";

const MIN_CHUNK_SIZE = Math.min(800, Math.max(400, INGEST_MAX_CHUNK_CHARS - INGEST_CHUNK_OVERLAP_CHARS));
const TARGET_CHUNK_SIZE = Math.max(400, Math.min(1000, INGEST_MAX_CHUNK_CHARS));
const MAX_CHUNK_SIZE = INGEST_MAX_CHUNK_CHARS;

export type ChunkDraft = {
  chunkText: string;
  chunkIndex: number;
  chunkType: string;
  embeddingText: string;
  metadata: Record<string, unknown>;
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
  const step = Math.max(1, size - INGEST_CHUNK_OVERLAP_CHARS);

  for (let start = 0; start < text.length; start += step) {
    chunks.push(text.slice(start, start + size));
  }

  return chunks;
}

export interface SplitContentContext {
  title?: string;
  category?: string;
  tags?: string[];
  summary?: string;
  sourceType?: string;
  sourceTitle?: string | null;
  sourceUrl?: string | null;
}

function isSemanticBoundary(line: string) {
  return [
    /^#{1,6}\s+/,
    /^第[一二三四五六七八九十\d]+[章节条款]/,
    /^(\d+|[一二三四五六七八九十]+)[.、]\s*\S+/,
    /^(Q|A|问|答)[:：]/i,
    /^(FAQ|常见问答|问题|客户异议|业务场景|适用场景|话术|推荐话术|禁止事项|禁止表达|允许表达|注意事项|操作步骤|流程|核心结论|关键规则|资格条件)[:：\s]/i
  ].some((pattern) => pattern.test(line.trim()));
}

function splitContentIntoSemanticBlocks(content: string) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  let current: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      if (current.length > 0) {
        blocks.push(current.join("\n").trim());
        current = [];
      }

      continue;
    }

    if (current.length > 0 && isSemanticBoundary(line)) {
      blocks.push(current.join("\n").trim());
      current = [line];
      continue;
    }

    current.push(line);
  }

  if (current.length > 0) {
    blocks.push(current.join("\n").trim());
  }

  return blocks.filter(Boolean);
}

function inferChunkType(chunkText: string) {
  const normalized = chunkText.trim();

  if (/^(Q|问|问题)[:：]|FAQ|常见问答/i.test(normalized)) {
    return "faq";
  }

  if (/话术|怎么说|推荐表达|可用表达|沟通示例|回复/.test(normalized)) {
    return "script";
  }

  if (/禁止|不能|不得|不允许|避免|边界/.test(normalized)) {
    return "policy";
  }

  if (/步骤|流程|\d+[.、]/.test(normalized)) {
    return "step";
  }

  if (/案例|对话|客户异议|复盘/.test(normalized)) {
    return "case";
  }

  if (/规则|制度|资格|条件|适用对象/.test(normalized)) {
    return "rule";
  }

  if (/摘要|核心结论|关键结论/.test(normalized)) {
    return "summary";
  }

  return "knowledge";
}

function buildEmbeddingText(chunkText: string, context: SplitContentContext, chunkType: string) {
  const contextLines = [
    context.title ? `知识标题：${context.title}` : null,
    context.category ? `分类：${context.category}` : null,
    context.tags && context.tags.length > 0 ? `标签：${context.tags.join("、")}` : null,
    context.summary ? `摘要：${context.summary}` : null,
    context.sourceTitle ? `来源：${context.sourceTitle}` : null,
    `片段类型：${chunkType}`,
    "正文：",
    chunkText
  ].filter((line): line is string => Boolean(line));

  return contextLines.join("\n");
}

function buildChunkMetadata(chunkText: string, context: SplitContentContext, chunkType: string) {
  return {
    title: context.title ?? null,
    category: context.category ?? null,
    tags: context.tags ?? [],
    summary: context.summary ?? null,
    sourceType: context.sourceType ?? null,
    sourceTitle: context.sourceTitle ?? null,
    sourceUrl: context.sourceUrl ?? null,
    scenario: /场景|客户|新伙伴|沟通|销售/.test(chunkText) ? "business_context" : null,
    chunkType,
    embeddingStatus: "pending"
  };
}

export function splitContentIntoChunks(content: string, context: SplitContentContext = {}): ChunkDraft[] {
  const semanticBlocks = splitContentIntoSemanticBlocks(content);
  const paragraphs = (semanticBlocks.length > 0 ? semanticBlocks : content.split(/\n{2,}/))
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

  return chunks.map((chunkText, chunkIndex) => {
    const chunkType = inferChunkType(chunkText);

    return {
      chunkText,
      chunkIndex,
      chunkType,
      embeddingText: buildEmbeddingText(chunkText, context, chunkType),
      metadata: buildChunkMetadata(chunkText, context, chunkType)
    };
  });
}

export async function createChunkEmbeddings(
  chunks: ChunkDraft[],
  options: CreateChunkEmbeddingsOptions = {}
): Promise<ChunkEmbedding[]> {
  if (!hasUsableOpenAIKey()) {
    if (!isAIFallbackAllowed()) {
      throw new AppError("MISSING_EMBEDDING_API_KEY", "生产环境必须配置 OPENAI_API_KEY 生成 embedding。", 500);
    }

    return chunks.map((chunk) => ({
      chunkIndex: chunk.chunkIndex,
      embedding: null,
      model: null
    }));
  }

  const { createEmbeddings } = await import("@/lib/ai/embeddings");
  const embeddings: ChunkEmbedding[] = [];

  for (let start = 0; start < chunks.length; start += INGEST_BATCH_SIZE) {
    const batch = chunks.slice(start, start + INGEST_BATCH_SIZE);

    try {
      const result = await createEmbeddings(batch.map((chunk) => chunk.embeddingText || chunk.chunkText), {
        requestId: options.requestId,
        operation: options.operation ?? "knowledge_chunk_embedding",
        userId: options.userId
      });

      for (let index = 0; index < result.embeddings.length; index += 1) {
        const embeddingResult = result.embeddings[index];
        const chunk = batch[index];

        if (!chunk || !embeddingResult) {
          continue;
        }

        embeddings.push({
          chunkIndex: chunk.chunkIndex,
          embedding: embeddingResult.embedding,
          model: embeddingResult.model
        });
      }
    } catch (error) {
      embeddings.push(...batch.map((chunk) => ({
        chunkIndex: chunk.chunkIndex,
        embedding: null,
        model: null,
        errorMessage: error instanceof Error ? error.message : "Embedding generation failed."
      })));
    }
  }

  return embeddings;
}
