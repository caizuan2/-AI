export interface IngestFileContextSource {
  fileName: string;
  fileType?: string;
  mimeType?: string;
  fileSize?: number;
  sizeBytes?: number;
  status?: string;
  parseStatus?: string;
  extractedText?: string;
  text?: string;
  content?: string;
  visibleText?: string;
  summary?: string;
  pageSummaries?: string[];
  limitationNote?: string;
  userPrompt?: string;
}

export interface IngestFileContext {
  fileName: string;
  fileType: string;
  fileSize?: number;
  mimeType?: string;
  extractedText?: string;
  pageSummaries: string[];
  visibleText?: string;
  userPrompt?: string;
  parseStatus: "metadata_only" | "summary_only" | "parsed";
  limitationNote: string;
}

const DEFAULT_FILE_CONTEXT_LIMIT = 16_000;
const PER_FILE_CONTEXT_LIMIT = 8_000;

function cleanText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function cleanTextArray(value: unknown, limit = 8) {
  return Array.isArray(value)
    ? value.map((item) => cleanText(item)).filter(Boolean).slice(0, limit)
    : [];
}

function readNumber(...values: unknown[]) {
  for (const value of values) {
    const numberValue = typeof value === "number" ? value : Number(value);

    if (Number.isFinite(numberValue) && numberValue > 0) {
      return numberValue;
    }
  }

  return undefined;
}

function inferFileType(fileName: string, fileType?: string, mimeType?: string) {
  const lowerName = fileName.toLowerCase();
  const lowerType = `${fileType ?? ""} ${mimeType ?? ""}`.toLowerCase();

  if (lowerName.endsWith(".ppt") || lowerName.endsWith(".pptx") || lowerType.includes("presentation")) {
    return "PPT";
  }

  if (lowerName.endsWith(".pdf") || lowerType.includes("pdf")) {
    return "PDF";
  }

  if (lowerName.endsWith(".doc") || lowerName.endsWith(".docx") || lowerType.includes("word")) {
    return "Word";
  }

  if (lowerType.includes("image/") || /\.(png|jpe?g|gif|webp|bmp)$/i.test(lowerName)) {
    return "图片";
  }

  if (lowerName.endsWith(".txt") || lowerType.includes("text/plain")) {
    return "TXT";
  }

  if (lowerName.endsWith(".md") || lowerType.includes("markdown")) {
    return "Markdown";
  }

  return fileType || mimeType || "文件";
}

function smartLimit(value: string, maxLength: number) {
  const text = cleanText(value);

  if (text.length <= maxLength) {
    return text;
  }

  const headLength = Math.floor(maxLength * 0.58);
  const middleLength = Math.floor(maxLength * 0.24);
  const tailLength = Math.max(0, maxLength - headLength - middleLength - 72);
  const middleStart = Math.max(headLength, Math.floor((text.length - middleLength) / 2));

  return [
    text.slice(0, headLength),
    `...（中间内容已压缩，原文约 ${text.length} 字）...`,
    text.slice(middleStart, middleStart + middleLength),
    tailLength > 0 ? `...（末尾片段）...${text.slice(-tailLength)}` : ""
  ].filter(Boolean).join(" ");
}

function normalizeOneFile(source: IngestFileContextSource, userPrompt?: string): IngestFileContext | null {
  const fileName = cleanText(source.fileName);

  if (!fileName) {
    return null;
  }

  const mimeType = cleanText(source.mimeType || source.fileType);
  const fileType = inferFileType(fileName, cleanText(source.fileType), mimeType);
  const extractedText = smartLimit(
    cleanText(source.extractedText) || cleanText(source.text) || cleanText(source.content),
    PER_FILE_CONTEXT_LIMIT
  );
  const visibleText = smartLimit(cleanText(source.visibleText), Math.floor(PER_FILE_CONTEXT_LIMIT / 2));
  const summary = smartLimit(cleanText(source.summary), 1_400);
  const pageSummaries = cleanTextArray(source.pageSummaries, 10);
  const parseStatus = extractedText || visibleText || pageSummaries.length > 0
    ? "parsed"
    : summary
      ? "summary_only"
      : "metadata_only";
  const limitationNote = cleanText(source.limitationNote) || (parseStatus === "metadata_only"
    ? "当前系统只拿到文件名、类型和大小，尚未解析到完整正文。请基于现有元信息做初步判断，并明确需要补充完整正文后才能深度总结。"
    : parseStatus === "summary_only"
      ? "当前系统只拿到摘要，尚未解析到完整正文。请基于摘要做初步分析，并说明正式入库前需要补充原文。"
      : "当前系统已拿到可用于分析的正文片段或摘要，请优先结合正文内容回答。");

  return {
    fileName,
    fileType,
    fileSize: readNumber(source.fileSize, source.sizeBytes),
    mimeType,
    extractedText: extractedText || undefined,
    pageSummaries,
    visibleText: visibleText || summary || undefined,
    userPrompt: cleanText(source.userPrompt) || cleanText(userPrompt) || undefined,
    parseStatus,
    limitationNote
  };
}

export function buildIngestFileContexts(
  attachments: IngestFileContextSource[] = [],
  options: {
    userPrompt?: string;
    maxFiles?: number;
  } = {}
) {
  return attachments
    .slice(0, options.maxFiles ?? 12)
    .map((attachment) => normalizeOneFile(attachment, options.userPrompt))
    .filter((attachment): attachment is IngestFileContext => attachment !== null);
}

function formatFileSize(value?: number) {
  if (!value || !Number.isFinite(value)) {
    return "大小未知";
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function buildIngestFileContextPrompt(
  attachments: IngestFileContextSource[] = [],
  options: {
    userPrompt?: string;
    maxFiles?: number;
    maxTotalChars?: number;
  } = {}
) {
  const contexts = buildIngestFileContexts(attachments, options);

  if (contexts.length === 0) {
    return "无附件。";
  }

  const sections = contexts.map((file, index) => {
    const bodyParts = [
      file.extractedText ? `extractedText:\n${file.extractedText}` : "",
      file.visibleText ? `visibleTextOrSummary:\n${file.visibleText}` : "",
      file.pageSummaries.length > 0 ? `pageSummaries:\n${file.pageSummaries.map((summary, pageIndex) => `${pageIndex + 1}. ${summary}`).join("\n")}` : ""
    ].filter(Boolean);

    return [
      `### 文件 ${index + 1}: ${file.fileName}`,
      `fileType: ${file.fileType}`,
      `mimeType: ${file.mimeType || "unknown"}`,
      `fileSize: ${formatFileSize(file.fileSize)}`,
      `parseStatus: ${file.parseStatus}`,
      file.userPrompt ? `userPrompt: ${file.userPrompt}` : "",
      `limitationNote: ${file.limitationNote}`,
      bodyParts.length > 0 ? bodyParts.join("\n\n") : "content: 未获得正文。"
    ].filter(Boolean).join("\n");
  }).join("\n\n");

  return smartLimit(sections, options.maxTotalChars ?? DEFAULT_FILE_CONTEXT_LIMIT);
}
