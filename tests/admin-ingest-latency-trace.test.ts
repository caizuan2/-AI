import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  createAdminIngestLatencyTrace,
  forgetAdminIngestBodyLatencyTrace,
  markAdminIngestBodyCommitted,
  registerAdminIngestBodyLatencyTrace,
  type AdminIngestLatencyEvent,
  type AdminIngestLatencyStage
} from "../lib/enterprise/admin-ingest-latency-trace";

const UI_LATENCY_STAGES = [
  "image_persist_completed",
  "attachment_parse_completed",
  "model_request_started",
  "first_reply_received",
  "first_visible_reply",
  "complete_visible_reply",
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
  assert.equal(UI_LATENCY_STAGES.length, 9);

  let currentTime = 2_000;
  const visibleEvents: AdminIngestLatencyEvent[] = [];
  const visibleTrace = createAdminIngestLatencyTrace({
    traceId: "visible-request", startedAt: currentTime,
    now: () => currentTime, log: (event) => visibleEvents.push(event)
  });
  registerAdminIngestBodyLatencyTrace("assistant-result-visible-request", visibleTrace);
  currentTime = 2_100;
  visibleTrace.mark("first_reply_received");
  assert.equal(visibleEvents.length, 1, "receiving bytes is not DOM visibility");
  markAdminIngestBodyCommitted({ messageId: "historical-response", phase: "complete_body", characters: 80 });
  markAdminIngestBodyCommitted({ messageId: "assistant-result-visible-request", phase: "first_body", characters: 0 });
  assert.equal(visibleEvents.length, 1, "history and empty loading nodes cannot emit visibility");
  currentTime = 2_130;
  markAdminIngestBodyCommitted({ messageId: "assistant-result-visible-request", phase: "first_body", characters: 8 });
  markAdminIngestBodyCommitted({ messageId: "assistant-result-visible-request", phase: "first_body", characters: 16 });
  assert.equal(visibleEvents.length, 2);
  assert.equal(visibleEvents[1].stage, "first_visible_reply");
  assert.equal(visibleEvents[1].elapsedMs, 130);
  currentTime = 2_800;
  markAdminIngestBodyCommitted({ messageId: "assistant-result-visible-request", phase: "complete_body", characters: 80 });
  markAdminIngestBodyCommitted({ messageId: "assistant-result-visible-request", phase: "complete_body", characters: 80 });
  assert.equal(visibleEvents.length, 3);
  assert.equal(visibleEvents[2].stage, "complete_visible_reply");
  assert.equal(visibleEvents[2].elapsedMs, 800);
  visibleTrace.mark("history_persist_completed");
  assert.equal(visibleEvents[3].stage, "history_persist_completed");

  registerAdminIngestBodyLatencyTrace("cancelled-response", visibleTrace);
  forgetAdminIngestBodyLatencyTrace("cancelled-response");
  markAdminIngestBodyCommitted({ messageId: "cancelled-response", phase: "complete_body", characters: 8 });
  assert.equal(visibleEvents.length, 4);
  registerAdminIngestBodyLatencyTrace("completed-response", visibleTrace);
  markAdminIngestBodyCommitted({ messageId: "completed-response", phase: "complete_body", characters: 80 });
  assert.deepEqual(visibleEvents.slice(-2).map((event) => event.stage), ["first_visible_reply", "complete_visible_reply"]);

  const source = readFileSync("components/enterprise-admin/IngestModeToggle.tsx", "utf8");
  const sendStart = source.indexOf("async function handleSend(");
  const traceStart = source.indexOf("const latencyStartedAt = Date.now()", sendStart);
  const authStart = source.indexOf("!await verifyCurrentAccountHistoryScope(isCurrentSendPreflight)", sendStart);
  assert.ok(traceStart > sendStart && authStart > traceStart, "click timing must include preflight auth");
  const queueAttemptStart = source.indexOf("const sendAttemptAt = Date.now()", sendStart);
  assert.ok(queueAttemptStart > authStart, "latency instrumentation must retain the queue's post-preflight attempt time");
  assert.match(source, /startedAt: latencyStartedAt/);
  assert.match(source, /const conversationId = ensureConversationForSend\(activeAgent\);\s*const sendAttemptAt = Date\.now\(\);/);
  assert.doesNotMatch(source, /latencyTrace\.mark\("first_visible_reply"/);

  console.log("Admin ingest latency trace tests passed.");
}

main();
