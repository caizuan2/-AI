import assert from "node:assert/strict";
import sharp from "sharp";
import { parseAdminIngestFile } from "../lib/enterprise/ingest-file-parser";
import { clearAdminIngestOcrCache } from "../lib/enterprise/admin-ingest-ocr-cache";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

async function main() {
  process.env.QWEN_API_KEY = "test-qwen-key";
  process.env.QWEN_VISION_MODEL = "qwen-vl-plus-test";
  delete process.env.OPENAI_API_KEY;

  const longScreenshot = await sharp({
    create: {
      width: 782,
      height: 13_063,
      channels: 3,
      background: "#f5f5f5"
    }
  })
    .jpeg({ quality: 82 })
    .toBuffer();
  let requestCount = 0;
  let activeRequestCount = 0;
  let maxActiveRequestCount = 0;

  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    requestCount += 1;
    activeRequestCount += 1;
    maxActiveRequestCount = Math.max(maxActiveRequestCount, activeRequestCount);
    const requestBody = String(init?.body ?? "");
    const segment = requestBody.match(/第 (\d+)\/(\d+) 段/);
    const segmentNumber = Number(segment?.[1] ?? 1);

    await new Promise((resolve) => setTimeout(resolve, 5));
    activeRequestCount -= 1;

    return new Response(JSON.stringify({
      choices: [{
        message: {
          content: [
            `客户(左侧)：最近对话问题${segmentNumber}`,
            `我(右侧)：最近回复${segmentNumber}`
          ].join("\n")
        }
      }]
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;

  const replyScriptResult = await parseAdminIngestFile({
    fileName: "wechat-long.jpg",
    mimeType: "image/jpeg",
    sizeBytes: longScreenshot.byteLength,
    buffer: longScreenshot,
    recognitionMode: "wechat_conversation",
    wechatOutputMode: "reply_script",
    cacheAccountScope: "account-a"
  });

  assert.equal(replyScriptResult.parseStatus, "parsed");
  assert.equal(replyScriptResult.totalPages, 3);
  assert.equal(requestCount, 3);
  assert.match(
    replyScriptResult.limitationNote,
    /只识别长截图底部最近对话区域/
  );
  assert.match(replyScriptResult.extractedText, /最近客户消息/);
  assert.ok(maxActiveRequestCount > 1);
  assert.ok(maxActiveRequestCount <= 6);

  const cachedReplyScriptResult = await parseAdminIngestFile({
    fileName: "wechat-long-renamed.jpg",
    mimeType: "image/jpeg",
    sizeBytes: longScreenshot.byteLength,
    buffer: longScreenshot,
    recognitionMode: "wechat_conversation",
    wechatOutputMode: "reply_script",
    cacheAccountScope: "account-a"
  });

  assert.equal(requestCount, 3);
  assert.equal(cachedReplyScriptResult.fileName, "wechat-long-renamed.jpg");
  assert.equal(cachedReplyScriptResult.extractedText, replyScriptResult.extractedText);

  requestCount = 0;
  maxActiveRequestCount = 0;
  const fullAnswerResult = await parseAdminIngestFile({
    fileName: "wechat-long.jpg",
    mimeType: "image/jpeg",
    sizeBytes: longScreenshot.byteLength,
    buffer: longScreenshot,
    recognitionMode: "wechat_conversation",
    wechatOutputMode: "full_answer",
    cacheAccountScope: "account-a"
  });

  assert.equal(fullAnswerResult.parseStatus, "partial");
  assert.equal(fullAnswerResult.totalPages, 7);
  assert.equal(requestCount, 7);
  assert.match(fullAnswerResult.extractedText, /【当前回合角色核验】证据不足/);
  assert.doesNotMatch(
    fullAnswerResult.limitationNote,
    /只识别长截图底部最近对话区域/
  );
  assert.ok(maxActiveRequestCount > 1);
  assert.ok(maxActiveRequestCount <= 6);

  const cachedFullAnswerResult = await parseAdminIngestFile({
    fileName: "wechat-long.jpg",
    mimeType: "image/jpeg",
    sizeBytes: longScreenshot.byteLength,
    buffer: longScreenshot,
    recognitionMode: "wechat_conversation",
    wechatOutputMode: "full_answer",
    cacheAccountScope: "account-a"
  });

  assert.equal(requestCount, 14);
  assert.equal(cachedFullAnswerResult.extractedText, fullAnswerResult.extractedText);

  await parseAdminIngestFile({
    fileName: "wechat-long.jpg",
    mimeType: "image/jpeg",
    sizeBytes: longScreenshot.byteLength,
    buffer: longScreenshot,
    recognitionMode: "wechat_conversation",
    wechatOutputMode: "full_answer",
    cacheAccountScope: "account-b"
  });

  assert.equal(requestCount, 21);

  console.log("Admin ingest WeChat fast-path tests passed.");
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    clearAdminIngestOcrCache();
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
  });
