export type AdminIngestLatencyStage =
  | "image_persist_completed"
  | "attachment_parse_completed"
  | "model_request_started"
  | "first_reply_received"
  | "first_visible_reply"
  | "complete_visible_reply"
  | "model_completed"
  | "terminal_committed"
  | "history_persist_completed"
  | "auth_completed"
  | "form_data_completed"
  | "worker_prewarm_completed"
  | "buffer_completed"
  | "ocr_cache_hit"
  | "ocr_cache_miss"
  | "ocr_completed"
  | "response_ready";

export interface AdminIngestLatencyEvent {
  traceId: string;
  stage: AdminIngestLatencyStage;
  elapsedMs: number;
  durationMs: number;
}

export interface AdminIngestLatencyTrace {
  readonly traceId: string;
  readonly startedAt: number;
  mark: (stage: AdminIngestLatencyStage, stageStartedAt?: number) => AdminIngestLatencyEvent;
}

interface CreateAdminIngestLatencyTraceInput {
  traceId?: string | null;
  startedAt?: number;
  now?: () => number;
  log?: (event: AdminIngestLatencyEvent) => void;
}

const MAX_TRACE_ID_LENGTH = 128;

function normalizeTraceId(value: string | null | undefined) {
  const normalized = value?.trim().replace(/[^a-zA-Z0-9._:-]/g, "").slice(0, MAX_TRACE_ID_LENGTH);

  return normalized || `parse-${Date.now().toString(36)}`;
}

function normalizeTimestamp(value: number | undefined, fallback: number) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value as number)) : fallback;
}

export function createAdminIngestLatencyTrace(
  input: CreateAdminIngestLatencyTraceInput = {}
): AdminIngestLatencyTrace {
  const now = input.now ?? Date.now;
  const initialNow = input.startedAt ?? now();
  const startedAt = normalizeTimestamp(input.startedAt, initialNow);
  const traceId = normalizeTraceId(input.traceId);
  const log = input.log ?? ((event: AdminIngestLatencyEvent) => {
    console.info("[admin-ingest:latency-ms]", event);
  });

  return {
    traceId,
    startedAt,
    mark(stage, stageStartedAt = startedAt) {
      const completedAt = now();
      const normalizedStageStartedAt = normalizeTimestamp(stageStartedAt, startedAt);
      const event = {
        traceId,
        stage,
        elapsedMs: Math.max(0, Math.round(completedAt - startedAt)),
        durationMs: Math.max(0, Math.round(completedAt - normalizedStageStartedAt))
      } satisfies AdminIngestLatencyEvent;

      log(event);
      return event;
    }
  };
}

interface AdminIngestBodyLatencyEntry {
  trace: AdminIngestLatencyTrace;
  registeredAt: number;
  firstBodyCommitted: boolean;
}

export interface AdminIngestBodyCommittedEvent {
  messageId: string;
  phase: "first_body" | "complete_body";
  characters: number;
}

// Browser-memory-only correlation; never attach timings or body text to history.
// Bounded entries also cover a completed response in a temporarily hidden chat.
const bodyLatencyEntries = new Map<string, AdminIngestBodyLatencyEntry>();
const BODY_LATENCY_ENTRY_TTL_MS = 30 * 60 * 1_000;
const MAX_BODY_LATENCY_ENTRIES = 128;

function pruneBodyLatencyEntries(now: number) {
  bodyLatencyEntries.forEach((entry, messageId) => {
    if (now - entry.registeredAt >= BODY_LATENCY_ENTRY_TTL_MS) {
      bodyLatencyEntries.delete(messageId);
    }
  });
}

export function registerAdminIngestBodyLatencyTrace(
  messageId: string,
  trace: AdminIngestLatencyTrace
) {
  pruneBodyLatencyEntries(Date.now());
  bodyLatencyEntries.delete(messageId);
  while (bodyLatencyEntries.size >= MAX_BODY_LATENCY_ENTRIES) {
    const oldestMessageId = bodyLatencyEntries.keys().next().value as string | undefined;
    if (!oldestMessageId) break;
    bodyLatencyEntries.delete(oldestMessageId);
  }
  bodyLatencyEntries.set(messageId, {
    trace,
    registeredAt: Date.now(),
    firstBodyCommitted: false
  });
}

export function forgetAdminIngestBodyLatencyTrace(messageId: string) {
  bodyLatencyEntries.delete(messageId);
}

export function markAdminIngestBodyCommitted(event: AdminIngestBodyCommittedEvent) {
  pruneBodyLatencyEntries(Date.now());
  const entry = bodyLatencyEntries.get(event.messageId);
  if (!entry || !Number.isFinite(event.characters) || event.characters <= 0) return;

  if (!entry.firstBodyCommitted) {
    entry.firstBodyCommitted = true;
    entry.trace.mark("first_visible_reply");
  }
  if (event.phase === "complete_body") {
    entry.trace.mark("complete_visible_reply");
    bodyLatencyEntries.delete(event.messageId);
  }
}
