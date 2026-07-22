import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import JSZip from "jszip";
import sharp from "sharp";

import {
  hasSufficientAdminIngestPdfPageTextEvidence,
  parseAdminIngestFile
} from "../lib/enterprise/ingest-file-parser";

async function buildPagedPptx(pageCount: number) {
  const zip = new JSZip();
  const slideIds: string[] = [];
  const relationships: string[] = [];

  for (let page = 1; page <= pageCount; page += 1) {
    slideIds.push(`<p:sldId id="${255 + page}" r:id="rIdSlide${page}"/>`);
    relationships.push(`<Relationship Id="rIdSlide${page}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${page}.xml"/>`);
    zip.file(
      `ppt/slides/slide${page}.xml`,
      `<p:sld xmlns:p="p" xmlns:a="a"><p:cSld><a:t>第 ${page} 页正文</a:t></p:cSld></p:sld>`
    );
  }

  zip.file(
    "ppt/presentation.xml",
    `<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst>${slideIds.join("")}</p:sldIdLst></p:presentation>`
  );
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `<Relationships>${relationships.join("")}</Relationships>`
  );

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

async function buildPptxWithMedia(image: Buffer) {
  const zip = new JSZip();

  zip.file(
    "ppt/presentation.xml",
    "<p:presentation xmlns:p=\"p\" xmlns:r=\"r\"><p:sldIdLst><p:sldId id=\"256\" r:id=\"rIdSlide1\"/></p:sldIdLst></p:presentation>"
  );
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    "<Relationships><Relationship Id=\"rIdSlide1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide\" Target=\"slides/slide1.xml\"/></Relationships>"
  );
  zip.file(
    "ppt/slides/slide1.xml",
    "<p:sld xmlns:p=\"p\" xmlns:a=\"a\" xmlns:r=\"r\"><p:cSld><a:t>保留的第一页正文</a:t><a:blip r:embed=\"rIdImage\"/></p:cSld></p:sld>"
  );
  zip.file(
    "ppt/slides/_rels/slide1.xml.rels",
    "<Relationships><Relationship Id=\"rIdImage\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/image\" Target=\"../media/image1.png\"/></Relationships>"
  );
  zip.file("ppt/media/image1.png", image);

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

function buildPagedImagePdf(jpeg: Buffer, width: number, height: number, pageCount: number) {
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
  const imageObjectId = 3;
  const pageObjectIds = Array.from({ length: pageCount }, (_, index) => 4 + (index * 2));

  push("%PDF-1.4\n");
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageCount} >>`);
  object(imageObjectId, Buffer.concat([
    Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, "binary"),
    jpeg,
    Buffer.from("\nendstream", "binary")
  ]));

  for (let index = 0; index < pageCount; index += 1) {
    const pageObjectId = pageObjectIds[index];
    const contentObjectId = pageObjectId + 1;
    const content = `q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ`;

    object(pageObjectId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 ${imageObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`);
    object(contentObjectId, `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
  }

  const objectCount = 3 + (pageCount * 2);
  const xrefOffset = length;

  push(`xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`);
  for (let id = 1; id <= objectCount; id += 1) {
    push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  push(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  return Buffer.concat(chunks);
}

function corruptZipEntryPayload(buffer: Buffer, entryName: string) {
  const corrupted = Buffer.from(buffer);
  let offset = 0;

  while (offset + 30 <= corrupted.length && corrupted.readUInt32LE(offset) === 0x04034b50) {
    const compressedSize = corrupted.readUInt32LE(offset + 18);
    const fileNameLength = corrupted.readUInt16LE(offset + 26);
    const extraLength = corrupted.readUInt16LE(offset + 28);
    const fileName = corrupted.subarray(offset + 30, offset + 30 + fileNameLength).toString("utf8");
    const payloadOffset = offset + 30 + fileNameLength + extraLength;

    if (fileName === entryName && compressedSize > 2) {
      corrupted[payloadOffset + Math.floor(compressedSize / 2)] ^= 0xff;
      return corrupted;
    }

    offset = payloadOffset + compressedSize;
  }

  throw new Error(`Unable to locate ZIP entry ${entryName}`);
}

async function testPptxBatchesUseLogicalSlideNumbers() {
  const buffer = await buildPagedPptx(10);
  const first = await parseAdminIngestFile({
    fileName: "十页课件.pptx",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    sizeBytes: buffer.byteLength,
    buffer,
    pageStart: 5,
    pageBatchSize: 4
  });

  assert.equal(first.totalPages, 10);
  assert.equal(first.processedPageStart, 5);
  assert.equal(first.processedPageEnd, 8);
  assert.equal(first.nextPage, 9);
  assert.equal(first.complete, false);
  assert.deepEqual(first.successfulPages, [5, 6, 7, 8]);
  assert.deepEqual(first.failedPages, []);
  assert.deepEqual(first.lowConfidencePages, []);
  assert.equal(first.coveragePercent, 80);
  assert.equal(first.successRatePercent, 100);
  assert.deepEqual(first.slideTexts.map((slide) => slide.slideIndex), [5, 6, 7, 8]);
  assert.doesNotMatch(first.extractedText, /第 4 页正文|第 9 页正文/);

  const last = await parseAdminIngestFile({
    fileName: "十页课件.pptx",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    sizeBytes: buffer.byteLength,
    buffer,
    pageStart: 9,
    pageBatchSize: 4
  });

  assert.equal(last.processedPageStart, 9);
  assert.equal(last.processedPageEnd, 10);
  assert.equal(last.nextPage, null);
  assert.equal(last.complete, true);
  assert.deepEqual(last.successfulPages, [9, 10]);

  const longBuffer = await buildPagedPptx(45);
  const beyondLegacyCap = await parseAdminIngestFile({
    fileName: "四十五页课件.pptx",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    sizeBytes: longBuffer.byteLength,
    buffer: longBuffer,
    pageStart: 41,
    pageBatchSize: 4
  });

  assert.equal(beyondLegacyCap.totalPages, 45);
  assert.equal(beyondLegacyCap.processedPageStart, 41);
  assert.equal(beyondLegacyCap.processedPageEnd, 44);
  assert.equal(beyondLegacyCap.nextPage, 45);
  assert.deepEqual(beyondLegacyCap.successfulPages, [41, 42, 43, 44]);
  assert.deepEqual(beyondLegacyCap.slideTexts.map((slide) => slide.slideIndex), [41, 42, 43, 44]);
}

async function testScannedPdfBatchesAreContinuableBeyondTwelvePages() {
  const originalEnabled = process.env.ADMIN_INGEST_LOCAL_OCR_ENABLED;

  try {
    process.env.ADMIN_INGEST_LOCAL_OCR_ENABLED = "false";
    const jpeg = await sharp({
      create: { width: 240, height: 120, channels: 3, background: "white" }
    }).jpeg().toBuffer();
    const buffer = buildPagedImagePdf(jpeg, 240, 120, 13);
    const middle = await parseAdminIngestFile({
      fileName: "十三页扫描件.pdf",
      mimeType: "application/pdf",
      sizeBytes: buffer.byteLength,
      buffer,
      pageStart: 5,
      pageBatchSize: 4
    });

    assert.equal(middle.totalPages, 13);
    assert.equal(middle.processedPageStart, 5);
    assert.equal(middle.processedPageEnd, 8);
    assert.equal(middle.nextPage, 9);
    assert.equal(middle.complete, false);
    assert.deepEqual(middle.failedPages, [5, 6, 7, 8]);
    assert.equal(middle.coveragePercent, 61.54);
    assert.match(middle.limitationNote, /原 12 页安全值不再作为整份文档上限/);

    const last = await parseAdminIngestFile({
      fileName: "十三页扫描件.pdf",
      mimeType: "application/pdf",
      sizeBytes: buffer.byteLength,
      buffer,
      pageStart: 9,
      pageBatchSize: 6
    });

    assert.equal(last.processedPageStart, 9);
    assert.equal(last.processedPageEnd, 13);
    assert.equal(last.nextPage, null);
    assert.equal(last.complete, true);
    assert.deepEqual(last.failedPages, [9, 10, 11, 12, 13]);
  } finally {
    if (originalEnabled === undefined) {
      delete process.env.ADMIN_INGEST_LOCAL_OCR_ENABLED;
    } else {
      process.env.ADMIN_INGEST_LOCAL_OCR_ENABLED = originalEnabled;
    }
  }
}

function testSparseTextEvidenceIsNotAcceptedAsCompletePdfCoverage() {
  assert.equal(hasSufficientAdminIngestPdfPageTextEvidence("HEADER ONLY"), false);
  assert.equal(hasSufficientAdminIngestPdfPageTextEvidence("页眉 页脚 2026"), false);
  assert.equal(
    hasSufficientAdminIngestPdfPageTextEvidence("完整页面正文".repeat(30)),
    true
  );

  const source = readFileSync(
    path.join(process.cwd(), "lib/enterprise/ingest-file-parser.ts"),
    "utf8"
  );

  assert.match(source, /sparsePages\.length > 0/);
  assert.match(source, /parseScannedPdfWithLocalOcr/);
  assert.match(source, /仅对文字证据不足页使用本地 Tesseract OCR/);
}

async function testPptxCorruptPageIsIsolatedAndRetryable() {
  const original = await buildPagedPptx(3);
  const corrupted = corruptZipEntryPayload(original, "ppt/slides/slide2.xml");
  const result = await parseAdminIngestFile({
    fileName: "单页损坏课件.pptx",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    sizeBytes: corrupted.byteLength,
    buffer: corrupted,
    pageStart: 1,
    pageBatchSize: 3
  });

  assert.equal(result.totalPages, 3);
  assert.equal(result.complete, true);
  assert.deepEqual(result.successfulPages, [1, 3]);
  assert.deepEqual(result.failedPages, [2]);
  assert.deepEqual(result.slideTexts.map((slide) => slide.slideIndex), [1, 3]);
  assert.match(result.extractedText, /第 1 页正文/);
  assert.match(result.extractedText, /第 3 页正文/);
  assert.doesNotMatch(result.extractedText, /第 2 页正文/);
}

async function testPptxRelationshipAndMediaFailuresStayPageScoped() {
  const image = await sharp({
    create: { width: 320, height: 160, channels: 3, background: "white" }
  }).png().toBuffer();
  const original = await buildPptxWithMedia(image);
  const corruptRelationship = corruptZipEntryPayload(
    original,
    "ppt/slides/_rels/slide1.xml.rels"
  );
  const relationshipResult = await parseAdminIngestFile({
    fileName: "关系损坏课件.pptx",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    sizeBytes: corruptRelationship.byteLength,
    buffer: corruptRelationship,
    pageStart: 1,
    pageBatchSize: 1
  });

  assert.equal(relationshipResult.totalPages, 1);
  assert.equal(relationshipResult.complete, true);
  assert.deepEqual(relationshipResult.failedPages, [1]);
  assert.equal(relationshipResult.processedPageStart, 1);

  const corruptMedia = corruptZipEntryPayload(original, "ppt/media/image1.png");
  const mediaResult = await parseAdminIngestFile({
    fileName: "媒体损坏课件.pptx",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    sizeBytes: corruptMedia.byteLength,
    buffer: corruptMedia,
    pageStart: 1,
    pageBatchSize: 1
  });

  assert.equal(mediaResult.totalPages, 1);
  assert.equal(mediaResult.complete, true);
  assert.deepEqual(mediaResult.failedPages, [1]);
  assert.deepEqual(mediaResult.successfulPages, [1]);
  assert.deepEqual(mediaResult.lowConfidencePages, [1]);
  assert.match(mediaResult.extractedText, /保留的第一页正文/);
}

async function testAbortedPdfKeepsCurrentPageRetryable() {
  const jpeg = await sharp({
    create: { width: 240, height: 120, channels: 3, background: "white" }
  }).jpeg().toBuffer();
  const buffer = buildPagedImagePdf(jpeg, 240, 120, 13);
  const controller = new AbortController();
  controller.abort(new Error("test abort"));
  const result = await parseAdminIngestFile({
    fileName: "中断扫描件.pdf",
    mimeType: "application/pdf",
    sizeBytes: buffer.byteLength,
    buffer,
    pageStart: 5,
    pageBatchSize: 4,
    signal: controller.signal
  });

  assert.equal(result.complete, false);
  assert.equal(result.processedPageStart, null);
  assert.equal(result.nextPage, 5);
  assert.deepEqual(result.failedPages, [5]);
  assert.match(result.limitationNote, /第 5 页重试/);
}

function testParserDeadlineWrapsEveryPdfStage() {
  const source = readFileSync(
    path.join(process.cwd(), "lib/enterprise/ingest-file-parser.ts"),
    "utf8"
  );

  assert.match(source, /waitForWithAbort\(\(\) => pdfParse\(buffer,/);
  assert.match(source, /waitForWithAbort\(\(\) => pdf\(buffer, \{ scale: 2 \}\), deadline\.signal\)/);
  assert.match(source, /waitForWithAbort\(\(\) => document!\.getPage\(page\), deadline\.signal\)/);
  assert.match(source, /ADMIN_INGEST_LOCAL_OCR_LOW_CONFIDENCE_THRESHOLD/);
  assert.doesNotMatch(source, /ADMIN_INGEST_LOCAL_OCR_LOW_CONFIDENCE\b/);
}

function testRouteValidatesBatchBoundsAndPassesAbortSignal() {
  const source = readFileSync(
    path.join(process.cwd(), "app/api/admin/kb/ingest/files/parse/route.ts"),
    "utf8"
  );

  assert.match(source, /formData\.get\("pageStart"\)/);
  assert.match(source, /formData\.get\("pageBatchSize"\)/);
  assert.match(source, /ADMIN_INGEST_MIN_PAGE_BATCH_SIZE/);
  assert.match(source, /ADMIN_INGEST_MAX_PAGE_BATCH_SIZE/);
  assert.match(source, /signal:\s*request\.signal/);
}

async function main() {
  await testPptxBatchesUseLogicalSlideNumbers();
  await testScannedPdfBatchesAreContinuableBeyondTwelvePages();
  testSparseTextEvidenceIsNotAcceptedAsCompletePdfCoverage();
  await testPptxCorruptPageIsIsolatedAndRetryable();
  await testPptxRelationshipAndMediaFailuresStayPageScoped();
  await testAbortedPdfKeepsCurrentPageRetryable();
  testParserDeadlineWrapsEveryPdfStage();
  testRouteValidatesBatchBoundsAndPassesAbortSignal();

  console.log("admin ingest PDF/PPT batch coverage tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
