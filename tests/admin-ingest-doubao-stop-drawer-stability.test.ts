import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ADMIN_INGEST_DOUBAO_VISIBLE_BUDGET_MS,
  ADMIN_INGEST_DOUBAO_VISIBLE_TIMEOUT_CODE,
  createAdminIngestDoubaoVisibleTimeoutError,
  isAdminIngestDoubaoVisibleTimeoutError,
  shouldApplyAdminIngestDoubaoVisibleBudget
} from "../lib/enterprise/admin-ingest-doubao-visible-budget";
import {
  resolveAdminIngestHistoryDisplayState
} from "../lib/enterprise/admin-ingest-history-load-state";
import {
  cancelRequest,
  createIngestQueueState,
  enqueueRequest,
  getNextQueuedRequest,
  startRequest
} from "../lib/enterprise/ingest-request-queue";

function testDoubaoVisibleAnswerBudget() {
  assert.equal(ADMIN_INGEST_DOUBAO_VISIBLE_BUDGET_MS, 120_000);
  assert.equal(shouldApplyAdminIngestDoubaoVisibleBudget("doubao-pro"), true);
  assert.equal(shouldApplyAdminIngestDoubaoVisibleBudget("deepseek-pro"), false);

  const error = createAdminIngestDoubaoVisibleTimeoutError("Doubao Seed");
  assert.equal(error.name, ADMIN_INGEST_DOUBAO_VISIBLE_TIMEOUT_CODE);
  assert.equal(isAdminIngestDoubaoVisibleTimeoutError(error), true);
  assert.match(error.message, /120 秒/);
}

function testCancelClearsOnlyTheMatchingConversationQueue() {
  let queue = createIngestQueueState();
  queue = startRequest(queue, "conversation-a", "request-a");
  queue = enqueueRequest(queue, {
    conversationId: "conversation-a",
    prompt: "不应在停止后重新发送",
    createdAt: 1
  });
  queue = startRequest(queue, "conversation-b", "request-b");

  const mismatch = cancelRequest(queue, "conversation-a", "stale-request");
  assert.deepEqual(mismatch, queue);

  const cancelled = cancelRequest(queue, "conversation-a", "request-a");
  assert.equal(getNextQueuedRequest(cancelled, "conversation-a"), null);
  assert.equal(cancelled["conversation-a"]?.activeRequestId, undefined);
  assert.equal(cancelled["conversation-b"]?.activeRequestId, "request-b");

  const queuedAfterCompletion = enqueueRequest(cancelled, {
    conversationId: "conversation-a",
    prompt: "新一轮待发送内容",
    createdAt: 2
  });
  const lateStop = cancelRequest(
    queuedAfterCompletion,
    "conversation-a",
    "request-a"
  );
  assert.deepEqual(lateStop, queuedAfterCompletion);
}

function testHistoryDisplayStateNeverTreatsLoadingAsEmpty() {
  assert.equal(
    resolveAdminIngestHistoryDisplayState({
      loadState: "loading",
      agentCount: 0
    }),
    "loading"
  );
  assert.equal(
    resolveAdminIngestHistoryDisplayState({
      loadState: "error",
      agentCount: 0
    }),
    "error"
  );
  assert.equal(
    resolveAdminIngestHistoryDisplayState({
      loadState: "ready",
      agentCount: 0
    }),
    "empty"
  );
  assert.equal(
    resolveAdminIngestHistoryDisplayState({
      loadState: "loading",
      agentCount: 2
    }),
    "agents"
  );
}

async function testProductionWiringAndFrozenProviderBoundary() {
  const modeToggle = await readFile(
    "components/enterprise-admin/IngestModeToggle.tsx",
    "utf8"
  );
  const shell = await readFile(
    "components/enterprise-admin/IngestChatGPTShell.tsx",
    "utf8"
  );
  const changedFiles = [
    "components/enterprise-admin/IngestModeToggle.tsx",
    "components/enterprise-admin/IngestChatGPTShell.tsx",
    "lib/enterprise/ingest-request-queue.ts",
    "lib/enterprise/admin-ingest-doubao-visible-budget.ts",
    "lib/enterprise/admin-ingest-history-load-state.ts"
  ];

  assert.match(
    modeToggle,
    /shouldApplyAdminIngestDoubaoVisibleBudget\(requestModelOption\.provider\)/
  );
  assert.match(
    modeToggle,
    /cancelledIngestRequestIdsRef\.current\.add\(requestId\)/
  );
  assert.match(
    modeToggle,
    /fallbackUsed:\s*doubaoVisibleBudgetTimedOut\s*\?\s*false/
  );
  assert.match(
    modeToggle,
    /if \(doubaoVisibleBudgetTimedOut\) \{\s*throw createAdminIngestDoubaoVisibleTimeoutError/
  );
  assert.match(
    modeToggle,
    /\|\| doubaoVisibleBudgetTimedOut\s*\|\| shouldIgnoreRequestResult/
  );
  assert.match(
    modeToggle,
    /agentHistoryLoadState:\s*historyLoadState/
  );
  assert.match(
    modeToggle,
    /preserveHistoryDuringHydrationRef\.current = true/
  );
  assert.match(
    modeToggle,
    /if \(!preserveCurrentHistory\) \{\s*historyScopeRef\.current = ""/
  );
  assert.match(shell, /正在同步 Agent 和历史记录/);
  assert.match(shell, /同步失败，已保留上次成功记录/);
  assert.match(shell, /Agent 列表同步失败/);
  assert.match(shell, /重新同步/);

  for (const file of changedFiles) {
    assert.doesNotMatch(file, /provider|deepseek|doubao.*route|prisma/i);
  }
}

async function main() {
  testDoubaoVisibleAnswerBudget();
  testCancelClearsOnlyTheMatchingConversationQueue();
  testHistoryDisplayStateNeverTreatsLoadingAsEmpty();
  await testProductionWiringAndFrozenProviderBoundary();
  console.log("Admin ingest Doubao, stop, and drawer stability tests passed.");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
