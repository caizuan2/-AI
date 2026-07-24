import "server-only";

import { posix as posixPath } from "node:path";
import type { JSZipObject } from "jszip";
import {
  extractAdminIngestLocalOcrText,
  extractAdminIngestWechatConversationText,
  type AdminIngestLocalOcrResult
} from "@/lib/enterprise/ingest-local-ocr";
import { extractChatImageText } from "@/lib/ai-chat/image-ocr";
import {
  buildAdminIngestWechatReplyEvidence,
  parseAdminIngestWechatRoleTranscript,
  reconcileAdminIngestWechatRoleTranscripts
} from "@/lib/enterprise/ingest-wechat-transcript";

export type IngestParsedFileStatus = "parsed" | "partial" | "metadata_only" | "unsupported" | "ocr_pending";

export interface IngestParsedFileResult {
  ok: true;
  fileName: string;
  fileType: string;
  mimeType: string;
  sizeBytes: number;
  parseStatus: IngestParsedFileStatus;
  extractedText: string;
  pageSummaries: string[];
  slideTexts: Array<{ slideIndex: number; text: string }>;
  limitationNote: string;
  source: "admin_ingest";
  totalPages?: number;
  processedPageStart?: number | null;
  processedPageEnd?: number | null;
  nextPage?: number | null;
  complete?: boolean;
  successfulPages?: number[];
  failedPages?: number[];
  lowConfidencePages?: number[];
  coveragePercent?: number;
  successRatePercent?: number;
  deadlineReached?: boolean;
}

export interface AdminIngestParseBatchOptions {
  pageStart?: number;
  pageBatchSize?: number;
  signal?: AbortSignal;
}

interface IngestParseCoverage {
  totalPages: number;
  processedPageStart: number | null;
  processedPageEnd: number | null;
  nextPage: number | null;
  complete: boolean;
  successfulPages: number[];
  failedPages: number[];
  lowConfidencePages: number[];
  coveragePercent: number;
  successRatePercent: number;
  deadlineReached: boolean;
}

interface IngestParseDeadline {
  signal: AbortSignal;
  deadlineReached: () => boolean;
  cleanup: () => void;
}

const MAX_EXTRACTED_TEXT = 20_000;
const MAX_PPTX_SLIDES = 40;
const MAX_PPTX_IMAGES_PER_SLIDE = 6;
const MAX_PPTX_OCR_IMAGES = 24;
const MAX_PPTX_IMAGE_BYTES = 7 * 1024 * 1024;
const MAX_PPTX_TOTAL_IMAGE_BYTES = 32 * 1024 * 1024;
const MAX_PPTX_UNCOMPRESSED_BYTES = 120 * 1024 * 1024;
const DEFAULT_PPTX_OCR_TIMEOUT_MS = 120_000;
const DEFAULT_PDF_OCR_MAX_PAGES = 12;
const DEFAULT_PARSE_BATCH_TIMEOUT_MS = 120_000;
const DEFAULT_LOW_CONFIDENCE_THRESHOLD = 60;
const MIN_PDF_PAGE_TEXT_EVIDENCE_CHARS = 80;
export const ADMIN_INGEST_DEFAULT_PAGE_BATCH_SIZE = 4;
export const ADMIN_INGEST_MIN_PAGE_BATCH_SIZE = 1;
export const ADMIN_INGEST_MAX_PAGE_BATCH_SIZE = 6;
export const ADMIN_INGEST_MAX_PAGE_START = 10_000;

function normalizeParseBatch(options: AdminIngestParseBatchOptions = {}) {
  const pageStart = Number.isInteger(options.pageStart) && (options.pageStart ?? 0) >= 1
    ? Math.min(ADMIN_INGEST_MAX_PAGE_START, options.pageStart as number)
    : 1;
  const pageBatchSize = Number.isInteger(options.pageBatchSize) && (options.pageBatchSize ?? 0) >= 1
    ? Math.min(ADMIN_INGEST_MAX_PAGE_BATCH_SIZE, options.pageBatchSize as number)
    : ADMIN_INGEST_DEFAULT_PAGE_BATCH_SIZE;

  return { pageStart, pageBatchSize, signal: options.signal };
}

function readParseBatchTimeoutMs() {
  const configured = Number(process.env.ADMIN_INGEST_PARSE_BATCH_TIMEOUT_MS);

  return Number.isFinite(configured) && configured > 0
    ? Math.min(180_000, Math.max(10_000, Math.floor(configured)))
    : DEFAULT_PARSE_BATCH_TIMEOUT_MS;
}

function readLowConfidenceThreshold() {
  const configured = Number(process.env.ADMIN_INGEST_LOCAL_OCR_LOW_CONFIDENCE_THRESHOLD);

  return Number.isFinite(configured) && configured >= 0
    ? Math.min(100, Math.max(0, configured))
    : DEFAULT_LOW_CONFIDENCE_THRESHOLD;
}

function createBatchDeadline(parentSignal?: AbortSignal, timeoutMs = readParseBatchTimeoutMs()): IngestParseDeadline {
  const controller = new AbortController();
  let deadlineReached = false;
  const abortFromParent = () => controller.abort(parentSignal?.reason);

  if (parentSignal?.aborted) {
    abortFromParent();
  } else {
    parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  }

  const timeoutId = setTimeout(() => {
    deadlineReached = true;
    controller.abort(new Error("ADMIN_INGEST_PARSE_BATCH_TIMEOUT"));
  }, timeoutMs);

  return {
    signal: controller.signal,
    deadlineReached: () => deadlineReached,
    cleanup: () => {
      clearTimeout(timeoutId);
      parentSignal?.removeEventListener("abort", abortFromParent);
    }
  };
}

function createAbortError(signal: AbortSignal) {
  const reason = signal.reason;
  const error = reason instanceof Error
    ? reason
    : new Error(typeof reason === "string" && reason ? reason : "ADMIN_INGEST_PARSE_ABORTED");

  if (error.name === "Error") {
    error.name = "AbortError";
  }

  return error;
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) {
    throw createAbortError(signal);
  }
}

async function waitForWithAbort<T>(operation: Promise<T> | (() => Promise<T>), signal: AbortSignal): Promise<T> {
  throwIfAborted(signal);
  const pendingOperation = typeof operation === "function" ? operation() : operation;

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener("abort", handleAbort);
    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      callback();
    };
    const handleAbort = () => finish(() => reject(createAbortError(signal)));

    signal.addEventListener("abort", handleAbort, { once: true });
    pendingOperation.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error))
    );
  });
}

export function hasSufficientAdminIngestPdfPageTextEvidence(value: string) {
  const meaningfulCharacters = cleanStructuredText(value).replace(/\s+/g, "");

  return meaningfulCharacters.length >= MIN_PDF_PAGE_TEXT_EVIDENCE_CHARS;
}

function uniqueSortedPages(pages: number[]) {
  return Array.from(new Set(pages)).sort((a, b) => a - b);
}

function roundPercent(value: number) {
  return Math.round(Math.min(100, Math.max(0, value)) * 100) / 100;
}

function buildParseCoverage(input: {
  totalPages: number;
  pageStart: number;
  processedPages: number[];
  successfulPages: number[];
  failedPages: number[];
  lowConfidencePages: number[];
  deadlineReached?: boolean;
}): IngestParseCoverage {
  const totalPages = Math.max(0, Math.floor(input.totalPages));
  const processedPages = uniqueSortedPages(input.processedPages);
  const successfulPages = uniqueSortedPages(input.successfulPages);
  const failedPages = uniqueSortedPages(input.failedPages);
  const lowConfidencePages = uniqueSortedPages(input.lowConfidencePages);
  const processedPageStart = processedPages[0] ?? null;
  const processedPageEnd = processedPages.at(-1) ?? null;
  const progressPage = processedPageEnd ?? Math.max(0, input.pageStart - 1);
  const complete = totalPages > 0 && progressPage >= totalPages;
  const nextPage = complete ? null : Math.max(input.pageStart, progressPage + 1);

  return {
    totalPages,
    processedPageStart,
    processedPageEnd,
    nextPage,
    complete,
    successfulPages,
    failedPages,
    lowConfidencePages,
    coveragePercent: totalPages > 0 ? roundPercent((progressPage / totalPages) * 100) : 0,
    successRatePercent: processedPages.length > 0
      ? roundPercent((successfulPages.length / processedPages.length) * 100)
      : 0,
    deadlineReached: input.deadlineReached === true
  };
}

function readPptxOcrTimeoutMs() {
  const configured = Number(
    process.env.ADMIN_INGEST_PPTX_OCR_TIMEOUT_MS
    ?? process.env.ADMIN_INGEST_PPTX_VISION_TIMEOUT_MS
  );

  return Number.isFinite(configured) && configured > 0
    ? Math.min(180_000, Math.max(10_000, Math.floor(configured)))
    : DEFAULT_PPTX_OCR_TIMEOUT_MS;
}

function readPdfOcrMaxPages() {
  const configured = Number(process.env.ADMIN_INGEST_PDF_OCR_MAX_PAGES);

  return Number.isFinite(configured) && configured > 0
    ? Math.min(40, Math.max(1, Math.floor(configured)))
    : DEFAULT_PDF_OCR_MAX_PAGES;
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

function cleanText(value: string) {
  return decodeXmlEntities(value)
    .replace(/\u0000/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanStructuredText(value: string) {
  return decodeXmlEntities(value)
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function smartLimit(text: string, maxLength = MAX_EXTRACTED_TEXT, preserveStructure = false) {
  const cleaned = preserveStructure ? cleanStructuredText(text) : cleanText(text);

  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  const headLength = Math.floor(maxLength * 0.62);
  const middleLength = Math.floor(maxLength * 0.2);
  const tailLength = Math.max(0, maxLength - headLength - middleLength - 90);
  const middleStart = Math.max(headLength, Math.floor((cleaned.length - middleLength) / 2));

  return [
    cleaned.slice(0, headLength),
    `...（文件正文较长，已压缩；原文约 ${cleaned.length} 字）...`,
    cleaned.slice(middleStart, middleStart + middleLength),
    tailLength > 0 ? `...（末尾关键片段）...${cleaned.slice(-tailLength)}` : ""
  ].filter(Boolean).join(preserveStructure ? "\n" : " ");
}

function inferFileType(fileName: string, mimeType: string) {
  const lowerName = fileName.toLowerCase();
  const lowerMime = mimeType.toLowerCase();

  if (lowerName.endsWith(".docx") || lowerMime.includes("wordprocessingml")) {
    return "docx";
  }

  if (lowerName.endsWith(".pptx") || lowerMime.includes("presentationml")) {
    return "pptx";
  }

  if (lowerName.endsWith(".pdf") || lowerMime.includes("pdf")) {
    return "pdf";
  }

  if (lowerMime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp)$/i.test(lowerName)) {
    return "image";
  }

  if (lowerName.endsWith(".txt") || lowerName.endsWith(".md") || lowerMime.startsWith("text/")) {
    return "text";
  }

  return lowerName.split(".").pop() || mimeType || "file";
}

function extractXmlTagText(xml: string, tagNames: string[]) {
  const parts: string[] = [];

  for (const tagName of tagNames) {
    const pattern = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, "g");
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(xml)) !== null) {
      const text = cleanText(match[1]?.replace(/<[^>]+>/g, " ") ?? "");

      if (text) {
        parts.push(text);
      }
    }
  }

  return parts;
}

function readXmlAttribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i"));

  return match?.[2] ? decodeXmlEntities(match[2]).trim() : "";
}

function extractSlideImageRelationshipIds(xml: string) {
  const ids: string[] = [];
  const seen = new Set<string>();
  const pattern = /<a:blip\b[^>]*\br:(?:embed|link)\s*=\s*(["'])(.*?)\1/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(xml)) !== null) {
    const id = decodeXmlEntities(match[2] ?? "").trim();

    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }

  return ids;
}

function relationshipFileForSlide(slideFile: string) {
  return posixPath.join(posixPath.dirname(slideFile), "_rels", `${posixPath.basename(slideFile)}.rels`);
}

function safeDecodeRelationshipTarget(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function resolvePptxMediaPath(slideFile: string, target: string) {
  const decoded = safeDecodeRelationshipTarget(decodeXmlEntities(target).trim());

  if (
    !decoded
    || decoded.includes("\u0000")
    || decoded.includes("\\")
    || decoded.includes("?")
    || decoded.includes("#")
    || decoded.startsWith("//")
    || /^[a-z][a-z0-9+.-]*:/i.test(decoded)
  ) {
    return null;
  }

  const joined = decoded.startsWith("/")
    ? decoded.slice(1)
    : posixPath.join(posixPath.dirname(slideFile), decoded);
  const normalized = posixPath.normalize(joined);

  return /^ppt\/media\/[^/]+$/i.test(normalized) ? normalized : null;
}

function resolvePptxSlidePath(target: string) {
  const decoded = safeDecodeRelationshipTarget(decodeXmlEntities(target).trim());

  if (
    !decoded
    || decoded.includes("\u0000")
    || decoded.includes("\\")
    || decoded.includes("?")
    || decoded.includes("#")
    || decoded.startsWith("//")
    || /^[a-z][a-z0-9+.-]*:/i.test(decoded)
  ) {
    return null;
  }

  const joined = decoded.startsWith("/")
    ? decoded.slice(1)
    : posixPath.join("ppt", decoded);
  const normalized = posixPath.normalize(joined);

  return /^ppt\/slides\/slide\d+\.xml$/i.test(normalized) ? normalized : null;
}

function extractSlideMediaPaths(slideFile: string, slideXml: string, relationshipXml: string) {
  const referencedIds = new Set(extractSlideImageRelationshipIds(slideXml));
  const resolvedIds = new Set<string>();
  const mediaPaths: string[] = [];
  const seen = new Set<string>();
  const relationshipTags = relationshipXml.match(/<(?:[\w.-]+:)?Relationship\b[^>]*\/?\s*>/gi) ?? [];

  for (const tag of relationshipTags) {
    const id = readXmlAttribute(tag, "Id");
    const type = readXmlAttribute(tag, "Type");
    const target = readXmlAttribute(tag, "Target");
    const targetMode = readXmlAttribute(tag, "TargetMode");

    if (
      !referencedIds.has(id)
      || !type.toLowerCase().endsWith("/image")
      || targetMode.toLowerCase() === "external"
    ) {
      continue;
    }

    const mediaPath = resolvePptxMediaPath(slideFile, target);

    if (mediaPath && !seen.has(mediaPath)) {
      seen.add(mediaPath);
      mediaPaths.push(mediaPath);
    }

    if (mediaPath) {
      resolvedIds.add(id);
    }
  }

  return {
    mediaPaths,
    unresolvedCount: Math.max(0, referencedIds.size - resolvedIds.size)
  };
}

function hasUnrenderedSlideGraphic(slideXml: string, relationshipXml: string) {
  if (/<p:(?:graphicFrame|grpSp|cxnSp)\b/i.test(slideXml)) {
    return true;
  }

  const relationshipTags = relationshipXml.match(/<(?:[\w.-]+:)?Relationship\b[^>]*\/?\s*>/gi) ?? [];

  return relationshipTags.some((tag) => {
    const type = readXmlAttribute(tag, "Type").toLowerCase();
    const targetMode = readXmlAttribute(tag, "TargetMode").toLowerCase();

    return targetMode !== "external" && /\/(?:chart|diagramdata|oleobject|package|video|audio)$/.test(type);
  });
}

function readZipEntryUncompressedSize(entry: JSZipObject) {
  const value = (entry as JSZipObject & { _data?: { uncompressedSize?: unknown } })._data?.uncompressedSize;

  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

async function readZipText(entry: JSZipObject | null, maxBytes = 2 * 1024 * 1024) {
  if (!entry) {
    return "";
  }

  const reportedSize = readZipEntryUncompressedSize(entry);

  if (reportedSize !== null && reportedSize > maxBytes) {
    return "";
  }

  const bytes = await entry.async("uint8array");

  return bytes.byteLength <= maxBytes ? Buffer.from(bytes).toString("utf8") : "";
}

async function orderPptxSlideFiles(
  getEntry: (path: string) => JSZipObject | null,
  fallbackSlideFiles: string[]
) {
  const presentationXml = await readZipText(getEntry("ppt/presentation.xml"));
  const relationshipXml = await readZipText(getEntry("ppt/_rels/presentation.xml.rels"));

  if (!presentationXml || !relationshipXml) {
    return {
      slides: fallbackSlideFiles.map((path, index) => ({ path, slideIndex: index + 1 })),
      declaredSlideCount: fallbackSlideFiles.length,
      unresolvedSlideCount: 0,
      reliable: false
    };
  }

  const slideIdTags = presentationXml.match(/<p:sldId\b[^>]*\/?\s*>/gi) ?? [];
  const orderedRelationshipIds = slideIdTags
    .map((tag) => readXmlAttribute(tag, "r:id"))
    .filter(Boolean);
  const relationshipTags = relationshipXml.match(/<(?:[\w.-]+:)?Relationship\b[^>]*\/?\s*>/gi) ?? [];
  const slidePathByRelationshipId = new Map<string, string>();

  for (const tag of relationshipTags) {
    const type = readXmlAttribute(tag, "Type").toLowerCase();
    const targetMode = readXmlAttribute(tag, "TargetMode").toLowerCase();
    const slidePath = targetMode === "external" || !type.endsWith("/slide")
      ? null
      : resolvePptxSlidePath(readXmlAttribute(tag, "Target"));

    if (slidePath) {
      slidePathByRelationshipId.set(readXmlAttribute(tag, "Id"), slidePath);
    }
  }

  const fallbackSet = new Set(fallbackSlideFiles);
  const seen = new Set<string>();
  const orderedSlides: Array<{ path: string; slideIndex: number }> = [];

  orderedRelationshipIds.forEach((relationshipId, index) => {
    const slidePath = slidePathByRelationshipId.get(relationshipId);

    if (slidePath && fallbackSet.has(slidePath) && !seen.has(slidePath)) {
      seen.add(slidePath);
      orderedSlides.push({ path: slidePath, slideIndex: index + 1 });
    }
  });

  if (orderedSlides.length === 0) {
    return {
      slides: fallbackSlideFiles.map((path, index) => ({ path, slideIndex: index + 1 })),
      declaredSlideCount: fallbackSlideFiles.length,
      unresolvedSlideCount: 0,
      reliable: false
    };
  }

  const unresolvedSlideCount = Math.max(0, orderedRelationshipIds.length - orderedSlides.length);

  return {
    slides: orderedSlides,
    declaredSlideCount: orderedRelationshipIds.length,
    unresolvedSlideCount,
    reliable: unresolvedSlideCount === 0
  };
}

function detectImageMimeType(bytes: Uint8Array) {
  if (bytes.byteLength >= 8 && Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }

  if (bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  const head = Buffer.from(bytes.subarray(0, 12)).toString("ascii");

  if (head.startsWith("GIF87a") || head.startsWith("GIF89a")) {
    return "image/gif";
  }

  if (head.startsWith("RIFF") && head.slice(8, 12) === "WEBP") {
    return "image/webp";
  }

  if (head.startsWith("BM")) {
    return "image/bmp";
  }

  return null;
}

function extractDocxParagraphs(xml: string) {
  const paragraphs: string[] = [];
  const paragraphPattern = /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g;
  let match: RegExpExecArray | null;

  while ((match = paragraphPattern.exec(xml)) !== null) {
    const pieces = extractXmlTagText(match[1] ?? "", ["w:t"]);
    const paragraph = cleanText(pieces.join(""));

    if (paragraph) {
      paragraphs.push(paragraph);
    }
  }

  if (paragraphs.length > 0) {
    return paragraphs;
  }

  return extractXmlTagText(xml, ["w:t"]);
}

async function parseDocx(buffer: Buffer) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file("word/document.xml")?.async("string");

  if (!documentXml) {
    return {
      extractedText: "",
      pageSummaries: [],
      slideTexts: [],
      limitationNote: "未找到 word/document.xml，无法提取 Word 正文。",
      parseStatus: "metadata_only" as const
    };
  }

  const paragraphs = extractDocxParagraphs(documentXml);
  const extractedText = smartLimit(paragraphs.join("\n"));

  return {
    extractedText,
    pageSummaries: paragraphs.slice(0, 12),
    slideTexts: [],
    limitationNote: extractedText
      ? "已从 word/document.xml 提取可见正文，保留段落顺序并压缩超长内容。"
      : "已读取 word/document.xml，但未提取到可见文字。",
    parseStatus: extractedText ? "parsed" as const : "metadata_only" as const
  };
}

function readSlideIndex(path: string) {
  const match = path.match(/slide(\d+)\.xml$/i);

  return match ? Number(match[1]) : 0;
}

async function parsePptx(buffer: Buffer, options: Required<Pick<AdminIngestParseBatchOptions, "pageStart" | "pageBatchSize">> & {
  signal?: AbortSignal;
}) {
  const deadline = createBatchDeadline(
    options.signal,
    Math.min(readParseBatchTimeoutMs(), readPptxOcrTimeoutMs())
  );

  try {
    const JSZip = (await waitForWithAbort(import("jszip"), deadline.signal)).default;
    const zip = await waitForWithAbort(JSZip.loadAsync(buffer), deadline.signal);
    const totalUncompressedBytes = Object.values(zip.files).reduce((total, entry) => {
      return total + (readZipEntryUncompressedSize(entry) ?? 0);
    }, 0);

    if (totalUncompressedBytes > MAX_PPTX_UNCOMPRESSED_BYTES) {
      return {
        extractedText: "",
        pageSummaries: [],
        slideTexts: [],
        limitationNote: "PPTX 解压后的内容超过安全上限，已停止解析。",
        parseStatus: "unsupported" as const,
        ...buildParseCoverage({
          totalPages: 0,
          pageStart: options.pageStart,
          processedPages: [],
          successfulPages: [],
          failedPages: [],
          lowConfidencePages: [],
          deadlineReached: deadline.deadlineReached()
        })
      };
    }

    const fallbackSlideFiles = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
      .sort((a, b) => readSlideIndex(a) - readSlideIndex(b));
    const slideOrder = await waitForWithAbort(
      orderPptxSlideFiles((path) => zip.file(path), fallbackSlideFiles),
      deadline.signal
    );
    const totalPages = slideOrder.declaredSlideCount;
    const batchSize = Math.min(options.pageBatchSize, MAX_PPTX_SLIDES);
    const requestedPageEnd = Math.min(totalPages, options.pageStart + batchSize - 1);
    const slideByIndex = new Map(slideOrder.slides.map((slide) => [slide.slideIndex, slide]));
    const slides: Array<{
      slideIndex: number;
      nativeText: string;
      mediaPaths: string[];
      skippedMediaCount: number;
      hasUnrenderedGraphic: boolean;
    }> = [];
    const processedPages: number[] = [];
    const failedPages: number[] = [];
    let unreadableSlideCount = 0;

    for (let page = options.pageStart; page <= requestedPageEnd; page += 1) {
      if (deadline.signal.aborted) {
        break;
      }

      const orderedSlide = slideByIndex.get(page);
      processedPages.push(page);

      if (!orderedSlide) {
        unreadableSlideCount += 1;
        failedPages.push(page);
        continue;
      }

      try {
        const fileName = orderedSlide.path;
        const xml = await waitForWithAbort(readZipText(zip.file(fileName)), deadline.signal);

        if (!xml) {
          unreadableSlideCount += 1;
          failedPages.push(page);
          continue;
        }

        const relationshipXml = await waitForWithAbort(
          readZipText(zip.file(relationshipFileForSlide(fileName))),
          deadline.signal
        );
        const mediaRelationships = extractSlideMediaPaths(fileName, xml, relationshipXml);
        const allMediaPaths = mediaRelationships.mediaPaths;

        if (mediaRelationships.unresolvedCount > 0) {
          failedPages.push(page);
        }

        slides.push({
          slideIndex: orderedSlide.slideIndex,
          nativeText: cleanText(extractXmlTagText(xml, ["a:t"]).join(" ")),
          mediaPaths: allMediaPaths.slice(0, MAX_PPTX_IMAGES_PER_SLIDE),
          skippedMediaCount: mediaRelationships.unresolvedCount
            + Math.max(0, allMediaPaths.length - MAX_PPTX_IMAGES_PER_SLIDE),
          hasUnrenderedGraphic: hasUnrenderedSlideGraphic(xml, relationshipXml)
        });
      } catch {
        unreadableSlideCount += 1;
        failedPages.push(page);

        if (deadline.signal.aborted) {
          break;
        }
      }
    }

    const uniqueMediaPaths = Array.from(new Set(slides.flatMap((slide) => slide.mediaPaths)));
    const slidePagesByMediaPath = new Map<string, number[]>();

    for (const slide of slides) {
      for (const mediaPath of slide.mediaPaths) {
        const pages = slidePagesByMediaPath.get(mediaPath) ?? [];
        pages.push(slide.slideIndex);
        slidePagesByMediaPath.set(mediaPath, pages);
      }
    }

    const selectedMediaPaths = uniqueMediaPaths.slice(0, MAX_PPTX_OCR_IMAGES);
    const skippedMediaPaths = new Set(uniqueMediaPaths.slice(MAX_PPTX_OCR_IMAGES));
    const mediaInputs: Array<{ path: string; bytes: Uint8Array; mimeType: string }> = [];
    let totalImageBytes = 0;
    let skippedMediaCount = uniqueMediaPaths.length - selectedMediaPaths.length
      + slides.reduce((count, slide) => count + slide.skippedMediaCount, 0);
    const markMediaPagesFailed = (mediaPath: string) => {
      failedPages.push(...(slidePagesByMediaPath.get(mediaPath) ?? []));
    };

    skippedMediaPaths.forEach(markMediaPagesFailed);

    for (const mediaPath of selectedMediaPaths) {
      try {
        throwIfAborted(deadline.signal);
        const entry = zip.file(mediaPath);
        const reportedSize = entry ? readZipEntryUncompressedSize(entry) : null;

        if (!entry || (reportedSize !== null && reportedSize > MAX_PPTX_IMAGE_BYTES)) {
          skippedMediaCount += 1;
          skippedMediaPaths.add(mediaPath);
          markMediaPagesFailed(mediaPath);
          continue;
        }

        const bytes = await waitForWithAbort(entry.async("uint8array"), deadline.signal);

        if (
          bytes.byteLength > MAX_PPTX_IMAGE_BYTES
          || totalImageBytes + bytes.byteLength > MAX_PPTX_TOTAL_IMAGE_BYTES
        ) {
          skippedMediaCount += 1;
          skippedMediaPaths.add(mediaPath);
          markMediaPagesFailed(mediaPath);
          continue;
        }

        const mimeType = detectImageMimeType(bytes);

        if (!mimeType) {
          skippedMediaCount += 1;
          skippedMediaPaths.add(mediaPath);
          markMediaPagesFailed(mediaPath);
          continue;
        }

        totalImageBytes += bytes.byteLength;
        mediaInputs.push({ path: mediaPath, bytes, mimeType });
      } catch {
        skippedMediaCount += 1;
        skippedMediaPaths.add(mediaPath);
        markMediaPagesFailed(mediaPath);

        if (deadline.signal.aborted) {
          break;
        }
      }
    }

    const ocrResults: Array<{ path: string; result: AdminIngestLocalOcrResult }> = [];

    for (const media of mediaInputs) {
      if (deadline.signal.aborted) {
        skippedMediaPaths.add(media.path);
        continue;
      }

      try {
        ocrResults.push({
          path: media.path,
          result: await waitForWithAbort(extractAdminIngestLocalOcrText({
            bytes: media.bytes,
            mimeType: media.mimeType,
            signal: deadline.signal
          }), deadline.signal)
        });
      } catch {
        skippedMediaPaths.add(media.path);
        markMediaPagesFailed(media.path);

        if (deadline.signal.aborted) {
          break;
        }
      }
    }

    const completedOcrPaths = new Set(ocrResults.map((item) => item.path));

    for (const media of mediaInputs) {
      if (!completedOcrPaths.has(media.path) && !skippedMediaPaths.has(media.path)) {
        skippedMediaPaths.add(media.path);
        markMediaPagesFailed(media.path);
      }
    }

    const ocrByPath = new Map<string, AdminIngestLocalOcrResult>(ocrResults.map((item) => [item.path, item.result]));
    const successfulOcrCount = ocrResults.filter((item) => item.result.status === "ok" && item.result.text).length;
    const failedOcrCount = ocrResults.length - successfulOcrCount
      + Math.max(0, mediaInputs.length - ocrResults.length);
    const lowConfidenceThreshold = readLowConfidenceThreshold();
    const successfulPages: number[] = [];
    const lowConfidencePages: number[] = [];
    const slideTexts: Array<{ slideIndex: number; text: string }> = [];

    for (const item of ocrResults) {
      if (item.result.status !== "ok" || !item.result.text) {
        markMediaPagesFailed(item.path);
      }
    }

    for (const slide of slides) {
      const parts = [slide.nativeText ? `幻灯片文字：${slide.nativeText}` : ""];
      let lowConfidence = slide.skippedMediaCount > 0 || slide.hasUnrenderedGraphic;

      slide.mediaPaths.forEach((mediaPath, index) => {
        const result = ocrByPath.get(mediaPath);

        if (result?.status === "ok" && result.text) {
          parts.push(`图片识别 ${index + 1}：${result.text}`);
          lowConfidence ||= result.lowConfidence === true;
          lowConfidence ||= typeof result.confidence === "number" && result.confidence <= lowConfidenceThreshold;
          lowConfidence ||= result.truncated === true;
        } else if (skippedMediaPaths.has(mediaPath) || result) {
          lowConfidence = true;
        }
      });

      const text = cleanStructuredText(parts.filter(Boolean).join("\n"));

      if (text) {
        successfulPages.push(slide.slideIndex);
        slideTexts.push({ slideIndex: slide.slideIndex, text });
      } else if (!failedPages.includes(slide.slideIndex)) {
        failedPages.push(slide.slideIndex);
      }

      if (lowConfidence) {
        lowConfidencePages.push(slide.slideIndex);
      }
    }

    const coverage = buildParseCoverage({
      totalPages,
      pageStart: options.pageStart,
      processedPages,
      successfulPages,
      failedPages,
      lowConfidencePages,
      deadlineReached: deadline.deadlineReached()
    });
    const combinedSlideText = slideTexts.map((slide) => `Slide ${slide.slideIndex}:\n${slide.text}`).join("\n\n");
    const extractedText = smartLimit(combinedSlideText, MAX_EXTRACTED_TEXT, true);
    const unrenderedGraphicCount = slides.filter((slide) => slide.hasUnrenderedGraphic).length;
    const hasTruncatedOcrResult = ocrResults.some((item) => item.result.truncated);
    const hasTruncatedCombinedText = cleanStructuredText(combinedSlideText).length > MAX_EXTRACTED_TEXT;
    const hasPartialCoverage = !coverage.complete
      || coverage.failedPages.length > 0
      || coverage.lowConfidencePages.length > 0
      || skippedMediaCount > 0
      || failedOcrCount > 0
      || unrenderedGraphicCount > 0
      || unreadableSlideCount > 0
      || slideOrder.unresolvedSlideCount > 0
      || !slideOrder.reliable
      || hasTruncatedOcrResult
      || hasTruncatedCombinedText;
    const parseStatus = extractedText
      ? hasPartialCoverage ? "partial" as const : "parsed" as const
      : "metadata_only" as const;
    const limitationNote = [
      `PPTX 共 ${totalPages} 页，本批处理第 ${coverage.processedPageStart ?? options.pageStart}-${coverage.processedPageEnd ?? options.pageStart - 1} 页。`,
      `本批成功 ${coverage.successfulPages.length} 页，失败 ${coverage.failedPages.length} 页，低置信度 ${coverage.lowConfidencePages.length} 页。`,
      `发现 ${uniqueMediaPaths.length} 个内嵌图片关系，本地 OCR 成功 ${successfulOcrCount} 个，失败或跳过 ${failedOcrCount + skippedMediaCount} 个。`,
      unreadableSlideCount > 0 ? `有 ${unreadableSlideCount} 页无法读取或缺少有效页面关系。` : "",
      slideOrder.unresolvedSlideCount > 0 ? `整份文件有 ${slideOrder.unresolvedSlideCount} 页缺少有效的 presentation.xml 关系映射。` : "",
      !slideOrder.reliable && slideOrder.unresolvedSlideCount === 0
        ? "未获得完整的 presentation.xml 页面顺序映射，已按 slide 文件编号兜底排序。"
        : "",
      unrenderedGraphicCount > 0 ? `本批有 ${unrenderedGraphicCount} 页包含未渲染的图表、组合图形或多媒体对象。` : "",
      hasTruncatedCombinedText
        ? "本批合并正文超过字符安全预算，extractedText 已明确裁剪；完整页级证据仍保留在 slideTexts。"
        : "",
      coverage.deadlineReached
        ? `本批达到解析总时限，已保留完成页；可从第 ${coverage.nextPage ?? options.pageStart} 页继续。`
        : !coverage.complete
          ? `可从第 ${coverage.nextPage} 页继续下一批，未静默省略后续页面。`
          : "已到达文档末页。",
      extractedText
        ? hasPartialCoverage
          ? "当前只获得本批或部分附件证据，回答不得声称已完整看完整份文件。"
          : "已按页合并幻灯片文字层与内嵌图片本地 OCR 结果。"
        : "未获得可用于分析的正文，不得根据历史对话假装读懂当前 PPTX。"
    ].filter(Boolean).join(" ");

    return {
      extractedText,
      pageSummaries: slideTexts.map((slide) => `Slide ${slide.slideIndex}: ${slide.text}`),
      slideTexts,
      limitationNote,
      parseStatus,
      ...coverage
    };
  } catch (error) {
    const coverage = buildParseCoverage({
      totalPages: 0,
      pageStart: options.pageStart,
      processedPages: [],
      successfulPages: [],
      failedPages: [],
      lowConfidencePages: [],
      deadlineReached: deadline.deadlineReached()
    });

    return {
      extractedText: "",
      pageSummaries: [],
      slideTexts: [],
      limitationNote: error instanceof Error ? `PPTX 解析失败：${error.message}` : "PPTX 解析失败。",
      parseStatus: "unsupported" as const,
      ...coverage
    };
  } finally {
    deadline.cleanup();
  }
}

function describeLocalOcrFailure(result: AdminIngestLocalOcrResult) {
  switch (result.status) {
    case "unavailable":
      return "投喂端本地 OCR 已停用，未读取到图片正文。";
    case "skipped_large":
      return "图片超过本地 OCR 安全大小上限，未读取到图片正文。";
    case "unsupported":
      return "当前图片格式不受本地 OCR 支持。";
    default:
      return "图片本地 OCR 识别失败，未读取到图片正文，不会根据文件名或历史对话猜测。";
  }
}

async function parseImage(input: { buffer: Buffer; signal?: AbortSignal }) {
  const detectedMimeType = detectImageMimeType(input.buffer);

  if (!detectedMimeType) {
    const coverage = buildParseCoverage({
      totalPages: 1,
      pageStart: 1,
      processedPages: [1],
      successfulPages: [],
      failedPages: [1],
      lowConfidencePages: [],
      deadlineReached: false
    });

    return {
      extractedText: "",
      pageSummaries: [],
      slideTexts: [],
      limitationNote: "图片文件头与支持格式不匹配，已停止识别。",
      parseStatus: "unsupported" as const,
      ...coverage
    };
  }

  const result = await extractAdminIngestLocalOcrText({
    bytes: input.buffer,
    mimeType: detectedMimeType,
    signal: input.signal
  });

  if (result.status !== "ok" || !result.text) {
    const coverage = buildParseCoverage({
      totalPages: 1,
      pageStart: 1,
      processedPages: [1],
      successfulPages: [],
      failedPages: [1],
      lowConfidencePages: [],
      deadlineReached: false
    });

    return {
      extractedText: "",
      pageSummaries: [],
      slideTexts: [],
      limitationNote: describeLocalOcrFailure(result),
      parseStatus: "metadata_only" as const,
      ...coverage
    };
  }

  const lowConfidence = result.lowConfidence === true || result.truncated === true;
  const coverage = buildParseCoverage({
    totalPages: 1,
    pageStart: 1,
    processedPages: [1],
    successfulPages: [1],
    failedPages: [],
    lowConfidencePages: lowConfidence ? [1] : [],
    deadlineReached: false
  });

  return {
    extractedText: smartLimit(result.text, MAX_EXTRACTED_TEXT, true),
    pageSummaries: [result.text.slice(0, 500)],
    slideTexts: [],
    limitationNote: lowConfidence
      ? `已通过 ${result.provider}/${result.model} 本地识别图片中的可见文字，但结果置信度较低或被裁剪；OCR 不做内容推断，回答必须标明不确定内容。`
      : `已通过 ${result.provider}/${result.model} 本地识别图片中的可见文字；OCR 不做内容推断，回答只能基于该识别结果。`,
    parseStatus: lowConfidence ? "partial" as const : "parsed" as const,
    ...coverage
  };
}

async function parseWechatConversationImage(input: { buffer: Buffer; signal?: AbortSignal }) {
  const detectedMimeType = detectImageMimeType(input.buffer);

  if (!detectedMimeType) {
    return {
      extractedText: "",
      pageSummaries: [],
      slideTexts: [],
      limitationNote: "微信截图文件头与支持格式不匹配，已停止识别。",
      parseStatus: "unsupported" as const,
      ...buildParseCoverage({
        totalPages: 1,
        pageStart: 1,
        processedPages: [1],
        successfulPages: [],
        failedPages: [1],
        lowConfidencePages: [],
        deadlineReached: false
      })
    };
  }

  const result = await extractAdminIngestWechatConversationText({
    bytes: input.buffer,
    mimeType: detectedMimeType,
    signal: input.signal
  });
  const totalSegments = Math.max(1, result.segmentCount ?? 1);
  const recognizedSegments = Math.max(0, result.recognizedSegmentCount ?? 0);
  const successfulPages = Array.from({ length: recognizedSegments }, (_, index) => index + 1);
  const failedPages = Array.from(
    { length: Math.max(0, totalSegments - recognizedSegments) },
    (_, index) => recognizedSegments + index + 1
  );

  const localRoleReliable = result.status === "ok"
    && Boolean(result.text)
    && Boolean(result.latestCustomerMessage)
    && result.lowConfidence !== true
    && result.roleReliable !== false
    && (result.confidence ?? 0) >= 60;

  if (localRoleReliable) {
    const partial = result.truncated === true || recognizedSegments < totalSegments;

    return {
      extractedText: result.text,
      pageSummaries: [`最近客户消息：${result.latestCustomerMessage}`],
      slideTexts: [],
      limitationNote: partial
        ? `已通过 ${result.provider}/${result.model} 对微信长截图进行分段和左右角色识别；存在未识别片段，回答只能基于已识别对话正文。`
        : `已通过 ${result.provider}/${result.model} 对微信长截图进行分段和左右角色识别；左侧白色气泡为客户，右侧绿色气泡为用户本人。`,
      parseStatus: partial ? "partial" as const : "parsed" as const,
      ...buildParseCoverage({
        totalPages: totalSegments,
        pageStart: 1,
        processedPages: [...successfulPages, ...failedPages],
        successfulPages,
        failedPages,
        lowConfidencePages: partial ? successfulPages : [],
        deadlineReached: false
      })
    };
  }

  const visionResult = await extractChatImageText({
    arrayBuffer: input.buffer.buffer.slice(
      input.buffer.byteOffset,
      input.buffer.byteOffset + input.buffer.byteLength
    ) as ArrayBuffer,
    filename: "wechat-conversation-image",
    mimeType: detectedMimeType
  });
  const visionTranscript = visionResult.status === "ok" && visionResult.text
    ? result.transcript
      ? reconcileAdminIngestWechatRoleTranscripts({
          visionTranscript: visionResult.text,
          localTranscript: result.transcript
        })
      : parseAdminIngestWechatRoleTranscript(visionResult.text)
    : null;

  if (visionTranscript?.transcript && visionTranscript.latestCustomerMessage) {
    const visionSegmentCount = Math.max(1, visionResult.segmentCount ?? 1);
    const visionRecognizedCount = Math.max(1, visionResult.recognizedSegmentCount ?? visionSegmentCount);
    const visionSuccessfulPages = Array.from({ length: visionRecognizedCount }, (_, index) => index + 1);
    const visionFailedPages = Array.from(
      { length: Math.max(0, visionSegmentCount - visionRecognizedCount) },
      (_, index) => visionRecognizedCount + index + 1
    );
    const partial = visionRecognizedCount < visionSegmentCount;

    return {
      extractedText: buildAdminIngestWechatReplyEvidence({
        transcript: visionTranscript.transcript,
        latestCustomerMessage: visionTranscript.latestCustomerMessage,
        partial
      }),
      pageSummaries: [`最近客户消息：${visionTranscript.latestCustomerMessage}`],
      slideTexts: [],
      limitationNote: partial
        ? `已通过 ${visionResult.provider}/${visionResult.model} 对低置信度微信长截图进行分段复核；存在未识别片段，回答只能基于已识别对话正文。`
        : `已通过 ${visionResult.provider}/${visionResult.model} 对低置信度微信长截图进行分段复核；左侧白色气泡为客户，右侧绿色气泡为用户本人。`,
      parseStatus: partial ? "partial" as const : "parsed" as const,
      ...buildParseCoverage({
        totalPages: visionSegmentCount,
        pageStart: 1,
        processedPages: [...visionSuccessfulPages, ...visionFailedPages],
        successfulPages: visionSuccessfulPages,
        failedPages: visionFailedPages,
        lowConfidencePages: partial ? visionSuccessfulPages : [],
        deadlineReached: false
      })
    };
  }

  return {
    extractedText: "",
    pageSummaries: [],
    slideTexts: [],
    limitationNote: result.code === "LOCAL_OCR_TIMEOUT"
      ? "微信长截图识别超时，未能可靠确认客户最后一条消息；本轮不会猜测或调用回答模型。"
      : "微信长截图未能可靠区分左右角色或确认客户最后一条消息；本轮已停止，不会把低置信度 OCR 结果交给 DeepSeek 或豆包。请上传更清晰的原始截图或分段截图。",
    parseStatus: "metadata_only" as const,
    ...buildParseCoverage({
      totalPages: totalSegments,
      pageStart: 1,
      processedPages: [...successfulPages, ...failedPages],
      successfulPages,
      failedPages,
      lowConfidencePages: [],
      deadlineReached: result.code === "LOCAL_OCR_TIMEOUT"
    })
  };
}

async function extractPdfPageText(pageData: {
  getTextContent: (options?: { normalizeWhitespace?: boolean; disableCombineTextItems?: boolean }) => Promise<{
    items?: Array<{ str?: unknown; transform?: unknown }>;
  }>;
}, signal: AbortSignal) {
  const textContent = await waitForWithAbort(pageData.getTextContent({
    normalizeWhitespace: false,
    disableCombineTextItems: false
  }), signal);
  let lastY: number | undefined;
  let text = "";

  for (const item of textContent.items ?? []) {
    const value = typeof item.str === "string" ? item.str : "";
    const transform = Array.isArray(item.transform) ? item.transform : [];
    const y = typeof transform[5] === "number" ? transform[5] : undefined;

    if (!value) {
      continue;
    }

    text += lastY === undefined || y === undefined || lastY === y ? value : `\n${value}`;
    lastY = y;
  }

  return cleanStructuredText(text);
}

function mergePdfPageEvidence(nativeText: string, ocrText: string) {
  const cleanNativeText = cleanStructuredText(nativeText);
  const cleanOcrText = cleanStructuredText(ocrText);

  if (!cleanNativeText) {
    return cleanOcrText;
  }

  if (!cleanOcrText || cleanOcrText.includes(cleanNativeText)) {
    return cleanOcrText || cleanNativeText;
  }

  if (cleanNativeText.includes(cleanOcrText)) {
    return cleanNativeText;
  }

  return `PDF 文字层：${cleanNativeText}\n本地 OCR：${cleanOcrText}`;
}

async function parsePdf(buffer: Buffer, options: Required<Pick<AdminIngestParseBatchOptions, "pageStart" | "pageBatchSize">> & {
  signal?: AbortSignal;
}) {
  const deadline = createBatchDeadline(options.signal);

  try {
    const pdfParse = (await waitForWithAbort(import("pdf-parse"), deadline.signal)).default;
    const nativePageTexts: string[] = [];
    let fallbackPageIndex = 0;
    const result = await waitForWithAbort(() => pdfParse(buffer, {
      pagerender: async (pageData: {
        pageNumber?: number;
        getTextContent: (renderOptions?: { normalizeWhitespace?: boolean; disableCombineTextItems?: boolean }) => Promise<{
          items?: Array<{ str?: unknown; transform?: unknown }>;
        }>;
      }) => {
        const reportedPage = Number(pageData.pageNumber);
        const pageIndex = Number.isInteger(reportedPage) && reportedPage >= 1
          ? reportedPage - 1
          : fallbackPageIndex;
        fallbackPageIndex = Math.max(fallbackPageIndex, pageIndex + 1);

        try {
          const text = await extractPdfPageText(pageData, deadline.signal);
          nativePageTexts[pageIndex] = text;
          return text;
        } catch (error) {
          nativePageTexts[pageIndex] = "";
          throw error;
        }
      }
    }), deadline.signal);
    const totalPages = Math.max(0, result.numpages || 0);

    while (nativePageTexts.length < totalPages) {
      nativePageTexts.push("");
    }

    const sparsePages = nativePageTexts
      .slice(0, totalPages)
      .map((text, index) => hasSufficientAdminIngestPdfPageTextEvidence(text) ? 0 : index + 1)
      .filter((page) => page > 0);

    if (totalPages === 0 || sparsePages.length > 0) {
      return await parseScannedPdfWithLocalOcr(
        buffer,
        options,
        totalPages || undefined,
        nativePageTexts,
        deadline
      );
    }

    const fullText = cleanStructuredText(nativePageTexts.join("\n\n"));
    const extractedText = smartLimit(fullText, MAX_EXTRACTED_TEXT, true);
    const processedPages = Array.from({ length: totalPages }, (_, index) => index + 1);
    const coverage = buildParseCoverage({
      totalPages,
      pageStart: 1,
      processedPages,
      successfulPages: processedPages,
      failedPages: [],
      lowConfidencePages: [],
      deadlineReached: deadline.deadlineReached()
    });
    const truncated = fullText.length > MAX_EXTRACTED_TEXT;

    return {
      extractedText,
      pageSummaries: nativePageTexts.map((text, index) => `Page ${index + 1}: ${text}`),
      slideTexts: [],
      limitationNote: truncated
        ? "已逐页核验 PDF 文字层；正文超过字符安全预算，extractedText 已明确裁剪，完整页级文字证据保留在 pageSummaries。"
        : "已逐页核验 PDF 文字层具有足够证据，未调用 OCR 或任何云端视觉大模型。",
      parseStatus: truncated ? "partial" as const : "parsed" as const,
      ...coverage
    };
  } catch (error) {
    const interrupted = deadline.signal.aborted;
    const coverage = buildParseCoverage({
      totalPages: 0,
      pageStart: options.pageStart,
      processedPages: [],
      successfulPages: [],
      failedPages: interrupted ? [options.pageStart] : [],
      lowConfidencePages: [],
      deadlineReached: deadline.deadlineReached()
    });

    return {
      extractedText: "",
      pageSummaries: [],
      slideTexts: [],
      limitationNote: interrupted
        ? `PDF 文字层解析已中断，当前页未标记为完成；可从第 ${options.pageStart} 页重试。`
        : error instanceof Error
          ? `PDF 解析失败：${error.message}`
          : "PDF 解析失败，后续需要接入更稳定的 PDF/OCR 链路。",
      parseStatus: interrupted ? "metadata_only" as const : "unsupported" as const,
      ...coverage
    };
  } finally {
    deadline.cleanup();
  }
}

async function parseScannedPdfWithLocalOcr(
  buffer: Buffer,
  options: Required<Pick<AdminIngestParseBatchOptions, "pageStart" | "pageBatchSize">> & {
    signal?: AbortSignal;
  },
  pageCountHint: number | undefined,
  nativePageTexts: string[],
  deadline: IngestParseDeadline
) {
  let document: Awaited<ReturnType<(typeof import("pdf-to-img"))["pdf"]>> | null = null;

  try {
    const { pdf } = await waitForWithAbort(import("pdf-to-img"), deadline.signal);
    document = await waitForWithAbort(() => pdf(buffer, { scale: 2 }), deadline.signal);
    const totalPages = document.length || pageCountHint || 0;
    const pagesToRead = Math.min(options.pageBatchSize, readPdfOcrMaxPages());
    const requestedPageEnd = Math.min(totalPages, options.pageStart + pagesToRead - 1);
    const pageTexts: Array<{ page: number; text: string }> = [];
    const processedPages: number[] = [];
    const successfulPages: number[] = [];
    const failedPages: number[] = [];
    const lowConfidencePages: number[] = [];
    let hasTruncatedOcr = false;
    const lowConfidenceThreshold = readLowConfidenceThreshold();

    for (let page = options.pageStart; page <= requestedPageEnd; page += 1) {
      if (deadline.signal.aborted) {
        break;
      }

      processedPages.push(page);
      const nativeText = nativePageTexts[page - 1] ?? "";

      if (hasSufficientAdminIngestPdfPageTextEvidence(nativeText)) {
        pageTexts.push({ page, text: cleanStructuredText(nativeText) });
        successfulPages.push(page);
        continue;
      }

      try {
        const image = await waitForWithAbort(() => document!.getPage(page), deadline.signal);
        const result = await waitForWithAbort(() => extractAdminIngestLocalOcrText({
          bytes: image,
          mimeType: "image/png",
          signal: deadline.signal
        }), deadline.signal);

        if (result.status === "ok" && result.text) {
          pageTexts.push({ page, text: mergePdfPageEvidence(nativeText, result.text) });
          successfulPages.push(page);
          hasTruncatedOcr ||= result.truncated === true;
          if (
            result.lowConfidence === true
            || result.truncated === true
            || (typeof result.confidence === "number" && result.confidence <= lowConfidenceThreshold)
          ) {
            lowConfidencePages.push(page);
          }
        } else {
          failedPages.push(page);

          if (nativeText) {
            pageTexts.push({ page, text: cleanStructuredText(nativeText) });
            successfulPages.push(page);
            lowConfidencePages.push(page);
          }
        }
      } catch {
        failedPages.push(page);

        if (nativeText) {
          pageTexts.push({ page, text: cleanStructuredText(nativeText) });
          successfulPages.push(page);
          lowConfidencePages.push(page);
        }

        if (deadline.signal.aborted) {
          break;
        }
      }
    }

    const combinedText = pageTexts.map((item) => `Page ${item.page}:\n${item.text}`).join("\n\n");
    const extractedText = smartLimit(combinedText, MAX_EXTRACTED_TEXT, true);
    const hasCombinedTruncation = cleanStructuredText(combinedText).length > MAX_EXTRACTED_TEXT;
    const coverage = buildParseCoverage({
      totalPages,
      pageStart: options.pageStart,
      processedPages,
      successfulPages,
      failedPages,
      lowConfidencePages,
      deadlineReached: deadline.deadlineReached()
    });
    const partial = !coverage.complete
      || coverage.failedPages.length > 0
      || coverage.lowConfidencePages.length > 0
      || hasTruncatedOcr
      || hasCombinedTruncation;
    const limitationNote = [
      `PDF 文字层为空或存在证据稀疏页，整份共 ${totalPages || "未知"} 页；本批处理第 ${coverage.processedPageStart ?? options.pageStart}-${coverage.processedPageEnd ?? options.pageStart - 1} 页，仅对文字证据不足页使用本地 Tesseract OCR。`,
      `本批成功 ${coverage.successfulPages.length} 页，失败 ${coverage.failedPages.length} 页，低置信度 ${coverage.lowConfidencePages.length} 页。`,
      hasCombinedTruncation
        ? "本批合并正文超过字符安全预算，extractedText 已明确裁剪；完整页级 OCR 证据仍保留在 pageSummaries。"
        : "",
      coverage.deadlineReached
        ? `本批达到约 120 秒总时限，已保留完成页；可从第 ${coverage.nextPage ?? options.pageStart} 页继续。`
        : !coverage.complete
          ? `可从第 ${coverage.nextPage} 页继续下一批，原 12 页安全值不再作为整份文档上限。`
          : "已到达文档末页。",
      extractedText
        ? partial
          ? "当前只获得本批或部分扫描 PDF 证据，回答不得声称已完整看完整份文件。"
          : "OCR 只提取可见文字，不作内容推断。"
        : "未获得可用正文，不得根据文件名或历史对话猜测扫描 PDF 内容。"
    ].filter(Boolean).join(" ");

    return {
      extractedText,
      pageSummaries: pageTexts.map((item) => `Page ${item.page}: ${item.text}`),
      slideTexts: [],
      limitationNote,
      parseStatus: extractedText
        ? partial ? "partial" as const : "parsed" as const
        : "metadata_only" as const,
      ...coverage
    };
  } catch {
    const coverage = buildParseCoverage({
      totalPages: pageCountHint || 0,
      pageStart: options.pageStart,
      processedPages: [],
      successfulPages: [],
      failedPages: [options.pageStart],
      lowConfidencePages: [],
      deadlineReached: deadline.deadlineReached()
    });

    return {
      extractedText: "",
      pageSummaries: [],
      slideTexts: [],
      limitationNote: deadline.signal.aborted
        ? `PDF 本地 OCR 初始化已中断，当前页未标记为完成；可从第 ${options.pageStart} 页重试。`
        : "PDF 文字层为空或证据不足，本地 OCR 解析失败，未根据文件名或历史对话猜测内容。",
      parseStatus: "metadata_only" as const,
      ...coverage
    };
  } finally {
    if (document) {
      await waitForWithAbort(document.destroy(), deadline.signal).catch(() => undefined);
    }
  }
}

async function parseText(buffer: Buffer) {
  const extractedText = smartLimit(buffer.toString("utf8"));

  return {
    extractedText,
    pageSummaries: extractedText ? [extractedText.slice(0, 300)] : [],
    slideTexts: [],
    limitationNote: extractedText ? "已按 UTF-8 文本提取内容。" : "文本文件为空或无法提取内容。",
    parseStatus: extractedText ? "parsed" as const : "metadata_only" as const
  };
}

export async function parseAdminIngestFile(input: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  buffer: Buffer;
  pageStart?: number;
  pageBatchSize?: number;
  recognitionMode?: "wechat_conversation";
  signal?: AbortSignal;
}): Promise<IngestParsedFileResult> {
  const fileType = inferFileType(input.fileName, input.mimeType);
  const batch = normalizeParseBatch(input);
  const base = {
    ok: true as const,
    fileName: input.fileName,
    fileType,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    source: "admin_ingest" as const
  };

  if (fileType === "docx") {
    return { ...base, ...(await parseDocx(input.buffer)) };
  }

  if (fileType === "pptx") {
    return { ...base, ...(await parsePptx(input.buffer, batch)) };
  }

  if (fileType === "ppt") {
    return {
      ...base,
      parseStatus: "unsupported",
      extractedText: "",
      pageSummaries: [],
      slideTexts: [],
      limitationNote: "旧版 .ppt 二进制格式暂不支持精准解析，请在 WPS/PowerPoint 中另存为 .pptx 后重新上传。"
    };
  }

  if (fileType === "pdf") {
    return { ...base, ...(await parsePdf(input.buffer, batch)) };
  }

  if (fileType === "image") {
    return {
      ...base,
      ...(input.recognitionMode === "wechat_conversation"
        ? await parseWechatConversationImage({ buffer: input.buffer, signal: batch.signal })
        : await parseImage({ buffer: input.buffer, signal: batch.signal }))
    };
  }

  if (fileType === "text") {
    return { ...base, ...(await parseText(input.buffer)) };
  }

  return {
    ...base,
    parseStatus: "unsupported",
    extractedText: "",
    pageSummaries: [],
    slideTexts: [],
    limitationNote: "当前文件类型暂不支持正文解析，只能把文件名、类型和大小作为元数据传给 GPT。"
  };
}
