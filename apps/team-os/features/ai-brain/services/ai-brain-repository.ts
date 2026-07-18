import "server-only";

import { Prisma } from "@prisma/client";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import type { AiBrainAccessScope } from "@/apps/team-os/features/ai-brain/services/ai-brain-access";
import type {
  AiBrainDashboardData,
  CreateKnowledgeFeedbackInput,
  KnowledgeCandidateRecord,
  KnowledgeCandidateSourceType,
  KnowledgeCandidateStatus,
  KnowledgeExtractionMaterial,
  KnowledgeFeedbackRecord,
  KnowledgeOptimizationRecord
} from "@/apps/team-os/features/ai-brain/types";
import { redactBusinessContent } from "@/apps/team-os/features/ai-brain/utils/content-safety";
import { nextKnowledgeReviewStatus } from "@/apps/team-os/features/ai-brain/validators/review-state";

type CandidateRecord = Prisma.KnowledgeCandidateGetPayload<Record<string, never>>;
type FeedbackRecord = Prisma.KnowledgeFeedbackGetPayload<Record<string, never>>;
type OptimizationRecord = Prisma.KnowledgeOptimizationGetPayload<Record<string, never>>;

export function candidateScopeWhere(access: AiBrainAccessScope): Prisma.KnowledgeCandidateWhereInput {
  if (access.isCompanyOwner) return { companyId: access.context.companyId };
  const scopes: Prisma.KnowledgeCandidateWhereInput[] = [];
  if (access.managerTeamIds.length > 0) {
    scopes.push({ teamId: { in: access.managerTeamIds } });
  }
  if (access.trainerTeamIds.length > 0) {
    scopes.push({ teamId: { in: access.trainerTeamIds }, sourceType: "TRAINING" });
  }
  return {
    companyId: access.context.companyId,
    ...(scopes.length > 0 ? { OR: scopes } : { id: "__no_ai_brain_candidates__" })
  };
}

export function feedbackScopeWhere(access: AiBrainAccessScope): Prisma.KnowledgeFeedbackWhereInput {
  if (access.isCompanyOwner) return { companyId: access.context.companyId };
  return {
    companyId: access.context.companyId,
    ...(access.managerTeamIds.length > 0
      ? { teamId: { in: access.managerTeamIds } }
      : { id: "__no_ai_brain_feedback__" })
  };
}

export function optimizationScopeWhere(access: AiBrainAccessScope): Prisma.KnowledgeOptimizationWhereInput {
  if (access.isCompanyOwner) return { companyId: access.context.companyId };
  return {
    companyId: access.context.companyId,
    ...(access.managerTeamIds.length > 0
      ? { teamId: { in: access.managerTeamIds } }
      : { id: "__no_ai_brain_optimizations__" })
  };
}

function serializeCandidate(record: CandidateRecord): KnowledgeCandidateRecord {
  return {
    id: record.id,
    companyId: record.companyId,
    ...(record.teamId ? { teamId: record.teamId } : {}),
    sourceType: record.sourceType,
    sourceId: record.sourceId,
    title: record.title,
    content: record.content,
    category: record.category,
    status: record.status,
    ...(record.reviewedBy ? { reviewedBy: record.reviewedBy } : {}),
    ...(record.reviewedAt ? { reviewedAt: record.reviewedAt.toISOString() } : {}),
    ...(record.publishedKnowledgeId ? { publishedKnowledgeId: record.publishedKnowledgeId } : {}),
    ...(record.reviewNote ? { reviewNote: record.reviewNote } : {}),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

function serializeFeedback(record: FeedbackRecord): KnowledgeFeedbackRecord {
  return {
    id: record.id,
    companyId: record.companyId,
    ...(record.teamId ? { teamId: record.teamId } : {}),
    userId: record.userId,
    question: record.question,
    answer: record.answer,
    feedbackType: record.feedbackType,
    comment: record.comment,
    createdAt: record.createdAt.toISOString()
  };
}

function serializeOptimization(record: OptimizationRecord): KnowledgeOptimizationRecord {
  return {
    id: record.id,
    companyId: record.companyId,
    ...(record.teamId ? { teamId: record.teamId } : {}),
    knowledgeId: record.knowledgeId,
    suggestion: record.suggestion,
    status: record.status,
    createdAt: record.createdAt.toISOString()
  };
}

function growthSeries(createdAt: Date[], days = 30) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const counts = new Map<string, number>();
  for (const value of createdAt) {
    const key = value.toISOString().slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from({ length: days }, (_, offset) => {
    const date = new Date(today.getTime() - (days - offset - 1) * 24 * 60 * 60 * 1_000)
      .toISOString()
      .slice(0, 10);
    return { date, count: counts.get(date) ?? 0 };
  });
}

export async function getAiBrainDashboard(
  access: AiBrainAccessScope,
  input: {
    status?: KnowledgeCandidateStatus;
    sourceType?: KnowledgeCandidateSourceType;
    limit: number;
  }
): Promise<AiBrainDashboardData> {
  if (!access.context.canViewAnalysis) {
    return {
      context: access.context,
      stats: {
        candidateCount: 0,
        pendingCount: 0,
        reviewingCount: 0,
        approvedCount: 0,
        pendingOptimizationCount: 0,
        negativeFeedbackCount: 0
      },
      growth: growthSeries([]),
      candidates: []
    };
  }
  const candidateScope = candidateScopeWhere(access);
  const candidateFilter: Prisma.KnowledgeCandidateWhereInput = {
    AND: [
      candidateScope,
      ...(input.status ? [{ status: input.status }] : []),
      ...(input.sourceType ? [{ sourceType: input.sourceType }] : [])
    ]
  };
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000);
  const [
    candidates,
    candidateCount,
    pendingCount,
    reviewingCount,
    approvedCount,
    pendingOptimizationCount,
    negativeFeedbackCount,
    recentCandidates
  ] = await Promise.all([
    prisma.knowledgeCandidate.findMany({
      where: candidateFilter,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit
    }),
    prisma.knowledgeCandidate.count({ where: candidateScope }),
    prisma.knowledgeCandidate.count({ where: { AND: [candidateScope, { status: "PENDING" }] } }),
    prisma.knowledgeCandidate.count({ where: { AND: [candidateScope, { status: "REVIEWING" }] } }),
    prisma.knowledgeCandidate.count({ where: { AND: [candidateScope, { status: "APPROVED" }] } }),
    access.context.canOptimize
      ? prisma.knowledgeOptimization.count({
          where: { AND: [optimizationScopeWhere(access), { status: "PENDING" }] }
        })
      : Promise.resolve(0),
    access.isCompanyOwner || access.managerTeamIds.length > 0
      ? prisma.knowledgeFeedback.count({
          where: {
            AND: [
              feedbackScopeWhere(access),
              { feedbackType: { in: ["BAD", "MISSING"] } }
            ]
          }
        })
      : Promise.resolve(0),
    prisma.knowledgeCandidate.findMany({
      where: { AND: [candidateScope, { createdAt: { gte: since } }] },
      select: { createdAt: true },
      take: 5_000
    })
  ]);
  return {
    context: access.context,
    stats: {
      candidateCount,
      pendingCount,
      reviewingCount,
      approvedCount,
      pendingOptimizationCount,
      negativeFeedbackCount
    },
    growth: growthSeries(recentCandidates.map((item) => item.createdAt)),
    candidates: candidates.map(serializeCandidate)
  };
}

export async function upsertKnowledgeCandidate(material: KnowledgeExtractionMaterial) {
  const unique = {
    companyId_sourceType_sourceId: {
      companyId: material.companyId,
      sourceType: material.sourceType,
      sourceId: material.sourceId
    }
  } as const;
  const existing = await prisma.knowledgeCandidate.findUnique({ where: unique });
  if (existing && (existing.status === "APPROVED" || existing.status === "REVIEWING")) {
    return serializeCandidate(existing);
  }
  if (existing) {
    const updated = await prisma.knowledgeCandidate.updateMany({
      where: {
        id: existing.id,
        companyId: material.companyId,
        status: existing.status
      },
      data: {
        teamId: material.teamId ?? null,
        title: material.title,
        content: material.content,
        category: material.category,
        status: "PENDING",
        reviewedBy: null,
        reviewedAt: null,
        publishedKnowledgeId: null,
        reviewNote: null
      }
    });
    const current = await prisma.knowledgeCandidate.findUnique({ where: { id: existing.id } });
    if (!current) throw new NotFoundError("候选知识状态更新期间已不存在。");
    if (updated.count === 0 && current.status !== "APPROVED" && current.status !== "REVIEWING") {
      throw new ValidationError("候选知识状态已变化，请刷新后重试。");
    }
    return serializeCandidate(current);
  }
  try {
    const created = await prisma.knowledgeCandidate.create({
      data: {
        companyId: material.companyId,
        teamId: material.teamId,
        sourceType: material.sourceType,
        sourceId: material.sourceId,
        title: material.title,
        content: material.content,
        category: material.category
      }
    });
    return serializeCandidate(created);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await prisma.knowledgeCandidate.findUnique({ where: unique });
      if (raced) return serializeCandidate(raced);
    }
    throw error;
  }
}

export async function createKnowledgeFeedback(
  access: AiBrainAccessScope,
  userId: string,
  input: CreateKnowledgeFeedbackInput
) {
  const created = await prisma.knowledgeFeedback.create({
    data: {
      companyId: access.context.companyId,
      teamId: input.teamId,
      userId,
      question: redactBusinessContent(input.question, 2_000),
      answer: redactBusinessContent(input.answer ?? "AI 未提供有效答案。", 10_000),
      feedbackType: input.feedbackType,
      comment: redactBusinessContent(input.comment ?? "", 2_000)
    }
  });
  return serializeFeedback(created);
}

export async function listKnowledgeFeedback(access: AiBrainAccessScope, limit: number) {
  const items = await prisma.knowledgeFeedback.findMany({
    where: feedbackScopeWhere(access),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit
  });
  return { context: access.context, items: items.map(serializeFeedback) };
}

export async function listKnowledgeOptimizations(access: AiBrainAccessScope, limit: number) {
  const items = await prisma.knowledgeOptimization.findMany({
    where: optimizationScopeWhere(access),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit
  });
  return { context: access.context, items: items.map(serializeOptimization) };
}

export async function findCandidateForReview(companyId: string, candidateId: string) {
  const candidate = await prisma.knowledgeCandidate.findFirst({
    where: { id: candidateId, companyId }
  });
  if (!candidate) throw new NotFoundError("候选知识不存在或不属于当前企业。");
  return candidate;
}

export async function rejectCandidate(input: {
  companyId: string;
  candidateId: string;
  reviewerId: string;
  note?: string;
}) {
  const candidate = await findCandidateForReview(input.companyId, input.candidateId);
  if (candidate.status === "REJECTED") return serializeCandidate(candidate);
  if (candidate.status !== "PENDING") {
    throw new ValidationError("只有待审核候选知识可以驳回。");
  }
  const updated = await prisma.knowledgeCandidate.updateMany({
    where: { id: candidate.id, companyId: input.companyId, status: "PENDING" },
    data: {
      status: nextKnowledgeReviewStatus(candidate.status, "REJECT"),
      reviewedBy: input.reviewerId,
      reviewedAt: new Date(),
      reviewNote: input.note ?? "企业负责人已驳回。"
    }
  });
  const current = await prisma.knowledgeCandidate.findUnique({ where: { id: candidate.id } });
  if (!current) throw new NotFoundError("候选知识不存在。");
  if (updated.count === 1 || current.status === "REJECTED") return serializeCandidate(current);
  throw new ValidationError("候选知识状态已变化，未执行驳回，请刷新后重试。");
}

export async function claimCandidateForPublishing(input: {
  companyId: string;
  candidateId: string;
  reviewerId: string;
  note?: string;
}) {
  const candidate = await findCandidateForReview(input.companyId, input.candidateId);
  if (candidate.status === "APPROVED") {
    return { claimed: false as const, candidate };
  }
  if (candidate.status === "REVIEWING") {
    throw new ValidationError("该候选知识正在发布或上次发布结果未知，请先人工核对，禁止重复提交。");
  }
  if (candidate.status !== "PENDING") {
    throw new ValidationError("只有待审核候选知识可以发布。");
  }
  const claim = await prisma.knowledgeCandidate.updateMany({
    where: { id: candidate.id, companyId: input.companyId, status: "PENDING" },
    data: {
      status: nextKnowledgeReviewStatus(candidate.status, "CLAIM_APPROVAL"),
      reviewedBy: input.reviewerId,
      reviewedAt: null,
      reviewNote: input.note ?? "正在通过现有知识库审核接口发布。"
    }
  });
  if (claim.count !== 1) {
    throw new ValidationError("候选知识状态已变化，请刷新后重试。");
  }
  return {
    claimed: true as const,
    candidate: await prisma.knowledgeCandidate.findUniqueOrThrow({ where: { id: candidate.id } })
  };
}

export async function finishCandidatePublishing(input: {
  candidateId: string;
  reviewerId: string;
  publishedKnowledgeId: string;
  note: string;
}) {
  const updated = await prisma.knowledgeCandidate.updateMany({
    where: { id: input.candidateId, status: "REVIEWING", reviewedBy: input.reviewerId },
    data: {
      status: nextKnowledgeReviewStatus("REVIEWING", "PUBLISH_CONFIRMED"),
      reviewedAt: new Date(),
      publishedKnowledgeId: input.publishedKnowledgeId,
      reviewNote: input.note
    }
  });
  if (updated.count !== 1) throw new ValidationError("候选知识发布状态已变化，请人工核对。");
  return serializeCandidate(await prisma.knowledgeCandidate.findUniqueOrThrow({ where: { id: input.candidateId } }));
}

export async function recordCandidatePublishingFailure(input: {
  candidateId: string;
  reviewerId: string;
  message: string;
  safeToRetry: boolean;
}) {
  await prisma.knowledgeCandidate.updateMany({
    where: { id: input.candidateId, status: "REVIEWING", reviewedBy: input.reviewerId },
    data: input.safeToRetry
      ? {
          status: nextKnowledgeReviewStatus("REVIEWING", "PUBLISH_FAILED_SAFE"),
          reviewedBy: null,
          reviewedAt: null,
          reviewNote: input.message
        }
      : {
          status: nextKnowledgeReviewStatus("REVIEWING", "PUBLISH_FAILED_UNKNOWN"),
          reviewNote: input.message
        }
  });
}

export async function serializeCandidateById(candidateId: string) {
  const candidate = await prisma.knowledgeCandidate.findUnique({ where: { id: candidateId } });
  if (!candidate) throw new NotFoundError("候选知识不存在。");
  return serializeCandidate(candidate);
}

export const aiBrainSerializers = {
  candidate: serializeCandidate,
  feedback: serializeFeedback,
  optimization: serializeOptimization
};
