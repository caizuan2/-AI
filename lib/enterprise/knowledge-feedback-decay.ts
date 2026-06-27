import "server-only";

const MIN_DECAY_WEIGHT = 0.2;
const MAX_DECAY_WEIGHT = 1;

function normalizeDate(value: string | Date | null | undefined) {
  if (!value) {
    return new Date();
  }

  const date = value instanceof Date ? value : new Date(value);

  return Number.isFinite(date.getTime()) ? date : new Date();
}

function clampDecayWeight(value: number) {
  if (!Number.isFinite(value)) {
    return MAX_DECAY_WEIGHT;
  }

  return Math.max(MIN_DECAY_WEIGHT, Math.min(MAX_DECAY_WEIGHT, value));
}

export function calculateFeedbackDecayWeight(input: {
  feedbackAt?: string | Date | null;
  now?: string | Date | null;
}) {
  const feedbackAt = normalizeDate(input.feedbackAt);
  const now = normalizeDate(input.now);
  const ageDays = Math.max(0, (now.getTime() - feedbackAt.getTime()) / (24 * 60 * 60 * 1000));

  if (ageDays <= 7) {
    return 1;
  }

  if (ageDays <= 30) {
    return 0.7;
  }

  if (ageDays <= 90) {
    return 0.4;
  }

  return clampDecayWeight(0.2);
}

export function calculateBehaviorDecayWeight(input: {
  eventAt?: string | Date | null;
  now?: string | Date | null;
}) {
  const eventAt = normalizeDate(input.eventAt);
  const now = normalizeDate(input.now);
  const ageDays = Math.max(0, (now.getTime() - eventAt.getTime()) / (24 * 60 * 60 * 1000));

  if (ageDays <= 3) {
    return 1;
  }

  if (ageDays <= 14) {
    return 0.8;
  }

  if (ageDays <= 45) {
    return 0.5;
  }

  return clampDecayWeight(0.25);
}
