import assert from "node:assert/strict";
import Module from "node:module";
import { clearAdminIngestOcrCache } from "../lib/enterprise/admin-ingest-ocr-cache";

const moduleLoader = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleLoader._load;
const originalFetch = globalThis.fetch;
let calls = 0;
let lowConfidence = false;
let release: () => void = () => undefined;
let waiting = new Promise<void>((resolve) => { release = resolve; });
let producerSignal: AbortSignal | undefined;
moduleLoader._load = (request, parent, isMain) => {
  if (request.endsWith("/ingest-local-ocr")) {
    return {
      extractAdminIngestLocalOcrText: async ({ signal }: { signal?: AbortSignal }) => {
        calls += 1;
        producerSignal = signal;
        await waiting;
        return { status: "ok", text: "完整原图上下文", provider: "local-test", model: "ocr-test", lowConfidence };
      },
      extractAdminIngestWechatConversationText: () => { throw new Error("unexpected role OCR"); }
    };
  }
  if (request.endsWith("/admin-ingest-wechat-image-detection")) {
    return { detectAdminIngestWechatConversationImage: async () => ({ detected: false }) };
  }
  return originalLoad(request, parent, isMain);
};
const { parseAdminIngestFile } = require("../lib/enterprise/ingest-file-parser") as typeof import("../lib/enterprise/ingest-file-parser");
moduleLoader._load = originalLoad;
globalThis.fetch = async () => { throw new Error("Network is forbidden in this OCR test"); };

const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function parse(fileName: string, signal?: AbortSignal, cacheAccountScope: string | undefined = "same-account") {
  return parseAdminIngestFile({ fileName, mimeType: "image/png", sizeBytes: buffer.length, buffer, cacheAccountScope, signal });
}
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

async function main() {
  clearAdminIngestOcrCache();
  const firstController = new AbortController();
  const first = parse("first.png", firstController.signal);
  const second = parse("second.png");
  const firstCheck = assert.rejects(first, (error: unknown) => error instanceof Error && error.name === "AbortError");
  await tick();
  assert.equal(calls, 1, "真实parser入口的同图并发只调用一次OCR");
  firstController.abort();
  await firstCheck;
  assert.equal(producerSignal?.aborted, false);
  release();
  const result = await second;
  assert.equal(result.fileName, "second.png", "缓存只共享正文，不能共享附件身份");
  assert.equal(result.extractedText, "完整原图上下文");
  assert.equal(result.parseStatus, "parsed");
  result.pageSummaries.push("外部修改");
  const cached = await parse("third.png");
  assert.equal(calls, 1, "已完成OCR应命中已有缓存");
  assert.equal(cached.fileName, "third.png");
  assert.deepEqual(cached.pageSummaries, ["完整原图上下文"]);

  clearAdminIngestOcrCache();
  lowConfidence = true;
  waiting = Promise.resolve();
  const beforePartial = calls;
  assert.equal((await parse("partial.png")).parseStatus, "partial");
  assert.equal((await parse("retry.png")).parseStatus, "partial");
  assert.equal(calls - beforePartial, 2, "低置信度结果必须重新识别，不能缓存失败证据");
  lowConfidence = false;
  const beforeUnscoped = calls;
  await Promise.all([parse("unscoped-a.png", undefined, ""), parse("unscoped-b.png", undefined, "")]);
  assert.equal(calls - beforeUnscoped, 2, "没有账号scope时绝不能共享OCR");
  console.log("Admin ingest OCR parser single-flight integration tests passed: single parse, cancellation isolation, cache, identity, partial/unscoped safety.");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
  moduleLoader._load = originalLoad;
  globalThis.fetch = originalFetch;
  clearAdminIngestOcrCache();
});
