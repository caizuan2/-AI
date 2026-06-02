export const knowledgeReviewStatuses = ["NEEDS_REVIEW", "MASTERED", "EXPIRED"] as const;

export type KnowledgeReviewStatus = (typeof knowledgeReviewStatuses)[number];

export const knowledgeReviewStatusLabels: Record<KnowledgeReviewStatus, string> = {
  NEEDS_REVIEW: "需要复习",
  MASTERED: "已掌握",
  EXPIRED: "已过期"
};

export function isKnowledgeReviewStatus(value: unknown): value is KnowledgeReviewStatus {
  return typeof value === "string" && knowledgeReviewStatuses.includes(value as KnowledgeReviewStatus);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);

  next.setDate(next.getDate() + days);
  return next;
}

export function calculateNextReviewAt(
  reviewStatus: KnowledgeReviewStatus,
  importance: number,
  reviewedAt = new Date()
) {
  if (reviewStatus === "EXPIRED") {
    return null;
  }

  const normalizedImportance = Math.min(5, Math.max(1, Math.round(importance)));
  const daysByStatus: Record<Exclude<KnowledgeReviewStatus, "EXPIRED">, Record<number, number>> = {
    NEEDS_REVIEW: {
      1: 7,
      2: 5,
      3: 3,
      4: 2,
      5: 1
    },
    MASTERED: {
      1: 45,
      2: 30,
      3: 21,
      4: 14,
      5: 7
    }
  };

  return addDays(reviewedAt, daysByStatus[reviewStatus][normalizedImportance]);
}
