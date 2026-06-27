import "server-only";

function clampTrust(value: number) {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.max(0.1, Math.min(1, value));
}

export function calculateFeedbackTrustWeight(input: {
  userId?: string | null;
  messageId?: string | null;
  chunkId?: string | null;
  eventType?: string;
  repeatedCount?: number;
  recentEventCount?: number;
  accountAgeDays?: number | null;
}): number {
  if (!input.userId) {
    return 0.1;
  }

  let trustWeight = 1;
  const repeatedCount = Math.max(0, Math.round(Number(input.repeatedCount ?? 0) || 0));
  const recentEventCount = Math.max(0, Math.round(Number(input.recentEventCount ?? 0) || 0));

  if (input.eventType === "answer_copy" && repeatedCount > 1) {
    trustWeight *= 0.5;
  } else if (repeatedCount > 1) {
    trustWeight *= Math.max(0.35, 1 - ((repeatedCount - 1) * 0.2));
  }

  if (recentEventCount > 20) {
    trustWeight *= 0.45;
  } else if (recentEventCount > 10) {
    trustWeight *= 0.65;
  } else if (recentEventCount > 6) {
    trustWeight *= 0.8;
  }

  if (input.accountAgeDays !== null && input.accountAgeDays !== undefined && input.accountAgeDays < 1) {
    trustWeight *= 0.8;
  }

  return Math.round(clampTrust(trustWeight) * 10000) / 10000;
}
