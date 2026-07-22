import assert from "node:assert/strict";

import JSZip from "jszip";
import sharp from "sharp";

import { parseAdminIngestFile } from "../lib/enterprise/ingest-file-parser";
import { terminateAdminIngestLocalOcrWorker } from "../lib/enterprise/ingest-local-ocr";

const TEST_ENV_NAMES = [
  "ADMIN_INGEST_LOCAL_OCR_ENABLED",
  "ADMIN_INGEST_LOCAL_OCR_CACHE_DIR",
  "ADMIN_INGEST_LOCAL_OCR_MAX_BYTES",
  "ADMIN_INGEST_LOCAL_OCR_TIMEOUT_MS",
  "ADMIN_INGEST_PDF_OCR_MAX_PAGES",
  "ADMIN_INGEST_PPTX_OCR_TIMEOUT_MS",
  "ADMIN_INGEST_PPTX_VISION_TIMEOUT_MS"
] as const;

const originalFetch = globalThis.fetch;
const originalEnv = Object.fromEntries(
  TEST_ENV_NAMES.map((name) => [name, process.env[name]])
) as Record<(typeof TEST_ENV_NAMES)[number], string | undefined>;

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

async function buildOcrImage(text: string, format: "png" | "jpeg" = "png") {
  const svg = Buffer.from([
    "<svg width=\"1400\" height=\"360\" xmlns=\"http://www.w3.org/2000/svg\">",
    "<rect width=\"100%\" height=\"100%\" fill=\"white\"/>",
    `<text x=\"70\" y=\"215\" font-family=\"Arial\" font-size=\"82\" font-weight=\"700\" fill=\"black\">${text}</text>`,
    "</svg>"
  ].join(""));
  const image = sharp(svg);

  return format === "jpeg"
    ? image.jpeg({ quality: 95 }).toBuffer()
    : image.png().toBuffer();
}

async function buildPptxFixture(image: Buffer) {
  const zip = new JSZip();

  zip.file("ppt/presentation.xml", [
    "<p:presentation xmlns:p=\"p\" xmlns:r=\"r\"><p:sldIdLst>",
    "<p:sldId id=\"256\" r:id=\"rIdSlide\"/>",
    "</p:sldIdLst></p:presentation>"
  ].join(""));
  zip.file("ppt/_rels/presentation.xml.rels", [
    "<Relationships>",
    "<Relationship Id=\"rIdSlide\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide\" Target=\"slides/slide1.xml\"/>",
    "</Relationships>"
  ].join(""));
  zip.file("ppt/slides/slide1.xml", [
    "<p:sld xmlns:p=\"p\" xmlns:a=\"a\" xmlns:r=\"r\"><p:cSld>",
    "<a:t>第三步：讲事业</a:t><a:blip r:embed=\"rIdImage\"/>",
    "</p:cSld></p:sld>"
  ].join(""));
  zip.file("ppt/slides/_rels/slide1.xml.rels", [
    "<Relationships>",
    "<Relationship Id=\"rIdImage\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/image\" Target=\"../media/image1.png\"/>",
    "</Relationships>"
  ].join(""));
  zip.file("ppt/media/image1.png", image);

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

function buildImageOnlyPdf(jpeg: Buffer, width: number, height: number) {
  const chunks: Buffer[] = [];
  const offsets: number[] = [0];
  let length = 0;
  const push = (value: string | Buffer) => {
    const chunk = typeof value === "string" ? Buffer.from(value, "binary") : value;
    chunks.push(chunk);
    length += chunk.length;
  };
  const object = (id: number, body: string | Buffer) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    push(body);
    push("\nendobj\n");
  };

  push("%PDF-1.4\n");
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  object(4, Buffer.concat([
    Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, "binary"),
    jpeg,
    Buffer.from("\nendstream", "binary")
  ]));
  const content = `q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ`;
  object(5, `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
  const xrefOffset = length;

  push("xref\n0 6\n0000000000 65535 f \n");
  for (let id = 1; id <= 5; id += 1) {
    push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  return Buffer.concat(chunks);
}

async function main() {
  try {
    process.env.ADMIN_INGEST_LOCAL_OCR_ENABLED = "true";
    process.env.ADMIN_INGEST_LOCAL_OCR_TIMEOUT_MS = "60000";
    let networkCallCount = 0;
    globalThis.fetch = (async () => {
      networkCallCount += 1;
      throw new Error("Local attachment parsing must not call a cloud vision model.");
    }) as typeof fetch;

    const png = await buildOcrImage("SYSTEM VALUE 2026");
    const imageResult = await parseAdminIngestFile({
      fileName: "课程截图.png",
      mimeType: "image/png",
      sizeBytes: png.byteLength,
      buffer: png
    });

    assert.equal(imageResult.parseStatus, "parsed");
    assert.match(imageResult.extractedText, /SYSTEM\s+VALUE\s+2026/i);
    assert.match(imageResult.limitationNote, /local-ocr\/tesseract\.js/);
    assert.equal(networkCallCount, 0);

    const pptxBuffer = await buildPptxFixture(png);
    const pptxResult = await parseAdminIngestFile({
      fileName: "讲事业第三步.pptx",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      sizeBytes: pptxBuffer.byteLength,
      buffer: pptxBuffer
    });

    assert.equal(pptxResult.parseStatus, "parsed");
    assert.match(pptxResult.extractedText, /第三步：讲事业/);
    assert.match(pptxResult.extractedText, /SYSTEM\s+VALUE\s+2026/i);
    assert.match(pptxResult.slideTexts[0]?.text ?? "", /图片识别 1：/);
    assert.match(pptxResult.limitationNote, /本地 OCR 成功 1 个/);
    assert.equal(networkCallCount, 0);

    const jpeg = await buildOcrImage("SCANNED PDF 2026", "jpeg");
    const scannedPdf = buildImageOnlyPdf(jpeg, 1400, 360);
    const pdfResult = await parseAdminIngestFile({
      fileName: "扫描课件.pdf",
      mimeType: "application/pdf",
      sizeBytes: scannedPdf.byteLength,
      buffer: scannedPdf
    });

    assert.equal(pdfResult.parseStatus, "parsed");
    assert.match(pdfResult.extractedText, /SCANNED\s+PDF\s+2026/i);
    assert.match(pdfResult.limitationNote, /本地 Tesseract OCR/);
    assert.equal(networkCallCount, 0);

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

    process.env.ADMIN_INGEST_LOCAL_OCR_ENABLED = "false";
    const disabledResult = await parseAdminIngestFile({
      fileName: "本地OCR已停用.png",
      mimeType: "image/png",
      sizeBytes: png.byteLength,
      buffer: png
    });

    assert.equal(disabledResult.parseStatus, "metadata_only");
    assert.equal(disabledResult.extractedText, "");
    assert.match(disabledResult.limitationNote, /本地 OCR 已停用/);

    const invalidMagicResult = await parseAdminIngestFile({
      fileName: "伪装图片.png",
      mimeType: "image/png",
      sizeBytes: 12,
      buffer: Buffer.from("not-a-png!!!")
    });

    assert.equal(invalidMagicResult.parseStatus, "unsupported");
    assert.equal(invalidMagicResult.extractedText, "");
    assert.match(invalidMagicResult.limitationNote, /文件头/);

    const legacyPptResult = await parseAdminIngestFile({
      fileName: "旧版课件.ppt",
      mimeType: "application/vnd.ms-powerpoint",
      sizeBytes: 8,
      buffer: Buffer.from("legacy")
    });

    assert.equal(legacyPptResult.parseStatus, "unsupported");
    assert.equal(legacyPptResult.extractedText, "");
    assert.match(legacyPptResult.limitationNote, /另存为 \.pptx/);

    console.log("Admin ingest local OCR and file parser tests passed.");
  } finally {
    await terminateAdminIngestLocalOcrWorker();
    restoreEnvironment();
    globalThis.fetch = originalFetch;
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
