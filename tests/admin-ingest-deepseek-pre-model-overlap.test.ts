import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getAdminIngestRemainingVisibleBudgetMs, prepareAdminIngestAttachments } from "../lib/enterprise/admin-ingest-attachment-preparation";
import { createAdminIngestLatencyTrace, type AdminIngestLatencyEvent } from "../lib/enterprise/admin-ingest-latency-trace";
import { createAdminIngestSendPreflightGuard } from "../lib/enterprise/admin-ingest-send-preflight";
import type { IngestUploadState } from "../lib/enterprise/ingest-client";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const original: IngestUploadState = {
  id: "image-1", fileName: "chat.jpg", fileType: "image/jpeg", fileSize: 100,
  status: "ready_to_send", isImage: true, source: "admin_ingest", platform: "web",
  syncTarget: ["web"], createdAt: "2026-10-01T00:00:00.000Z", previewUrl: "blob:local"
};
const persisted: IngestUploadState = { ...original, previewUrl: "/api/admin/ingest-images?id=1", persistentUrl: "/api/admin/ingest-images?id=1" };
const parsed: IngestUploadState = {
  ...original, status: "parsed", extractedText: "客户：一般般\n完整上下文",
  currentTurnState: "reply_required", recognitionMode: "wechat_conversation"
};
const noopTrace = () => createAdminIngestLatencyTrace({ log: () => undefined });
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

async function main() {
  const source = await readFile("components/enterprise-admin/IngestModeToggle.tsx", "utf8");
  const parseRoute = await readFile("app/api/admin/kb/ingest/files/parse/route.ts", "utf8");
  assert.match(source, /attachmentProvider === "deepseek-pro"[\s\S]*?attachmentProvider === "deepseek-flash"[\s\S]*?attachmentProvider === "doubao-pro"/);
  assert.match(source, /parseUploadedFilesForGpt\(files, 2, \{\s*modelProvider: attachmentProvider,[\s\S]*?strictModelAffinity: true[\s\S]*?pageBatchSize: 4/);
  assert.match(source, /const preparedUploads = preparedAttachmentUploads \?\? await parseUploadedFilesForGpt\(composerUploads/);
  assert.match(source, /historyScopeRef\.current !== requestHistoryScope[\s\S]*?reloadForAccountHistoryChange\(\);[\s\S]*?return null;/);
  assert.match(parseRoute, /modelAffinity\?\.modelProvider === "deepseek-pro"[\s\S]*?modelAffinity\?\.modelProvider === "deepseek-flash"[\s\S]*?\? "tail_strict" as const\s*: "global" as const/);

  // Execute the actual UI preflight gate: an account mismatch must prevent both tasks.
  const gateStart = source.indexOf("    let composerUploads = resolveIngestSendAttachments", source.indexOf("async function handleSend("));
  const gateEnd = source.indexOf("    if (!hasActiveAgent)", gateStart);
  assert.ok(gateStart > 0 && gateEnd > gateStart);
  const gate = new Function("resolveIngestSendAttachments", "uploadedFiles", "options", "requestModelOption", "verifyCurrentAccountHistoryScope", "latencyTrace", "prepare", "context", `const {sendPreflightGuardRef, historyScope, requestHistoryScope, requestConversationId, activeAgent, isAccountTransitioningRef, historyScopeRef, activeAgentIdRef, activeConversationIdRef, setNoticeMessage} = context; return (async () => { ${source.slice(gateStart, gateEnd)} return prepare(); })();`);
  const gateContext = () => ({
    sendPreflightGuardRef: { current: createAdminIngestSendPreflightGuard() },
    historyScope: "account-1", requestHistoryScope: "account-1", requestConversationId: "conversation-1",
    activeAgent: { id: "agent-1" }, isAccountTransitioningRef: { current: false },
    historyScopeRef: { current: "account-1" }, activeAgentIdRef: { current: "agent-1" },
    activeConversationIdRef: { current: "conversation-1" }, setNoticeMessage: () => undefined
  });
  let authChecks = 0;
  let tasksStarted = 0;
  const gateImage = { ...original, rawFile: {} };
  for (const provider of ["deepseek-pro", "deepseek-flash", "doubao-pro"]) {
    const result = await gate(() => [gateImage], [], undefined, { provider }, async () => { authChecks += 1; return false; }, noopTrace(), async () => { tasksStarted += 1; }, gateContext());
    assert.equal(result, null);
  }
  assert.equal(authChecks, 3);
  assert.equal(tasksStarted, 0);
  await gate(() => [], [], undefined, { provider: "doubao-pro" }, async () => { throw new Error("plain text must retain existing auth transport"); }, noopTrace(), async () => { tasksStarted += 1; }, gateContext());
  assert.equal(tasksStarted, 1);

  // Each timing belongs to its own promise, not the later Promise.all join.
  const upload = deferred<IngestUploadState[]>();
  const ocr = deferred<IngestUploadState[]>();
  const events: AdminIngestLatencyEvent[] = [];
  const starts: string[] = [];
  const controller = new AbortController();
  let clock = 1_000;
  const actualNow = Date.now;
  Date.now = () => clock;
  try {
    const preparation = prepareAdminIngestAttachments({
      uploads: [original], controller,
      trace: createAdminIngestLatencyTrace({ startedAt: clock, now: () => clock, log: (event) => events.push(event) }),
      persist: async (files, signal) => { assert.equal(files[0], original); assert.equal(signal, controller.signal); starts.push("persist"); return upload.promise; },
      parse: async (files, signal) => { assert.equal(files[0], original); assert.equal(signal, controller.signal); starts.push("parse"); return ocr.promise; },
      isParseCancellation: () => false
    });
    await flush();
    assert.deepEqual(starts, ["persist", "parse"]);
    clock = 1_030;
    upload.resolve([persisted]);
    await flush();
    assert.equal(events[0]?.stage, "image_persist_completed");
    assert.equal(events[0]?.durationMs, 30);
    clock = 1_090;
    ocr.resolve([parsed]);
    const result = await preparation;
    assert.equal(events[1]?.durationMs, 90);
    assert.equal(result.imagePersistCompletedAt, 1_030);
    assert.equal(result.preparedUploads?.[0].persistentUrl, persisted.persistentUrl);
    assert.equal(result.preparedUploads?.[0].previewUrl, persisted.previewUrl);
    assert.equal(result.preparedUploads?.[0].extractedText, parsed.extractedText);
    assert.equal(result.preparedUploads?.[0].currentTurnState, "reply_required");
    let fallbackCalls = 0;
    const files = result.preparedUploads ?? await (async () => { fallbackCalls += 1; return []; })();
    assert.equal(files[0].extractedText, parsed.extractedText);
    assert.equal(fallbackCalls, 0, "success must not trigger duplicate OCR");
  } finally {
    Date.now = actualNow;
  }

  assert.equal(getAdminIngestRemainingVisibleBudgetMs({ provider: "doubao-pro", budgetMs: 180_000, imagePersistCompletedAt: 1_030, now: 61_030 }), 120_000);
  assert.equal(getAdminIngestRemainingVisibleBudgetMs({ provider: "doubao-pro", budgetMs: 180_000, imagePersistCompletedAt: 1_030, now: 181_030 }), 0);
  assert.equal(getAdminIngestRemainingVisibleBudgetMs({ provider: "doubao-pro", budgetMs: 180_000, imagePersistCompletedAt: 1_030, now: 201_030 }), 0);
  assert.equal(getAdminIngestRemainingVisibleBudgetMs({ provider: "doubao-pro", budgetMs: 180_000, imagePersistCompletedAt: null, now: 201_030 }), 180_000);
  assert.equal(getAdminIngestRemainingVisibleBudgetMs({ provider: "deepseek-pro", budgetMs: 180_000, imagePersistCompletedAt: 1_030, now: 201_030 }), 180_000);
  assert.equal(getAdminIngestRemainingVisibleBudgetMs({ provider: "deepseek-flash", budgetMs: 180_000, imagePersistCompletedAt: 1_030, now: 201_030 }), 180_000);

  const budgetGateStart = source.indexOf("      if (\n        shouldApplyAdminIngestDoubaoVisibleBudget", source.indexOf("const expireDoubaoVisibleBudget"));
  const budgetGateEnd = source.indexOf("      if (composerUploads.length > 0)", budgetGateStart);
  assert.ok(budgetGateStart > 0 && budgetGateEnd > budgetGateStart);
  const budgetGate = new Function("shouldApplyAdminIngestDoubaoVisibleBudget", "requestModelOption", "doubaoVisibleBudgetRemainingMs", "expireDoubaoVisibleBudget", "createAdminIngestDoubaoVisibleTimeoutError", "currentModelLabel", "invokeModel", `${source.slice(budgetGateStart, budgetGateEnd)} return invokeModel();`);
  let modelCalls = 0;
  let expiredCalls = 0;
  const runBudgetGate = (provider: string, remaining: number) => budgetGate(
    (value: string) => value === "doubao-pro", { provider }, remaining,
    () => { expiredCalls += 1; }, () => new Error("existing timeout card"), "selected model", () => { modelCalls += 1; }
  );
  assert.throws(() => runBudgetGate("doubao-pro", 0), /existing timeout card/);
  assert.equal(expiredCalls, 1);
  assert.equal(modelCalls, 0, "expired preparation must never call the model");
  runBudgetGate("doubao-pro", 120_000);
  runBudgetGate("deepseek-pro", 0);
  assert.equal(modelCalls, 2);
  assert.match(source, /window\.setTimeout\(\s*expireDoubaoVisibleBudget,\s*doubaoVisibleBudgetRemainingMs\s*\)/);

  const parseFailure = await prepareAdminIngestAttachments({
    uploads: [original], controller: new AbortController(), trace: noopTrace(),
    persist: async () => [persisted], parse: async () => { throw new Error("temporary parse failure"); },
    isParseCancellation: () => false
  });
  assert.equal(parseFailure.preparedUploads, null);
  assert.equal(parseFailure.persistedUploads[0].persistentUrl, persisted.persistentUrl);

  for (const cancellation of [new DOMException("cancel", "AbortError"), new Error("parser cancellation")]) {
    await assert.rejects(prepareAdminIngestAttachments({
      uploads: [original], controller: new AbortController(), trace: noopTrace(),
      persist: async () => [persisted], parse: async () => { throw cancellation; },
      isParseCancellation: (error) => error === cancellation
    }), (error: unknown) => error instanceof DOMException && error.name === "AbortError");
  }

  // An account change/stop must win even if an uncooperative parser resolves.
  const changedAccountController = new AbortController();
  await assert.rejects(prepareAdminIngestAttachments({
    uploads: [original], controller: changedAccountController, trace: noopTrace(),
    persist: async () => [persisted], parse: async () => { changedAccountController.abort(); return [parsed]; },
    isParseCancellation: () => false
  }), (error: unknown) => error instanceof DOMException && error.name === "AbortError");

  const failedUploadController = new AbortController();
  const uploadError = new Error("persistence failed");
  await assert.rejects(prepareAdminIngestAttachments({
    uploads: [original], controller: failedUploadController, trace: noopTrace(),
    persist: async () => { throw uploadError; },
    parse: async (_files, signal) => new Promise<IngestUploadState[]>((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })),
    isParseCancellation: () => false
  }), (error: unknown) => error === uploadError);
  assert.equal(failedUploadController.signal.aborted, true);

  const alreadyCancelled = new AbortController();
  alreadyCancelled.abort();
  await assert.rejects(prepareAdminIngestAttachments({
    uploads: [original], controller: alreadyCancelled, trace: noopTrace(),
    persist: async () => { throw new Error("must not start upload"); },
    parse: async () => { throw new Error("must not start parse"); },
    isParseCancellation: () => false
  }), (error: unknown) => error instanceof DOMException && error.name === "AbortError");

  console.log("admin ingest DeepSeek / Doubao pre-model overlap tests passed");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
