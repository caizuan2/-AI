import "server-only";

import { posix as posixPath } from "node:path";
import type { JSZipObject } from "jszip";
import {
  extractAdminIngestImageText,
  type AdminIngestVisionResult
} from "@/lib/enterprise/ingest-image-vision";

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
}

const MAX_EXTRACTED_TEXT = 20_000;
const MAX_PPTX_SLIDES = 40;
const MAX_PPTX_IMAGES_PER_SLIDE = 6;
const MAX_PPTX_VISION_IMAGES = 24;
const MAX_PPTX_IMAGE_BYTES = 7 * 1024 * 1024;
const MAX_PPTX_TOTAL_IMAGE_BYTES = 32 * 1024 * 1024;
const MAX_PPTX_UNCOMPRESSED_BYTES = 120 * 1024 * 1024;
const PPTX_VISION_CONCURRENCY = 2;
const DEFAULT_PPTX_VISION_TIMEOUT_MS = 120_000;

function readPptxVisionTimeoutMs() {
  const configured = Number(process.env.ADMIN_INGEST_PPTX_VISION_TIMEOUT_MS);

  return Number.isFinite(configured) && configured > 0
    ? Math.min(180_000, Math.max(10_000, Math.floor(configured)))
    : DEFAULT_PPTX_VISION_TIMEOUT_MS;
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

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, () => worker()));

  return results;
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

async function parsePptx(buffer: Buffer) {
  try {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(buffer);
    const totalUncompressedBytes = Object.values(zip.files).reduce((total, entry) => {
      return total + (readZipEntryUncompressedSize(entry) ?? 0);
    }, 0);

    if (totalUncompressedBytes > MAX_PPTX_UNCOMPRESSED_BYTES) {
      return {
        extractedText: "",
        pageSummaries: [],
        slideTexts: [],
        limitationNote: "PPTX 解压后的内容超过安全上限，已停止解析。",
        parseStatus: "unsupported" as const
      };
    }

    const fallbackSlideFiles = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
      .sort((a, b) => readSlideIndex(a) - readSlideIndex(b));
    const slideOrder = await orderPptxSlideFiles((path) => zip.file(path), fallbackSlideFiles);
    const slideFiles = slideOrder.slides.filter((slide) => slide.slideIndex <= MAX_PPTX_SLIDES);
    const slides: Array<{
      slideIndex: number;
      nativeText: string;
      mediaPaths: string[];
      skippedMediaCount: number;
      hasUnrenderedGraphic: boolean;
    }> = [];
    let unreadableSlideCount = 0;

    for (const orderedSlide of slideFiles) {
      const fileName = orderedSlide.path;
      const xml = await readZipText(zip.file(fileName));

      if (!xml) {
        unreadableSlideCount += 1;
        continue;
      }

      const relationshipXml = await readZipText(zip.file(relationshipFileForSlide(fileName)));

      const mediaRelationships = extractSlideMediaPaths(fileName, xml, relationshipXml);
      const allMediaPaths = mediaRelationships.mediaPaths;

      slides.push({
        slideIndex: orderedSlide.slideIndex,
        nativeText: cleanText(extractXmlTagText(xml, ["a:t"]).join(" ")),
        mediaPaths: allMediaPaths.slice(0, MAX_PPTX_IMAGES_PER_SLIDE),
        skippedMediaCount: mediaRelationships.unresolvedCount
          + Math.max(0, allMediaPaths.length - MAX_PPTX_IMAGES_PER_SLIDE),
        hasUnrenderedGraphic: hasUnrenderedSlideGraphic(xml, relationshipXml)
      });
    }

    const uniqueMediaPaths = Array.from(new Set(slides.flatMap((slide) => slide.mediaPaths)));
    const selectedMediaPaths = uniqueMediaPaths.slice(0, MAX_PPTX_VISION_IMAGES);
    const mediaInputs: Array<{ path: string; bytes: Uint8Array; mimeType: string }> = [];
    let totalImageBytes = 0;
    let skippedMediaCount = uniqueMediaPaths.length - selectedMediaPaths.length
      + slides.reduce((count, slide) => count + slide.skippedMediaCount, 0);

    for (const mediaPath of selectedMediaPaths) {
      const entry = zip.file(mediaPath);
      const reportedSize = entry ? readZipEntryUncompressedSize(entry) : null;

      if (!entry || (reportedSize !== null && reportedSize > MAX_PPTX_IMAGE_BYTES)) {
        skippedMediaCount += 1;
        continue;
      }

      const bytes = await entry.async("uint8array");

      if (
        bytes.byteLength > MAX_PPTX_IMAGE_BYTES
        || totalImageBytes + bytes.byteLength > MAX_PPTX_TOTAL_IMAGE_BYTES
      ) {
        skippedMediaCount += 1;
        continue;
      }

      const mimeType = detectImageMimeType(bytes);

      if (!mimeType) {
        skippedMediaCount += 1;
        continue;
      }

      totalImageBytes += bytes.byteLength;
      mediaInputs.push({ path: mediaPath, bytes, mimeType });
    }

    const pptxVisionController = new AbortController();
    const pptxVisionTimeoutId = setTimeout(() => pptxVisionController.abort(), readPptxVisionTimeoutMs());
    const visionResults = await mapWithConcurrency(mediaInputs, PPTX_VISION_CONCURRENCY, async (media) => ({
      path: media.path,
      result: await extractAdminIngestImageText({
        bytes: media.bytes,
        mimeType: media.mimeType,
        contextLabel: "PPTX 内嵌课件图片",
        signal: pptxVisionController.signal
      })
    })).finally(() => clearTimeout(pptxVisionTimeoutId));
    const visionByPath = new Map<string, AdminIngestVisionResult>(visionResults.map((item) => [item.path, item.result]));
    const successfulVisionCount = visionResults.filter((item) => item.result.status === "ok" && item.result.text).length;
    const failedVisionCount = visionResults.length - successfulVisionCount;
    const slideTexts: Array<{ slideIndex: number; text: string }> = [];

    for (const slide of slides) {
      const parts = [slide.nativeText ? `幻灯片文字：${slide.nativeText}` : ""];

      slide.mediaPaths.forEach((mediaPath, index) => {
        const result = visionByPath.get(mediaPath);

        if (result?.status === "ok" && result.text) {
          parts.push(`图片识别 ${index + 1}：${result.text}`);
        }
      });

      const text = cleanStructuredText(parts.filter(Boolean).join("\n"));

      if (text) {
        slideTexts.push({ slideIndex: slide.slideIndex, text });
      }
    }

    const combinedSlideText = slideTexts.map((slide) => `Slide ${slide.slideIndex}:\n${slide.text}`).join("\n\n");
    const extractedText = smartLimit(combinedSlideText, MAX_EXTRACTED_TEXT, true);
    const truncatedSlideCount = Math.max(0, slideOrder.declaredSlideCount - MAX_PPTX_SLIDES);
    const unrenderedGraphicCount = slides.filter((slide) => slide.hasUnrenderedGraphic).length;
    const hasTruncatedVisionResult = visionResults.some((item) => item.result.truncated);
    const hasTruncatedCombinedText = cleanStructuredText(combinedSlideText).length > MAX_EXTRACTED_TEXT;
    const hasPartialCoverage = truncatedSlideCount > 0
      || skippedMediaCount > 0
      || failedVisionCount > 0
      || unrenderedGraphicCount > 0
      || unreadableSlideCount > 0
      || slideOrder.unresolvedSlideCount > 0
      || !slideOrder.reliable
      || hasTruncatedVisionResult
      || hasTruncatedCombinedText;
    const parseStatus = extractedText
      ? hasPartialCoverage ? "partial" as const : "parsed" as const
      : "metadata_only" as const;
    const limitationNote = [
      `PPTX 共 ${slideOrder.declaredSlideCount} 页，本次成功读取 ${slides.length} 页。`,
      `发现 ${uniqueMediaPaths.length} 个内嵌图片关系，视觉识别成功 ${successfulVisionCount} 个，失败或跳过 ${failedVisionCount + skippedMediaCount} 个。`,
      unreadableSlideCount > 0 ? `有 ${unreadableSlideCount} 页因 XML 缺失或超过安全上限而未读取。` : "",
      slideOrder.unresolvedSlideCount > 0 ? `有 ${slideOrder.unresolvedSlideCount} 页缺少有效的 presentation.xml 关系映射。` : "",
      !slideOrder.reliable && slideOrder.unresolvedSlideCount === 0
        ? "未获得完整的 presentation.xml 页面顺序映射，已按 slide 文件编号兜底排序。"
        : "",
      unrenderedGraphicCount > 0 ? `另有 ${unrenderedGraphicCount} 页包含未渲染的图表、组合图形或多媒体对象。` : "",
      truncatedSlideCount > 0 ? `另有 ${truncatedSlideCount} 页超过安全处理上限，未纳入本轮分析。` : "",
      extractedText
        ? hasPartialCoverage
          ? "当前只获得部分附件证据，回答必须明确说明部分识别，不得声称已完整看完。"
          : "已按页合并幻灯片文字层与内嵌图片识别结果。"
        : "未获得可用于分析的正文，不得根据历史对话假装读懂当前 PPTX。"
    ].filter(Boolean).join(" ");

    return {
      extractedText,
      pageSummaries: slideTexts.slice(0, 20).map((slide) => `Slide ${slide.slideIndex}: ${slide.text.slice(0, 320)}`),
      slideTexts: slideTexts.slice(0, MAX_PPTX_SLIDES),
      limitationNote,
      parseStatus
    };
  } catch (error) {
    return {
      extractedText: "",
      pageSummaries: [],
      slideTexts: [],
      limitationNote: error instanceof Error ? `PPTX 解析失败：${error.message}` : "PPTX 解析失败。",
      parseStatus: "unsupported" as const
    };
  }
}

function describeVisionFailure(result: AdminIngestVisionResult) {
  switch (result.status) {
    case "unavailable":
      return "投喂端视觉识别服务尚未配置，未读取到图片正文。";
    case "skipped_large":
      return "图片超过视觉识别安全大小上限，未读取到图片正文。";
    case "unsupported":
      return "当前图片格式不受视觉识别服务支持。";
    default:
      return "图片视觉识别失败，未读取到图片正文。";
  }
}

async function parseImage(input: { buffer: Buffer }) {
  const detectedMimeType = detectImageMimeType(input.buffer);

  if (!detectedMimeType) {
    return {
      extractedText: "",
      pageSummaries: [],
      slideTexts: [],
      limitationNote: "图片文件头与支持格式不匹配，已停止识别。",
      parseStatus: "unsupported" as const
    };
  }

  const result = await extractAdminIngestImageText({
    bytes: input.buffer,
    mimeType: detectedMimeType,
    contextLabel: "管理员当前上传的课件图片"
  });

  if (result.status !== "ok" || !result.text) {
    return {
      extractedText: "",
      pageSummaries: [],
      slideTexts: [],
      limitationNote: describeVisionFailure(result),
      parseStatus: "metadata_only" as const
    };
  }

  return {
    extractedText: smartLimit(result.text, MAX_EXTRACTED_TEXT, true),
    pageSummaries: [result.text.slice(0, 500)],
    slideTexts: [],
    limitationNote: `已通过 ${result.provider ?? "vision"}/${result.model ?? "unknown"} 识别图片中的可见文字与结构；回答只能基于该识别结果。`,
    parseStatus: result.truncated ? "partial" as const : "parsed" as const
  };
}

async function parsePdf(buffer: Buffer) {
  try {
    const pdfParse = (await import("pdf-parse")).default;
    const result = await pdfParse(buffer);
    const extractedText = smartLimit(result.text || "");

    return {
      extractedText,
      pageSummaries: extractedText ? [`PDF 共 ${result.numpages || "未知"} 页，已提取文本片段。`] : [],
      slideTexts: [],
      limitationNote: extractedText
        ? "已使用现有 pdf-parse 解析 PDF 文本；扫描件或图片型 PDF 仍可能需要 OCR。"
        : "PDF 解析未提取到可见文字，可能是扫描件或图片型 PDF，需要 OCR。",
      parseStatus: extractedText ? "parsed" as const : "partial" as const
    };
  } catch (error) {
    return {
      extractedText: "",
      pageSummaries: [],
      slideTexts: [],
      limitationNote: error instanceof Error
        ? `PDF 解析失败：${error.message}`
        : "PDF 解析失败，后续需要接入更稳定的 PDF/OCR 链路。",
      parseStatus: "unsupported" as const
    };
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
}): Promise<IngestParsedFileResult> {
  const fileType = inferFileType(input.fileName, input.mimeType);
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
    return { ...base, ...(await parsePptx(input.buffer)) };
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
    return { ...base, ...(await parsePdf(input.buffer)) };
  }

  if (fileType === "image") {
    return { ...base, ...(await parseImage({ buffer: input.buffer })) };
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
