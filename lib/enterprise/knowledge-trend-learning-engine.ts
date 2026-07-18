import "server-only";

import type {
  KnowledgeTrendDiagnostics,
  KnowledgeTrendSignal,
  KnowledgeTrendWindow
} from "@/lib/enterprise/knowledge-trend-types";

type MetadataRecord = Record<string, unknown>;

function clamp01(value: unknown, fallback = 0) {
  const numeric = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  if (numeric > 1 && numeric <= 5) {
    return Math.max(0, Math.min(1, numeric / 5));
  }

  if (numeric > 5 && numeric <= 100) {
    return Math.max(0, Math.min(1, numeric / 100));
  }

  return Math.max(0, Math.min(1, numeric));
}

function clampSigned(value: unknown, fallback = 0) {
  const numeric = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.max(-1, Math.min(1, numeric));
}

function round4(value: number) {
  return Math.round(clamp01(value) * 10000) / 10000;
}

function roundSigned4(value: number) {
  return Math.round(clampSigned(value) * 10000) / 10000;
}

function readRecord(value: unknown): MetadataRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as MetadataRecord
    : {};
}

function normalizeDate(value: string | Date | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  return Number.isFinite(date.getTime()) ? date : null;
}

function ageDays(value: string | Date | null | undefined) {
  const date = normalizeDate(value);

  return date ? Math.max(0, (Date.now() - date.getTime()) / (24 * 60 * 60 * 1000)) : null;
}

function normalizeSignedSignal(value: unknown, fallback = 0.5) {
  const numeric = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  if (numeric >= -1 && numeric <= 1) {
    return clamp01((numeric + 1) / 2, fallback);
  }

  return clamp01(numeric, fallback);
}

function normalizeGrowth(shortUsage: number, longUsage: number) {
  if (longUsage <= 0) {
    return shortUsage > 0 ? 0.68 : 0.5;
  }

  const expectedShortUsage = Math.max(0.1, (longUsage / 30) * 7);
  const ratio = shortUsage / expectedShortUsage;

  return clamp01(0.38 + (Math.min(ratio, 2.4) / 2.4 * 0.62), 0.5);
}

function normalizeMomentum(shortValue: number, longValue: number) {
  return clamp01(0.5 + ((shortValue - longValue) * 0.55), 0.5);
}

function calculateConfidence(sampleCount: number, uniqueUserCount = 0) {
  let confidence = 0.25;

  if (sampleCount > 30) {
    confidence = 1;
  } else if (sampleCount >= 11) {
    confidence = 0.85;
  } else if (sampleCount >= 6) {
    confidence = 0.65;
  } else if (sampleCount >= 3) {
    confidence = 0.45;
  }

  if (sampleCount >= 3 && uniqueUserCount <= 1) {
    confidence *= 0.72;
  }

  return round4(confidence);
}

function windowDays(window: KnowledgeTrendWindow) {
  if (window === "7d") return 7;
  if (window === "30d") return 30;
  return 90;
}

export function calculateTrendScore(input: {
  usage7d?: number;
  usage30d?: number;
  feedback7d?: number;
  feedback30d?: number;
  behavior7d?: number;
  behavior30d?: number;
  stableOptimizationScore?: number;
  freshnessScore?: number;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
}): number {
  const stableOptimizationScore = clamp01(input.stableOptimizationScore ?? 0.5, 0.5);
  const shortTermGrowth = normalizeGrowth(Math.max(0, input.usage7d ?? 0), Math.max(0, input.usage30d ?? 0));
  const feedbackMomentum = normalizeMomentum(clampSigned(input.feedback7d, 0), clampSigned(input.feedback30d, 0));
  const behaviorMomentum = normalizeMomentum(clampSigned(input.behavior7d, 0), clampSigned(input.behavior30d, 0));
  const freshnessScore = clamp01(input.freshnessScore ?? calculateFreshnessFromDates(input.updatedAt ?? input.createdAt), 0.5);
  const score = (
    (stableOptimizationScore * 0.35)
    + (shortTermGrowth * 0.22)
    + (feedbackMomentum * 0.18)
    + (behaviorMomentum * 0.15)
    + (freshnessScore * 0.1)
  );

  return round4(score);
}

function calculateFreshnessFromDates(value: string | Date | null | undefined) {
  const days = ageDays(value);

  if (days === null) {
    return 0.5;
  }

  return clamp01(Math.pow(0.5, days / 120), 0.5);
}

export function buildTrendWindow(input: {
  window: KnowledgeTrendWindow;
  usageEvents?: number[];
  feedbackEvents?: number[];
  behaviorEvents?: number[];
  freshnessScore?: number;
  stableOptimizationScore?: number;
}): KnowledgeTrendSignal {
  const days = windowDays(input.window);
  const usage = Math.max(0, (input.usageEvents ?? []).length);
  const feedbackEvents = input.feedbackEvents ?? [];
  const behaviorEvents = input.behaviorEvents ?? [];
  const feedbackDelta = feedbackEvents.length > 0
    ? feedbackEvents.reduce((sum, value) => sum + clampSigned(value, 0), 0) / feedbackEvents.length
    : 0;
  const behaviorDelta = behaviorEvents.length > 0
    ? behaviorEvents.reduce((sum, value) => sum + clampSigned(value, 0), 0) / behaviorEvents.length
    : 0;
  const sampleCount = usage + feedbackEvents.length + behaviorEvents.length;
  const normalizedUsage = clamp01(usage / Math.max(1, days / 2), 0);
  const freshnessDelta = clamp01(input.freshnessScore ?? 0.5, 0.5);
  const trendScore = calculateTrendScore({
    usage7d: input.window === "7d" ? usage : normalizedUsage * 7,
    usage30d: input.window === "30d" ? usage : Math.max(usage, normalizedUsage * 30),
    feedback7d: feedbackDelta,
    feedback30d: feedbackDelta,
    behavior7d: behaviorDelta,
    behavior30d: behaviorDelta,
    freshnessScore: freshnessDelta,
    stableOptimizationScore: input.stableOptimizationScore
  });

  return {
    usageDelta: round4(normalizedUsage),
    feedbackDelta: roundSigned4(feedbackDelta),
    behaviorDelta: roundSigned4(behaviorDelta),
    freshnessDelta: round4(freshnessDelta),
    trendScore,
    confidence: calculateConfidence(sampleCount)
  };
}

export function compareTrendWindows(shortWindow: KnowledgeTrendSignal, longWindow: KnowledgeTrendSignal): KnowledgeTrendSignal {
  return {
    usageDelta: roundSigned4(shortWindow.usageDelta - longWindow.usageDelta),
    feedbackDelta: roundSigned4(shortWindow.feedbackDelta - longWindow.feedbackDelta),
    behaviorDelta: roundSigned4(shortWindow.behaviorDelta - longWindow.behaviorDelta),
    freshnessDelta: roundSigned4(shortWindow.freshnessDelta - longWindow.freshnessDelta),
    trendScore: round4((shortWindow.trendScore * 0.58) + (longWindow.trendScore * 0.42)),
    confidence: round4(Math.max(shortWindow.confidence, longWindow.confidence * 0.85))
  };
}

export function detectFastRisingKnowledge(input: {
  createdAt?: string | Date | null;
  usage7d?: number;
  usage30d?: number;
  feedback7d?: number;
  behavior7d?: number;
  stableOptimizationScore?: number;
}) {
  const createdAgeDays = ageDays(input.createdAt);

  return (createdAgeDays === null || createdAgeDays <= 30)
    && normalizeGrowth(input.usage7d ?? 0, input.usage30d ?? 0) >= 0.64
    && clampSigned(input.feedback7d, 0) >= 0
    && clampSigned(input.behavior7d, 0) >= 0
    && clamp01(input.stableOptimizationScore ?? 0.5, 0.5) >= 0.45;
}

export function detectStaleHighScoreKnowledge(input: {
  stableOptimizationScore?: number;
  usage7d?: number;
  usage30d?: number;
  feedback7d?: number;
  feedback30d?: number;
  behavior7d?: number;
  behavior30d?: number;
  updatedAt?: string | Date | null;
  staleVersion?: boolean;
}) {
  const updatedAgeDays = ageDays(input.updatedAt);
  const highScore = clamp01(input.stableOptimizationScore ?? 0.5, 0.5) >= 0.72;
  const usageDecline = normalizeGrowth(input.usage7d ?? 0, input.usage30d ?? 0) < 0.42;
  const feedbackDecline = normalizeMomentum(clampSigned(input.feedback7d, 0), clampSigned(input.feedback30d, 0)) < 0.45;
  const behaviorDecline = normalizeMomentum(clampSigned(input.behavior7d, 0), clampSigned(input.behavior30d, 0)) < 0.45;
  const staleByAge = updatedAgeDays !== null && updatedAgeDays >= 120;

  return highScore && (input.staleVersion === true || staleByAge || usageDecline || feedbackDecline || behaviorDecline);
}

export function detectDecliningKnowledge(input: {
  usage7d?: number;
  usage30d?: number;
  feedback7d?: number;
  feedback30d?: number;
  behavior7d?: number;
  behavior30d?: number;
  negativeRate?: number;
}) {
  return normalizeGrowth(input.usage7d ?? 0, input.usage30d ?? 0) < 0.42
    && normalizeMomentum(clampSigned(input.feedback7d, 0), clampSigned(input.feedback30d, 0)) < 0.47
    && normalizeMomentum(clampSigned(input.behavior7d, 0), clampSigned(input.behavior30d, 0)) < 0.47
    && clamp01(input.negativeRate ?? 0, 0) >= 0.35;
}

export function detectEvergreenKnowledge(input: {
  usage30d?: number;
  feedbackScore?: number;
  behaviorScore?: number;
  stableOptimizationScore?: number;
  volatilityPenalty?: number;
}) {
  return Math.max(0, input.usage30d ?? 0) >= 2
    && normalizeSignedSignal(input.feedbackScore, 0.5) >= 0.58
    && normalizeSignedSignal(input.behaviorScore, 0.5) >= 0.58
    && clamp01(input.stableOptimizationScore ?? 0.5, 0.5) >= 0.75
    && clamp01(input.volatilityPenalty ?? 0, 0) < 0.06;
}

function signalDate(signal: MetadataRecord, keys: string[]) {
  for (const key of keys) {
    const date = normalizeDate(signal[key] as string | Date | null | undefined);

    if (date) {
      return date;
    }
  }

  return null;
}

function signalScore(signal: MetadataRecord, keys: string[]) {
  for (const key of keys) {
    if (signal[key] !== undefined) {
      return clampSigned(signal[key], 0);
    }
  }

  return 0;
}

function collectWindowSignals(state: MetadataRecord, input: {
  dateKeys: string[];
  scoreKeys: string[];
  days: number;
  now: Date;
}) {
  const signals = Object.values(readRecord(state.messageSignals)).map(readRecord);
  const since = input.now.getTime() - (input.days * 24 * 60 * 60 * 1000);

  return signals
    .map((signal) => ({
      date: signalDate(signal, input.dateKeys),
      score: signalScore(signal, input.scoreKeys)
    }))
    .filter((signal) => signal.date && signal.date.getTime() >= since)
    .map((signal) => signal.score);
}

function negativeRate(feedbackScores: number[], behaviorScores: number[]) {
  const values = [...feedbackScores, ...behaviorScores];

  if (values.length === 0) {
    return 0;
  }

  return clamp01(values.filter((value) => value < 0).length / values.length, 0);
}

export function buildTrendDiagnosticsFromMetadata(metadata: unknown, context: {
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
  freshnessScore?: number | null;
  stableOptimizationScore?: number | null;
  feedbackScore?: number | null;
  behaviorScore?: number | null;
  usageScore?: number | null;
  volatilityPenalty?: number | null;
  staleVersion?: boolean | null;
  latestVersion?: string | number | null;
} = {}): KnowledgeTrendDiagnostics {
  const record = readRecord(metadata);
  const governance = readRecord(record.governance);
  const feedback = readRecord(governance.feedback);
  const behavior = readRecord(governance.behavior);
  const stability = readRecord(governance.stability);
  const trend = readRecord(governance.trend);
  const now = new Date();
  const feedback7dScores = collectWindowSignals(feedback, {
    dateKeys: ["feedbackAt", "eventAt", "createdAt"],
    scoreKeys: ["scoreDelta", "rawScoreDelta"],
    days: 7,
    now
  });
  const feedback30dScores = collectWindowSignals(feedback, {
    dateKeys: ["feedbackAt", "eventAt", "createdAt"],
    scoreKeys: ["scoreDelta", "rawScoreDelta"],
    days: 30,
    now
  });
  const behavior7dScores = collectWindowSignals(behavior, {
    dateKeys: ["eventAt", "feedbackAt", "createdAt"],
    scoreKeys: ["scoreDelta", "behaviorScoreDelta", "rawBehaviorScoreDelta"],
    days: 7,
    now
  });
  const behavior30dScores = collectWindowSignals(behavior, {
    dateKeys: ["eventAt", "feedbackAt", "createdAt"],
    scoreKeys: ["scoreDelta", "behaviorScoreDelta", "rawBehaviorScoreDelta"],
    days: 30,
    now
  });
  const avg = (values: number[]) => values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
  const usage7d = behavior7dScores.length;
  const usage30d = Math.max(
    behavior30dScores.length,
    Math.round(clamp01(context.usageScore ?? governance.usageScore ?? record.usageScore, 0) * 10)
  );
  const feedback7d = avg(feedback7dScores);
  const feedback30d = avg(feedback30dScores);
  const behavior7d = avg(behavior7dScores);
  const behavior30d = avg(behavior30dScores);
  const createdAt = context.createdAt ?? governance.ingestTimestamp as string | null | undefined ?? record.ingestTimestamp as string | null | undefined;
  const updatedAt = context.updatedAt ?? trend.lastUpdatedAt as string | null | undefined ?? governance.ingestTimestamp as string | null | undefined;
  const stableOptimizationScore = clamp01(
    context.stableOptimizationScore ?? stability.stableOptimizationScore ?? governance.stableOptimizationScore ?? record.stableOptimizationScore,
    0.5
  );
  const freshnessScore = clamp01(context.freshnessScore ?? calculateFreshnessFromDates(updatedAt ?? createdAt), 0.5);
  const score = calculateTrendScore({
    usage7d,
    usage30d,
    feedback7d,
    feedback30d,
    behavior7d,
    behavior30d,
    stableOptimizationScore,
    freshnessScore,
    createdAt,
    updatedAt
  });
  const sampleCount = feedback30dScores.length + behavior30dScores.length;
  const uniqueUserCount = new Set(
    [
      ...Object.values(readRecord(feedback.messageSignals)).map(readRecord),
      ...Object.values(readRecord(behavior.messageSignals)).map(readRecord)
    ]
      .map((signal) => typeof signal.userId === "string" && signal.userId.trim() ? signal.userId.trim() : null)
      .filter(Boolean)
  ).size;
  const confidence = calculateConfidence(sampleCount, uniqueUserCount);
  const staleVersion = context.staleVersion === true
    || record.staleVersion === true
    || record.stale_version === true
    || (context.latestVersion !== null && context.latestVersion !== undefined && governance.version !== undefined && String(governance.version) !== String(context.latestVersion));
  const negativeTrendRate = negativeRate(feedback30dScores, behavior30dScores);
  const fastRising = detectFastRisingKnowledge({
    createdAt,
    usage7d,
    usage30d,
    feedback7d,
    behavior7d,
    stableOptimizationScore
  });
  const staleHighScore = detectStaleHighScoreKnowledge({
    stableOptimizationScore,
    usage7d,
    usage30d,
    feedback7d,
    feedback30d,
    behavior7d,
    behavior30d,
    updatedAt,
    staleVersion
  });
  const decliningTrend = detectDecliningKnowledge({
    usage7d,
    usage30d,
    feedback7d,
    feedback30d,
    behavior7d,
    behavior30d,
    negativeRate: negativeTrendRate
  });
  const evergreen = detectEvergreenKnowledge({
    usage30d,
    feedbackScore: context.feedbackScore ?? governance.feedbackScore as number | undefined,
    behaviorScore: context.behaviorScore ?? governance.behaviorScore as number | undefined,
    stableOptimizationScore,
    volatilityPenalty: context.volatilityPenalty ?? stability.volatilityPenalty as number | undefined
  });
  const staleRisk = round4(
    (staleHighScore ? 0.58 : 0)
    + (decliningTrend ? 0.24 : 0)
    + (ageDays(updatedAt) !== null && ageDays(updatedAt)! >= 120 ? 0.18 : 0)
  );
  const trendLabel = fastRising
    ? "fast_rising"
    : staleHighScore
      ? "stale_high_score"
      : decliningTrend
        ? "declining"
        : evergreen
          ? "evergreen"
          : "neutral";
  const trendReason = fastRising
    ? "new_knowledge_fast_growth"
    : staleHighScore
      ? "high_score_but_declining_recently"
      : decliningTrend
        ? "knowledge_trend_declining"
        : evergreen
          ? "long_term_stable_high_value"
          : "neutral_or_shadow_trend";

  return {
    usageDelta: roundSigned4(normalizeGrowth(usage7d, usage30d) - 0.5),
    feedbackDelta: roundSigned4(feedback7d - feedback30d),
    behaviorDelta: roundSigned4(behavior7d - behavior30d),
    freshnessDelta: round4(freshnessScore),
    trendScore: confidence <= 0.25 && sampleCount === 0 ? 0.5 : score,
    confidence,
    trendLabel,
    fastRising,
    staleHighScore,
    decliningTrend,
    evergreen,
    staleRisk,
    trendReason,
    shadowMode: sampleCount < 3,
    usage7d,
    usage30d,
    feedback7d: roundSigned4(feedback7d),
    feedback30d: roundSigned4(feedback30d),
    behavior7d: roundSigned4(behavior7d),
    behavior30d: roundSigned4(behavior30d)
  };
}
