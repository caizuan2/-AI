import "server-only";

import mammoth from "mammoth";
import { ValidationError } from "@/lib/errors";

export const uploadMaxFileSizeBytes = 4 * 1024 * 1024;
export const uploadMaxFileSizeLabel = "4MB";
export const uploadSupportedExtensions = [".txt", ".md", ".pdf", ".docx"] as const;

export type UploadSupportedExtension = (typeof uploadSupportedExtensions)[number];

export interface UploadedTextSegment {
  index: number;
  charLength: number;
  preview: string;
}

export interface ExtractedUploadText {
  fileName: string;
  extension: UploadSupportedExtension;
  mimeType: string;
  size: number;
  content: string;
  charLength: number;
  segments: UploadedTextSegment[];
}

const UPLOAD_TEXT_SEGMENT_SIZE = 6000;
const MAX_ANALYSIS_SEGMENTS = 5;
const ANALYSIS_SEGMENT_PREVIEW_SIZE = 2200;

function getExtension(fileName: string): UploadSupportedExtension | null {
  const normalized = fileName.toLowerCase();
  const extension = uploadSupportedExtensions.find((item) => normalized.endsWith(item));

  return extension ?? null;
}

function normalizeExtractedText(text: string) {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function splitTextSegments(text: string): UploadedTextSegment[] {
  const segments: UploadedTextSegment[] = [];

  for (let start = 0; start < text.length; start += UPLOAD_TEXT_SEGMENT_SIZE) {
    const segment = text.slice(start, start + UPLOAD_TEXT_SEGMENT_SIZE).trim();

    if (!segment) {
      continue;
    }

    segments.push({
      index: segments.length,
      charLength: segment.length,
      preview: `${segment.slice(0, 180)}${segment.length > 180 ? "..." : ""}`
    });
  }

  return segments.length > 0
    ? segments
    : [{ index: 0, charLength: text.length, preview: text.slice(0, 180) }];
}

async function extractPdfText(buffer: Buffer) {
  const pdfParse = (await import("pdf-parse")).default;
  const result = await pdfParse(buffer);

  return result.text;
}

async function extractDocxText(buffer: Buffer) {
  const result = await mammoth.extractRawText({ buffer });

  return result.value;
}

export async function extractTextFromUpload(file: File): Promise<ExtractedUploadText> {
  const fileName = file.name.trim() || "untitled";
  const extension = getExtension(fileName);

  if (!extension) {
    throw new ValidationError("仅支持 txt、md、pdf、docx 文件。");
  }

  if (file.size <= 0) {
    throw new ValidationError("文件为空，请选择包含文本内容的文件。");
  }

  if (file.size > uploadMaxFileSizeBytes) {
    throw new ValidationError(`文件过大，请上传不超过 ${uploadMaxFileSizeLabel} 的文件。`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let rawText = "";

  try {
    if (extension === ".txt" || extension === ".md") {
      rawText = buffer.toString("utf8");
    } else if (extension === ".pdf") {
      rawText = await extractPdfText(buffer);
    } else {
      rawText = await extractDocxText(buffer);
    }
  } catch {
    throw new ValidationError("文件文本提取失败，请确认文件未损坏且未加密。");
  }

  const content = normalizeExtractedText(rawText);

  if (!content) {
    throw new ValidationError("没有从文件中提取到可用文本。");
  }

  return {
    fileName,
    extension,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    content,
    charLength: content.length,
    segments: splitTextSegments(content)
  };
}

export function buildUploadAnalysisText(content: string, segments: UploadedTextSegment[]) {
  if (segments.length <= 1 && content.length <= UPLOAD_TEXT_SEGMENT_SIZE) {
    return content;
  }

  const excerpts = segments
    .slice(0, MAX_ANALYSIS_SEGMENTS)
    .map((segment) => {
      const start = segment.index * UPLOAD_TEXT_SEGMENT_SIZE;
      const text = content.slice(start, start + ANALYSIS_SEGMENT_PREVIEW_SIZE).trim();

      return [`分段 ${segment.index + 1}（约 ${segment.charLength} 字）`, text].join("\n");
    })
    .join("\n\n---\n\n");

  return [
    `以下是长文档的自动分段摘录，共 ${segments.length} 段。请基于这些摘录整理整体知识；完整原文会在用户确认后入库。`,
    excerpts
  ].join("\n\n");
}
