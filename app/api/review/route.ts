import type { KnowledgeReviewStatus as PrismaKnowledgeReviewStatus } from "@prisma/client";
import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { requireBetaAccess } from "@/lib/beta";
import { NotFoundError, ValidationError } from "@/lib/errors";
import {
  calculateNextReviewAt,
  isKnowledgeReviewStatus,
  type KnowledgeReviewStatus
} from "@/lib/knowledge/review";
import { prisma } from "@/lib/prisma";
import { hasDatabaseUrl } from "@/lib/server-config";

export const dynamic = "force-dynamic";

const REVIEW_RECOMMENDATION_LIMIT = 5;

interface ReviewItemResponse {
  id: string;
  title: string;
  summary: string;
  content: string;
  tags: string[];
  category: string;
  importance: number;
  reviewStatus: KnowledgeReviewStatus;
  lastReviewedAt: string | null;
  nextReviewAt: string | null;
  updatedAt: string;
}

interface ReviewStatsResponse {
  dueCount: number;
  needsReviewCount: number;
  masteredCount: number;
  expiredCount: number;
}

interface ReviewResponse {
  items: ReviewItemResponse[];
  stats: ReviewStatsResponse;
  limit: number;
  generatedAt: string;
}

interface ReviewUpdateResponse {
  item: ReviewItemResponse;
  stats: ReviewStatsResponse;
  nextReviewAt: string | null;
}

function serializeReviewItem(item: {
  id: string;
  title: string;
  summary: string;
  content: string;
  tags: string[];
  category: string;
  importance: number;
  reviewStatus: PrismaKnowledgeReviewStatus;
  lastReviewedAt: Date | null;
  nextReviewAt: Date | null;
  updatedAt: Date;
}): ReviewItemResponse {
  return {
    id: item.id,
    title: item.title,
    summary: item.summary,
    content: item.content,
    tags: item.tags,
    category: item.category,
    importance: item.importance,
    reviewStatus: item.reviewStatus,
    lastReviewedAt: item.lastReviewedAt?.toISOString() ?? null,
    nextReviewAt: item.nextReviewAt?.toISOString() ?? null,
    updatedAt: item.updatedAt.toISOString()
  };
}

function parseReviewUpdateRequest(body: unknown) {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const knowledgeItemId = typeof body.knowledgeItemId === "string" ? body.knowledgeItemId.trim() : "";

  if (!knowledgeItemId) {
    throw new ValidationError("请选择要标记的知识。");
  }

  if (!isKnowledgeReviewStatus(body.reviewStatus)) {
    throw new ValidationError("复习状态不正确。");
  }

  return {
    knowledgeItemId,
    reviewStatus: body.reviewStatus
  };
}

async function getReviewStats(userId: string, now = new Date()): Promise<ReviewStatsResponse> {
  const [dueCount, needsReviewCount, masteredCount, expiredCount] = await prisma.$transaction([
    prisma.knowledgeItem.count({
      where: {
        userId,
        reviewStatus: { not: "EXPIRED" },
        OR: [
          { nextReviewAt: null },
          { nextReviewAt: { lte: now } }
        ]
      }
    }),
    prisma.knowledgeItem.count({
      where: {
        userId,
        reviewStatus: "NEEDS_REVIEW"
      }
    }),
    prisma.knowledgeItem.count({
      where: {
        userId,
        reviewStatus: "MASTERED"
      }
    }),
    prisma.knowledgeItem.count({
      where: {
        userId,
        reviewStatus: "EXPIRED"
      }
    })
  ]);

  return {
    dueCount,
    needsReviewCount,
    masteredCount,
    expiredCount
  };
}

async function getReviewRecommendations(userId: string, now = new Date()) {
  const baseSelect = {
    id: true,
    title: true,
    summary: true,
    content: true,
    tags: true,
    category: true,
    importance: true,
    reviewStatus: true,
    lastReviewedAt: true,
    nextReviewAt: true,
    updatedAt: true
  } as const;
  const dueItems = await prisma.knowledgeItem.findMany({
    where: {
      userId,
      reviewStatus: { not: "EXPIRED" },
      OR: [
        { nextReviewAt: null },
        { nextReviewAt: { lte: now } }
      ]
    },
    orderBy: [
      { importance: "desc" },
      { reviewStatus: "asc" },
      { nextReviewAt: "asc" },
      { updatedAt: "desc" }
    ],
    take: REVIEW_RECOMMENDATION_LIMIT,
    select: baseSelect
  });

  if (dueItems.length >= REVIEW_RECOMMENDATION_LIMIT) {
    return dueItems;
  }

  const seenIds = new Set(dueItems.map((item) => item.id));
  const fillItems = await prisma.knowledgeItem.findMany({
    where: {
      userId,
      reviewStatus: { not: "EXPIRED" },
      id: {
        notIn: Array.from(seenIds)
      }
    },
    orderBy: [
      { importance: "desc" },
      { nextReviewAt: "asc" },
      { updatedAt: "desc" }
    ],
    take: REVIEW_RECOMMENDATION_LIMIT - dueItems.length,
    select: baseSelect
  });

  return [...dueItems, ...fillItems];
}

export async function GET() {
  let currentUser: Awaited<ReturnType<typeof requireBetaAccess>>;

  try {
    currentUser = await requireBetaAccess();
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("加载复习知识"));
  }

  try {
    const now = new Date();
    const [items, stats] = await Promise.all([
      getReviewRecommendations(currentUser.id, now),
      getReviewStats(currentUser.id, now)
    ]);

    return apiSuccess<ReviewResponse>({
      items: items.map(serializeReviewItem),
      stats,
      limit: REVIEW_RECOMMENDATION_LIMIT,
      generatedAt: now.toISOString()
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  let currentUser: Awaited<ReturnType<typeof requireBetaAccess>>;

  try {
    currentUser = await requireBetaAccess();
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("更新复习状态"));
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return apiError(new ValidationError("请求体必须是合法 JSON。"));
  }

  let input: ReturnType<typeof parseReviewUpdateRequest>;

  try {
    input = parseReviewUpdateRequest(body);
  } catch (error) {
    return apiError(error);
  }

  try {
    const existing = await prisma.knowledgeItem.findFirst({
      where: {
        id: input.knowledgeItemId,
        userId: currentUser.id
      },
      select: {
        id: true,
        importance: true
      }
    });

    if (!existing) {
      return apiError(new NotFoundError("知识不存在。"));
    }

    const reviewedAt = new Date();
    const nextReviewAt = calculateNextReviewAt(input.reviewStatus, existing.importance, reviewedAt);
    const item = await prisma.knowledgeItem.update({
      where: { id: existing.id },
      data: {
        reviewStatus: input.reviewStatus,
        lastReviewedAt: reviewedAt,
        nextReviewAt
      },
      select: {
        id: true,
        title: true,
        summary: true,
        content: true,
        tags: true,
        category: true,
        importance: true,
        reviewStatus: true,
        lastReviewedAt: true,
        nextReviewAt: true,
        updatedAt: true
      }
    });
    const stats = await getReviewStats(currentUser.id);

    return apiSuccess<ReviewUpdateResponse>({
      item: serializeReviewItem(item),
      stats,
      nextReviewAt: nextReviewAt?.toISOString() ?? null
    });
  } catch (error) {
    return apiError(error);
  }
}
