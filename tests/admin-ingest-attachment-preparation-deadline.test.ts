import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { readFile } from "node:fs/promises";
import { prepareAdminIngestAttachments } from "../lib/enterprise/admin-ingest-attachment-preparation";
import { createAdminIngestLatencyTrace, type AdminIngestLatencyEvent } from "../lib/enterprise/admin-ingest-latency-trace";
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

const image: IngestUploadState = {
  id: "image-deadline", fileName: "chat.jpg", fileType: "image/jpeg", fileSize: 100,
  status: "ready_to_send", source: "admin_ingest", platform: "web",
  syncTarget: ["web"], createdAt: "2026-10-01T00:00:00.000Z", isImage: true
};
const persisted = { ...image, persistentUrl: "/api/admin/ingest-images?id=deadline" };
const parsed: IngestUploadState = { ...image, status: "parsed", extractedText: "保留完整上下文" };
const flush = async () => { for (let index = 0; index < 12; index += 1) await Promise.resolve(); };

async function main() {
  const source = await readFile("components/enterprise-admin/IngestModeToggle.tsx", "utf8");
  assert.match(source, /maxWaitAfterPersistMs: shouldOverlapAttachmentParsing\s*\? ADMIN_INGEST_VISIBLE_PARSE_WAIT_MS\s*: undefined/);
  assert.match(source, /attachmentPreparationDeadlineReached = preparation\.parseDeadlineReached/);
  assert.match(source, /const doubaoVisibleBudgetRemainingMs = attachmentPreparationDeadlineReached \? 0 : getAdminIngestRemainingVisibleBudgetMs/);
  const actualNow = Date.now;
  const actualSetTimeout = globalThis.setTimeout;
  const actualClearTimeout = globalThis.clearTimeout;
  let clock = 1_000;
  let nextTimer = 0;
  const timers = new Map<number, { due: number; callback: () => void }>();
  Date.now = () => clock;
  globalThis.setTimeout = ((callback: () => void, delay = 0) => {
    const timer = ++nextTimer;
    timers.set(timer, { due: clock + delay, callback });
    return timer as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((timer: ReturnType<typeof setTimeout>) => {
    timers.delete(Number(timer));
  }) as typeof clearTimeout;
  const tick = async (milliseconds: number) => {
    clock += milliseconds;
    for (const [timer, scheduled] of Array.from(timers.entries())) {
      if (scheduled.due <= clock) {
        timers.delete(timer);
        scheduled.callback();
      }
    }
    await flush();
  };
  const events: AdminIngestLatencyEvent[] = [];
  const trace = () => createAdminIngestLatencyTrace({ startedAt: clock, now: () => clock, log: (event) => events.push(event) });
  const unhandled: unknown[] = [];
  const onUnhandled = (error: unknown) => unhandled.push(error);
  process.on("unhandledRejection", onUnhandled);
  try {
    // The timer starts after persistence, with OCR already in flight. A parser
    // ignoring abort must not postpone the old 180 second UI terminal state.
    const upload = deferred<IngestUploadState[]>();
    const lateParse = deferred<IngestUploadState[]>();
    const outer = new AbortController();
    let parseSignal: AbortSignal | undefined;
    let resolved = false;
    const pending = prepareAdminIngestAttachments({
      uploads: [image], controller: outer, trace: trace(), maxWaitAfterPersistMs: 180_000,
      persist: async () => upload.promise,
      parse: async (_files, signal) => { parseSignal = signal; return lateParse.promise; },
      isParseCancellation: () => false
    }).then((result) => { resolved = true; return result; });
    await flush();
    assert.ok(parseSignal);
    assert.notEqual(parseSignal, outer.signal);
    assert.equal(timers.size, 0, "upload time must not consume the old post-persistence budget");
    await tick(30_000);
    upload.resolve([persisted]);
    await flush();
    const persistedAt = clock;
    assert.equal(timers.size, 1);
    await tick(179_999);
    assert.equal(resolved, false);
    await tick(1);
    const timedOut = await pending;
    assert.equal(timedOut.preparedUploads, null);
    assert.equal(timedOut.parseDeadlineReached, true, "a reached deadline stays terminal even if the system clock later moves backward");
    assert.equal(timedOut.persistedUploads[0].persistentUrl, persisted.persistentUrl);
    assert.equal(timedOut.imagePersistCompletedAt, persistedAt);
    assert.equal(outer.signal.aborted, false, "deadline must not masquerade as user stop");
    assert.equal(parseSignal?.aborted, true);
    assert.equal(timers.size, 0);
    assert.equal(getEventListeners(outer.signal, "abort").length, 0);
    const completionEvents = events.length;
    lateParse.resolve([parsed]);
    await flush();
    assert.equal(timedOut.preparedUploads, null);
    assert.equal(events.length, completionEvents, "late OCR must not emit successful completion after the timeout");

    // A late rejection after timeout is consumed, even when the parser ignored abort.
    const lateFailure = deferred<IngestUploadState[]>();
    const rejectedLater = prepareAdminIngestAttachments({
      uploads: [image], controller: new AbortController(), trace: trace(), maxWaitAfterPersistMs: 180_000,
      persist: async () => [persisted], parse: async () => lateFailure.promise, isParseCancellation: () => false
    });
    await flush();
    await tick(180_000);
    assert.equal((await rejectedLater).preparedUploads, null);
    lateFailure.reject(new Error("uncooperative late rejection"));
    await flush();

    for (const raceWithDeadline of [false, true]) {
      const stopped = new AbortController();
      const neverParses = deferred<IngestUploadState[]>();
      const stoppedPending = prepareAdminIngestAttachments({
        uploads: [image], controller: stopped, trace: trace(), maxWaitAfterPersistMs: 180_000,
        persist: async () => [persisted], parse: async () => neverParses.promise, isParseCancellation: () => false
      });
      const rejection = assert.rejects(stoppedPending, (error: unknown) => error instanceof DOMException && error.name === "AbortError");
      await flush();
      if (raceWithDeadline) {
        clock += 180_000;
        for (const scheduled of Array.from(timers.values())) scheduled.callback();
      }
      stopped.abort(new DOMException("account changed or stopped", "AbortError"));
      await rejection;
      assert.equal(timers.size, 0);
      assert.equal(getEventListeners(stopped.signal, "abort").length, 0);
      neverParses.resolve([parsed]);
      await flush();
    }

    const uploadFailed = new AbortController();
    const uploadFailure = new Error("upload rejected");
    let failedParseSignal: AbortSignal | undefined;
    await assert.rejects(prepareAdminIngestAttachments({
      uploads: [image], controller: uploadFailed, trace: trace(), maxWaitAfterPersistMs: 180_000,
      persist: async () => { throw uploadFailure; },
      parse: async (_files, signal) => { failedParseSignal = signal; return new Promise<IngestUploadState[]>(() => undefined); },
      isParseCancellation: () => false
    }), (error: unknown) => error === uploadFailure);
    assert.equal(uploadFailed.signal.aborted, true);
    assert.equal(failedParseSignal?.aborted, true);
    assert.equal(timers.size, 0);
    assert.equal(getEventListeners(uploadFailed.signal, "abort").length, 0);

    const ordinaryFailure = new AbortController();
    const fallback = await prepareAdminIngestAttachments({
      uploads: [image], controller: ordinaryFailure, trace: trace(), maxWaitAfterPersistMs: 180_000,
      persist: async () => [persisted], parse: async () => { throw new Error("retryable OCR error"); }, isParseCancellation: () => false
    });
    assert.equal(fallback.preparedUploads, null);
    assert.equal(fallback.parseDeadlineReached, false);
    assert.equal(ordinaryFailure.signal.aborted, false);
    assert.equal(timers.size, 0);
    assert.equal(getEventListeners(ordinaryFailure.signal, "abort").length, 0);

    // DeepSeek's no-deadline path still waits for its parser with its original signal.
    const deepseekController = new AbortController();
    const deepseekParse = deferred<IngestUploadState[]>();
    let deepseekFinished = false;
    const deepseek = prepareAdminIngestAttachments({
      uploads: [image], controller: deepseekController, trace: trace(),
      persist: async () => [persisted],
      parse: async (_files, signal) => { assert.equal(signal, deepseekController.signal); return deepseekParse.promise; },
      isParseCancellation: () => false
    }).then((result) => { deepseekFinished = true; return result; });
    await flush();
    assert.equal(timers.size, 0);
    await tick(180_001);
    assert.equal(deepseekFinished, false);
    deepseekParse.resolve([parsed]);
    assert.equal((await deepseek).preparedUploads?.[0].extractedText, parsed.extractedText);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(unhandled, []);
  } finally {
    process.removeListener("unhandledRejection", onUnhandled);
    Date.now = actualNow;
    globalThis.setTimeout = actualSetTimeout;
    globalThis.clearTimeout = actualClearTimeout;
  }
  console.log("Admin ingest attachment preparation deadline tests passed.");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
