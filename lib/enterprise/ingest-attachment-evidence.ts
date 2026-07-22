export const ATTACHMENT_CONTENT_MISSING_CODE = "ATTACHMENT_CONTENT_MISSING" as const;
export const ATTACHMENT_EVIDENCE_MISMATCH_CODE = "ATTACHMENT_EVIDENCE_MISMATCH" as const;

export type AttachmentEvidenceErrorCode =
  | typeof ATTACHMENT_CONTENT_MISSING_CODE
  | typeof ATTACHMENT_EVIDENCE_MISMATCH_CODE;

export interface AdminIngestAttachmentEvidenceSource {
  fileName?: string;
  name?: string;
  fileType?: string;
  mimeType?: string;
  parseStatus?: string;
  extractedText?: string;
  text?: string;
  content?: string;
  visibleText?: string;
  summary?: string;
  pageSummaries?: string[];
  slideTexts?: Array<{ text?: string; content?: string } | string>;
}

export interface AdminIngestAttachmentEvidenceReport {
  attachmentCount: number;
  groundedCount: number;
  missingCount: number;
  partialCount: number;
  hasAnyEvidence: boolean;
  isPartial: boolean;
  blocking: boolean;
  missingFiles: string[];
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function readSlideText(value: AdminIngestAttachmentEvidenceSource["slideTexts"]) {
  if (!Array.isArray(value)) {
    return "";
  }

  return value.map((item) => {
    if (typeof item === "string") {
      return cleanText(item);
    }

    return cleanText(item?.text) || cleanText(item?.content);
  }).filter(Boolean).join(" ");
}

function isLimitedParseStatus(parseStatus: string) {
  return parseStatus === "partial"
    || parseStatus === "metadata_only"
    || parseStatus === "unsupported"
    || parseStatus === "ocr_pending";
}

function requiresVisualAttachmentEvidence(source: AdminIngestAttachmentEvidenceSource) {
  const fileName = `${cleanText(source.fileName)} ${cleanText(source.name)}`.toLowerCase();
  const fileType = `${cleanText(source.fileType)} ${cleanText(source.mimeType)}`.toLowerCase();

  return fileType.includes("image/")
    || fileType.includes("presentation")
    || /\.(?:png|jpe?g|gif|webp|bmp|ppt|pptx)(?:\s|$)/i.test(fileName);
}

export function readAdminIngestAttachmentEvidence(source: AdminIngestAttachmentEvidenceSource) {
  return [
    cleanText(source.extractedText),
    cleanText(source.text),
    cleanText(source.content),
    cleanText(source.visibleText),
    cleanText(source.summary),
    ...(Array.isArray(source.pageSummaries) ? source.pageSummaries.map(cleanText) : []),
    readSlideText(source.slideTexts)
  ].filter(Boolean).join("\n");
}

export function assessAdminIngestAttachmentEvidence(
  attachments: AdminIngestAttachmentEvidenceSource[] = []
): AdminIngestAttachmentEvidenceReport {
  let groundedCount = 0;
  let partialCount = 0;
  let attachmentCount = 0;
  const missingFiles: string[] = [];

  for (const attachment of attachments) {
    if (!requiresVisualAttachmentEvidence(attachment)) {
      continue;
    }

    attachmentCount += 1;
    const evidence = readAdminIngestAttachmentEvidence(attachment);
    const parseStatus = cleanText(attachment.parseStatus).toLowerCase();

    if (evidence) {
      groundedCount += 1;
      if (isLimitedParseStatus(parseStatus)) {
        partialCount += 1;
      }
      continue;
    }

    missingFiles.push(cleanText(attachment.fileName) || cleanText(attachment.name) || "未命名附件");
  }

  const missingCount = missingFiles.length;

  return {
    attachmentCount,
    groundedCount,
    missingCount,
    partialCount,
    hasAnyEvidence: groundedCount > 0,
    isPartial: partialCount > 0 || (groundedCount > 0 && missingCount > 0),
    blocking: attachmentCount > 0 && groundedCount === 0,
    missingFiles
  };
}

const POSITIVE_EVIDENCE_CLAIM = /(?:仔细(?:看了|看过|看完)|完整(?:看完|阅读|识别|理解)|全部(?:看完|阅读|识别|理解)|完全理解|精准识别|逐页(?:看完|阅读|分析))/;
const NEGATIVE_EVIDENCE_CLAIM = /(?:无法|不能|尚未|未能|没有|并未|不代表|未完整|不完整|仅部分|部分识别)/;

export function findUnsupportedAdminIngestAttachmentClaim(
  replyMarkdown: string,
  report: AdminIngestAttachmentEvidenceReport
) {
  if (!report.blocking && !report.isPartial) {
    return "";
  }

  const clauses = replyMarkdown
    .split(/[，,。；;！？!?\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  return clauses.find((clause) => POSITIVE_EVIDENCE_CLAIM.test(clause) && !NEGATIVE_EVIDENCE_CLAIM.test(clause)) ?? "";
}

export function buildAttachmentContentMissingMessage(report: AdminIngestAttachmentEvidenceReport) {
  const files = report.missingFiles.slice(0, 3).join("、");
  const suffix = report.missingFiles.length > 3 ? `等 ${report.missingFiles.length} 个附件` : files;

  return `当前附件${suffix ? `（${suffix}）` : ""}尚未识别到可用于分析的文字证据。请确认图片清晰且包含可识别文字、补充图片内容说明，或将旧版 .ppt 另存为 .pptx 后重新发送。严格单模型模式不会调用其他视觉或备用模型，也不会根据文件名、历史对话猜测画面；系统已停止本轮分析，未生成知识草稿或训练记忆。`;
}

export function readAttachmentEvidenceErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const match = raw.match(/(?:ATTACHMENT_CONTENT_MISSING|ATTACHMENT_EVIDENCE_MISMATCH)\s*:\s*([\s\S]+)$/);

  return match?.[1]?.trim() ?? "";
}
