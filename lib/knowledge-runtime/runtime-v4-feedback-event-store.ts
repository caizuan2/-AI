import type {
  RuntimeV4FeedbackEvent,
  RuntimeV4FeedbackRecord,
  RuntimeV4Scope,
} from "./runtime-v4-growth-types";
import {
  buildRuntimeV3ScopeKey,
  normalizeRuntimeV3Scope,
} from "./runtime-v3-learning-guard";

const STORAGE_KEY = "runtime-v4:growth-feedback:v1";
export const RUNTIME_V4_FEEDBACK_UPDATED_EVENT = "runtime-v4-feedback-updated";

const memoryStore: Record<string, RuntimeV4FeedbackRecord[]> = {};

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readAll(): Record<string, RuntimeV4FeedbackRecord[]> {
  if (!canUseLocalStorage()) return memoryStore;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? parsed as Record<string, RuntimeV4FeedbackRecord[]>
      : {};
  } catch {
    return {};
  }
}

function writeAll(value: Record<string, RuntimeV4FeedbackRecord[]>) {
  if (!canUseLocalStorage()) {
    Object.assign(memoryStore, value);
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    Object.assign(memoryStore, value);
  }
}

function dispatchUpdated(scopeKey: string) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new CustomEvent(RUNTIME_V4_FEEDBACK_UPDATED_EVENT, {
    detail: { scopeKey },
  }));
}

export function normalizeRuntimeV4Scope(scope: RuntimeV4Scope): RuntimeV4Scope {
  return normalizeRuntimeV3Scope(scope);
}

export function hasCompleteRuntimeV4Scope(scope?: RuntimeV4Scope | null) {
  if (!scope) return false;
  const normalized = normalizeRuntimeV4Scope(scope);

  return Boolean((normalized.kbId || normalized.knowledgeBaseId) && (normalized.agentId || normalized.expertId));
}

export function buildRuntimeV4ScopeKey(scope: RuntimeV4Scope) {
  return buildRuntimeV3ScopeKey(normalizeRuntimeV4Scope(scope));
}

export function listRuntimeV4FeedbackEvents(scope: RuntimeV4Scope): RuntimeV4FeedbackRecord[] {
  if (!hasCompleteRuntimeV4Scope(scope)) return [];
  const all = readAll();

  return (all[buildRuntimeV4ScopeKey(scope)] ?? []).slice(-200);
}

export function recordRuntimeV4FeedbackEvent(input: {
  scope?: RuntimeV4Scope | null;
  event: RuntimeV4FeedbackEvent;
  variantId?: string;
  customerSegment?: string;
  dealSignal?: string;
  messageId?: string;
  traceId?: string;
  meta?: RuntimeV4FeedbackRecord["meta"];
}) {
  if (!input.scope || !hasCompleteRuntimeV4Scope(input.scope)) return null;

  const scopeKey = buildRuntimeV4ScopeKey(input.scope);
  const all = readAll();
  const record: RuntimeV4FeedbackRecord = {
    id: `v4-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    event: input.event,
    variantId: input.variantId,
    customerSegment: input.customerSegment,
    dealSignal: input.dealSignal,
    messageId: input.messageId,
    traceId: input.traceId,
    timestamp: new Date().toISOString(),
    meta: input.meta,
  };

  all[scopeKey] = [...(all[scopeKey] ?? []), record].slice(-200);
  writeAll(all);
  dispatchUpdated(scopeKey);

  return record;
}

export function clearRuntimeV4Feedback(scope: RuntimeV4Scope) {
  if (!hasCompleteRuntimeV4Scope(scope)) return;
  const scopeKey = buildRuntimeV4ScopeKey(scope);
  const all = readAll();

  delete all[scopeKey];
  writeAll(all);
  dispatchUpdated(scopeKey);
}

export function summarizeRuntimeV4Feedback(scope: RuntimeV4Scope) {
  const events = listRuntimeV4FeedbackEvents(scope);
  const variantCounts: Record<string, number> = {};
  const toneCounts: Record<string, number> = {};
  let copyCount = 0;
  let positiveCount = 0;
  let negativeCount = 0;
  let wonCount = 0;
  let lostCount = 0;

  for (const event of events) {
    if (event.variantId) {
      variantCounts[event.variantId] = (variantCounts[event.variantId] ?? 0) + 1;
    }

    if (event.meta?.tone) {
      toneCounts[event.meta.tone] = (toneCounts[event.meta.tone] ?? 0) + 1;
    }

    if (event.event.startsWith("copy_")) copyCount += 1;
    if (["copy_customer_copy", "copy_variant_a", "copy_variant_b", "copy_variant_c", "like_answer", "continue_thread", "save_response", "mark_deal_won"].includes(event.event)) {
      positiveCount += 1;
    }
    if (["dislike_answer", "edit_script", "mark_deal_lost", "mark_customer_silent", "mark_stop_followup"].includes(event.event)) {
      negativeCount += 1;
    }
    if (event.event === "mark_deal_won") wonCount += 1;
    if (event.event === "mark_deal_lost") lostCount += 1;
  }

  return {
    scopeKey: hasCompleteRuntimeV4Scope(scope) ? buildRuntimeV4ScopeKey(scope) : "",
    eventCount: events.length,
    events,
    copyCount,
    positiveCount,
    negativeCount,
    variantCounts,
    toneCounts,
    wonCount,
    lostCount,
    summary: events.length > 0
      ? `当前知识库/Agent 已累计 ${events.length} 条成交飞轮信号。`
      : "当前知识库/Agent 暂无成交飞轮信号。",
  };
}
