import assert from "node:assert/strict";
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

  console.log("Chat image OCR tests passed.");
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(restoreRuntime);
