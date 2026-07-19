import "server-only";

import { AppError } from "@/lib/errors";
import type { AiBrainAccessScope } from "@/apps/team-os/features/ai-brain/services/ai-brain-access";
import {
  claimCandidateForPublishing,
  finishCandidatePublishing,
  recordCandidatePublishingFailure,
  rejectCandidate,
  serializeCandidateById
} from "@/apps/team-os/features/ai-brain/services/ai-brain-repository";
import { publishKnowledgeCandidateToKnowledgeBase } from "@/apps/team-os/features/ai-brain/services/knowledge-base-adapter";
import type { ReviewKnowledgeInput } from "@/apps/team-os/features/ai-brain/types";
import { shouldRestorePendingAfterPublishFailure } from "@/apps/team-os/features/ai-brain/validators/review-state";

export async function reviewKnowledgeCandidate(input: {
  access: AiBrainAccessScope;
  actorUserId: string;
  request: Request;
  review: ReviewKnowledgeInput;
}) {
  if (input.review.decision === "REJECT") {
    return {
      candidate: await rejectCandidate({
        companyId: input.access.context.companyId,
        candidateId: input.review.candidateId,
        reviewerId: input.actorUserId,
        note: input.review.note
      }),
      publication: { status: "not-requested" as const }
    };
  }

  const claim = await claimCandidateForPublishing({
    companyId: input.access.context.companyId,
    candidateId: input.review.candidateId,
    reviewerId: input.actorUserId,
    note: input.review.note
  });
  if (!claim.claimed) {
    return {
      candidate: await serializeCandidateById(claim.candidate.id),
      publication: {
        status: "already-approved" as const,
        publishedKnowledgeId: claim.candidate.publishedKnowledgeId
      }
    };
  }

  const published = await publishKnowledgeCandidateToKnowledgeBase({
    request: input.request,
    actorUserId: input.actorUserId,
    companyId: input.access.context.companyId,
    candidateId: claim.candidate.id,
    title: claim.candidate.title,
    content: claim.candidate.content,
    category: claim.candidate.category
  });
  if (!published.ok) {
    const safeToRetry = shouldRestorePendingAfterPublishFailure(published);
    const stateMessage = safeToRetry
      ? `${published.message} 候选已恢复为待审核，可在修复授权或配置后重试。`
      : `${published.message} 候选保持“发布中”，请先到知识库人工核对，禁止重复发布。`;
    await recordCandidatePublishingFailure({
      candidateId: claim.candidate.id,
      reviewerId: input.actorUserId,
      message: stateMessage,
      safeToRetry
    });
    throw new AppError(
      "INGEST_WRITE_FAILED",
      stateMessage,
      published.httpStatus && published.httpStatus >= 400 ? published.httpStatus : 502
    );
  }

  const candidate = await finishCandidatePublishing({
    candidateId: claim.candidate.id,
    reviewerId: input.actorUserId,
    publishedKnowledgeId: published.data.publishedKnowledgeId,
    note: `已通过现有知识库审核接口发布（${published.data.stage}，请求 ${published.requestId}）。`
  });
  return {
    candidate,
    publication: {
      status: "published" as const,
      ...published.data
    }
  };
}
