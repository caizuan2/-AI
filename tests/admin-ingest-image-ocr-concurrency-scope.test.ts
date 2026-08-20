import assert from "node:assert/strict";
import sharp from "sharp";
import { extractChatImageText } from "../lib/ai-chat/image-ocr";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

async function measureMaximumConcurrency(
  screenshot: Buffer,
  longImageSegmentConcurrency?: number,
) {
  let active = 0;
  let maximum = 0;

  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;

    const requestBody = String(init?.body ?? "");
    const segment = requestBody.match(/第 (\d+)\/(\d+) 段/);

    return new Response(JSON.stringify({
      choices: [{
        message: {
          content: `第${segment?.[1] ?? "1"}段识别正文`
        }
      }]
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;

  const result = await extractChatImageText({
    arrayBuffer: screenshot.buffer.slice(
      screenshot.byteOffset,
      screenshot.byteOffset + screenshot.byteLength,
    ) as ArrayBuffer,
    filename: "wechat-long.jpg",
    mimeType: "image/jpeg",
    longImageSegmentConcurrency,
  });

  assert.equal(result.status, "ok");
  assert.equal(result.segmentCount, 7);
  return maximum;
}

async function measureTwoAdminImagesMaximumConcurrency(screenshot: Buffer) {
  let active = 0;
  let maximum = 0;
  const arrayBuffer = screenshot.buffer.slice(
    screenshot.byteOffset,
    screenshot.byteOffset + screenshot.byteLength,
  ) as ArrayBuffer;

  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    const requestBody = String(init?.body ?? "");
    const segment = requestBody.match(/第 (\d+)\/(\d+) 段/);

    return new Response(JSON.stringify({
      choices: [{ message: { content: `第${segment?.[1] ?? "1"}段识别正文` } }]
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;

  const results = await Promise.all([
    extractChatImageText({
      arrayBuffer,
      filename: "wechat-long-a.jpg",
      mimeType: "image/jpeg",
      longImageSegmentConcurrency: 6,
    }),
    extractChatImageText({
      arrayBuffer,
      filename: "wechat-long-b.jpg",
      mimeType: "image/jpeg",
      longImageSegmentConcurrency: 6,
    })
  ]);

  assert.equal(results.every((result) => result.status === "ok"), true);
  return maximum;
}

async function main() {
  process.env.QWEN_API_KEY = "test-qwen-key";
  process.env.QWEN_VISION_MODEL = "qwen-vl-plus-test";
  delete process.env.OPENAI_API_KEY;

  const screenshot = await sharp({
    create: {
      width: 782,
      height: 13_063,
      channels: 3,
      background: { r: 248, g: 248, b: 248 }
    }
  }).jpeg({ quality: 82 }).toBuffer();

  assert.equal(
    await measureMaximumConcurrency(screenshot),
    3,
    "共享图片 OCR 必须保持用户端原有并发 3",
  );
  assert.equal(
    await measureMaximumConcurrency(screenshot, 99),
    6,
    "管理员投喂端显式提速也必须受硬上限 6 保护",
  );
  assert.equal(
    await measureTwoAdminImagesMaximumConcurrency(screenshot),
    6,
    "同时解析两张管理员长图时，进程内云 OCR 峰值仍不得超过 6",
  );

  console.log("Admin ingest image OCR concurrency scope tests passed.");
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
  });
