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

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : 0;
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
