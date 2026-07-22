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
  slideTexts?: Array<{ slideIndex?: number; text?: string } | string>;
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
  slideTexts: Array<{ slideIndex: number; text: string }>;
  totalPages?: number;
  processedPageStart?: number;
  processedPageEnd?: number;
  nextPage?: number;
  complete?: boolean;
  successfulPages: number[];
  failedPages: number[];
  lowConfidencePages: number[];
  coveragePercent?: number;
  successRatePercent?: number;
  deadlineReached: boolean;
  visibleText?: string;
  userPrompt?: string;
  parseStatus: "metadata_only" | "summary_only" | "parsed" | "partial" | "unsupported" | "ocr_pending";
  limitationNote: string;
}

const DEFAULT_FILE_CONTEXT_LIMIT = 80_000;
const PER_FILE_CONTEXT_LIMIT = 52_000;
const MAX_PAGE_EVIDENCE_COUNT = 500;
const MAX_PAGE_SUMMARY_CHARS = 420;
const MAX_SLIDE_TEXT_CHARS = 900;

function cleanText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function cleanStructuredText(value: unknown) {
  return typeof value === "string"
    ? value
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => line.replace(/[\t ]+/g, " ").trim())
      .filter(Boolean)
      .join("\n")
      .trim()
    : "";
}

function cleanTextArray(value: unknown, limit = 8, itemLimit?: number) {
  return Array.isArray(value)
    ? value
      .map((item) => cleanText(item))
      .filter(Boolean)
      .slice(0, limit)
      .map((item) => itemLimit ? smartLimit(item, itemLimit) : item)
    : [];
}

function cleanSlideTexts(value: unknown, limit = 40) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item, index) => {
    if (typeof item === "string") {
      const text = cleanStructuredText(item);

      return text ? { slideIndex: index + 1, text } : null;
    }

    if (!item || typeof item !== "object") {
      return null;
    }

    const record = item as { slideIndex?: unknown; pageIndex?: unknown; text?: unknown; content?: unknown };
    const slideIndex = readNumber(record.slideIndex, record.pageIndex) ?? index + 1;
    const text = smartLimit(
      cleanStructuredText(record.text) || cleanStructuredText(record.content),
      MAX_SLIDE_TEXT_CHARS,
      true
    );

    return text ? { slideIndex, text } : null;
  }).filter((item): item is { slideIndex: number; text: string } => item !== null).slice(0, limit);
}

function cleanPageNumbers(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0)))
    .sort((left, right) => left - right);
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

function smartLimit(value: string, maxLength: number, preserveStructure = false) {
  const text = preserveStructure ? cleanStructuredText(value) : cleanText(value);

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
  ].filter(Boolean).join(preserveStructure ? "\n" : " ");
}

function normalizeOneFile(source: IngestFileContextSource, userPrompt?: string): IngestFileContext | null {
  const fileName = cleanText(source.fileName);

  if (!fileName) {
    return null;
  }

  const mimeType = cleanText(source.mimeType || source.fileType);
  const fileType = inferFileType(fileName, cleanText(source.fileType), mimeType);
  const rawExtractedText = cleanStructuredText(source.extractedText)
    || cleanStructuredText(source.text)
    || cleanStructuredText(source.content);
  const extractedText = smartLimit(
    rawExtractedText,
    PER_FILE_CONTEXT_LIMIT,
    true
  );
  const visibleText = smartLimit(cleanText(source.visibleText), Math.floor(PER_FILE_CONTEXT_LIMIT / 2));
  const summary = smartLimit(cleanText(source.summary), 1_400);
  const pageSummaries = cleanTextArray(source.pageSummaries, MAX_PAGE_EVIDENCE_COUNT, MAX_PAGE_SUMMARY_CHARS);
  const slideTexts = cleanSlideTexts(source.slideTexts, MAX_PAGE_EVIDENCE_COUNT);
  const totalPages = readNumber(source.totalPages);
  const processedPageStart = readNumber(source.processedPageStart);
  const processedPageEnd = readNumber(source.processedPageEnd);
  const nextPage = readNumber(source.nextPage);
  const successfulPages = cleanPageNumbers(source.successfulPages);
  const failedPages = cleanPageNumbers(source.failedPages);
  const lowConfidencePages = cleanPageNumbers(source.lowConfidencePages);
  const coveragePercent = typeof source.coveragePercent === "number" && Number.isFinite(source.coveragePercent)
    ? Math.min(100, Math.max(0, source.coveragePercent))
    : undefined;
  const successRatePercent = typeof source.successRatePercent === "number" && Number.isFinite(source.successRatePercent)
    ? Math.min(100, Math.max(0, source.successRatePercent))
    : undefined;
  const explicitParseStatus = cleanText(source.parseStatus);
  const parseStatus = explicitParseStatus === "unsupported" || explicitParseStatus === "ocr_pending" || explicitParseStatus === "partial"
    ? explicitParseStatus
    : extractedText || visibleText || pageSummaries.length > 0 || slideTexts.length > 0
    ? "parsed"
    : summary
      ? "summary_only"
      : "metadata_only";
  const baseLimitationNote = cleanText(source.limitationNote) || (parseStatus === "metadata_only"
    ? "当前系统只拿到文件名、类型和大小，尚未解析到完整正文。请基于现有元信息做初步判断，并明确需要补充完整正文后才能深度总结。"
    : parseStatus === "summary_only"
      ? "当前系统只拿到摘要，尚未解析到完整正文。请基于摘要做初步分析，并说明正式入库前需要补充原文。"
      : "当前系统已拿到可用于分析的正文片段或摘要，请优先结合正文内容回答。");
  const limitationNote = rawExtractedText.length > PER_FILE_CONTEXT_LIMIT
    ? `${baseLimitationNote} 合并正文超过单文件上下文预算；系统已同时保留各页/各幻灯片证据与覆盖率，回答不得把未进入上下文的细节视为已核实。`
    : baseLimitationNote;

  return {
    fileName,
    fileType,
    fileSize: readNumber(source.fileSize, source.sizeBytes),
    mimeType,
    extractedText: extractedText || undefined,
    pageSummaries,
    slideTexts,
    totalPages,
    processedPageStart,
    processedPageEnd,
    nextPage,
    complete: typeof source.complete === "boolean" ? source.complete : undefined,
    successfulPages,
    failedPages,
    lowConfidencePages,
    coveragePercent,
    successRatePercent,
    deadlineReached: source.deadlineReached === true,
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
    const useStructuredSlideEvidence = file.slideTexts.length > 0;
    const bodyParts = [
      file.extractedText && !useStructuredSlideEvidence ? `extractedText:\n${file.extractedText}` : "",
      file.visibleText ? `visibleTextOrSummary:\n${file.visibleText}` : "",
      file.slideTexts.length > 0 ? `slideTexts:\n${file.slideTexts.map((slide) => `Slide ${slide.slideIndex}: ${slide.text}`).join("\n")}` : "",
      file.pageSummaries.length > 0 ? `pageSummaries:\n${file.pageSummaries.map((summary, pageIndex) => `${pageIndex + 1}. ${summary}`).join("\n")}` : ""
    ].filter(Boolean);
    const coverage = [
      file.totalPages ? `totalPages: ${file.totalPages}` : "",
      file.processedPageStart ? `processedPageStart: ${file.processedPageStart}` : "",
      file.processedPageEnd ? `processedPageEnd: ${file.processedPageEnd}` : "",
      typeof file.complete === "boolean" ? `complete: ${file.complete}` : "",
      typeof file.coveragePercent === "number" ? `coveragePercent: ${file.coveragePercent}` : "",
      typeof file.successRatePercent === "number" ? `successRatePercent: ${file.successRatePercent}` : "",
      file.successfulPages.length > 0 ? `successfulPages: ${file.successfulPages.join(",")}` : "",
      file.failedPages.length > 0 ? `failedPages: ${file.failedPages.join(",")}` : "",
      file.lowConfidencePages.length > 0 ? `lowConfidencePages: ${file.lowConfidencePages.join(",")}` : "",
      file.nextPage ? `nextPage: ${file.nextPage}` : "",
      file.deadlineReached ? "deadlineReached: true" : ""
    ].filter(Boolean);

    return [
      `### 文件 ${index + 1}: ${file.fileName}`,
      `fileType: ${file.fileType}`,
      `mimeType: ${file.mimeType || "unknown"}`,
      `fileSize: ${formatFileSize(file.fileSize)}`,
      `parseStatus: ${file.parseStatus}`,
      coverage.length > 0 ? `coverage:\n${coverage.join("\n")}` : "",
      file.userPrompt ? `userPrompt: ${file.userPrompt}` : "",
      `limitationNote: ${file.limitationNote}`,
      bodyParts.length > 0 ? bodyParts.join("\n\n") : "content: 未获得正文。"
    ].filter(Boolean).join("\n");
  }).join("\n\n");

  const evidenceRules = [
    "【附件证据规则】",
    "1. 只有下方 extractedText、visibleTextOrSummary、slideTexts、pageSummaries 才是本轮当前附件的证据；coverage 只说明识别范围与可靠性，不等于正文。",
    "2. 文件名、limitationNote 和历史对话不能替代当前附件正文；如引用历史内容，必须明确标注为历史上下文。",
    "3. parseStatus 为 partial、metadata_only、unsupported 或 ocr_pending 时，不得声称已完整阅读、精准识别或完全理解附件。",
    "4. failedPages、lowConfidencePages、nextPage 或 complete=false 代表仍有未核实内容；必须如实说明，不得依据课程常识补写。",
    "5. 最终正文由当前 Agent 选中的同一个模型生成；不得要求或假设其他视觉/备用模型补写。"
  ].join("\n");

  return smartLimit(
    `${evidenceRules}\n\n${sections}`,
    options.maxTotalChars ?? DEFAULT_FILE_CONTEXT_LIMIT,
    true
  );
}
