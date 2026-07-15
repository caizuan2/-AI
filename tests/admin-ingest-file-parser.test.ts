import assert from "node:assert/strict";

import JSZip from "jszip";

import { parseAdminIngestFile } from "../lib/enterprise/ingest-file-parser";

const TEST_ENV_NAMES = [
  "ADMIN_INGEST_VISION_ENABLED",
  "ADMIN_INGEST_VISION_PROVIDER",
  "ADMIN_INGEST_VISION_ALLOW_PROVIDER_FALLBACK",
  "ADMIN_INGEST_VISION_QWEN_MODEL",
  "ADMIN_INGEST_VISION_OPENAI_MODEL",
  "ADMIN_INGEST_VISION_MODEL",
  "ADMIN_INGEST_VISION_MAX_BYTES",
  "ADMIN_INGEST_VISION_TIMEOUT_MS",
  "ADMIN_INGEST_VISION_MAX_TOKENS",
  "ADMIN_INGEST_PPTX_VISION_TIMEOUT_MS",
  "QWEN_API_KEY",
  "QWEN_BASE_URL",
  "QWEN_VISION_MODEL",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_VISION_MODEL"
] as const;

const originalFetch = globalThis.fetch;
const originalEnv = Object.fromEntries(
  TEST_ENV_NAMES.map((name) => [name, process.env[name]])
) as Record<(typeof TEST_ENV_NAMES)[number], string | undefined>;

const VALID_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52
]);

function clearVisionEnv() {
  for (const name of TEST_ENV_NAMES) {
    delete process.env[name];
  }
}

function configureQwenVision() {
  clearVisionEnv();
  process.env.ADMIN_INGEST_VISION_PROVIDER = "qwen";
  process.env.QWEN_API_KEY = "sk-test-admin-ingest-vision";
  process.env.QWEN_BASE_URL = "https://vision.test.invalid/v1";
  process.env.ADMIN_INGEST_VISION_QWEN_MODEL = "qwen-vl-test";
}

function restoreEnvironment() {
  for (const name of TEST_ENV_NAMES) {
    const value = originalEnv[name];

    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

function mockVisionFetch(
  text: string,
  requests: Array<{ url: string; body: unknown }>,
  finishReason = "stop"
) {
  globalThis.fetch = (async (input, init) => {
    requests.push({
      url: String(input),
      body: JSON.parse(String(init?.body ?? "{}")) as unknown
    });

    return new Response(JSON.stringify({
      choices: [{ finish_reason: finishReason, message: { content: text } }]
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;
}

function readVisionRequest(request: { url: string; body: unknown }) {
  const body = request.body as {
    model?: string;
    messages?: Array<{
      content?: Array<{
        type?: string;
        text?: string;
        image_url?: { url?: string };
      }>;
    }>;
  };
  const content = body.messages?.[0]?.content ?? [];

  return {
    model: body.model,
    prompt: content.find((part) => part.type === "text")?.text ?? "",
    imageUrl: content.find((part) => part.type === "image_url")?.image_url?.url ?? ""
  };
}

async function buildPptxFixture() {
  const zip = new JSZip();

  zip.file("ppt/slides/slide1.xml", [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<p:sld xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\"",
    " xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\"",
    " xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\">",
    "<p:cSld><a:t>第三步：讲事业</a:t>",
    "<a:blip r:embed=\"rIdImage\"/>",
    "<a:blip r:link=\"rIdExternal\"/>",
    "</p:cSld></p:sld>"
  ].join(""));
  zip.file("ppt/slides/_rels/slide1.xml.rels", [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">",
    "<Relationship Id=\"rIdImage\"",
    " Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/image\"",
    " Target=\"../media/image1.png\"/>",
    "<Relationship Id=\"rIdExternal\"",
    " Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/image\"",
    " Target=\"https://example.invalid/external.png\" TargetMode=\"External\"/>",
    "</Relationships>"
  ].join(""));
  zip.file("ppt/media/image1.png", VALID_PNG);

  return zip.generateAsync({ type: "nodebuffer" });
}

async function buildOrderedPptxFixture() {
  const zip = new JSZip();

  zip.file("ppt/presentation.xml", [
    "<p:presentation xmlns:p=\"p\" xmlns:r=\"r\"><p:sldIdLst>",
    "<p:sldId id=\"256\" r:id=\"rIdFirst\"/>",
    "<p:sldId id=\"257\" r:id=\"rIdSecond\"/>",
    "</p:sldIdLst></p:presentation>"
  ].join(""));
  zip.file("ppt/_rels/presentation.xml.rels", [
    "<Relationships>",
    "<Relationship Id=\"rIdFirst\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide\" Target=\"slides/slide2.xml\"/>",
    "<Relationship Id=\"rIdSecond\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide\" Target=\"slides/slide1.xml\"/>",
    "</Relationships>"
  ].join(""));
  zip.file("ppt/slides/slide1.xml", "<p:sld><p:cSld><a:t>实际第二页</a:t></p:cSld></p:sld>");
  zip.file("ppt/slides/slide2.xml", "<p:sld><p:cSld><a:t>实际第一页</a:t></p:cSld></p:sld>");
  zip.file("ppt/slides/slide99.xml", "<p:sld><p:cSld><a:t>孤立页面不得进入模型</a:t></p:cSld></p:sld>");

  return zip.generateAsync({ type: "nodebuffer" });
}

async function main() {
  try {
    configureQwenVision();
    const imageRequests: Array<{ url: string; body: unknown }> = [];
    mockVisionFetch("【可见文字】\n系统五大价值\n【结构与图表】\n从左到右", imageRequests);

    const imageResult = await parseAdminIngestFile({
      fileName: "课程截图.png",
      mimeType: "image/png",
      sizeBytes: VALID_PNG.byteLength,
      buffer: VALID_PNG
    });

    assert.equal(imageResult.parseStatus, "parsed");
    assert.match(imageResult.extractedText, /系统五大价值/);
    assert.equal(imageRequests.length, 1);
    assert.equal(imageRequests[0]?.url, "https://vision.test.invalid/v1/chat/completions");

    const imageRequest = readVisionRequest(imageRequests[0]);

    assert.equal(imageRequest.model, "qwen-vl-test");
    assert.match(imageRequest.prompt, /只识别当前这张图片/);
    assert.match(imageRequest.prompt, /不得使用历史对话/);
    assert.doesNotMatch(imageRequest.prompt, /课程截图\.png/);
    assert.match(imageRequest.imageUrl, /^data:image\/png;base64,/);

    const truncatedRequests: Array<{ url: string; body: unknown }> = [];
    mockVisionFetch("识别文字".repeat(3_000), truncatedRequests);
    const truncatedImageResult = await parseAdminIngestFile({
      fileName: "超长识别结果.png",
      mimeType: "image/png",
      sizeBytes: VALID_PNG.byteLength,
      buffer: VALID_PNG
    });

    assert.equal(truncatedImageResult.parseStatus, "partial");
    assert.ok(truncatedImageResult.extractedText.length <= 8_000);

    const providerTruncatedRequests: Array<{ url: string; body: unknown }> = [];
    mockVisionFetch("只返回了前半段识别文字", providerTruncatedRequests, "length");
    const providerTruncatedResult = await parseAdminIngestFile({
      fileName: "供应商截断.png",
      mimeType: "image/png",
      sizeBytes: VALID_PNG.byteLength,
      buffer: VALID_PNG
    });

    assert.equal(providerTruncatedResult.parseStatus, "partial");

    const filteredRequests: Array<{ url: string; body: unknown }> = [];
    mockVisionFetch("只返回了可安全显示的识别片段", filteredRequests, "content_filter");
    const filteredResult = await parseAdminIngestFile({
      fileName: "过滤截断.png",
      mimeType: "image/png",
      sizeBytes: VALID_PNG.byteLength,
      buffer: VALID_PNG
    });

    assert.equal(filteredResult.parseStatus, "partial");

    const emptyTemplateRequests: Array<{ url: string; body: unknown }> = [];
    mockVisionFetch("【可见文字】\n无\n【结构与图表】\n无\n【不确定内容】\n无", emptyTemplateRequests);
    const emptyTemplateResult = await parseAdminIngestFile({
      fileName: "空白图片.png",
      mimeType: "image/png",
      sizeBytes: VALID_PNG.byteLength,
      buffer: VALID_PNG
    });

    assert.equal(emptyTemplateResult.parseStatus, "metadata_only");
    assert.equal(emptyTemplateResult.extractedText, "");

    const sentinelRequests: Array<{ url: string; body: unknown }> = [];
    mockVisionFetch("`NO_VISIBLE_CONTENT`", sentinelRequests);
    const sentinelResult = await parseAdminIngestFile({
      fileName: "哨兵图片.png",
      mimeType: "image/png",
      sizeBytes: VALID_PNG.byteLength,
      buffer: VALID_PNG
    });

    assert.equal(sentinelResult.parseStatus, "metadata_only");

    const refusalRequests: Array<{ url: string; body: unknown }> = [];
    mockVisionFetch("抱歉，我无法识别这张图片中的具体文字。", refusalRequests);
    const refusalResult = await parseAdminIngestFile({
      fileName: "拒识图片.png",
      mimeType: "image/png",
      sizeBytes: VALID_PNG.byteLength,
      buffer: VALID_PNG
    });

    assert.equal(refusalResult.parseStatus, "metadata_only");

    configureQwenVision();
    process.env.OPENAI_API_KEY = "sk-test-openai-vision";
    process.env.OPENAI_BASE_URL = "https://openai-vision.test.invalid/v1";
    const strictProviderUrls: string[] = [];
    globalThis.fetch = (async (input) => {
      strictProviderUrls.push(String(input));
      return new Response("provider unavailable", { status: 503 });
    }) as typeof fetch;
    const strictProviderResult = await parseAdminIngestFile({
      fileName: "私有课件.png",
      mimeType: "image/png",
      sizeBytes: VALID_PNG.byteLength,
      buffer: VALID_PNG
    });

    assert.equal(strictProviderResult.parseStatus, "metadata_only");
    assert.deepEqual(strictProviderUrls, ["https://vision.test.invalid/v1/chat/completions"]);

    clearVisionEnv();
    let unavailableFetchCount = 0;
    globalThis.fetch = (async () => {
      unavailableFetchCount += 1;
      throw new Error("Vision fetch must not run without a configured provider.");
    }) as typeof fetch;

    const unavailableResult = await parseAdminIngestFile({
      fileName: "未配置识别.png",
      mimeType: "image/png",
      sizeBytes: VALID_PNG.byteLength,
      buffer: VALID_PNG
    });

    assert.equal(unavailableResult.parseStatus, "metadata_only");
    assert.equal(unavailableResult.extractedText, "");
    assert.equal(unavailableFetchCount, 0);
    assert.match(unavailableResult.limitationNote, /尚未配置/);

    const partialPptxBuffer = await buildPptxFixture();
    const partialPptxResult = await parseAdminIngestFile({
      fileName: "视觉服务未配置.pptx",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      sizeBytes: partialPptxBuffer.byteLength,
      buffer: partialPptxBuffer
    });

    assert.equal(partialPptxResult.parseStatus, "partial");
    assert.match(partialPptxResult.extractedText, /第三步：讲事业/);
    assert.match(partialPptxResult.limitationNote, /部分附件证据/);

    configureQwenVision();
    let invalidMagicFetchCount = 0;
    globalThis.fetch = (async () => {
      invalidMagicFetchCount += 1;
      throw new Error("Vision fetch must not run for an invalid image signature.");
    }) as typeof fetch;

    const invalidMagicResult = await parseAdminIngestFile({
      fileName: "伪装图片.png",
      mimeType: "image/png",
      sizeBytes: 12,
      buffer: Buffer.from("not-a-png!!!")
    });

    assert.equal(invalidMagicResult.parseStatus, "unsupported");
    assert.equal(invalidMagicResult.extractedText, "");
    assert.equal(invalidMagicFetchCount, 0);
    assert.match(invalidMagicResult.limitationNote, /文件头/);

    configureQwenVision();
    const pptxRequests: Array<{ url: string; body: unknown }> = [];
    mockVisionFetch("【可见文字】\n客户可见的创业机会\n【结构与图表】\n箭头指向成交", pptxRequests);
    const pptxBuffer = await buildPptxFixture();
    const pptxResult = await parseAdminIngestFile({
      fileName: "讲事业第三步.pptx",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      sizeBytes: pptxBuffer.byteLength,
      buffer: pptxBuffer
    });

    assert.equal(pptxResult.parseStatus, "partial");
    assert.equal(pptxRequests.length, 1, "External image relationships must not trigger vision requests.");
    assert.match(pptxResult.extractedText, /第三步：讲事业/);
    assert.match(pptxResult.extractedText, /客户可见的创业机会/);
    assert.match(pptxResult.slideTexts[0]?.text ?? "", /幻灯片文字：第三步：讲事业/);
    assert.match(pptxResult.slideTexts[0]?.text ?? "", /图片识别 1：/);
    assert.match(readVisionRequest(pptxRequests[0]).imageUrl, /^data:image\/png;base64,/);
    assert.match(pptxResult.limitationNote, /视觉识别成功 1 个/);
    assert.match(pptxResult.limitationNote, /失败或跳过 1 个/);

    const orderedPptxBuffer = await buildOrderedPptxFixture();
    const orderedPptxResult = await parseAdminIngestFile({
      fileName: "重排页面.pptx",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      sizeBytes: orderedPptxBuffer.byteLength,
      buffer: orderedPptxBuffer
    });

    assert.equal(orderedPptxResult.parseStatus, "parsed");
    assert.deepEqual(orderedPptxResult.slideTexts.map((slide) => slide.slideIndex), [1, 2]);
    assert.ok(orderedPptxResult.extractedText.indexOf("实际第一页") < orderedPptxResult.extractedText.indexOf("实际第二页"));
    assert.doesNotMatch(orderedPptxResult.extractedText, /孤立页面不得进入模型/);

    const legacyPptResult = await parseAdminIngestFile({
      fileName: "旧版课件.ppt",
      mimeType: "application/vnd.ms-powerpoint",
      sizeBytes: 8,
      buffer: Buffer.from("legacy")
    });

    assert.equal(legacyPptResult.parseStatus, "unsupported");
    assert.equal(legacyPptResult.extractedText, "");
    assert.match(legacyPptResult.limitationNote, /另存为 \.pptx/);

    console.log("Admin ingest file parser tests passed.");
  } finally {
    restoreEnvironment();
    globalThis.fetch = originalFetch;
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
