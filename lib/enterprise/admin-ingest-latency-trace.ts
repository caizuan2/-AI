export type AdminIngestLatencyStage =
  | "image_persist_completed"
  | "attachment_parse_completed"
  | "model_request_started"
  | "first_visible_reply"
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
