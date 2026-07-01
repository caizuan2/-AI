import type {
  RuntimeV3LearningEvent,
  RuntimeV3LearningScope,
  RuntimeV3LearningSummary,
} from "./runtime-v3-sales-learning-types";
import { buildRuntimeV3ScopeKey, normalizeRuntimeV3Scope } from "./runtime-v3-learning-guard";

const STORAGE_KEY = "runtime-v3:sales-learning:v1";
const memoryStore: Record<string, RuntimeV3LearningEvent[]> = {};

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readAll(): Record<string, RuntimeV3LearningEvent[]> {
  if (!canUseLocalStorage()) return memoryStore;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as Record<string, RuntimeV3LearningEvent[]> : {};
  } catch {
    return {};
  }
}

function writeAll(value: Record<string, RuntimeV3LearningEvent[]>) {
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

function getScopeKey(scope: RuntimeV3LearningScope) {
  return buildRuntimeV3ScopeKey(normalizeRuntimeV3Scope(scope));
}

export function loadRuntimeV3Learning(scope: RuntimeV3LearningScope): RuntimeV3LearningEvent[] {
  const all = readAll();
  return (all[getScopeKey(scope)] ?? []).slice(-100);
}

export function saveRuntimeV3Learning(scope: RuntimeV3LearningScope, event: RuntimeV3LearningEvent) {
  const all = readAll();
  const key = getScopeKey(scope);
  const next = [...(all[key] ?? []), event].slice(-100);

  all[key] = next;
  writeAll(all);
  return next;
}

export function clearRuntimeV3Learning(scope: RuntimeV3LearningScope) {
  const all = readAll();
  delete all[getScopeKey(scope)];
  writeAll(all);
}

export function summarizeRuntimeV3Learning(scope: RuntimeV3LearningScope): RuntimeV3LearningSummary {
  const events = loadRuntimeV3Learning(scope);
  const copiedVariantCounts: Record<string, number> = {};
  const copiedToneCounts: RuntimeV3LearningSummary["copiedToneCounts"] = {};
  let positiveCount = 0;
  let negativeCount = 0;

  for (const event of events) {
    if (event.variantId) {
      copiedVariantCounts[event.variantId] = (copiedVariantCounts[event.variantId] ?? 0) + 1;
    }

    if (event.tone) {
      copiedToneCounts[event.tone] = (copiedToneCounts[event.tone] ?? 0) + 1;
    }

    if (["disliked_answer", "ignored_response", "manual_negative"].includes(event.signal)) {
      negativeCount += 1;
    } else {
      positiveCount += 1;
    }
  }

  const preferredVariantId = Object.entries(copiedVariantCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const preferredTone = Object.entries(copiedToneCounts).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0] as RuntimeV3LearningSummary["preferredTone"];
  const lastSignals = events.slice(-6).map((event) => event.signal);

  return {
    scopeKey: getScopeKey(scope),
    eventCount: events.length,
    copiedVariantCounts,
    copiedToneCounts,
    positiveCount,
    negativeCount,
    lastSignals,
    preferredVariantId,
    preferredTone,
    summary: events.length > 0
      ? `当前知识库/Agent 已累计 ${events.length} 条本地学习信号。`
      : "当前知识库/Agent 暂无本地学习记录。",
  };
}
