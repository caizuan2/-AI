export const knowledgeStatuses = ["active", "stale", "archived"] as const;

export type KnowledgeLifecycleStatus = (typeof knowledgeStatuses)[number];

export const knowledgeStatusLabels: Record<KnowledgeLifecycleStatus, string> = {
  active: "有效",
  stale: "已过期",
  archived: "已归档"
};

export function isKnowledgeLifecycleStatus(value: unknown): value is KnowledgeLifecycleStatus {
  return typeof value === "string" && knowledgeStatuses.includes(value as KnowledgeLifecycleStatus);
}

export function calculateExpiresAt(defaultExpireDays: number, baseDate = new Date()) {
  const normalizedDays = Number.isInteger(defaultExpireDays)
    ? Math.min(3650, Math.max(1, defaultExpireDays))
    : 90;
  const expiresAt = new Date(baseDate);

  expiresAt.setDate(expiresAt.getDate() + normalizedDays);
  return expiresAt;
}

export function getEffectiveKnowledgeStatus(status: string, expiresAt: Date | string | null, now = new Date()): KnowledgeLifecycleStatus {
  if (status === "archived") {
    return "archived";
  }

  if (expiresAt && new Date(expiresAt).getTime() <= now.getTime()) {
    return "stale";
  }

  return status === "stale" ? "stale" : "active";
}
