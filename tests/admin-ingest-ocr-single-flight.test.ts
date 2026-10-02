import assert from "node:assert/strict";
import {
  buildAdminIngestOcrCacheKey,
  clearAdminIngestOcrCache,
  readAdminIngestOcrCache,
  runAdminIngestOcrSingleFlight
} from "../lib/enterprise/admin-ingest-ocr-cache";

type Result = { complete: boolean; pages: string[] };
const good = (): Result => ({ complete: true, pages: ["完整上下文"] });
const canCache = (value: Result) => value.complete;
function key(accountScope = "account-a", variant = "wechat:full_answer:global", bytes = "image", pipelineVersion = "v5") {
  return buildAdminIngestOcrCacheKey({ accountScope, variant, bytes: Buffer.from(bytes), pipelineVersion });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}
const isAbort = (error: unknown) => error instanceof Error && error.name === "AbortError";

async function main() {
  clearAdminIngestOcrCache();
  const task = deferred<Result>();
  let calls = 0;
  const parse = () => { calls += 1; return task.promise; };
  const first = runAdminIngestOcrSingleFlight({ key: key(), parse, canCache });
  const second = runAdminIngestOcrSingleFlight({ key: key(), parse, canCache });
  await Promise.resolve();
  assert.equal(calls, 1, "同账号同图并发只能执行一次解析");
  const original = good();
  task.resolve(original);
  const [a, b] = await Promise.all([first, second]);
  a.pages.push("调用方修改");
  original.pages.push("生产方修改");
  assert.deepEqual(b.pages, ["完整上下文"]);
  assert.deepEqual(readAdminIngestOcrCache<Result>(key())?.pages, ["完整上下文"]);

  clearAdminIngestOcrCache();
  const variants = [key(), key("account-b"), key("account-a", "wechat:reply_script:global"),
    key("account-a", "wechat:full_answer:tail_strict"), key("account-a", undefined, "other-image"),
    key("account-a", undefined, undefined, "next-pipeline")];
  const isolated = deferred<Result>();
  calls = 0;
  const independent = variants.map((cacheKey) => runAdminIngestOcrSingleFlight({
    key: cacheKey, canCache, parse: () => { calls += 1; return isolated.promise; }
  }));
  await Promise.resolve();
  assert.equal(calls, variants.length, "账号、输出模式、角色策略、图片字节和pipeline不得混用");
  isolated.resolve(good());
  await Promise.all(independent);

  clearAdminIngestOcrCache();
  const failure = deferred<Result>();
  const failed = [0, 1].map(() => runAdminIngestOcrSingleFlight({ key: key(), canCache, parse: () => failure.promise }));
  const failureChecks = failed.map((promise) => assert.rejects(promise, /OCR failed/));
  failure.reject(new Error("OCR failed"));
  await Promise.all(failureChecks);
  assert.equal(readAdminIngestOcrCache(key()), null);
  assert.deepEqual(await runAdminIngestOcrSingleFlight({ key: key(), canCache, parse: async () => good() }), good());

  clearAdminIngestOcrCache();
  calls = 0;
  const parsePartial = async () => { calls += 1; return { complete: false, pages: [] }; };
  await runAdminIngestOcrSingleFlight({ key: key(), canCache, parse: parsePartial });
  await runAdminIngestOcrSingleFlight({ key: key(), canCache, parse: parsePartial });
  assert.equal(calls, 2, "未完成结果不能缓存，下一次必须重试");
  assert.equal(readAdminIngestOcrCache(key()), null);

  clearAdminIngestOcrCache();
  const shared = deferred<Result>();
  const one = new AbortController();
  let producerSignal!: AbortSignal;
  const cancelled = runAdminIngestOcrSingleFlight({
    key: key(), canCache, signal: one.signal,
    parse: (signal) => { producerSignal = signal; return shared.promise; }
  });
  const retained = runAdminIngestOcrSingleFlight({ key: key(), canCache, parse: async () => { throw new Error("must join"); } });
  const cancelledCheck = assert.rejects(cancelled, isAbort);
  await Promise.resolve();
  one.abort();
  await cancelledCheck;
  assert.equal(producerSignal.aborted, false, "首调用取消不能影响仍然等待的调用");
  shared.resolve(good());
  assert.deepEqual(await retained, good());

  clearAdminIngestOcrCache();
  const stale = deferred<Result>();
  const all = new AbortController();
  let staleSignal!: AbortSignal;
  const abandoned = runAdminIngestOcrSingleFlight({
    key: key(), canCache, signal: all.signal,
    parse: (signal) => { staleSignal = signal; return stale.promise; }
  });
  const abandonedCheck = assert.rejects(abandoned, isAbort);
  await Promise.resolve();
  all.abort();
  await abandonedCheck;
  assert.equal(staleSignal.aborted, true);
  const fresh = deferred<Result>();
  calls = 0;
  const freshFirst = runAdminIngestOcrSingleFlight({ key: key(), canCache, parse: () => { calls += 1; return fresh.promise; } });
  stale.resolve({ complete: true, pages: ["已取消的旧结果"] });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(readAdminIngestOcrCache(key()), null, "取消后的迟到结果不能写入缓存");
  const freshSecond = runAdminIngestOcrSingleFlight({ key: key(), canCache, parse: async () => { calls += 1; return good(); } });
  fresh.resolve(good());
  await Promise.all([freshFirst, freshSecond]);
  assert.equal(calls, 1, "旧任务结束不能删除或污染新任务");
  assert.deepEqual(readAdminIngestOcrCache<Result>(key())?.pages, ["完整上下文"]);

  const alreadyAborted = new AbortController();
  alreadyAborted.abort();
  await assert.rejects(runAdminIngestOcrSingleFlight({
    key: key(), canCache, signal: alreadyAborted.signal,
    parse: async () => { throw new Error("must not start"); }
  }), isAbort);
  console.log("Admin ingest OCR single-flight tests passed: deduplication, scope, failure/partial retry, cancellation, cloning.");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(clearAdminIngestOcrCache);
