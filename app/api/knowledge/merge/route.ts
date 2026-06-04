import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { requireLicensedUser } from "@/lib/auth/guards";
import { createChunkEmbeddings, splitContentIntoChunks } from "@/lib/knowledge/chunks";
import { getExistingCategoryNames } from "@/lib/knowledge/categories";
import { normalizeQualityScores, type KnowledgeQualityScores } from "@/lib/knowledge/quality";
import {
  defaultKnowledgeSourceType,
  isKnowledgeSourceType,
  type KnowledgeSourceType
} from "@/lib/knowledge/source-types";
import { toVectorLiteral } from "@/lib/knowledge/vector";
import { getRequestIdFromHeaders } from "@/lib/logger";
import { hasDatabaseUrl, hasUsableChatProvider, isAIFallbackAllowed } from "@/lib/server-config";
import { AIError, NotFoundError, ValidationError } from "@/lib/errors";

export const dynamic = "force-dynamic";

interface MergeKnowledgeRequest extends KnowledgeQualityScores {
  targetKnowledgeItemId: string;
  title: string;
  content: string;
  summary: string;
  tags: string[];
  category: string;
  importance: number;
  sourceType: KnowledgeSourceType;
  sourceTitle: string | null;
  sourceUrl: string | null;
  sourceMessageId: string | null;
}

interface MergeHistoryResponse {
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

interface MergeKnowledgeResponse extends KnowledgeQualityScores {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  category: string;
  importance: number;
  updatedAt: string;
  chunkCount: number;
  mergeHistory: MergeHistoryResponse;
}

type ExistingKnowledge = KnowledgeQualityScores & {
  id: string;
  title: string;
  content: string;
  summary: string;
  tags: string[];
  category: string;
  importance: number;
};

type MergedKnowledgeDraft = KnowledgeQualityScores & {
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

function parseMergeKnowledgeRequest(body: unknown): MergeKnowledgeRequest {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const targetKnowledgeItemId = readTrimmedString(body.targetKnowledgeItemId);
  const title = readTrimmedString(body.title);
  const content = readTrimmedString(body.content);
  const summary = readTrimmedString(body.summary);
  const category = readTrimmedString(body.category);
  const importance = typeof body.importance === "number" ? Math.round(body.importance) : Number.NaN;
  const qualityScores = normalizeQualityScores({
    clarityScore: typeof body.clarityScore === "number" ? body.clarityScore : undefined,
    completenessScore: typeof body.completenessScore === "number" ? body.completenessScore : undefined,
    usefulnessScore: typeof body.usefulnessScore === "number" ? body.usefulnessScore : undefined,
    confidenceScore: typeof body.confidenceScore === "number" ? body.confidenceScore : undefined
  });
  const sourceType = isKnowledgeSourceType(body.sourceType) ? body.sourceType : defaultKnowledgeSourceType;
  const tags = Array.isArray(body.tags)
    ? body.tags.map((tag) => readTrimmedString(tag)).filter(Boolean)
    : [];

  if (!targetKnowledgeItemId) {
    throw new ValidationError("请选择要合并到的知识。");
  }

  if (!title) {
    throw new ValidationError("标题不能为空。");
  }

  if (!content) {
    throw new ValidationError("正文不能为空。");
  }

  if (!summary) {
    throw new ValidationError("摘要不能为空。");
  }

  if (!category) {
    throw new ValidationError("分类不能为空。");
  }

  if (!Number.isInteger(importance) || importance < 1 || importance > 5) {
    throw new ValidationError("重要度必须是 1 到 5 的整数。");
  }

  return {
    targetKnowledgeItemId,
    title,
    content,
    summary,
    tags,
    category,
    importance,
    ...qualityScores,
    sourceType,
    sourceTitle: readNullableTrimmedString(body.sourceTitle),
    sourceUrl: readNullableTrimmedString(body.sourceUrl),
    sourceMessageId: readNullableTrimmedString(body.sourceMessageId)
  };
}

function uniqueTags(tags: string[]) {
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean))).slice(0, 6);
}

function buildMergedContent(existing: ExistingKnowledge, incoming: MergeKnowledgeRequest) {
  return [
    existing.content.trim(),
    [
      "补充知识",
      `标题：${incoming.title}`,
      `摘要：${incoming.summary}`,
      `正文：${incoming.content}`
    ].join("\n")
  ].join("\n\n---\n\n");
}

function compactSummary(existing: ExistingKnowledge, incoming: MergeKnowledgeRequest) {
  const summary = [existing.summary, incoming.summary]
    .map((item) => item.trim())
    .filter(Boolean)
    .join("；");

  return summary.length > 220 ? `${summary.slice(0, 220)}...` : summary;
}

function buildLocalMergedDraft(existing: ExistingKnowledge, incoming: MergeKnowledgeRequest): MergedKnowledgeDraft {
  const tags = uniqueTags([...existing.tags, ...incoming.tags, "合并知识"]);
  const qualityScores = normalizeQualityScores({
    clarityScore: Math.round((existing.clarityScore + incoming.clarityScore) / 2),
    completenessScore: Math.max(existing.completenessScore, incoming.completenessScore),
    usefulnessScore: Math.max(existing.usefulnessScore, incoming.usefulnessScore),
    confidenceScore: Math.round((existing.confidenceScore + incoming.confidenceScore) / 2)
  });

  return {
    title: existing.title,
    summary: compactSummary(existing, incoming),
    tags,
    category: existing.category || incoming.category,
    importance: Math.max(existing.importance, incoming.importance),
    ...qualityScores
  };
}

async function generateMergedDraft(
  existing: ExistingKnowledge,
  incoming: MergeKnowledgeRequest,
  mergedContent: string,
  existingCategories: string[],
  requestId?: string,
  userId?: string
): Promise<MergedKnowledgeDraft> {
  if (!hasUsableChatProvider()) {
    if (!isAIFallbackAllowed()) {
      throw new AIError("生产环境必须配置真实 AI 生成模型，不能使用本地合并整理 fallback。");
    }

    return buildLocalMergedDraft(existing, incoming);
  }

  try {
    const { structureKnowledge } = await import("@/lib/ai/knowledge-structurer");
    const result = await structureKnowledge({
      content: mergedContent,
      sourceType: "manual_note",
      sourceId: existing.id,
      existingCategories,
      requestId,
      userId
    });
    const knowledge = result.knowledge;

    return {
      title: knowledge.title || existing.title,
      summary: knowledge.summary,
      tags: uniqueTags(knowledge.tags.length > 0 ? knowledge.tags : [...existing.tags, ...incoming.tags]),
      category: knowledge.category || existing.category || incoming.category,
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

    return buildLocalMergedDraft(existing, incoming);
  }
}

function toMergeHistoryResponse(history: {
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
}): MergeHistoryResponse {
  return {
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
  };
}

export async function POST(request: Request) {
  const requestId = getRequestIdFromHeaders(request.headers);
  let currentUser: Awaited<ReturnType<typeof requireLicensedUser>>;

  try {
    currentUser = await requireLicensedUser();
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("合并知识"));
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return apiError(new ValidationError("请求体必须是合法 JSON。"));
  }

  let input: MergeKnowledgeRequest;

  try {
    input = parseMergeKnowledgeRequest(body);
  } catch (error) {
    return apiError(error);
  }

  try {
    const existing = await prisma.knowledgeItem.findFirst({
      where: {
        id: input.targetKnowledgeItemId,
        userId: currentUser.id
      },
      select: {
        id: true,
        title: true,
        content: true,
        summary: true,
        tags: true,
        category: true,
        importance: true,
        clarityScore: true,
        completenessScore: true,
        usefulnessScore: true,
        confidenceScore: true
      }
    });

    if (!existing) {
      return apiError(new NotFoundError("要合并的目标知识不存在。"));
    }

    const mergedContent = buildMergedContent(existing, input);
    const existingCategories = await getExistingCategoryNames(currentUser.id);
    const mergedDraft = await generateMergedDraft(
      existing,
      input,
      mergedContent,
      existingCategories,
      requestId,
      currentUser.id
    );
    const chunks = splitContentIntoChunks(mergedContent, {
      title: mergedDraft.title,
      category: mergedDraft.category,
      tags: mergedDraft.tags,
      summary: mergedDraft.summary,
      sourceType: input.sourceType,
      sourceTitle: input.sourceTitle,
      sourceUrl: input.sourceUrl
    });
    const embeddings = await createChunkEmbeddings(chunks, {
      requestId,
      operation: "knowledge_merge_chunk_embedding",
      userId: currentUser.id
    });
    const embeddingsByIndex = new Map(embeddings.map((embedding) => [embedding.chunkIndex, embedding]));

    const result = await prisma.$transaction(async (tx) => {
      await tx.knowledgeChunk.deleteMany({
        where: { knowledgeItemId: existing.id }
      });

      const updated = await tx.knowledgeItem.update({
        where: { id: existing.id },
        data: {
          title: mergedDraft.title,
          content: mergedContent,
          summary: mergedDraft.summary,
          tags: mergedDraft.tags,
          category: mergedDraft.category,
          importance: mergedDraft.importance,
          clarityScore: mergedDraft.clarityScore,
          completenessScore: mergedDraft.completenessScore,
          usefulnessScore: mergedDraft.usefulnessScore,
          confidenceScore: mergedDraft.confidenceScore,
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
                  regeneratedBy: "knowledge_merge"
                }
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

      for (const chunk of updated.chunks) {
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

      const history = await tx.knowledgeMergeHistory.create({
        data: {
          knowledgeItemId: existing.id,
          incomingTitle: input.title,
          incomingSummary: input.summary,
          incomingContent: input.content,
          incomingTags: input.tags,
          incomingCategory: input.category,
          incomingImportance: input.importance,
          incomingSourceType: input.sourceType,
          incomingSourceTitle: input.sourceTitle,
          incomingSourceUrl: input.sourceUrl,
          incomingSourceMessageId: input.sourceMessageId
        }
      });

      return { updated, history };
    });

    return apiSuccess<MergeKnowledgeResponse>({
      id: result.updated.id,
      title: result.updated.title,
      summary: result.updated.summary,
      tags: result.updated.tags,
      category: result.updated.category,
      importance: result.updated.importance,
      clarityScore: result.updated.clarityScore,
      completenessScore: result.updated.completenessScore,
      usefulnessScore: result.updated.usefulnessScore,
      confidenceScore: result.updated.confidenceScore,
      updatedAt: result.updated.updatedAt.toISOString(),
      chunkCount: result.updated.chunks.length,
      mergeHistory: toMergeHistoryResponse(result.history)
    });
  } catch (error) {
    return apiError(error);
  }
}
