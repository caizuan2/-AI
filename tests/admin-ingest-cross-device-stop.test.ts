import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module from "node:module";
import test from "node:test";
import {
  isAdminIngestConversationRequestCancelled,
  markAdminIngestConversationGenerating,
  markAdminIngestConversationRequestTerminal,
  markAdminIngestConversationVisibleCompleted,
  mergeAdminIngestConversationRuntimeStatusMaps,
  normalizeAdminIngestConversationRuntimeStatusMap
} from "../lib/enterprise/admin-ingest-conversation-runtime-status";
const moduleLoader = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleLoader._load;

moduleLoader._load = (request, parent, isMain) => {
  if (request === "server-only") {
    return {};
  }

  return originalLoad(request, parent, isMain);
};

const {
  cancelAdminIngestActiveRequest,
  registerAdminIngestActiveRequest
} = require("../lib/enterprise/admin-ingest-request-cancellation-store") as typeof import("../lib/enterprise/admin-ingest-request-cancellation-store");
moduleLoader._load = originalLoad;

test("a stopped request is monotonic and cannot overwrite a newer request", () => {
  const generating = markAdminIngestConversationGenerating({}, {
    conversationId: "conversation-a",
    requestId: "request-a",
    now: 1_000
  });
  const stopRequested = markAdminIngestConversationRequestTerminal(generating, {
    conversationId: "conversation-a",
    requestId: "request-a",
    state: "stop_requested",
    now: 2_000
  });
  const stopped = markAdminIngestConversationRequestTerminal(stopRequested, {
    conversationId: "conversation-a",
    requestId: "request-a",
    state: "stopped",
    now: 3_000
  });

  assert.equal(
    markAdminIngestConversationVisibleCompleted(stopped, {
      conversationId: "conversation-a",
      requestId: "request-a",
      now: 4_000
    }),
    stopped,
    "late completion must not revive a stopped request"
  );
  assert.equal(
    isAdminIngestConversationRequestCancelled(stopped["conversation-a"], "request-a"),
    true
  );

  const nextRequest = markAdminIngestConversationGenerating(stopped, {
    conversationId: "conversation-a",
    requestId: "request-b",
    now: 5_000
  });
  const staleStop = markAdminIngestConversationRequestTerminal(nextRequest, {
    conversationId: "conversation-a",
    requestId: "request-a",
    state: "stopped",
    now: 6_000
  });

  assert.deepEqual(staleStop["conversation-a"], {
    state: "generating",
    requestId: "request-b",
    startedAt: 5_000,
    updatedAt: 5_000
  });
});

test("stale generating states become a timed-out terminal state", () => {
  const now = 20 * 60 * 1_000;
  const normalized = normalizeAdminIngestConversationRuntimeStatusMap({
    stale: {
      state: "generating",
      requestId: "request-stale",
      startedAt: 1,
      updatedAt: 1
    }
  }, now);

  assert.deepEqual(normalized.stale, {
    state: "timed_out",
    requestId: "request-stale",
    updatedAt: 5 * 60 * 1_000 + 1
  });
});

test("expired timed-out tombstones do not remain visible forever", () => {
  const normalized = normalizeAdminIngestConversationRuntimeStatusMap({
    stale: {
      state: "generating",
      requestId: "request-stale",
      startedAt: 1,
      updatedAt: 1
    }
  }, 3 * 24 * 60 * 60 * 1_000);

  assert.equal(normalized.stale, undefined);
});

test("a matching request heartbeat renews the lease without resetting elapsed time", () => {
  const started = markAdminIngestConversationGenerating({}, {
    conversationId: "conversation-a",
    requestId: "request-a",
    now: 1_000
  });
  const refreshed = markAdminIngestConversationGenerating(started, {
    conversationId: "conversation-a",
    requestId: "request-a",
    now: 4 * 60 * 1_000
  });
  const normalized = normalizeAdminIngestConversationRuntimeStatusMap(
    refreshed,
    6 * 60 * 1_000
  );

  assert.deepEqual(normalized["conversation-a"], {
    state: "generating",
    requestId: "request-a",
    startedAt: 1_000,
    updatedAt: 4 * 60 * 1_000
  });
});

test("terminal state wins same-request cross-device merges", () => {
  const generating = markAdminIngestConversationGenerating({}, {
    conversationId: "conversation-a",
    requestId: "request-a",
    now: 1_000
  });
  const stopped = markAdminIngestConversationRequestTerminal(generating, {
    conversationId: "conversation-a",
    requestId: "request-a",
    state: "stopped",
    now: 2_000
  });

  assert.deepEqual(
    mergeAdminIngestConversationRuntimeStatusMaps(stopped, generating),
    stopped
  );

  const laterFailed = markAdminIngestConversationRequestTerminal(generating, {
    conversationId: "conversation-a",
    requestId: "request-a",
    state: "failed",
    now: 3_000
  });
  const laterVisible = markAdminIngestConversationVisibleCompleted(generating, {
    conversationId: "conversation-a",
    requestId: "request-a",
    now: 4_000
  });

  assert.deepEqual(
    mergeAdminIngestConversationRuntimeStatusMaps(stopped, laterFailed),
    stopped,
    "an explicit stop must remain stronger than a later generic failure"
  );
  assert.deepEqual(
    mergeAdminIngestConversationRuntimeStatusMaps(stopped, laterVisible),
    stopped,
    "late visible completion must not revive an explicitly stopped request"
  );
  assert.equal(
    markAdminIngestConversationVisibleCompleted(laterFailed, {
      conversationId: "conversation-a",
      requestId: "request-a",
      now: 5_000
    }),
    laterFailed,
    "late completion must not revive a failed request"
  );
});

test("a stop arriving after successful completion cannot overwrite success", () => {
  const generating = markAdminIngestConversationGenerating({}, {
    conversationId: "conversation-a",
    requestId: "request-a",
    now: 1_000
  });
  const completed = markAdminIngestConversationVisibleCompleted(generating, {
    conversationId: "conversation-a",
    requestId: "request-a",
    now: 2_000
  });

  assert.equal(
    markAdminIngestConversationRequestTerminal(completed, {
      conversationId: "conversation-a",
      requestId: "request-a",
      state: "stop_requested",
      now: 3_000
    }),
    completed
  );
});

test("server cancellation is account scoped and aborts only the matching request", () => {
  const ownerA = registerAdminIngestActiveRequest({
    ownerUserId: "owner-a",
    conversationId: "conversation-a",
    requestId: "shared-request"
  });
  const ownerB = registerAdminIngestActiveRequest({
    ownerUserId: "owner-b",
    conversationId: "conversation-a",
    requestId: "shared-request"
  });
  const conversationB = registerAdminIngestActiveRequest({
    ownerUserId: "owner-a",
    conversationId: "conversation-b",
    requestId: "shared-request"
  });

  try {
    assert.equal(cancelAdminIngestActiveRequest({
      ownerUserId: "owner-a",
      conversationId: "conversation-a",
      requestId: "shared-request"
    }), true);
    assert.equal(ownerA.signal.aborted, true);
    assert.equal(ownerB.signal.aborted, false);
    assert.equal(conversationB.signal.aborted, false);
  } finally {
    ownerA.unregister();
    ownerB.unregister();
    conversationB.unregister();
  }
});

test("production wiring exposes idempotent remote stop and drops late results", () => {
  const toggle = readFileSync(
    "components/enterprise-admin/IngestModeToggle.tsx",
    "utf8"
  );
  const syncRoute = readFileSync(
    "app/api/admin/ingest-conversations/route.ts",
    "utf8"
  );
  const gptRoute = readFileSync(
    "app/api/admin/kb/ingest/gpt/route.ts",
    "utf8"
  );

  assert.match(toggle, /operation:\s*"request_runtime_stop"/);
  assert.match(toggle, /runtimeStatus\?\.state === "generating"/);
  assert.match(toggle, /remoteStatus\.state !== "generating"/);
  assert.match(toggle, /state:\s*"stop_requested"[\s\S]*const stopResult = await stopRequest/);
  assert.match(toggle, /stopResult\.stopApplied === false[\s\S]*本轮回答已在停止请求到达前完成/);
  assert.match(
    toggle,
    /effectiveStatus\.requestId !== requestId[\s\S]*activeIngestRequestIdByConversationRef\.current\[conversationId\] === requestId[\s\S]*delete activeIngestRequestIdByConversationRef\.current\[conversationId\][\s\S]*当前对话已进入新一轮/,
    "a stale stop must release old request A so the next stop targets effective request B"
  );
  assert.match(toggle, /if \(!stopConfirmed && !controller\)[\s\S]*暂未停止生成/);
  assert.match(
    toggle,
    /status\.state !== "visible_completed"[\s\S]*status\.state !== "completed_unread"/,
    "a successful unread completion must complete the assistant message instead of being treated as a stop"
  );
  assert.match(syncRoute, /cancelAdminIngestActiveRequest/);
  assert.match(syncRoute, /state:\s*"stop_requested"/);
  assert.match(syncRoute, /state:\s*"stopped"/);
  assert.match(syncRoute, /stopApplied = false/);
  assert.match(syncRoute, /runtimeStatus:\s*runtimeResult\.statusById\[conversationId\]/);
  assert.match(gptRoute, /registerAdminIngestActiveRequest/);
  assert.match(gptRoute, /await ensureRequestIsActive\(\)/);
  assert.match(gptRoute, /isAdminIngestConversationRequestCancelled/);
  assert.match(gptRoute, /ADMIN_INGEST_RUNTIME_LEASE_HEARTBEAT_MS/);
  assert.match(gptRoute, /ADMIN_INGEST_RUNTIME_CANCELLATION_POLL_MS/);
  assert.match(gptRoute, /markAdminIngestConversationRequestGenerating/);
  assert.match(
    gptRoute,
    /onProgressEvent:[\s\S]*signal\?\.aborted[\s\S]*isAdminIngestRequestCancellationPending/,
    "late provider chunks must be suppressed after a stop is observed"
  );
  assert.match(gptRoute, /observeCancellation[\s\S]*cancelLocalRequest/);
  assert.match(gptRoute, /stopRuntimeLeaseHeartbeat\(\)/);
});
