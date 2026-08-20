import assert from "node:assert/strict";

import {
  createAdminIngestLatencyTrace,
  type AdminIngestLatencyEvent,
  type AdminIngestLatencyStage
} from "../lib/enterprise/admin-ingest-latency-trace";

const UI_LATENCY_STAGES = [
  "image_persist_completed",
  "attachment_parse_completed",
  "model_request_started",
  "first_visible_reply",
  "model_completed",
  "terminal_committed",
  "history_persist_completed"
] as const satisfies readonly AdminIngestLatencyStage[];

function main() {
  const events: AdminIngestLatencyEvent[] = [];
  const times = [1_025, 1_080, 1_140];
  const trace = createAdminIngestLatencyTrace({
    traceId: " request-123 / forbidden正文 ",
    startedAt: 1_000,
    now: () => times.shift() ?? 1_140,
    log: (event) => events.push(event)
  });

  const auth = trace.mark("auth_completed", 1_005);
  const cache = trace.mark("ocr_cache_miss", 1_025);
  const completed = trace.mark("ocr_completed", 1_080);

  assert.equal(trace.traceId, "request-123forbidden");
  assert.deepEqual(auth, {
    traceId: "request-123forbidden",
    stage: "auth_completed",
    elapsedMs: 25,
    durationMs: 20
  });
  assert.equal(cache.elapsedMs, 80);
  assert.equal(cache.durationMs, 55);
  assert.equal(completed.elapsedMs, 140);
  assert.equal(completed.durationMs, 60);
  assert.deepEqual(events, [auth, cache, completed]);

  const serialized = JSON.stringify(events);

  assert.doesNotMatch(serialized, /正文|prompt|replyMarkdown|extractedText|apiKey/i);
  assert.match(serialized, /elapsedMs/);
  assert.match(serialized, /durationMs/);
  assert.equal(UI_LATENCY_STAGES.length, 7);

  console.log("Admin ingest latency trace tests passed.");
}

main();
