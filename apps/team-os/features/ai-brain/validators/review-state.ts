import { ValidationError } from "@/lib/errors";
import type { KnowledgeCandidateStatus } from "@/apps/team-os/features/ai-brain/types";

export type KnowledgeReviewEvent =
  | "CLAIM_APPROVAL"
  | "REJECT"
  | "PUBLISH_CONFIRMED"
  | "PUBLISH_FAILED_SAFE"
  | "PUBLISH_FAILED_UNKNOWN";

const transitions: Record<KnowledgeReviewEvent, Partial<Record<KnowledgeCandidateStatus, KnowledgeCandidateStatus>>> = {
  CLAIM_APPROVAL: { PENDING: "REVIEWING" },
  REJECT: { PENDING: "REJECTED" },
  PUBLISH_CONFIRMED: { REVIEWING: "APPROVED" },
  PUBLISH_FAILED_SAFE: { REVIEWING: "PENDING" },
  PUBLISH_FAILED_UNKNOWN: { REVIEWING: "REVIEWING" }
};

export function nextKnowledgeReviewStatus(
  current: KnowledgeCandidateStatus,
  event: KnowledgeReviewEvent
) {
  const next = transitions[event][current];
  if (!next) throw new ValidationError(`候选知识不能从 ${current} 执行 ${event} 状态转换。`);
  return next;
}

export function shouldRestorePendingAfterPublishFailure(input: {
  safeToRetry: boolean;
  requestDispatched: boolean;
}) {
  return input.safeToRetry || !input.requestDispatched;
}
