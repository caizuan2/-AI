import type { RuntimeV5Scope } from "./runtime-v5-strategy-types";
import {
  buildRuntimeV4ScopeKey,
  hasCompleteRuntimeV4Scope,
} from "./runtime-v4-feedback-event-store";

const STORAGE_KEY = "runtime-v5:strategy-memory:v1";
const memoryStore: Record<string, RuntimeV5StrategyMemoryRecord[]> = {};

export type RuntimeV5StrategyMemoryRecord = {
  id: string;
  createdAt: string;
  strategyId?: string;
  recommendation: string;
  outcomeSignal?: string;
  reason?: string;
};

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readAll(): Record<string, RuntimeV5StrategyMemoryRecord[]> {
  if (!canUseLocalStorage()) return memoryStore;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? parsed as Record<string, RuntimeV5StrategyMemoryRecord[]>
      : {};
  } catch {
    return {};
  }
}

function writeAll(value: Record<string, RuntimeV5StrategyMemoryRecord[]>) {
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

export function loadRuntimeV5StrategyMemory(scope?: RuntimeV5Scope | null): RuntimeV5StrategyMemoryRecord[] {
  if (!scope || !hasCompleteRuntimeV4Scope(scope)) return [];
  const all = readAll();
  return (all[buildRuntimeV4ScopeKey(scope)] ?? []).slice(-100);
}

export function saveRuntimeV5StrategyMemory(scope: RuntimeV5Scope | null | undefined, data: Omit<RuntimeV5StrategyMemoryRecord, "id" | "createdAt">) {
  if (!scope || !hasCompleteRuntimeV4Scope(scope)) return null;
  const scopeKey = buildRuntimeV4ScopeKey(scope);
  const all = readAll();
  const record: RuntimeV5StrategyMemoryRecord = {
    id: `v5-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    ...data,
  };

  all[scopeKey] = [...(all[scopeKey] ?? []), record].slice(-100);
  writeAll(all);
  return record;
}

export function summarizeRuntimeV5StrategyMemory(scope?: RuntimeV5Scope | null) {
  const records = loadRuntimeV5StrategyMemory(scope);
  const latest = records.length > 0 ? records[records.length - 1] : undefined;

  return {
    count: records.length,
    latestStrategyId: latest?.strategyId,
    summary: records.length > 0
      ? `当前隔离范围已累计 ${records.length} 条策略摘要。`
      : "当前隔离范围暂无策略摘要。",
  };
}

export function clearRuntimeV5StrategyMemory(scope?: RuntimeV5Scope | null) {
  if (!scope || !hasCompleteRuntimeV4Scope(scope)) return;
  const scopeKey = buildRuntimeV4ScopeKey(scope);
  const all = readAll();
  delete all[scopeKey];
  writeAll(all);
}
