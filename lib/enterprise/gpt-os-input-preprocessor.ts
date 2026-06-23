export interface GptOSRawAttachmentInput {
  fileName?: string;
  fileType?: string;
  mimeType?: string;
  fileSize?: number;
  sizeBytes?: number;
  parseStatus?: string;
  extractedText?: string;
  text?: string;
  content?: string;
  visibleText?: string;
  summary?: string;
  pageSummaries?: string[];
  slideTexts?: Array<{ slideIndex?: number; text?: string } | string>;
  limitationNote?: string;
}

export interface GptOSFileContext {
  fileName: string;
  mimeType?: string;
  parseStatus?: string;
  textPreview: string;
  metadata: string[];
}

export interface GptOSImageContext {
  fileName: string;
  mimeType?: string;
  caption: string;
  metadata: string[];
}

export interface GptOSPreprocessedInput {
  textContent: string;
  voiceTranscript: string;
  fileContexts: GptOSFileContext[];
  imageContexts: GptOSImageContext[];
  structuredSignals: string[];
  metadata: {
    textLength: number;
    fileCount: number;
    imageCount: number;
    voiceDetected: boolean;
    structuredDetected: boolean;
  };
}

interface PreprocessInput {
  text: string;
  voiceTranscript?: string | null;
  attachments?: GptOSRawAttachmentInput[];
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function compactText(parts: Array<string | undefined>, maxLength = 1200) {
  const text = parts.map((part) => readString(part)).filter(Boolean).join("\n").replace(/\n{3,}/g, "\n\n").trim();

  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function isImageAttachment(attachment: GptOSRawAttachmentInput) {
  const mimeType = readString(attachment.mimeType || attachment.fileType).toLowerCase();
  const fileName = readString(attachment.fileName).toLowerCase();

  return mimeType.startsWith("image/") || /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/.test(fileName);
}

function normalizeSlideTexts(slideTexts: GptOSRawAttachmentInput["slideTexts"]) {
  if (!Array.isArray(slideTexts)) {
    return [];
  }

  return slideTexts.map((slide, index) => {
    if (typeof slide === "string") {
      return slide.trim() ? `Slide ${index + 1}: ${slide.trim()}` : "";
    }

    const text = readString(slide?.text);

    return text ? `Slide ${slide?.slideIndex ?? index + 1}: ${text}` : "";
  }).filter(Boolean);
}

function buildAttachmentText(attachment: GptOSRawAttachmentInput) {
  return compactText([
    attachment.extractedText,
    attachment.text,
    attachment.content,
    attachment.visibleText,
    attachment.summary,
    ...(attachment.pageSummaries ?? []),
    ...normalizeSlideTexts(attachment.slideTexts),
    attachment.limitationNote
  ]);
}

function buildMetadata(attachment: GptOSRawAttachmentInput) {
  return [
    attachment.mimeType || attachment.fileType ? `type:${attachment.mimeType || attachment.fileType}` : "",
    attachment.parseStatus ? `parse:${attachment.parseStatus}` : "",
    attachment.fileSize || attachment.sizeBytes ? `size:${attachment.fileSize || attachment.sizeBytes}` : ""
  ].filter(Boolean);
}

function detectVoice(text: string, voiceTranscript?: string | null) {
  if (readString(voiceTranscript)) {
    return readString(voiceTranscript);
  }

  const match = text.match(/(?:语音|voice|transcript|转写)[：:]\s*([\s\S]+)/i);

  return match?.[1]?.trim() ?? "";
}

function detectStructuredSignals(text: string) {
  const signals: string[] = [];

  if (/^\s*[{[]/.test(text)) {
    signals.push("json-like");
  }

  if (/\|.+\|/.test(text)) {
    signals.push("table-like");
  }

  if (/^#{1,6}\s+/m.test(text)) {
    signals.push("markdown-headings");
  }

  if (/标准问答|分类|标签|训练记录|知识库/.test(text)) {
    signals.push("knowledge-structure");
  }

  return signals;
}

export function preprocessGptOSInput(input: PreprocessInput): GptOSPreprocessedInput {
  const textContent = readString(input.text);
  const voiceTranscript = detectVoice(textContent, input.voiceTranscript);
  const fileContexts: GptOSFileContext[] = [];
  const imageContexts: GptOSImageContext[] = [];

  for (const attachment of input.attachments ?? []) {
    const fileName = readString(attachment.fileName) || "unnamed-file";
    const textPreview = buildAttachmentText(attachment);
    const metadata = buildMetadata(attachment);

    if (isImageAttachment(attachment)) {
      imageContexts.push({
        fileName,
        mimeType: attachment.mimeType || attachment.fileType,
        caption: textPreview || `图片附件：${fileName}。当前阶段使用图片元数据和文件名作为推理上下文。`,
        metadata
      });
      continue;
    }

    fileContexts.push({
      fileName,
      mimeType: attachment.mimeType || attachment.fileType,
      parseStatus: attachment.parseStatus,
      textPreview: textPreview || `文件附件：${fileName}。当前未获得可解析正文，只使用元数据参与推理。`,
      metadata
    });
  }

  const structuredSignals = detectStructuredSignals(textContent);

  return {
    textContent,
    voiceTranscript,
    fileContexts,
    imageContexts,
    structuredSignals,
    metadata: {
      textLength: textContent.length,
      fileCount: fileContexts.length,
      imageCount: imageContexts.length,
      voiceDetected: Boolean(voiceTranscript),
      structuredDetected: structuredSignals.length > 0
    }
  };
}
