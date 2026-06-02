import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { requireLicensedUser } from "@/lib/auth/guards";
import { createChunkEmbeddings, splitContentIntoChunks } from "@/lib/knowledge/chunks";
import { isKnowledgeLifecycleStatus } from "@/lib/knowledge/status";
import { getRequestIdFromHeaders } from "@/lib/logger";
import { toVectorLiteral } from "@/lib/knowledge/vector";
import { hasDatabaseUrl } from "@/lib/server-config";
import { NotFoundError, ValidationError } from "@/lib/errors";

export const dynamic = "force-dynamic";

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

interface KnowledgeDetailResponse {
  id: string;
  userId: string;
  title: string;
  content: string;
  summary: string;
  tags: string[];
  category: string;
  importance: number;
  clarityScore: number;
  completenessScore: number;
  usefulnessScore: number;
  confidenceScore: number;
  sourceType: string;
  sourceId: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
  sourceMessageId: string | null;
  expiresAt: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  chunks: KnowledgeChunkResponse[];
  mergeHistories: KnowledgeMergeHistoryResponse[];
}

interface DeleteKnowledgeResponse {
  id: string;
  deleted: true;
}

type RouteContext = {
  params: {
    id: string;
  };
};

type PatchKnowledgeInput = {
  title?: string;
  content?: string;
  summary?: string;
  tags?: string[];
  category?: string;
  importance?: number;
  clarityScore?: number;
  completenessScore?: number;
  usefulnessScore?: number;
  confidenceScore?: number;
  expiresAt?: Date | null;
  status?: string;
};

const MAX_KNOWLEDGE_CONTENT_CHARS = 100_000;

function ensureDatabaseUrl() {
  return hasDatabaseUrl();
}

function parsePatchKnowledgeInput(body: unknown): PatchKnowledgeInput {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const input: PatchKnowledgeInput = {};

  if ("title" in body) {
    if (typeof body.title !== "string" || !body.title.trim()) {
      throw new ValidationError("标题不能为空。");
    }

    input.title = body.title.trim();
  }

  if ("content" in body) {
    if (typeof body.content !== "string" || !body.content.trim()) {
      throw new ValidationError("正文不能为空。");
    }

    const content = body.content.trim();

    if (content.length > MAX_KNOWLEDGE_CONTENT_CHARS) {
      throw new ValidationError(`正文过长，请控制在 ${MAX_KNOWLEDGE_CONTENT_CHARS} 字以内。`);
    }

    input.content = content;
  }

  if ("summary" in body) {
    if (typeof body.summary !== "string" || !body.summary.trim()) {
      throw new ValidationError("摘要不能为空。");
    }

    input.summary = body.summary.trim();
  }

  if ("tags" in body) {
    if (!Array.isArray(body.tags)) {
      throw new ValidationError("标签必须是字符串数组。");
    }

    input.tags = body.tags.map((tag) => (typeof tag === "string" ? tag.trim() : "")).filter(Boolean);
  }

  if ("category" in body) {
    if (typeof body.category !== "string" || !body.category.trim()) {
      throw new ValidationError("分类不能为空。");
    }

    input.category = body.category.trim();
  }

  if ("importance" in body) {
    const importance = typeof body.importance === "number" ? Math.round(body.importance) : Number.NaN;

    if (!Number.isInteger(importance) || importance < 1 || importance > 5) {
      throw new ValidationError("重要度必须是 1 到 5 的整数。");
    }

    input.importance = importance;
  }

  for (const key of ["clarityScore", "completenessScore", "usefulnessScore", "confidenceScore"] as const) {
    if (key in body) {
      const score = typeof body[key] === "number" ? Math.round(body[key]) : Number.NaN;

      if (!Number.isInteger(score) || score < 1 || score > 5) {
        throw new ValidationError("质量评分必须是 1 到 5 的整数。");
      }

      input[key] = score;
    }
  }

  if ("expiresAt" in body) {
    if (body.expiresAt === null || body.expiresAt === "") {
      input.expiresAt = null;
    } else if (typeof body.expiresAt === "string") {
      const expiresAt = new Date(body.expiresAt);

      if (!Number.isFinite(expiresAt.getTime())) {
        throw new ValidationError("过期时间格式不正确。");
      }

      input.expiresAt = expiresAt;
    } else {
      throw new ValidationError("过期时间格式不正确。");
    }
  }

  if ("status" in body) {
    if (!isKnowledgeLifecycleStatus(body.status)) {
      throw new ValidationError("知识状态不正确。");
    }

    input.status = body.status;
  }

  if (Object.keys(input).length === 0) {
    throw new ValidationError("至少需要提供一个要更新的字段。");
  }

  return input;
}

function serializeKnowledgeDetail(item: {
  id: string;
  userId: string;
  title: string;
  content: string;
  summary: string;
  tags: string[];
  category: string;
  importance: number;
  clarityScore: number;
  completenessScore: number;
  usefulnessScore: number;
  confidenceScore: number;
  sourceType: string;
  sourceId: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
  sourceMessageId: string | null;
  expiresAt: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
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
}): KnowledgeDetailResponse {
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
    expiresAt: item.expiresAt?.toISOString() ?? null,
    status: item.status,
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

async function findKnowledgeItem(id: string, userId: string) {
  return prisma.knowledgeItem.findFirst({
    where: { id, userId },
    include: {
      chunks: {
        orderBy: { chunkIndex: "asc" }
      },
      mergeHistories: {
        orderBy: { createdAt: "desc" }
      }
    }
  });
}

function buildPatchData(input: PatchKnowledgeInput): Prisma.KnowledgeItemUpdateInput {
  const data: Prisma.KnowledgeItemUpdateInput = {};

  if (input.title !== undefined) {
    data.title = input.title;
  }

  if (input.content !== undefined) {
    data.content = input.content;
  }

  if (input.summary !== undefined) {
    data.summary = input.summary;
  }

  if (input.tags !== undefined) {
    data.tags = input.tags;
  }

  if (input.category !== undefined) {
    data.category = input.category;
  }

  if (input.importance !== undefined) {
    data.importance = input.importance;
  }

  if (input.clarityScore !== undefined) {
    data.clarityScore = input.clarityScore;
  }

  if (input.completenessScore !== undefined) {
    data.completenessScore = input.completenessScore;
  }

  if (input.usefulnessScore !== undefined) {
    data.usefulnessScore = input.usefulnessScore;
  }

  if (input.confidenceScore !== undefined) {
    data.confidenceScore = input.confidenceScore;
  }

  if (input.expiresAt !== undefined) {
    data.expiresAt = input.expiresAt;
  }

  if (input.status !== undefined) {
    data.status = input.status;
  }

  return data;
}

export async function GET(_request: Request, context: RouteContext) {
  let currentUser: Awaited<ReturnType<typeof requireLicensedUser>>;

  try {
    currentUser = await requireLicensedUser();
  } catch (error) {
    return apiError(error);
  }

  if (!ensureDatabaseUrl()) {
    return apiError(databaseConfigError("加载知识详情"));
  }

  try {
    const item = await findKnowledgeItem(context.params.id, currentUser.id);

    if (!item) {
      return apiError(new NotFoundError("知识不存在。"));
    }

    return apiSuccess<KnowledgeDetailResponse>(serializeKnowledgeDetail(item));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const requestId = getRequestIdFromHeaders(request.headers);
  let currentUser: Awaited<ReturnType<typeof requireLicensedUser>>;

  try {
    currentUser = await requireLicensedUser();
  } catch (error) {
    return apiError(error);
  }

  if (!ensureDatabaseUrl()) {
    return apiError(databaseConfigError("更新知识"));
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return apiError(new ValidationError("请求体必须是合法 JSON。"));
  }

  let input: PatchKnowledgeInput;

  try {
    input = parsePatchKnowledgeInput(body);
  } catch (error) {
    return apiError(error);
  }

  try {
    const existing = await prisma.knowledgeItem.findUnique({
      where: { id: context.params.id },
      select: { id: true, userId: true }
    });

    if (!existing || existing.userId !== currentUser.id) {
      return apiError(new NotFoundError("知识不存在。"));
    }

    const replacementChunks = input.content === undefined ? null : splitContentIntoChunks(input.content);
    const replacementEmbeddings = replacementChunks
      ? await createChunkEmbeddings(replacementChunks, {
          requestId,
          operation: "knowledge_update_chunk_embedding",
          userId: currentUser.id
        })
      : null;
    const embeddingsByIndex = replacementEmbeddings
      ? new Map(replacementEmbeddings.map((embedding) => [embedding.chunkIndex, embedding]))
      : null;

    const updated = await prisma.$transaction(async (tx) => {
      if (input.content === undefined) {
        return tx.knowledgeItem.update({
          where: { id: context.params.id },
          data: buildPatchData(input),
          include: {
            chunks: {
              orderBy: { chunkIndex: "asc" }
            },
            mergeHistories: {
              orderBy: { createdAt: "desc" }
            }
          }
        });
      }

      if (!replacementChunks || !embeddingsByIndex) {
        throw new ValidationError("更新正文时必须重新生成知识片段。");
      }

      await tx.knowledgeChunk.deleteMany({
        where: { knowledgeItemId: context.params.id }
      });

      const item = await tx.knowledgeItem.update({
        where: { id: context.params.id },
        data: {
          ...buildPatchData(input),
          chunks: {
            create: replacementChunks.map((chunk) => {
              const embedding = embeddingsByIndex.get(chunk.chunkIndex);

              return {
                chunkText: chunk.chunkText,
                chunkIndex: chunk.chunkIndex,
                metadata: {
                  charLength: chunk.chunkText.length,
                  embeddingModel: embedding?.model ?? null,
                  embeddingSkipped: embedding?.embedding === null,
                  embeddingError: embedding?.errorMessage ?? null
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

    return apiSuccess<KnowledgeDetailResponse>(serializeKnowledgeDetail(updated));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  let currentUser: Awaited<ReturnType<typeof requireLicensedUser>>;

  try {
    currentUser = await requireLicensedUser();
  } catch (error) {
    return apiError(error);
  }

  if (!ensureDatabaseUrl()) {
    return apiError(databaseConfigError("删除知识"));
  }

  try {
    const result = await prisma.knowledgeItem.deleteMany({
      where: {
        id: context.params.id,
        userId: currentUser.id
      }
    });

    if (result.count === 0) {
      return apiError(new NotFoundError("知识不存在。"));
    }

    return apiSuccess<DeleteKnowledgeResponse>({
      id: context.params.id,
      deleted: true
    });
  } catch (error) {
    return apiError(error);
  }
}
