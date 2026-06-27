export type KnowledgeFeedbackEventType =
  | "click"
  | "copy"
  | "dwellTime"
  | "followUpQuestion"
  | "conversionAction";

export interface KnowledgeFeedbackInput {
  userId?: string | null;
  query?: string | null;
  responseId?: string | null;
  eventType?: KnowledgeFeedbackEventType;
  clickCount?: number;
  copyCount?: number;
  dwellTime?: number;
  followUp?: boolean;
  converted?: boolean;
  metadata?: Record<string, unknown>;
}

export interface KnowledgeFeedbackRecord {
  userId: string;
  query: string;
  responseId: string;
  eventType: KnowledgeFeedbackEventType;
  clickCount: number;
  copyCount: number;
  dwellTime: number;
  followUp: boolean;
  converted: boolean;
  collectedAt: string;
  metadata: Record<string, unknown>;
}

export interface RuntimeFeedbackOptimization {
  engagementScore: number;
  conversionScore: number;
  shouldOptimize: boolean;
  strategyHints: string[];
}

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : 0;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function createFeedbackRecord(input: KnowledgeFeedbackInput): KnowledgeFeedbackRecord {
  return {
    userId: safeText(input.userId) || "anonymous",
    query: safeText(input.query),
    responseId: safeText(input.responseId),
    eventType: input.eventType ?? "click",
    clickCount: safeCount(input.clickCount),
    copyCount: safeCount(input.copyCount),
    dwellTime: safeCount(input.dwellTime),
    followUp: Boolean(input.followUp),
    converted: Boolean(input.converted),
    collectedAt: new Date().toISOString(),
    metadata: input.metadata ?? {}
  };
}

export function mergeFeedbackRecords(records: KnowledgeFeedbackInput[]): KnowledgeFeedbackRecord {
  const normalized = records.map((record) => createFeedbackRecord(record));
  const latest = normalized.at(-1);

  return {
    userId: latest?.userId ?? "anonymous",
    query: latest?.query ?? "",
    responseId: latest?.responseId ?? "",
    eventType: latest?.eventType ?? "click",
    clickCount: normalized.reduce((total, record) => total + record.clickCount, 0),
    copyCount: normalized.reduce((total, record) => total + record.copyCount, 0),
    dwellTime: normalized.reduce((total, record) => Math.max(total, record.dwellTime), 0),
    followUp: normalized.some((record) => record.followUp),
    converted: normalized.some((record) => record.converted),
    collectedAt: latest?.collectedAt ?? new Date().toISOString(),
    metadata: {
      eventCount: normalized.length,
      eventTypes: Array.from(new Set(normalized.map((record) => record.eventType)))
    }
  };
}

export function evaluateFeedbackForRuntime(input: KnowledgeFeedbackInput | KnowledgeFeedbackInput[]): RuntimeFeedbackOptimization {
  const record = Array.isArray(input)
    ? mergeFeedbackRecords(input)
    : createFeedbackRecord(input);
  const engagementScore = clamp01(
    (record.clickCount * 0.08)
    + (record.copyCount * 0.28)
    + (Math.min(record.dwellTime, 60_000) / 60_000 * 0.34)
    + (record.followUp ? 0.18 : 0)
    + (record.converted ? 0.28 : 0)
  );
  const conversionScore = clamp01(
    (record.copyCount > 0 ? 0.28 : 0)
    + (record.converted ? 0.5 : 0)
    + (record.followUp ? 0.14 : 0)
    + (record.dwellTime >= 12_000 ? 0.08 : 0)
  );
  const strategyHints = [
    record.copyCount > 0 ? "用户复制了回答，保留可复制话术和行动建议。" : null,
    record.followUp ? "用户继续追问，下一轮应补充上下文并减少重复解释。" : null,
    record.converted ? "检测到转化动作，优先强化成交路径和下一步 CTA。" : null,
    record.dwellTime < 3000 && record.clickCount === 0 ? "停留较短，下一轮应更快给结论。" : null
  ].filter((item): item is string => Boolean(item));

  return {
    engagementScore,
    conversionScore,
    shouldOptimize: engagementScore < 0.24 || conversionScore >= 0.48 || record.followUp,
    strategyHints
  };
}

export class FeedbackCollector {
  collect(input: KnowledgeFeedbackInput) {
    return createFeedbackRecord(input);
  }

  summarize(input: KnowledgeFeedbackInput | KnowledgeFeedbackInput[]) {
    return evaluateFeedbackForRuntime(input);
  }
}
