"use client";

import type {
  AutonomousStep,
  AutonomousTaskStatus
} from "@/lib/enterprise/gpt-os-autonomous-executor";
import type { TaskChainExecutionResult } from "@/lib/enterprise/gpt-os-task-chain-engine";

export const ADMIN_INGEST_AUTONOMOUS_TASK_STORAGE_KEY = "admin-ingest-autonomous-task-v1";
export const ADMIN_INGEST_TASK_CHAIN_STORAGE_KEY = "admin-ingest-task-chain-v1";

export interface AutonomousTaskStateSnapshot {
  taskId: string;
  goal: string;
  steps: AutonomousStep[];
  status: AutonomousTaskStatus;
  createdAt: string;
  updatedAt: string;
  summaryResult?: string;
}

export type TaskChainStateSnapshot = TaskChainExecutionResult;

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadAutonomousTaskState(): AutonomousTaskStateSnapshot | null {
  if (!isBrowser()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(ADMIN_INGEST_AUTONOMOUS_TASK_STORAGE_KEY);

    return raw ? JSON.parse(raw) as AutonomousTaskStateSnapshot : null;
  } catch {
    return null;
  }
}

export function saveAutonomousTaskState(snapshot: AutonomousTaskStateSnapshot) {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(ADMIN_INGEST_AUTONOMOUS_TASK_STORAGE_KEY, JSON.stringify({
    taskId: snapshot.taskId,
    goal: snapshot.goal,
    steps: snapshot.steps,
    status: snapshot.status,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    summaryResult: snapshot.summaryResult
  }));
}

export function clearAutonomousTaskState() {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.removeItem(ADMIN_INGEST_AUTONOMOUS_TASK_STORAGE_KEY);
}

export function mergeAutonomousTaskState(
  current: AutonomousTaskStateSnapshot | null,
  next: Partial<AutonomousTaskStateSnapshot> & Pick<AutonomousTaskStateSnapshot, "taskId" | "goal" | "steps" | "status">
) {
  const now = new Date().toISOString();

  return {
    taskId: next.taskId,
    goal: next.goal,
    steps: next.steps,
    status: next.status,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
    summaryResult: next.summaryResult ?? current?.summaryResult
  };
}

export function loadTaskChainState(): TaskChainStateSnapshot | null {
  if (!isBrowser()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(ADMIN_INGEST_TASK_CHAIN_STORAGE_KEY);

    return raw ? JSON.parse(raw) as TaskChainStateSnapshot : null;
  } catch {
    return null;
  }
}

export function saveTaskChainState(snapshot: TaskChainStateSnapshot) {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(ADMIN_INGEST_TASK_CHAIN_STORAGE_KEY, JSON.stringify(snapshot));
}

export function clearTaskChainState() {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.removeItem(ADMIN_INGEST_TASK_CHAIN_STORAGE_KEY);
}

export function mergeTaskChainState(
  current: TaskChainStateSnapshot | null,
  next: TaskChainExecutionResult
): TaskChainStateSnapshot {
  return {
    ...next,
    createdAt: current?.createdAt ?? next.createdAt,
    updatedAt: new Date().toISOString()
  };
}
