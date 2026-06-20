import "server-only";

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

function smartLimit(text: string, maxLength = MAX_EXTRACTED_TEXT) {
  const cleaned = cleanText(text);

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
  ].filter(Boolean).join(" ");
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
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => readSlideIndex(a) - readSlideIndex(b));
  const slideTexts: Array<{ slideIndex: number; text: string }> = [];

  for (const fileName of slideFiles) {
    const xml = await zip.file(fileName)?.async("string");

    if (!xml) {
      continue;
    }

    const text = cleanText(extractXmlTagText(xml, ["a:t"]).join(" "));

    if (text) {
      slideTexts.push({
        slideIndex: readSlideIndex(fileName),
        text
      });
    }
  }

  const extractedText = smartLimit(slideTexts.map((slide) => `Slide ${slide.slideIndex}: ${slide.text}`).join("\n"));

  return {
    extractedText,
    pageSummaries: slideTexts.slice(0, 12).map((slide) => `Slide ${slide.slideIndex}: ${slide.text.slice(0, 260)}`),
    slideTexts: slideTexts.slice(0, 24),
    limitationNote: extractedText
      ? "已从 ppt/slides/slide*.xml 提取每页可见文字，并保留 slideIndex。"
      : "已读取 PPTX，但未提取到可见文字。",
    parseStatus: extractedText ? "parsed" as const : "metadata_only" as const
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

  if (fileType === "pdf") {
    return { ...base, ...(await parsePdf(input.buffer)) };
  }

  if (fileType === "image") {
    return {
      ...base,
      parseStatus: "ocr_pending",
      extractedText: "",
      pageSummaries: [],
      slideTexts: [],
      limitationNote: "图片 OCR 入口已识别，但当前未接入 OCR；不要假装读到图片正文。"
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
