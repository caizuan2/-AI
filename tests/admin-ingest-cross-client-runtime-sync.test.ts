import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  markAdminIngestConversationGenerating,
  normalizeAdminIngestConversationRuntimeStatusMap
} from "../lib/enterprise/admin-ingest-conversation-runtime-status";
import {
  createEmptyAdminIngestConversationSyncSnapshot,
  normalizeAdminIngestConversationSyncSnapshot
} from "../lib/enterprise/admin-ingest-history-sync";
import {
  createEmptyConversationState,
  markRequestActive,
  markRequestCompleted
} from "../lib/enterprise/ingest-conversation-state";

function testRequestStartTimeSurvivesConversationSwitches() {
  const initial = createEmptyConversationState({
    conversationId: "conversation-a"
  });
  const active = markRequestActive(initial, "request-a", 1_000);
  const sameRequest = markRequestActive(active, "request-a", 9_000);

  assert.equal(active.requestStartedAt, 1_000);
  assert.equal(
    sameRequest.requestStartedAt,
    1_000,
    "the same request must keep its original start time"
  );
  assert.equal(
    markRequestCompleted(sameRequest, "request-a").requestStartedAt,
    undefined
  );
}

function testRuntimeStatusRoundTripsThroughAccountSnapshot() {
  const now = Date.now();
  const runtime = markAdminIngestConversationGenerating({}, {
    conversationId: "conversation-a",
    requestId: "request-a",
    now
  });
  const normalized = normalizeAdminIngestConversationSyncSnapshot({
    ...createEmptyAdminIngestConversationSyncSnapshot(),
    conversationRuntimeStatusById: runtime
  }, {
    includeDrafts: true
  });

  assert.deepEqual(
    normalized.conversationRuntimeStatusById["conversation-a"],
    {
      state: "generating",
      requestId: "request-a",
      startedAt: now,
      updatedAt: now
    }
  );
}

function testStaleRuntimeStatusIsNotRestoredForever() {
  const now = 20 * 60 * 1_000;
  const normalized = normalizeAdminIngestConversationRuntimeStatusMap({
    fresh: {
      state: "generating",
      requestId: "request-fresh",
      startedAt: now - 10_000,
      updatedAt: now - 5_000
    },
    stale: {
      state: "generating",
      requestId: "request-stale",
      startedAt: 1,
      updatedAt: 1
    }
  }, now);

  assert.equal(normalized.fresh?.state, "generating");
  assert.equal(normalized.stale, undefined);
}

function testProductionWiring() {
  const toggleSource = readFileSync(
    "components/enterprise-admin/IngestModeToggle.tsx",
    "utf8"
  );
  const shellSource = readFileSync(
    "components/enterprise-admin/IngestChatGPTShell.tsx",
    "utf8"
  );

  assert.match(
    toggleSource,
    /INGEST_REMOTE_SYNC_POLL_INTERVAL_MS = 2_000/
  );
  assert.match(
    toggleSource,
    /window\.addEventListener\("focus", handleForegroundRefresh\)/
  );
  assert.match(
    toggleSource,
    /document\.addEventListener\("visibilitychange", handleForegroundRefresh\)/
  );
  assert.match(
    toggleSource,
    /conversationRuntimeStatusById:\s*remoteState\.conversationRuntimeStatusById/
  );
  assert.match(
    toggleSource,
    /thinkingStartedAt:\s*activeConversationRuntimeStatus\?\.state === "generating"/
  );
  assert.match(
    shellSource,
    /controlledThinkingStartedAt\s*\?\?\s*localThinkingStartedAt\s*\?\?\s*Date\.now\(\)/
  );
  assert.match(
    shellSource,
    /conversationRuntimeStatusById=\{conversationRuntimeStatusById\}/
  );
  assert.doesNotMatch(
    shellSource,
    /conversationRuntimeStatusById=\{isAdminApk \?/
  );
}

testRequestStartTimeSurvivesConversationSwitches();
testRuntimeStatusRoundTripsThroughAccountSnapshot();
testStaleRuntimeStatusIsNotRestoredForever();
testProductionWiring();
console.log("admin-ingest cross-client runtime sync tests passed");
