import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  detectAdminIngestWechatConversationImage
} from "../lib/enterprise/admin-ingest-wechat-image-detection";
import {
  parseUploadedFileForGpt,
  type IngestUploadState
} from "../lib/enterprise/ingest-client";

const root = process.cwd();

async function buildSyntheticWechatLongScreenshot() {
  const width = 480;
  const height = 3_600;
  const greenBubble = await sharp({
    create: {
      width: 250,
      height: 520,
      channels: 3,
      background: "#95ec69"
    }
  }).png().toBuffer();
  const whiteBubble = await sharp({
    create: {
      width: 260,
      height: 480,
      channels: 3,
      background: "#ffffff"
    }
  }).png().toBuffer();

  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: "#ededed"
    }
  }).composite([
    { input: whiteBubble, left: 24, top: 420 },
    { input: greenBubble, left: 206, top: 1_180 },
    { input: whiteBubble, left: 24, top: 2_000 },
    { input: greenBubble, left: 206, top: 2_780 }
  ]).jpeg({ quality: 88 }).toBuffer();
}

async function run() {
  const wechatLongScreenshot = await buildSyntheticWechatLongScreenshot();
  const wechatDetection = await detectAdminIngestWechatConversationImage(wechatLongScreenshot);

  assert.equal(wechatDetection.detected, true);
  assert.ok(wechatDetection.aspectRatio >= 3);
  assert.ok(wechatDetection.greenRatio > 0.008);
  assert.ok(wechatDetection.lightBackgroundRatio > 0.45);

  const ordinaryImage = await sharp({
    create: {
      width: 1_200,
      height: 800,
      channels: 3,
      background: "#95ec69"
    }
  }).jpeg().toBuffer();
  const ordinaryDetection = await detectAdminIngestWechatConversationImage(ordinaryImage);

  assert.equal(ordinaryDetection.detected, false, "普通横图不能自动进入微信长截图流程");

  const longNonWechatImage = await sharp({
    create: {
      width: 480,
      height: 3_600,
      channels: 3,
      background: "#f1f1f1"
    }
  }).jpeg().toBuffer();
  const nonWechatDetection = await detectAdminIngestWechatConversationImage(longNonWechatImage);

  assert.equal(nonWechatDetection.detected, false, "没有微信绿色气泡特征的长图不能误判");

  const originalFetch = globalThis.fetch;
  const rawFile = new File([wechatLongScreenshot], "wechat-long.jpg", { type: "image/jpeg" });
  const upload: IngestUploadState = {
    id: "wechat-auto-detect",
    fileName: rawFile.name,
    fileType: rawFile.type,
    fileSize: rawFile.size,
    isImage: true,
    rawFile,
    mimeType: rawFile.type,
    parseStatus: "metadata_only",
    status: "ready_to_send",
    source: "admin_ingest",
    platform: "web",
    syncTarget: ["web"],
    createdAt: new Date(0).toISOString()
  };

  try {
    globalThis.fetch = async () => new Response(JSON.stringify({
      ok: true,
      data: {
        fileName: rawFile.name,
        fileType: "image",
        mimeType: rawFile.type,
        sizeBytes: rawFile.size,
        parseStatus: "parsed",
        recognitionMode: "wechat_conversation",
        extractedText: "【微信对话截图识别稿】\n客户：最近客户消息",
        pageSummaries: ["最近客户消息：最近客户消息"],
        slideTexts: [],
        totalPages: 2,
        processedPageStart: 1,
        processedPageEnd: 2,
        nextPage: null,
        complete: true,
        successfulPages: [1, 2],
        failedPages: [],
        lowConfidencePages: [],
        coveragePercent: 100,
        successRatePercent: 100,
        deadlineReached: false,
        limitationNote: "已自动识别为微信长截图。"
      }
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

    const parsedUpload = await parseUploadedFileForGpt(upload);

    assert.equal(parsedUpload.recognitionMode, "wechat_conversation");
    assert.equal(parsedUpload.parseStatus, "parsed");
    assert.equal(parsedUpload.extractedText?.includes("【微信对话截图识别稿】"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const parserSource = await readFile(
    path.join(root, "lib/enterprise/ingest-file-parser.ts"),
    "utf8"
  );
  const clientSource = await readFile(
    path.join(root, "lib/enterprise/ingest-client.ts"),
    "utf8"
  );
  const modeToggleSource = await readFile(
    path.join(root, "components/enterprise-admin/IngestModeToggle.tsx"),
    "utf8"
  );

  assert.match(parserSource, /detectAdminIngestWechatConversationImage\(input\.buffer\)/);
  assert.match(parserSource, /recognitionMode === "wechat_conversation"/);
  assert.match(clientSource, /recognitionMode:\s*lastData\?\.recognitionMode \?\? file\.recognitionMode/);
  assert.match(modeToggleSource, /parsedAsWechatConversation/);
  assert.match(modeToggleSource, /effectiveInput = buildEffectiveInput\(true\)/);

  console.log("admin ingest WeChat image auto-detection tests passed");
}

void run();
