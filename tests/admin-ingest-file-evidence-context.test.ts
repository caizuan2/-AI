import assert from "node:assert/strict";

import { buildIngestFileContextPrompt } from "../lib/enterprise/ingest-file-context";

function testKeepsSixtyScannedPdfPagesAndCoverage() {
  const pageSummaries = Array.from({ length: 60 }, (_, index) => (
    `Page ${index + 1}: 扫描证据-${String(index + 1).padStart(2, "0")}-唯一标记`
  ));
  const prompt = buildIngestFileContextPrompt([{
    fileName: "60页扫描资料.pdf",
    mimeType: "application/pdf",
    parseStatus: "partial",
    extractedText: "扫描正文".repeat(7_000),
    pageSummaries,
    totalPages: 60,
    processedPageStart: 1,
    processedPageEnd: 60,
    complete: true,
    successfulPages: Array.from({ length: 59 }, (_, index) => index + 1),
    failedPages: [60],
    lowConfidencePages: [17],
    coveragePercent: 100,
    successRatePercent: 98.33,
    deadlineReached: false,
    limitationNote: "第60页单页重试后仍未获得可靠文字证据。"
  }], {
    maxTotalChars: 80_000
  });

  assert.match(prompt, /Page 1: 扫描证据-01-唯一标记/);
  assert.match(prompt, /Page 60: 扫描证据-60-唯一标记/);
  assert.match(prompt, /totalPages: 60/);
  assert.match(prompt, /failedPages: 60/);
  assert.match(prompt, /lowConfidencePages: 17/);
  assert.match(prompt, /complete: true/);
  assert.match(prompt, /不得依据课程常识补写/);
}

function testKeepsLogicalSlideOrderWithoutRepeatingFlatText() {
  const slideTexts = Array.from({ length: 60 }, (_, index) => ({
    slideIndex: index + 1,
    text: `幻灯片-${String(index + 1).padStart(2, "0")}-页级证据`
  }));
  const prompt = buildIngestFileContextPrompt([{
    fileName: "60页课程.pptx",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    parseStatus: "parsed",
    extractedText: "不应重复进入提示词的扁平正文",
    slideTexts,
    totalPages: 60,
    processedPageStart: 1,
    processedPageEnd: 60,
    complete: true,
    successfulPages: Array.from({ length: 60 }, (_, index) => index + 1),
    failedPages: [],
    lowConfidencePages: [],
    coveragePercent: 100,
    successRatePercent: 100
  }]);

  assert.match(prompt, /Slide 1: 幻灯片-01-页级证据/);
  assert.match(prompt, /Slide 60: 幻灯片-60-页级证据/);
  assert.doesNotMatch(prompt, /不应重复进入提示词的扁平正文/);
}

testKeepsSixtyScannedPdfPagesAndCoverage();
testKeepsLogicalSlideOrderWithoutRepeatingFlatText();

console.log("admin ingest file evidence context tests passed");
