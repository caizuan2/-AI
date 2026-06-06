import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { requireKbAdmin } from "@/lib/auth/guards";
import { writeAuditLog } from "@/lib/audit-log";
import { createChunkEmbeddings, splitContentIntoChunks } from "@/lib/knowledge/chunks";
import { normalizeQualityScores } from "@/lib/knowledge/quality";
import { calculateExpiresAt } from "@/lib/knowledge/status";
import {
  defaultKnowledgeSourceType,
  isKnowledgeSourceType,
  type KnowledgeSourceType
} from "@/lib/knowledge/source-types";
import { toVectorLiteral } from "@/lib/knowledge/vector";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { estimateTokenCount, getRequestIdFromHeaders } from "@/lib/logger";
import { hasDatabaseUrl } from "@/lib/server-config";
import { getOrCreateUserSettings } from "@/lib/settings";
import { RateLimitError, ValidationError } from "@/lib/errors";

export const dynamic = "force-dynamic";

interface CreateKnowledgeRequest {
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
  sourceType: KnowledgeSourceType;
  sourceTitle: string | null;
  sourceUrl: string | null;
  sourceMessageId: string | null;
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

interface CreateKnowledgeResponse {
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
}

interface KnowledgeListResponse {
  items: Array<{
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
    chunkCount: number;
  }>;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

const MAX_KNOWLEDGE_CONTENT_CHARS = 100_000;
const KNOWLEDGE_LIST_RATE_LIMIT = {
  limit: 60,
  windowMs: 60_000
};
const KNOWLEDGE_CREATE_RATE_LIMIT = {
  limit: 20,
  windowMs: 60_000
};

function enforceKnowledgeRateLimit(request: Request, userId: string, action: "list" | "create") {
  const config = action === "list" ? KNOWLEDGE_LIST_RATE_LIMIT : KNOWLEDGE_CREATE_RATE_LIMIT;
  const rateLimit = checkRateLimit(request, {
    namespace: `api:knowledge:${action}`,
    userId,
    ...config
  });

  if (!rateLimit.allowed) {
    return apiError(
      new RateLimitError(`知识库请求过于频繁，请 ${rateLimit.retryAfterSeconds} 秒后再试。`),
      { headers: rateLimitHeaders(rateLimit) }
    );
  }

  return null;
}

function parseCreateKnowledgeRequest(body: unknown): CreateKnowledgeRequest {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const summary = typeof body.summary === "string" ? body.summary.trim() : "";
  const category = typeof body.category === "string" ? body.category.trim() : "";
  const importance = typeof body.importance === "number" ? Math.round(body.importance) : Number.NaN;
  const qualityScores = normalizeQualityScores({
    clarityScore: typeof body.clarityScore === "number" ? body.clarityScore : undefined,
    completenessScore: typeof body.completenessScore === "number" ? body.completenessScore : undefined,
    usefulnessScore: typeof body.usefulnessScore === "number" ? body.usefulnessScore : undefined,
    confidenceScore: typeof body.confidenceScore === "number" ? body.confidenceScore : undefined
  });
  const sourceType = isKnowledgeSourceType(body.sourceType) ? body.sourceType : defaultKnowledgeSourceType;
  const sourceTitle = typeof body.sourceTitle === "string" && body.sourceTitle.trim()
    ? body.sourceTitle.trim()
    : null;
  const sourceUrl = typeof body.sourceUrl === "string" && body.sourceUrl.trim() ? body.sourceUrl.trim() : null;
  const sourceMessageId = typeof body.sourceMessageId === "string" && body.sourceMessageId.trim()
    ? body.sourceMessageId.trim()
    : null;
  const tags = Array.isArray(body.tags)
    ? body.tags.map((tag) => (typeof tag === "string" ? tag.trim() : "")).filter(Boolean)
    : [];

  if (!title) {
    throw new ValidationError("标题不能为空。");
  }

  if (!content) {
    throw new ValidationError("正文不能为空。");
  }

  if (content.length > MAX_KNOWLEDGE_CONTENT_CHARS) {
    throw new ValidationError(`正文过长，请控制在 ${MAX_KNOWLEDGE_CONTENT_CHARS} 字以内。`);
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
    title,
    content,
    summary,
    tags,
    category,
    importance,
    ...qualityScores,
    sourceType,
    sourceTitle,
    sourceUrl,
    sourceMessageId
  };
}

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function buildKnowledgeWhere(searchParams: URLSearchParams, userId: string): Prisma.KnowledgeItemWhereInput {
  const q = searchParams.get("q")?.trim();
  const tag = searchParams.get("tag")?.trim();
  const category = searchParams.get("category")?.trim();
  const status = searchParams.get("status")?.trim();
  const filters: Prisma.KnowledgeItemWhereInput[] = [{ userId, deletedAt: null }];

  if (q) {
    filters.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { summary: { contains: q, mode: "insensitive" } },
        { content: { contains: q, mode: "insensitive" } }
      ]
    });
  }

  if (tag) {
    filters.push({ tags: { has: tag } });
  }

  if (category) {
    filters.push({ category });
  }

  if (status === "active") {
    filters.push({
      status: "active",
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } }
      ]
    });
  } else if (status === "stale") {
    filters.push({
      OR: [
        { status: "stale" },
        {
          status: "active",
          expiresAt: { lte: new Date() }
        }
      ]
    });
  } else if (status === "archived") {
    filters.push({ status: "archived" });
  }

  return { AND: filters };
}

function buildKnowledgeOrderBy(searchParams: URLSearchParams): Prisma.KnowledgeItemOrderByWithRelationInput[] {
  const sort = searchParams.get("sort")?.trim();

  if (sort === "quality_asc") {
    return [
      { clarityScore: "asc" },
      { completenessScore: "asc" },
      { usefulnessScore: "asc" },
      { confidenceScore: "asc" },
      { updatedAt: "desc" }
    ];
  }

  if (sort === "quality_desc") {
    return [
      { clarityScore: "desc" },
      { completenessScore: "desc" },
      { usefulnessScore: "desc" },
      { confidenceScore: "desc" },
      { updatedAt: "desc" }
    ];
  }

  return [{ updatedAt: "desc" }];
}

function serializeKnowledgeItem(item: {
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
  _count: { chunks: number };
}) {
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
    chunkCount: item._count.chunks
  };
}

export async function GET(request: Request) {
  let currentUser: Awaited<ReturnType<typeof requireKbAdmin>>;

  try {
    currentUser = await requireKbAdmin(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "knowledge_item"
    });
  } catch (error) {
    return apiError(error);
  }

  const limitedResponse = enforceKnowledgeRateLimit(request, currentUser.id, "list");

  if (limitedResponse) {
    return limitedResponse;
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("加载知识列表"));
  }

  const { searchParams } = new URL(request.url);
  const page = parsePositiveInt(searchParams.get("page"), 1, 10_000);
  const pageSize = parsePositiveInt(searchParams.get("pageSize"), 10, 100);
  const where = buildKnowledgeWhere(searchParams, currentUser.id);
  const orderBy = buildKnowledgeOrderBy(searchParams);

  try {
    const [total, items] = await prisma.$transaction([
      prisma.knowledgeItem.count({ where }),
      prisma.knowledgeItem.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: {
            select: { chunks: true }
          }
        }
      })
    ]);
    const totalPages = Math.ceil(total / pageSize);

    await writeAuditLog({
      userId: currentUser.id,
      role: currentUser.role,
      action: "KNOWLEDGE_VIEW",
      targetType: "knowledge_item",
      request,
      metadata: {
        scope: "list",
        page,
        pageSize,
        total
      }
    });

    return apiSuccess<KnowledgeListResponse>({
      items: items.map(serializeKnowledgeItem),
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
      }
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  const requestId = getRequestIdFromHeaders(request.headers);
  let user: Awaited<ReturnType<typeof requireKbAdmin>>;

  try {
    user = await requireKbAdmin(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "knowledge_item",
      metadata: {
        operation: "knowledge_create"
      }
    });
  } catch (error) {
    return apiError(error);
  }

  const limitedResponse = enforceKnowledgeRateLimit(request, user.id, "create");

  if (limitedResponse) {
    return limitedResponse;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return apiError(new ValidationError("请求体必须是合法 JSON。"));
  }

  let input: CreateKnowledgeRequest;

  try {
    input = parseCreateKnowledgeRequest(body);
  } catch (error) {
    return apiError(error);
  }

  const chunks = splitContentIntoChunks(input.content, {
    title: input.title,
    category: input.category,
    tags: input.tags,
    summary: input.summary,
    sourceType: input.sourceType,
    sourceTitle: input.sourceTitle,
    sourceUrl: input.sourceUrl
  });

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("创建知识"));
  }

  try {
    const embeddings = await createChunkEmbeddings(chunks, {
      requestId,
      operation: "knowledge_create_chunk_embedding",
      userId: user.id
    });
    const embeddingsByIndex = new Map(embeddings.map((embedding) => [embedding.chunkIndex, embedding]));
    const settings = await getOrCreateUserSettings(user.id);
    const expiresAt = calculateExpiresAt(settings.defaultExpireDays);

    const knowledgeItem = await prisma.$transaction(async (tx) => {
      const created = await tx.knowledgeItem.create({
        data: {
          userId: user.id,
          title: input.title,
          content: input.content,
          summary: input.summary,
          tags: input.tags,
          category: input.category,
          importance: input.importance,
          clarityScore: input.clarityScore,
          completenessScore: input.completenessScore,
          usefulnessScore: input.usefulnessScore,
          confidenceScore: input.confidenceScore,
          sourceType: input.sourceType,
          sourceTitle: input.sourceTitle,
          sourceUrl: input.sourceUrl,
          sourceMessageId: input.sourceMessageId,
          expiresAt,
          status: "active",
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
                  embeddingStatus: embedding?.embedding ? "indexed" : "missing"
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

      return created;
    });

    await writeAuditLog({
      userId: user.id,
      role: user.role,
      action: "INGEST_CREATE",
      targetType: "knowledge_item",
      targetId: knowledgeItem.id,
      request,
      metadata: {
        requestId,
        sourceType: input.sourceType,
        category: input.category,
        tagCount: input.tags.length,
        chunkCount: knowledgeItem.chunks.length
      }
    });

    return apiSuccess<CreateKnowledgeResponse>(
      {
        ...knowledgeItem,
        expiresAt: knowledgeItem.expiresAt?.toISOString() ?? null,
        createdAt: knowledgeItem.createdAt.toISOString(),
        updatedAt: knowledgeItem.updatedAt.toISOString(),
        chunks: knowledgeItem.chunks.map((chunk) => ({
          ...chunk,
          createdAt: chunk.createdAt.toISOString(),
          hasEmbedding: Boolean(embeddingsByIndex.get(chunk.chunkIndex)?.embedding)
        }))
      },
      { status: 201 }
    );
  } catch (error) {
    return apiError(error);
  }
}
