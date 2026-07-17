import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import sharp from "sharp";
import {
  createChatImageOcrMetadata,
  extractChatImageText
} from "../lib/ai-chat/image-ocr";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

function restoreRuntime() {
  process.env = { ...originalEnv };
  globalThis.fetch = originalFetch;
}

function toArrayBuffer(value: Uint8Array) {
  return value.buffer.slice(
    value.byteOffset,
    value.byteOffset + value.byteLength,
  ) as ArrayBuffer;
}

function occurrenceCount(value: string, search: string) {
  return value.split(search).length - 1;
}

async function main() {
  delete process.env.QWEN_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.CHAT_IMAGE_OCR_PROVIDER;

  const unavailable = await extractChatImageText({
    arrayBuffer: new Uint8Array([1, 2, 3]).buffer,
    filename: "wechat.png",
    mimeType: "image/png"
  });

  assert.equal(unavailable.status, "unavailable");
  assert.equal(unavailable.text, "");

  process.env.QWEN_API_KEY = "test-qwen-key";
  process.env.QWEN_VISION_MODEL = "qwen-vl-plus-test";

  const calls: Array<{ input: unknown; init?: RequestInit }> = [];

  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    calls.push({ input, init });

    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: "客户说：这张微信截图里的套餐怎么解释？"
            }
          }
        ]
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }) as typeof fetch;

  const ocrResult = await extractChatImageText({
    arrayBuffer: new Uint8Array([4, 5, 6]).buffer,
    filename: "wechat.png",
    mimeType: "image/png"
  });

  assert.equal(ocrResult.status, "ok");
  assert.equal(ocrResult.provider, "qwen");
  assert.equal(ocrResult.model, "qwen-vl-plus-test");
  assert.equal(ocrResult.text, "客户说：这张微信截图里的套餐怎么解释？");
  assert.equal(calls.length, 1);
  assert.match(String(calls[0].input), /\/chat\/completions$/);
  assert.match(String(calls[0].init?.body), /image_url/);
  assert.match(String(calls[0].init?.body), /左侧头像\/白色气泡=客户/);
  assert.match(String(calls[0].init?.body), /右侧头像\/绿色气泡=我\/用户/);
  assert.match(String(calls[0].init?.body), /客户\(左侧\).*我\(右侧\)/);

  const metadata = createChatImageOcrMetadata(ocrResult);

  assert.equal(metadata.ocrStatus, "ok");
  assert.equal(metadata.ocrText, "客户说：这张微信截图里的套餐怎么解释？");
  assert.equal(metadata.ocrProvider, "qwen");
  assert.equal(metadata.ocrModel, "qwen-vl-plus-test");

  const nonImage = await extractChatImageText({
    arrayBuffer: new Uint8Array([7, 8, 9]).buffer,
    filename: "note.txt",
    mimeType: "text/plain"
  });

  assert.deepEqual(createChatImageOcrMetadata(nonImage), {});
  assert.equal(nonImage.status, "skipped_non_image");

  const landscapePhoto = await sharp({
    create: {
      width: 4032,
      height: 3024,
      channels: 3,
      background: "#d8e8f8"
    }
  })
    .jpeg({ quality: 80 })
    .toBuffer();
  let landscapeCalls = 0;

  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    const body = String(init?.body ?? "");

    landscapeCalls += 1;
    assert.doesNotMatch(body, /同一张纵向长截图/);
    assert.match(body, /data:image\/jpeg;base64/);

    return new Response(
      JSON.stringify({ choices: [{ message: { content: "普通照片文字" } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  const landscapeResult = await extractChatImageText({
    arrayBuffer: toArrayBuffer(landscapePhoto),
    filename: "camera-landscape.jpg",
    mimeType: "image/jpeg"
  });

  assert.equal(landscapeResult.status, "ok");
  assert.equal(landscapeResult.strategy, undefined);
  assert.equal(landscapeCalls, 1);

  const longImageSvg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="880" height="11632">',
    '<rect width="880" height="11632" fill="#ffffff"/>',
    '<rect y="0" width="880" height="1939" fill="#fde2e2"/>',
    '<rect y="1939" width="880" height="1939" fill="#e2f0fd"/>',
    '<rect y="3878" width="880" height="1939" fill="#e5fde2"/>',
    '<rect y="5817" width="880" height="1939" fill="#fff4d6"/>',
    '<rect y="7756" width="880" height="1939" fill="#eee2fd"/>',
    '<rect y="9695" width="880" height="1937" fill="#dff8f3"/>',
    '</svg>'
  ].join("");
  const longImage = await sharp(Buffer.from(longImageSvg))
    .jpeg({ quality: 85 })
    .toBuffer();
  const longCalls: Array<{ body: string; segmentNumber: number }> = [];
  const longSegmentHashes = new Set<string>();
  const longSegmentHeights: number[] = [];
  let activeCalls = 0;
  let maxActiveCalls = 0;

  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    const body = String(init?.body ?? "");
    const match = body.match(/第 (\d+)\/(\d+) 段/);
    const segmentNumber = Number(match?.[1] ?? 0);
    const segmentTotal = Number(match?.[2] ?? 0);

    assert.equal(segmentTotal, 6);
    assert.match(body, /同一张纵向长截图/);
    assert.match(body, /客户\(左侧\).*我\(右侧\)/);
    assert.match(body, /data:image\/png;base64/);
    const dataUrlMatch = body.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/);

    assert.ok(dataUrlMatch?.[1]);
    const segmentBuffer = Buffer.from(dataUrlMatch[1], "base64");
    const segmentMetadata = await sharp(segmentBuffer).metadata();

    assert.equal(segmentMetadata.width, 880);
    assert.equal((segmentMetadata.height ?? 0) >= 2200, true);
    assert.equal((segmentMetadata.height ?? 0) <= 2300, true);
    longSegmentHeights.push(segmentMetadata.height ?? 0);
    longSegmentHashes.add(createHash("sha256").update(segmentBuffer).digest("hex"));
    longCalls.push({ body, segmentNumber });
    activeCalls += 1;
    maxActiveCalls = Math.max(maxActiveCalls, activeCalls);

    await new Promise((resolve) => setTimeout(resolve, (7 - segmentNumber) * 2));
    activeCalls -= 1;

    if (segmentNumber === 3) {
      return new Response("temporary segment failure", { status: 500 });
    }

    const segmentText = new Map<number, string>([
      [1, "客户(左侧)：第一句\n我(右侧)：边界重复句"],
      [2, "我(右侧)：边界重复句\n客户(左侧)：第二句"],
      [4, "客户(左侧)：第四句"],
      [5, "客户(左侧)：第五句"],
      [6, "客户(左侧)：最后一个真实问题怎么回复？"]
    ]).get(segmentNumber) ?? "";

    return new Response(
      JSON.stringify({
        choices: [{ message: { content: segmentText } }]
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  }) as typeof fetch;

  const longResult = await extractChatImageText({
    arrayBuffer: toArrayBuffer(longImage),
    filename: "wechat-long.jpg",
    mimeType: "image/jpeg"
  });

  assert.equal(longCalls.length, 6);
  assert.equal(longSegmentHashes.size, 6);
  assert.equal(longSegmentHeights.length, 6);
  assert.equal(maxActiveCalls <= 3, true);
  assert.equal(longResult.status, "ok");
  assert.equal(longResult.strategy, "vertical_segments_v1");
  assert.equal(longResult.segmentCount, 6);
  assert.equal(longResult.recognizedSegmentCount, 5);
  assert.equal(occurrenceCount(longResult.text, "我(右侧)：边界重复句"), 1);
  assert.match(longResult.text, /^客户\(左侧\)：第一句/);
  assert.match(longResult.text, /第 3\/6 段未识别/);
  assert.match(longResult.text, /客户\(左侧\)：最后一个真实问题怎么回复？$/);

  const longMetadata = createChatImageOcrMetadata(longResult);

  assert.equal(longMetadata.ocrStrategy, "vertical_segments_v1");
  assert.equal(longMetadata.ocrSegmentCount, "6");
  assert.equal(longMetadata.ocrRecognizedSegmentCount, "5");
  assert.equal(longMetadata.ocrPartial, "true");

  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.OPENAI_VISION_MODEL = "gpt-4o-mini-test";
  let qwenFailureCalls = 0;
  let openAiForbiddenCalls = 0;

  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    const body = String(init?.body ?? "");

    if (body.includes("qwen-vl-plus-test")) {
      qwenFailureCalls += 1;
      return new Response("temporary qwen failure", { status: 500 });
    }

    openAiForbiddenCalls += 1;
    return new Response("unsupported_country_region_territory", { status: 403 });
  }) as typeof fetch;

  const allProvidersFailed = await extractChatImageText({
    arrayBuffer: toArrayBuffer(longImage),
    filename: "wechat-long-provider-failure.jpg",
    mimeType: "image/jpeg"
  });

  assert.equal(allProvidersFailed.status, "failed");
  assert.equal(allProvidersFailed.strategy, "vertical_segments_v1");
  assert.equal(allProvidersFailed.segmentCount, 6);
  assert.equal(allProvidersFailed.recognizedSegmentCount, 0);
  assert.equal(qwenFailureCalls, 6);
  assert.equal(openAiForbiddenCalls > 0, true);
  assert.equal(openAiForbiddenCalls <= 3, true);

  delete process.env.OPENAI_API_KEY;
  let lastSegmentFailureCalls = 0;

  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    const body = String(init?.body ?? "");
    const match = body.match(/第 (\d+)\/(\d+) 段/);
    const segmentNumber = Number(match?.[1] ?? 0);
    const segmentTotal = Number(match?.[2] ?? 0);

    lastSegmentFailureCalls += 1;

    if (segmentNumber === segmentTotal) {
      return new Response("last segment failed", { status: 500 });
    }

    return new Response(
      JSON.stringify({
        choices: [{ message: { content: `客户(左侧)：较早片段${segmentNumber}` } }]
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  const lastSegmentFailed = await extractChatImageText({
    arrayBuffer: toArrayBuffer(longImage),
    filename: "wechat-long-last-segment-failed.jpg",
    mimeType: "image/jpeg"
  });

  assert.equal(lastSegmentFailureCalls, 6);
  assert.equal(lastSegmentFailed.status, "failed");
  assert.equal(lastSegmentFailed.text, "");
  assert.equal(lastSegmentFailed.segmentCount, 6);
  assert.equal(lastSegmentFailed.recognizedSegmentCount, 5);

  console.log("Chat image OCR tests passed.");
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(restoreRuntime);
