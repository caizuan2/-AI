import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { requireLicensedUser } from "@/lib/auth/guards";
import { AIError, NotFoundError, ValidationError } from "@/lib/errors";
import { createChunkEmbeddings, splitContentIntoChunks } from "@/lib/knowledge/chunks";
import { getExistingCategoryNames } from "@/lib/knowledge/categories";
import { normalizeQualityScores, type KnowledgeQualityScores } from "@/lib/knowledge/quality";
import { getRequestIdFromHeaders } from "@/lib/logger";
import { toVectorLiteral } from "@/lib/knowledge/vector";
import { hasDatabaseUrl, hasUsableOpenAIKey, isAIFallbackAllowed } from "@/lib/server-config";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    id: string;
  };
};

interface SupplementKnowledgeRequest {
  suggestionTitle: string | null;
  suggestionQuestion: string | null;
  message: string;
}

interface KnowledgeChunkResponse {
  id: string;
  knowledgeItemId: string;
  chunkText: string;
  chunkIndex: number;
  metadata: Prisma.JsonValue;
  createdAt: string;
  hasEmbedding: boolean;
}

interface KnowledgeMergeHistoryResponse {
  id: string;
  incomingTitle: string;
  incomingSummary: string;
  incomingTags: string[];
  incomingCategory: string;
  incomingImportance: number;
  incomingSourceType: string;
  incomingSourceTitle: string | null;
  incomingSourceUrl: string | null;
  incomingSourceMessageId: string | null;
  createdAt: string;
}

interface SupplementKnowledgeResponse extends KnowledgeQualityScores {
  id: string;
  userId: string;
  title: string;
  content: string;
  summary: string;
  tags: string[];
  category: string;
  importance: number;
  sourceType: string;
  sourceId: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
  sourceMessageId: string | null;
  createdAt: string;
  updatedAt: string;
  chunks: KnowledgeChunkResponse[];
  mergeHistories: KnowledgeMergeHistoryResponse[];
}

type ExistingKnowledge = KnowledgeQualityScores & {
  id: string;
  userId: string;
  title: string;
  content: string;
  summary: string;
  tags: string[];
  category: string;
  importance: number;
  sourceType: string;
  sourceId: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
  sourceMessageId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type StructuredSupplement = KnowledgeQualityScores & {
  title: string;
  summary: string;
  tags: string[];
  category: string;
  importance: number;
};

function readTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNullableTrimmedString(value: unknown) {
  const text = readTrimmedString(value);

  return text ? text : null;
}

function parseSupplementRequest(body: unknown): SupplementKnowledgeRequest {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const message = readTrimmedString(body.message);

  if (!message) {
    throw new ValidationError("请输入要补充的内容。");
  }

  return {
    suggestionTitle: readNullableTrimmedString(body.suggestionTitle),
    suggestionQuestion: readNullableTrimmedString(body.suggestionQuestion),
    message
  };
}

function uniqueTags(tags: string[]) {
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean))).slice(0, 6);
}

function buildSupplementedContent(existing: ExistingKnowledge, input: SupplementKnowledgeRequest) {
  const lines = [
    "补充对话",
    input.suggestionTitle ? `建议主题：${input.suggestionTitle}` : null,
    input.suggestionQuestion ? `补充问题：${input.suggestionQuestion}` : null,
    `用户补充：${input.message}`
  ].filter((line): line is string => Boolean(line));

  return [existing.content.trim(), lines.join("\n")].join("\n\n---\n\n");
}

function compactSummary(existing: ExistingKnowledge, input: SupplementKnowledgeRequest) {
  const summary = [existing.summary, input.message]
    .map((item) => item.trim())
    .filter(Boolean)
    .join("；");

  return summary.length > 260 ? `${summary.slice(0, 260)}...` : summary;
}

function buildLocalSupplementDraft(existing: ExistingKnowledge, input: SupplementKnowledgeRequest): StructuredSupplement {
  const hasEvidence = /来源|依据|文档|会议|数据|客户|用户|链接|截图/.test(input.message);
  const qualityScores = normalizeQualityScores({
    clarityScore: Math.min(5, existing.clarityScore + 1),
    completenessScore: Math.min(5, existing.completenessScore + 1),
    usefulnessScore: Math.min(5, existing.usefulnessScore + 1),
    confidenceScore: Math.min(5, existing.confidenceScore + (hasEvidence ? 1 : 0))
  });

  return {
    title: existing.title,
    summary: compactSummary(existing, input),
    tags: uniqueTags([...existing.tags, "补充完善"]),
    category: existing.category,
    importance: existing.importance,
    ...qualityScores
  };
}

async function structureSupplementedKnowledge(
  existing: ExistingKnowledge,
  input: SupplementKnowledgeRequest,
  supplementedContent: string,
  existingCategories: string[],
  requestId?: string,
  userId?: string
): Promise<StructuredSupplement> {
  if (!hasUsableOpenAIKey()) {
    if (!isAIFallbackAllowed()) {
      throw new AIError("生产环境必须配置真实 OPENAI_API_KEY，不能使用本地知识补充 fallback。");
    }

    return buildLocalSupplementDraft(existing, input);
  }

  try {
    const { structureKnowledge } = await import("@/lib/ai/knowledge-structurer");
    const result = await structureKnowledge({
      content: supplementedContent,
      sourceType: existing.sourceType,
      sourceId: existing.id,
      existingCategories,
      requestId,
      userId
    });
    const knowledge = result.knowledge;

    return {
      title: knowledge.title || existing.title,
      summary: knowledge.summary,
      tags: uniqueTags(knowledge.tags.length > 0 ? knowledge.tags : existing.tags),
      category: knowledge.category || existing.category,
      importance: knowledge.importance,
      clarityScore: knowledge.clarityScore,
      completenessScore: knowledge.completenessScore,
      usefulnessScore: knowledge.usefulnessScore,
      confidenceScore: knowledge.confidenceScore
    };
  } catch (error) {
    if (!isAIFallbackAllowed()) {
      throw error;
    }

    return buildLocalSupplementDraft(existing, input);
  }
}

function serializeKnowledgeDetail(item: ExistingKnowledge & {
  chunks: Array<{
    id: string;
    knowledgeItemId: string;
    chunkText: string;
    chunkIndex: number;
    metadata: Prisma.JsonValue;
    createdAt: Date;
  }>;
  mergeHistories: Array<{
    id: string;
    incomingTitle: string;
    incomingSummary: string;
    incomingTags: string[];
    incomingCategory: string;
    incomingImportance: number;
    incomingSourceType: string;
    incomingSourceTitle: string | null;
    incomingSourceUrl: string | null;
    incomingSourceMessageId: string | null;
    createdAt: Date;
  }>;
}): SupplementKnowledgeResponse {
  return {
    id: item.id,
    userId: item.userId,
    title: item.title,
    content: item.content,
    summary: item.summary,
    tags: item.tags,
    category: item.category,
    importance: item.importance,
    clarityScore: item.clarityScore,
    completenessScore: item.completenessScore,
    usefulnessScore: item.usefulnessScore,
    confidenceScore: item.confidenceScore,
    sourceType: item.sourceType,
    sourceId: item.sourceId,
    sourceTitle: item.sourceTitle,
    sourceUrl: item.sourceUrl,
    sourceMessageId: item.sourceMessageId,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    chunks: item.chunks.map((chunk) => ({
      id: chunk.id,
      knowledgeItemId: chunk.knowledgeItemId,
      chunkText: chunk.chunkText,
      chunkIndex: chunk.chunkIndex,
      metadata: chunk.metadata,
      createdAt: chunk.createdAt.toISOString(),
      hasEmbedding:
        isPlainObject(chunk.metadata) &&
        "embeddingSkipped" in chunk.metadata &&
        chunk.metadata.embeddingSkipped === false
    })),
    mergeHistories: item.mergeHistories.map((history) => ({
      id: history.id,
      incomingTitle: history.incomingTitle,
      incomingSummary: history.incomingSummary,
      incomingTags: history.incomingTags,
      incomingCategory: history.incomingCategory,
      incomingImportance: history.incomingImportance,
      incomingSourceType: history.incomingSourceType,
      incomingSourceTitle: history.incomingSourceTitle,
      incomingSourceUrl: history.incomingSourceUrl,
      incomingSourceMessageId: history.incomingSourceMessageId,
      createdAt: history.createdAt.toISOString()
    }))
  };
}

export async function POST(request: Request, context: RouteContext) {
  const requestId = getRequestIdFromHeaders(request.headers);
  let currentUser: Awaited<ReturnType<typeof requireLicensedUser>>;

  try {
    currentUser = await requireLicensedUser();
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("补充知识"));
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return apiError(new ValidationError("请求体必须是合法 JSON。"));
  }

  let input: SupplementKnowledgeRequest;

  try {
    input = parseSupplementRequest(body);
  } catch (error) {
    return apiError(error);
  }

  try {
    const existing = await prisma.knowledgeItem.findFirst({
      where: {
        id: context.params.id,
        userId: currentUser.id
      }
    });

    if (!existing) {
      return apiError(new NotFoundError("知识不存在。"));
    }

    const supplementedContent = buildSupplementedContent(existing, input);
    const existingCategories = await getExistingCategoryNames(currentUser.id);
    const structured = await structureSupplementedKnowledge(
      existing,
      input,
      supplementedContent,
      existingCategories,
      requestId,
      currentUser.id
    );
    const chunks = splitContentIntoChunks(supplementedContent);
    const embeddings = await createChunkEmbeddings(chunks, {
      requestId,
      operation: "knowledge_supplement_chunk_embedding",
      userId: currentUser.id
    });
    const embeddingsByIndex = new Map(embeddings.map((embedding) => [embedding.chunkIndex, embedding]));

    const updated = await prisma.$transaction(async (tx) => {
      await tx.knowledgeChunk.deleteMany({
        where: { knowledgeItemId: existing.id }
      });

      const item = await tx.knowledgeItem.update({
        where: { id: existing.id },
        data: {
          title: structured.title,
          content: supplementedContent,
          summary: structured.summary,
          tags: structured.tags,
          category: structured.category,
          importance: structured.importance,
          clarityScore: structured.clarityScore,
          completenessScore: structured.completenessScore,
          usefulnessScore: structured.usefulnessScore,
          confidenceScore: structured.confidenceScore,
          chunks: {
            create: chunks.map((chunk) => {
              const embedding = embeddingsByIndex.get(chunk.chunkIndex);

              return {
                chunkText: chunk.chunkText,
                chunkIndex: chunk.chunkIndex,
                metadata: {
                  charLength: chunk.chunkText.length,
                  embeddingModel: embedding?.model ?? null,
                  embeddingSkipped: embedding?.embedding === null,
                  embeddingError: embedding?.errorMessage ?? null,
                  regeneratedBy: "knowledge_supplement"
                }
              };
            })
          }
        },
        include: {
          chunks: {
            orderBy: { chunkIndex: "asc" }
          },
          mergeHistories: {
            orderBy: { createdAt: "desc" }
          }
        }
      });

      for (const chunk of item.chunks) {
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

      return item;
    });

    return apiSuccess<SupplementKnowledgeResponse>(serializeKnowledgeDetail(updated));
  } catch (error) {
    return apiError(error);
  }
}
