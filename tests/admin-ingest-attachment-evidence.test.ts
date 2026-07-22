import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  ATTACHMENT_CONTENT_MISSING_CODE,
  ATTACHMENT_EVIDENCE_MISMATCH_CODE,
  assessAdminIngestAttachmentEvidence,
  buildAttachmentContentMissingMessage,
  findUnsupportedAdminIngestAttachmentClaim,
  readAttachmentEvidenceErrorMessage
} from "../lib/enterprise/ingest-attachment-evidence";

function assertSourceOrder(source: string, first: string, second: string, message: string) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);

  assert.notEqual(firstIndex, -1, `Missing source marker: ${first}`);
  assert.notEqual(secondIndex, -1, `Missing source marker: ${second}`);
  assert.ok(firstIndex < secondIndex, message);
}

const noAttachments = assessAdminIngestAttachmentEvidence();

assert.deepEqual(noAttachments, {
  attachmentCount: 0,
  groundedCount: 0,
  missingCount: 0,
  partialCount: 0,
  hasAnyEvidence: false,
  isPartial: false,
  blocking: false,
  missingFiles: []
});

const unrelatedEmptyDocument = assessAdminIngestAttachmentEvidence([{
  fileName: "已有文档流程.docx",
  mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  parseStatus: "metadata_only"
}]);

assert.equal(unrelatedEmptyDocument.attachmentCount, 0);
assert.equal(unrelatedEmptyDocument.blocking, false);

const emptyImage = assessAdminIngestAttachmentEvidence([
  {
    fileName: "课程截图.png",
    parseStatus: "parsed"
  }
]);

assert.equal(emptyImage.blocking, true);
assert.equal(emptyImage.hasAnyEvidence, false);
assert.deepEqual(emptyImage.missingFiles, ["课程截图.png"]);

const emptyPresentation = assessAdminIngestAttachmentEvidence([
  {
    fileName: "培训课件.pptx",
    parseStatus: "partial"
  }
]);

assert.equal(emptyPresentation.blocking, true);
assert.equal(emptyPresentation.groundedCount, 0);
assert.equal(emptyPresentation.partialCount, 0);
assert.match(buildAttachmentContentMissingMessage(emptyPresentation), /培训课件\.pptx/);
assert.match(buildAttachmentContentMissingMessage(emptyPresentation), /未生成知识草稿或训练记忆/);

const partialWithText = assessAdminIngestAttachmentEvidence([
  {
    fileName: "图文课件.pptx",
    parseStatus: "partial",
    slideTexts: [
      { text: "第三步：讲事业，先呈现价值，再确认客户意愿。" }
    ]
  }
]);

assert.equal(partialWithText.blocking, false);
assert.equal(partialWithText.hasAnyEvidence, true);
assert.equal(partialWithText.groundedCount, 1);
assert.equal(partialWithText.partialCount, 1);
assert.equal(partialWithText.isPartial, true);

for (const parseStatus of ["metadata_only", "unsupported", "ocr_pending"]) {
  const limitedEvidence = assessAdminIngestAttachmentEvidence([{
    fileName: `${parseStatus}.png`,
    parseStatus,
    visibleText: "只识别到一小段可见文字"
  }]);

  assert.equal(limitedEvidence.blocking, false);
  assert.equal(limitedEvidence.isPartial, true);
  assert.equal(limitedEvidence.partialCount, 1);
  assert.match(
    findUnsupportedAdminIngestAttachmentClaim("我已经完整看完附件。", limitedEvidence),
    /完整看完/
  );
}

const mixedEvidence = assessAdminIngestAttachmentEvidence([
  {
    fileName: "第一页.png",
    parseStatus: "parsed",
    visibleText: "系统五大价值"
  },
  {
    fileName: "第二页.png",
    parseStatus: "ocr_pending"
  }
]);

assert.equal(mixedEvidence.blocking, false);
assert.equal(mixedEvidence.groundedCount, 1);
assert.equal(mixedEvidence.missingCount, 1);
assert.equal(mixedEvidence.isPartial, true);
assert.deepEqual(mixedEvidence.missingFiles, ["第二页.png"]);

const unsupportedClaim = findUnsupportedAdminIngestAttachmentClaim(
  "我已经仔细看完了全部课件，并完全理解其中的每一页内容。",
  partialWithText
);

assert.match(unsupportedClaim, /仔细看完/);
assert.equal(
  findUnsupportedAdminIngestAttachmentClaim(
    "当前仅部分识别，未完整看完课件；下面只依据已识别文字分析。",
    partialWithText
  ),
  ""
);
assert.equal(
  findUnsupportedAdminIngestAttachmentClaim(
    "我已经完整看完课件。",
    assessAdminIngestAttachmentEvidence([
      { fileName: "完整课件.pptx", parseStatus: "parsed", extractedText: "已完整提取的正文" }
    ])
  ),
  "",
  "A fully grounded attachment must not be rejected by the partial-evidence claim gate."
);

const contentMissingMessage = "附件尚未识别到正文，已停止本轮分析。";
const evidenceMismatchMessage = "回答超出附件证据，已停止生成草稿。";

assert.equal(
  readAttachmentEvidenceErrorMessage(new Error(`${ATTACHMENT_CONTENT_MISSING_CODE}: ${contentMissingMessage}`)),
  contentMissingMessage
);
assert.equal(
  readAttachmentEvidenceErrorMessage(`${ATTACHMENT_EVIDENCE_MISMATCH_CODE}: ${evidenceMismatchMessage}`),
  evidenceMismatchMessage
);
assert.equal(readAttachmentEvidenceErrorMessage(new Error("普通网络错误")), "");

const routeSource = readFileSync("app/api/admin/kb/ingest/gpt/route.ts", "utf8");
const toggleSource = readFileSync("components/enterprise-admin/IngestModeToggle.tsx", "utf8");

assertSourceOrder(
  routeSource,
  "const attachmentEvidence = assessAdminIngestAttachmentEvidence(input.attachments);",
  "const result = await runAdminIngestWithSelectedModel({",
  "The API attachment-evidence preflight must run before provider dispatch."
);
assertSourceOrder(
  routeSource,
  "const unsupportedClaim = findUnsupportedAdminIngestAttachmentClaim(",
  "? await createEnterpriseIngestLog(enterpriseActor, {",
  "The response-evidence mismatch gate must run before a training log can be created."
);

const routePreflightStart = routeSource.indexOf(
  "const attachmentEvidence = assessAdminIngestAttachmentEvidence(input.attachments);"
);
const providerDispatchStart = routeSource.indexOf("const result = await runAdminIngestWithSelectedModel({");
const routePreflightBlock = routeSource.slice(routePreflightStart, providerDispatchStart);

assert.match(routePreflightBlock, /if \(attachmentEvidence\.blocking\)/);
assert.match(routePreflightBlock, /ATTACHMENT_CONTENT_MISSING_CODE/);

const mismatchGateStart = routeSource.indexOf(
  "const unsupportedClaim = findUnsupportedAdminIngestAttachmentClaim("
);
const trainingLogStart = routeSource.indexOf("? await createEnterpriseIngestLog(enterpriseActor, {");
const mismatchGateBlock = routeSource.slice(mismatchGateStart, trainingLogStart);

assert.match(mismatchGateBlock, /if \(unsupportedClaim\)/);
assert.match(mismatchGateBlock, /ATTACHMENT_EVIDENCE_MISMATCH_CODE/);

assertSourceOrder(
  toggleSource,
  "const attachmentEvidence = assessAdminIngestAttachmentEvidence(outgoingAttachments);",
  "result = await sendCoreIngest({",
  "The admin-ingest UI must block missing attachment evidence before sending the model request."
);

const uiEvidenceGateStart = toggleSource.indexOf(
  "const attachmentEvidence = assessAdminIngestAttachmentEvidence(outgoingAttachments);"
);
const memoryPreviewStart = toggleSource.indexOf(
  "const memoryV2Trace = await prepareMemoryV2Context({",
  uiEvidenceGateStart
);

assert.ok(
  uiEvidenceGateStart >= 0 && memoryPreviewStart > uiEvidenceGateStart,
  "The attachment-evidence gate must run before the memory prompt preview request."
);

const clientErrorStart = toggleSource.indexOf(
  "const attachmentEvidenceMessage = readAttachmentEvidenceErrorMessage(error);"
);
const regularFallbackStart = toggleSource.indexOf(
  "const shouldSuppress = shouldSuppressFallbackToast({",
  clientErrorStart
);

assert.notEqual(clientErrorStart, -1, "The admin-ingest UI must decode attachment-evidence errors.");
assert.notEqual(regularFallbackStart, -1, "The regular fallback path must remain after the evidence branch.");
assert.ok(
  clientErrorStart < regularFallbackStart,
  "Attachment-evidence errors must be handled before regular model fallback handling."
);

const evidenceErrorBranch = toggleSource.slice(clientErrorStart, regularFallbackStart);

assert.match(evidenceErrorBranch, /if \(attachmentEvidenceMessage\)/);
assert.match(evidenceErrorBranch, /setGptFallbackToast\(null\)/);
assert.match(evidenceErrorBranch, /setInput\(\(current\) => current \|\| value\)/);
assert.match(evidenceErrorBranch, /error instanceof AdminIngestFileParseCancelledError/);
assert.match(evidenceErrorBranch, /\? error\.files\s+: resumableUploads/);
assert.match(evidenceErrorBranch, /setUploadedFiles\(\(current\) => current\.length > 0 \? current : cancelledUploads\)/);
assert.match(evidenceErrorBranch, /type: "warning"/);
assert.match(evidenceErrorBranch, /return null;/);
assert.doesNotMatch(evidenceErrorBranch, /type: "fallback"/);
assert.doesNotMatch(evidenceErrorBranch, /setGptFallbackToast\(\{/);

console.log("Admin ingest attachment evidence tests passed.");
