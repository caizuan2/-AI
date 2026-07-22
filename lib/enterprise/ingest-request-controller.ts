"use client";

import type { IngestConversationState } from "@/lib/enterprise/ingest-conversation-state";
import { readAdminIngestRequestError } from "@/lib/enterprise/admin-ingest-request-error";

export function createIngestRequestId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // Browser crypto can be unavailable in older embedded shells.
  }

  return `admin-ingest-gpt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function isStaleRequest(activeRequestId: string | null | undefined, requestId: string) {
  return Boolean(activeRequestId && activeRequestId !== requestId);
}

export function shouldIgnoreRequestResult(state: IngestConversationState | null | undefined, requestId: string) {
  return isStaleRequest(state?.activeRequestId, requestId);
}

export function shouldIgnoreRequestError(state: IngestConversationState | null | undefined, requestId: string) {
  return isStaleRequest(state?.activeRequestId, requestId);
}

export function shouldResetLoading(state: IngestConversationState | null | undefined, requestId: string) {
  if (!state) {
    return false;
  }

  return state.activeRequestId === requestId || state.lastCompletedRequestId === requestId;
}

export function isRetryableIngestError(error: unknown) {
  const details = readAdminIngestRequestError(error);
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = [message, details?.errorCode, details?.causeCode, details?.status]
    .filter((value) => value !== undefined && value !== null)
    .join(" ")
    .toLowerCase();

  if (
    normalized.includes("401")
    || normalized.includes("403")
    || normalized.includes("auth_required")
    || normalized.includes("no_ingest_access")
    || normalized.includes("no-access")
    || normalized.includes("validation")
    || normalized.includes("当前账号")
    || normalized.includes("请先登录")
  ) {
    return false;
  }

  if (typeof details?.retryable === "boolean") {
    return details.retryable;
  }

  return normalized.includes("network")
    || normalized.includes("failed to fetch")
    || normalized.includes("timeout")
    || normalized.includes("timed out")
    || normalized.includes("502")
    || normalized.includes("503")
    || normalized.includes("504")
    || normalized.includes("temporarily unavailable")
    || normalized.includes("econnreset");
}

export function getRetryDelayMs(attempt: number) {
  return Math.min(1200, 600 + Math.max(0, attempt - 1) * 300);
}

export function createIngestRequestAttemptId(requestId: string, attempt: number) {
  return `${requestId}:attempt-${attempt}`;
}
