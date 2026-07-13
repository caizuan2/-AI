import "server-only";

import { prisma } from "@/lib/prisma";
import type { AiBrainAccessScope } from "@/apps/team-os/features/ai-brain/services/ai-brain-access";
import {
  candidateScopeWhere,
  feedbackScopeWhere,
  listKnowledgeOptimizations
} from "@/apps/team-os/features/ai-brain/services/ai-brain-repository";
import { fetchKnowledgeBaseOptimization } from "@/apps/team-os/features/ai-brain/services/knowledge-base-adapter";
import {
  mineFrequentCustomerQuestions,
  mineFrequentKnowledgeGaps
} from "@/apps/team-os/features/ai-brain/services/question-mining-service";
import { normalizeQuestionKey, redactBusinessContent, stableBrainKey } from "@/apps/team-os/features/ai-brain/utils/content-safety";

interface OptimizationDraft {
  companyId: string;
  teamId?: string;
  knowledgeId: string;
  suggestion: string;
  suggestionKey: string;
}

function duplicateCandidateDrafts(
  companyId: string,
  candidates: Array<{
    id: string;
    teamId: string | null;
    title: string;
    publishedKnowledgeId: string | null;
  }>
) {
  const groups = new Map<string, typeof candidates>();
  for (const candidate of candidates) {
    const normalized = normalizeQuestionKey(candidate.title);
    if (!normalized) continue;
    const key = `${candidate.teamId ?? "company"}:${normalized}`;
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }
  return Array.from(groups.entries()).flatMap(([key, records]) => {
    if (records.length < 2) return [];
    const first = records[0]!;
    return [{
      companyId,
      ...(first.teamId ? { teamId: first.teamId } : {}),
      knowledgeId: first.publishedKnowledgeId ?? first.id,
      suggestionKey: stableBrainKey("duplicate-candidate", companyId, key),
      suggestion: `检测到 ${records.length} 条标题高度重复的候选知识：“${first.title}”。建议审核内容边界并合并重复条目。`
    } satisfies OptimizationDraft];
  });
}

export async function generateKnowledgeOptimizations(input: {
  access: AiBrainAccessScope;
  actorUserId: string;
  request: Request;
}) {
  const companyId = input.access.context.companyId;
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1_000);
  const staleBefore = new Date(Date.now() - 180 * 24 * 60 * 60 * 1_000);
  const [feedback, customerQuestions, candidates, staleCandidates] = await Promise.all([
    prisma.knowledgeFeedback.findMany({
      where: {
        AND: [feedbackScopeWhere(input.access), { createdAt: { gte: ninetyDaysAgo } }]
      },
      select: { id: true, teamId: true, question: true, feedbackType: true },
      orderBy: { createdAt: "desc" },
      take: 5_000
    }),
    prisma.customerFollowUp.findMany({
      where: {
        createdAt: { gte: ninetyDaysAgo },
        customer: {
          companyId,
          team: { status: "ACTIVE" }
        }
      },
      select: {
        id: true,
        content: true,
        summary: true,
        customer: { select: { teamId: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 5_000
    }),
    prisma.knowledgeCandidate.findMany({
      where: candidateScopeWhere(input.access),
      select: { id: true, teamId: true, title: true, publishedKnowledgeId: true },
      orderBy: { createdAt: "desc" },
      take: 1_000
    }),
    prisma.knowledgeCandidate.findMany({
      where: {
        AND: [
          candidateScopeWhere(input.access),
          { status: "APPROVED", updatedAt: { lt: staleBefore } }
        ]
      },
      select: { id: true, teamId: true, title: true, publishedKnowledgeId: true },
      take: 500
    })
  ]);

  const drafts: OptimizationDraft[] = [
    ...mineFrequentKnowledgeGaps(companyId, feedback).map((item) => ({ companyId, ...item })),
    ...mineFrequentCustomerQuestions(
      companyId,
      customerQuestions.map((item) => ({
        id: item.id,
        teamId: item.customer.teamId,
        content: redactBusinessContent(item.content, 2_000),
        summary: redactBusinessContent(item.summary, 1_000)
      }))
    ).map((item) => ({ companyId, ...item })),
    ...duplicateCandidateDrafts(companyId, candidates),
    ...staleCandidates.map((candidate) => ({
      companyId,
      ...(candidate.teamId ? { teamId: candidate.teamId } : {}),
      knowledgeId: candidate.publishedKnowledgeId ?? candidate.id,
      suggestionKey: stableBrainKey("stale-candidate", companyId, candidate.id),
      suggestion: `已发布知识“${candidate.title}”超过 180 天未更新，建议复核时效、适用范围与示例。`
    }))
  ];

  let upstreamStatus: "not-requested" | "available" | "unavailable" = "not-requested";
  let upstreamMessage: string | undefined;
  if (input.access.isCompanyOwner) {
    const upstream = await fetchKnowledgeBaseOptimization({
      request: input.request,
      actorUserId: input.actorUserId,
      companyId,
      limit: 120
    });
    if (upstream.ok) {
      upstreamStatus = "available";
      const recommendations = (upstream.data.recommendations ?? []).slice(0, 100);
      for (let index = 0; index < recommendations.length; index += 1) {
        const recommendation = recommendations[index]!;
        const raw = recommendation.message
          ?? (recommendation.titles?.length ? `知识条目：${recommendation.titles.join("、")}` : "");
        const suggestion = redactBusinessContent(raw, 2_000);
        if (!suggestion) continue;
        const knowledgeId = recommendation.chunkIds?.[0]
          ?? recommendation.knowledgeBaseId
          ?? `knowledge-os:${index + 1}`;
        drafts.push({
          companyId,
          knowledgeId,
          suggestion: `现有知识优化服务建议：${suggestion}`,
          suggestionKey: stableBrainKey("knowledge-os", companyId, knowledgeId, suggestion)
        });
      }
    } else {
      upstreamStatus = "unavailable";
      upstreamMessage = upstream.message;
    }
  }

  const deduplicated = Array.from(new Map(drafts.map((draft) => [draft.suggestionKey, draft])).values());
  const created = deduplicated.length > 0
    ? await prisma.knowledgeOptimization.createMany({
        data: deduplicated,
        skipDuplicates: true
      })
    : { count: 0 };
  const data = await listKnowledgeOptimizations(input.access, 100);
  return {
    ...data,
    generatedCount: created.count,
    upstream: {
      status: upstreamStatus,
      ...(upstreamMessage ? { message: upstreamMessage } : {})
    }
  };
}

export class KnowledgeOptimizationService {
  generate = generateKnowledgeOptimizations;
}

export const knowledgeOptimizationService = new KnowledgeOptimizationService();
