import type { Prisma } from "@prisma/client";
import { createHash, randomBytes } from "crypto";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { prisma } from "@/lib/prisma";
import { estimateTokenCount } from "@/lib/logger";
import { ValidationError } from "@/lib/errors";
import type { AppRole } from "@/lib/rbac/roles";
import { normalizeKnowledgeSourceType } from "@/lib/admin-ingest/source-type";

export type AdminKbIngestSourceType = "text" | "chat" | "file";
export type AdminKbJobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "pending_processor"
  | "unsupported_processor";

export interface AdminKbActor {
  id: string;
  role: AppRole;
}

export interface AdminKbTextInput {
  title?: string | null;
  content: string;
  categoryId?: string | null;
  tags?: unknown;
  metadata?: unknown;
  sourceType?: AdminKbIngestSourceType;
  auditAction?: "INGEST_TEXT_CREATE" | "INGEST_CHAT_CONFIRM";
}

export interface AdminKbFileInput {
  originalName: string;
  mimeType: string;
  size: number;
  bytes: Uint8Array;
  categoryId?: string | null;
  tags?: unknown;
  metadata?: unknown;
}

type CreateArgs<T> = { data: T; include?: unknown; select?: unknown };
type UpdateArgs<T> = { where: unknown; data: T; include?: unknown; select?: unknown };

type AdminKbIngestionTransaction = {
  ingestionJob: {
    create(args: CreateArgs<Record<string, unknown>>): Promise<Record<string, unknown>>;
    update(args: UpdateArgs<Record<string, unknown>>): Promise<Record<string, unknown>>;
  };
  knowledgeItem: {
    create(args: CreateArgs<Record<string, unknown>>): Promise<Record<string, unknown>>;
  };
  knowledgeFile: {
    create(args: CreateArgs<Record<string, unknown>>): Promise<Record<string, unknown>>;
    update(args: UpdateArgs<Record<string, unknown>>): Promise<Record<string, unknown>>;
  };
  auditLog: {
    create(args: CreateArgs<Record<string, unknown>>): Promise<Record<string, unknown>>;
  };
};

type AdminKbIngestionDb = {
  $transaction<T>(action: (tx: AdminKbIngestionTransaction) => Promise<T>): Promise<T>;
  ingestionJob: {
    findFirst(args: unknown): Promise<Record<string, unknown> | null>;
    update(args: UpdateArgs<Record<string, unknown>>): Promise<Record<string, unknown>>;
    findMany?(args: unknown): Promise<Record<string, unknown>[]>;
    count?(args: unknown): Promise<number>;
  };
  auditLog: {
    create(args: CreateArgs<Record<string, unknown>>): Promise<Record<string, unknown>>;
  };
};

const MAX_TEXT_CONTENT_CHARS = 100_000;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const CHUNK_TARGET_CHARS = 1_000;
const CHUNK_OVERLAP_CHARS = 150;
const PRIVATE_STORAGE_DIR = process.env.KB_FILE_STORAGE_DIR?.trim() || path.join(process.cwd(), "storage", "knowledge-files");

type AdminKbFileProcessor = "text" | "pdf" | "pending";

const allowedFileTypes: Record<string, { mimeTypes: string[]; processor: AdminKbFileProcessor }> = {
  ".txt": { mimeTypes: ["text/plain", "application/octet-stream"], processor: "text" },
  ".md": { mimeTypes: ["text/markdown", "text/plain", "application/octet-stream"], processor: "text" },
  ".markdown": { mimeTypes: ["text/markdown", "text/plain", "application/octet-stream"], processor: "text" },
  ".pdf": { mimeTypes: ["application/pdf", "application/octet-stream"], processor: "pdf" },
  ".doc": { mimeTypes: ["application/msword", "application/octet-stream"], processor: "pending" },
  ".docx": { mimeTypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/octet-stream"], processor: "pending" },
  ".xls": { mimeTypes: ["application/vnd.ms-excel", "application/octet-stream"], processor: "pending" },
  ".xlsx": { mimeTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream"], processor: "pending" },
  ".ppt": { mimeTypes: ["application/vnd.ms-powerpoint", "application/octet-stream"], processor: "pending" },
  ".pptx": { mimeTypes: ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/octet-stream"], processor: "pending" },
  ".png": { mimeTypes: ["image/png"], processor: "pending" },
  ".jpg": { mimeTypes: ["image/jpeg"], processor: "pending" },
  ".jpeg": { mimeTypes: ["image/jpeg"], processor: "pending" },
  ".webp": { mimeTypes: ["image/webp"], processor: "pending" },
  ".gif": { mimeTypes: ["image/gif"], processor: "pending" },
  ".mp3": { mimeTypes: ["audio/mpeg", "audio/mp3"], processor: "pending" },
  ".wav": { mimeTypes: ["audio/wav", "audio/x-wav"], processor: "pending" },
  ".m4a": { mimeTypes: ["audio/mp4", "audio/x-m4a"], processor: "pending" },
  ".mp4": { mimeTypes: ["video/mp4"], processor: "pending" },
  ".mov": { mimeTypes: ["video/quicktime"], processor: "pending" },
  ".webm": { mimeTypes: ["video/webm"], processor: "pending" }
};

export const adminKbUploadLimits = {
  maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
  allowedExtensions: Object.keys(allowedFileTypes)
};

function trimString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const tags: string[] = [];

  for (const item of value) {
    const tag = trimString(item);

    if (!tag || seen.has(tag)) {
      continue;
    }

    seen.add(tag);
    tags.push(tag);
  }

  return tags.slice(0, 12);
}

function normalizeMetadata(value: unknown): Prisma.InputJsonValue | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function metadataRecord(value: Prisma.InputJsonValue | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function cleanIngestText(content: string) {
  return content
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildContentHash(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function inferTitle(content: string) {
  const firstLine = content.split("\n").map((line) => line.trim()).find(Boolean) ?? "管理员投喂知识";
  const normalized = firstLine.replace(/^#+\s*/, "");

  return normalized.length > 80 ? `${normalized.slice(0, 80)}...` : normalized;
}

function buildSummary(content: string) {
  return content.length > 220 ? `${content.slice(0, 220)}...` : content;
}

export function splitAdminKbChunks(content: string, metadata: Record<string, unknown> = {}) {
  const clean = cleanIngestText(content);
  const chunks: Array<{
    chunkText: string;
    chunkIndex: number;
    summary: string;
    contentHash: string;
    metadata: Prisma.InputJsonValue;
    charCount: number;
    tokenCount: number;
  }> = [];

  for (let start = 0; start < clean.length; start += CHUNK_TARGET_CHARS - CHUNK_OVERLAP_CHARS) {
    const chunkText = clean.slice(start, start + CHUNK_TARGET_CHARS).trim();

    if (!chunkText) {
      continue;
    }

    chunks.push({
      chunkText,
      chunkIndex: chunks.length,
      summary: buildSummary(chunkText),
      contentHash: buildContentHash(chunkText),
      metadata: {
        ...metadata,
        chunkTargetChars: CHUNK_TARGET_CHARS,
        chunkOverlapChars: CHUNK_OVERLAP_CHARS
      },
      charCount: chunkText.length,
      tokenCount: estimateTokenCount(chunkText)
    });
  }

  return chunks;
}

export function buildChatIngestContent(input: { messages?: unknown; content?: unknown }) {
  const content = trimString(input.content);

  if (content) {
    return cleanIngestText(content);
  }

  if (!Array.isArray(input.messages)) {
    return "";
  }

  const lines: string[] = [];

  for (const message of input.messages) {
    if (!message || typeof message !== "object") {
      continue;
    }

    const value = message as { role?: unknown; content?: unknown };
    const role = trimString(value.role) || "message";
    const messageContent = trimString(value.content);

    if (messageContent) {
      lines.push(`${role}: ${messageContent}`);
    }
  }

  return cleanIngestText(lines.join("\n"));
}

function serializeJob(job: Record<string, unknown>) {
  return {
    id: String(job.id),
    sourceType: String(job.sourceType),
    sourceId: typeof job.sourceId === "string" ? job.sourceId : null,
    status: String(job.status),
    progress: Number(job.progress ?? 0),
    errorMessage: typeof job.errorMessage === "string" ? job.errorMessage : null,
    fileId: typeof job.fileId === "string" ? job.fileId : null,
    knowledgeItemId: typeof job.knowledgeItemId === "string" ? job.knowledgeItemId : null,
    createdAt: job.createdAt instanceof Date ? job.createdAt.toISOString() : String(job.createdAt ?? ""),
    updatedAt: job.updatedAt instanceof Date ? job.updatedAt.toISOString() : String(job.updatedAt ?? ""),
    finishedAt: job.finishedAt instanceof Date ? job.finishedAt.toISOString() : null
  };
}

function serializeFile(file: Record<string, unknown>) {
  return {
    id: String(file.id),
    originalName: String(file.originalName),
    fileType: String(file.fileType),
    fileSize: Number(file.fileSize ?? 0),
    status: String(file.status),
    categoryId: typeof file.categoryId === "string" ? file.categoryId : null,
    tags: Array.isArray(file.tags) ? file.tags.map(String) : [],
    createdAt: file.createdAt instanceof Date ? file.createdAt.toISOString() : String(file.createdAt ?? "")
  };
}

function buildKnowledgeCreateData(input: {
  actor: AdminKbActor;
  title: string;
  content: string;
  category: string;
  tags: string[];
  sourceType: string;
  sourceId?: string | null;
  sourceTitle?: string | null;
  metadata?: Prisma.InputJsonValue;
  fileId?: string | null;
  chunks: ReturnType<typeof splitAdminKbChunks>;
}) {
  const summary = buildSummary(input.content);

  return {
    userId: input.actor.id,
    title: input.title,
    content: input.content,
    summary,
    tags: input.tags,
    category: input.category,
    importance: 3,
    clarityScore: 3,
    completenessScore: 3,
    usefulnessScore: 3,
    confidenceScore: 3,
    sourceType: normalizeKnowledgeSourceType(input.sourceType),
    sourceId: input.sourceId ?? null,
    sourceTitle: input.sourceTitle ?? null,
    status: "active",
    chunks: {
      create: input.chunks.map((chunk) => ({
        fileId: input.fileId ?? null,
        chunkText: chunk.chunkText,
        chunkIndex: chunk.chunkIndex,
        summary: chunk.summary,
        metadata: chunk.metadata,
        charCount: chunk.charCount,
        tokenCount: chunk.tokenCount,
        contentHash: chunk.contentHash
      }))
    }
  };
}

export async function createAdminKbTextIngestion(
  actor: AdminKbActor,
  input: AdminKbTextInput,
  db: AdminKbIngestionDb = prisma as unknown as AdminKbIngestionDb
) {
  const content = cleanIngestText(input.content);

  if (!content) {
    throw new ValidationError("投喂内容不能为空。");
  }

  if (content.length > MAX_TEXT_CONTENT_CHARS) {
    throw new ValidationError(`投喂内容过长，请控制在 ${MAX_TEXT_CONTENT_CHARS} 字以内。`);
  }

  const tags = normalizeTags(input.tags);
  const category = trimString(input.categoryId) || "未分类";
  const title = trimString(input.title) || inferTitle(content);
  const metadata = normalizeMetadata(input.metadata);
  const metadataScope = metadataRecord(metadata);
  const sourceType = input.sourceType ?? "text";
  const knowledgeSourceType = normalizeKnowledgeSourceType(sourceType);
  const chunks = splitAdminKbChunks(content, {
    ...metadataScope,
    sourceType: knowledgeSourceType,
    title,
    category,
    tags,
    contentHash: buildContentHash(content)
  });

  if (chunks.length === 0) {
    throw new ValidationError("投喂内容为空，无法入库。");
  }

  return db.$transaction(async (tx) => {
    const job = await tx.ingestionJob.create({
      data: {
        sourceType,
        status: "processing",
        progress: 10,
        createdByUserId: actor.id,
        metadata: {
          ...(metadata && typeof metadata === "object" ? metadata : {}),
          retryTitle: title,
          retryContent: content,
          retryCategoryId: category,
          retryTags: tags
        }
      }
    });
    const knowledgeItem = await tx.knowledgeItem.create({
      data: buildKnowledgeCreateData({
        actor,
        title,
        content,
        category,
        tags,
        sourceType: knowledgeSourceType,
        sourceId: String(job.id),
        metadata,
        chunks
      }),
      include: {
        chunks: {
          orderBy: { chunkIndex: "asc" }
        }
      }
    });
    const completedJob = await tx.ingestionJob.update({
      where: { id: job.id },
      data: {
        sourceId: String(knowledgeItem.id),
        knowledgeItemId: String(knowledgeItem.id),
        status: "completed",
        progress: 100,
        finishedAt: new Date()
      }
    });

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        role: actor.role,
        action: input.auditAction ?? "INGEST_TEXT_CREATE",
        targetType: "ingestion_job",
        targetId: String(completedJob.id),
        metadata: {
          sourceType,
          knowledgeItemId: String(knowledgeItem.id),
          chunkCount: chunks.length
        }
      }
    });
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        role: actor.role,
        action: "INGEST_JOB_SUCCESS",
        targetType: "ingestion_job",
        targetId: String(completedJob.id),
        metadata: {
          sourceType,
          knowledgeItemId: String(knowledgeItem.id)
        }
      }
    });

    return {
      job: serializeJob(completedJob),
      knowledgeItem: {
        id: String(knowledgeItem.id),
        title: String(knowledgeItem.title),
        chunkCount: chunks.length
      }
    };
  });
}

export function getFileExtension(fileName: string) {
  return path.extname(fileName).toLowerCase();
}

export function sanitizeOriginalFileName(fileName: string) {
  const baseName = path.basename(fileName).replace(/[^\w.\-\u4e00-\u9fa5 ]+/g, "_").trim();

  return baseName || "upload";
}

export function validateAdminKbUpload(input: Pick<AdminKbFileInput, "originalName" | "mimeType" | "size">) {
  if (input.size <= 0) {
    throw new ValidationError("上传文件不能为空。");
  }

  if (input.size > MAX_FILE_SIZE_BYTES) {
    throw new ValidationError("上传文件过大，请选择不超过 10MB 的文件。");
  }

  const extension = getFileExtension(input.originalName);
  const config = allowedFileTypes[extension];

  if (!config) {
    throw new ValidationError("不支持的文件类型。");
  }

  const mimeType = input.mimeType || "application/octet-stream";

  if (!config.mimeTypes.includes(mimeType)) {
    throw new ValidationError("文件 MIME 类型不被允许。");
  }

  return {
    extension,
    processor: config.processor,
    mimeType
  };
}

async function saveAdminKbUpload(fileName: string, bytes: Uint8Array) {
  await mkdir(PRIVATE_STORAGE_DIR, { recursive: true });

  const safeName = sanitizeOriginalFileName(fileName);
  const storageName = `${Date.now()}-${randomBytes(12).toString("hex")}-${safeName}`;
  const storagePath = path.join(PRIVATE_STORAGE_DIR, storageName);

  await writeFile(storagePath, bytes);

  return storagePath;
}

type DecodedAdminKbText = {
  text: string;
  encoding: string;
  warnings: string[];
};

type ExtractedAdminKbFileText = {
  content: string;
  metadata: Record<string, unknown>;
};

function decodeWithEncoding(bytes: Uint8Array, encoding: string) {
  try {
    return new TextDecoder(encoding, { fatal: false }).decode(bytes);
  } catch {
    return "";
  }
}

function scoreDecodedText(text: string) {
  if (!text) {
    return Number.MAX_SAFE_INTEGER;
  }

  const replacementCount = (text.match(/\uFFFD/g) ?? []).length;
  const suspiciousCount = (text.match(/[ÃÂ锟斤拷]/g) ?? []).length;
  const controlCount = (text.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) ?? []).length;

  return replacementCount * 20 + suspiciousCount * 8 + controlCount * 4;
}

function hasUtf8Bom(bytes: Uint8Array) {
  return bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
}

function hasUtf16LeBom(bytes: Uint8Array) {
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe;
}

function hasUtf16BeBom(bytes: Uint8Array) {
  return bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff;
}

function looksLikeUtf16Le(bytes: Uint8Array) {
  if (bytes.length < 8) {
    return false;
  }

  let nullOddBytes = 0;
  const sampleLength = Math.min(bytes.length, 200);

  for (let index = 1; index < sampleLength; index += 2) {
    if (bytes[index] === 0) {
      nullOddBytes += 1;
    }
  }

  return nullOddBytes / Math.max(1, Math.floor(sampleLength / 2)) > 0.35;
}

export function decodeAdminKbTextFile(bytes: Uint8Array): DecodedAdminKbText {
  const warnings: string[] = [];

  if (hasUtf8Bom(bytes)) {
    return {
      text: decodeWithEncoding(bytes.slice(3), "utf-8"),
      encoding: "utf-8-bom",
      warnings
    };
  }

  if (hasUtf16LeBom(bytes)) {
    return {
      text: decodeWithEncoding(bytes.slice(2), "utf-16le"),
      encoding: "utf-16le-bom",
      warnings
    };
  }

  if (hasUtf16BeBom(bytes)) {
    return {
      text: decodeWithEncoding(bytes.slice(2), "utf-16be"),
      encoding: "utf-16be-bom",
      warnings
    };
  }

  const candidates = [
    { encoding: "utf-8", text: decodeWithEncoding(bytes, "utf-8") },
    { encoding: "gb18030", text: decodeWithEncoding(bytes, "gb18030") },
    ...(looksLikeUtf16Le(bytes) ? [{ encoding: "utf-16le", text: decodeWithEncoding(bytes, "utf-16le") }] : [])
  ].filter((candidate) => candidate.text);
  const best = candidates.reduce((currentBest, candidate) => {
    return scoreDecodedText(candidate.text) < scoreDecodedText(currentBest.text) ? candidate : currentBest;
  }, candidates[0] ?? { encoding: "utf-8", text: "" });

  if (best.encoding !== "utf-8") {
    warnings.push(`TXT 自动按 ${best.encoding} 解码，已避免中文乱码。`);
  }

  return {
    text: best.text,
    encoding: best.encoding,
    warnings
  };
}

async function extractPdfText(bytes: Uint8Array) {
  const pdfParse = (await import("pdf-parse")).default;
  const result = await pdfParse(Buffer.from(bytes));

  return result.text;
}

async function extractAdminKbFileText(
  input: AdminKbFileInput,
  validation: ReturnType<typeof validateAdminKbUpload>
): Promise<ExtractedAdminKbFileText | null> {
  if (validation.processor === "text") {
    const decoded = decodeAdminKbTextFile(input.bytes);

    return {
      content: cleanIngestText(decoded.text),
      metadata: {
        textEncoding: decoded.encoding,
        decodeWarnings: decoded.warnings
      }
    };
  }

  if (validation.processor !== "pdf") {
    return null;
  }

  try {
    const content = cleanIngestText(await extractPdfText(input.bytes));

    if (!content || content.length < 20) {
      return null;
    }

    return {
      content,
      metadata: {
        extractedBy: "pdf-parse",
        processorStatus: "text",
        textEncoding: "pdf-text-layer"
      }
    };
  } catch {
    return null;
  }
}

export async function createAdminKbFileIngestion(
  actor: AdminKbActor,
  input: AdminKbFileInput,
  db: AdminKbIngestionDb = prisma as unknown as AdminKbIngestionDb
) {
  const validation = validateAdminKbUpload(input);
  const tags = normalizeTags(input.tags);
  const category = trimString(input.categoryId) || "未分类";
  const originalName = sanitizeOriginalFileName(input.originalName);
  const metadata = normalizeMetadata(input.metadata);
  const metadataScope = metadataRecord(metadata);
  const storagePath = await saveAdminKbUpload(originalName, input.bytes);

  const extractedText = await extractAdminKbFileText(input, validation);

  if (!extractedText) {
    return db.$transaction(async (tx) => {
      const file = await tx.knowledgeFile.create({
        data: {
          originalName,
          fileType: validation.extension.slice(1),
          fileSize: input.size,
          storagePath,
          uploaderId: actor.id,
          status: "pending_processor",
          categoryId: category,
          tags,
          metadata: {
            ...(metadata && typeof metadata === "object" ? metadata : {}),
            mimeType: validation.mimeType,
            processorStatus: "pending_processor",
            ...(validation.processor === "pdf" ? {
              requiresOcr: true,
              processorNote: "pdf_text_layer_unavailable"
            } : {})
          }
        }
      });
      const job = await tx.ingestionJob.create({
        data: {
          sourceType: "file",
          sourceId: String(file.id),
          status: "pending_processor",
          progress: 0,
          createdByUserId: actor.id,
          fileId: String(file.id),
          metadata: {
            processorStatus: "pending_processor",
            extension: validation.extension,
            mimeType: validation.mimeType,
            ...(validation.processor === "pdf" ? {
              requiresOcr: true,
              processorNote: "pdf_text_layer_unavailable"
            } : {})
          }
        }
      });

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          role: actor.role,
          action: "INGEST_FILE_UPLOAD",
          targetType: "knowledge_file",
          targetId: String(file.id),
          metadata: {
            jobId: String(job.id),
            extension: validation.extension,
            fileSize: input.size,
            processorStatus: "pending_processor",
            ...(validation.processor === "pdf" ? { requiresOcr: true } : {})
          }
        }
      });

      return {
        job: serializeJob(job),
        file: serializeFile(file),
        knowledgeItem: null
      };
    });
  }

  const content = extractedText.content;

  if (!content) {
    throw new ValidationError("文件内容为空，无法入库。");
  }

  const title = originalName;
  const knowledgeSourceType = normalizeKnowledgeSourceType("file");
  const chunks = splitAdminKbChunks(content, {
    ...metadataScope,
    sourceType: knowledgeSourceType,
    title,
    category,
    tags,
    contentHash: buildContentHash(content),
    fileType: validation.extension.slice(1),
    ...extractedText.metadata
  });

  return db.$transaction(async (tx) => {
    const file = await tx.knowledgeFile.create({
      data: {
        originalName,
        fileType: validation.extension.slice(1),
        fileSize: input.size,
        storagePath,
        uploaderId: actor.id,
        status: "processing",
        categoryId: category,
        tags,
        metadata: {
          ...(metadata && typeof metadata === "object" ? metadata : {}),
          mimeType: validation.mimeType,
          processorStatus: "text",
          ...extractedText.metadata
        }
      }
    });
    const job = await tx.ingestionJob.create({
      data: {
        sourceType: "file",
        sourceId: String(file.id),
        status: "processing",
        progress: 10,
        createdByUserId: actor.id,
        fileId: String(file.id),
        metadata: {
          extension: validation.extension,
          mimeType: validation.mimeType,
          ...extractedText.metadata
        }
      }
    });
    const knowledgeItem = await tx.knowledgeItem.create({
      data: buildKnowledgeCreateData({
        actor,
        title,
        content,
        category,
        tags,
        sourceType: knowledgeSourceType,
        sourceId: String(file.id),
        sourceTitle: originalName,
        metadata,
        fileId: String(file.id),
        chunks
      }),
      include: {
        chunks: {
          orderBy: { chunkIndex: "asc" }
        }
      }
    });
    const completedFile = await tx.knowledgeFile.update({
      where: { id: file.id },
      data: {
        status: "completed"
      }
    });
    const completedJob = await tx.ingestionJob.update({
      where: { id: job.id },
      data: {
        sourceId: String(file.id),
        knowledgeItemId: String(knowledgeItem.id),
        status: "completed",
        progress: 100,
        finishedAt: new Date()
      }
    });

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        role: actor.role,
        action: "INGEST_FILE_UPLOAD",
        targetType: "knowledge_file",
        targetId: String(file.id),
        metadata: {
          jobId: String(completedJob.id),
          knowledgeItemId: String(knowledgeItem.id),
          extension: validation.extension,
          fileSize: input.size,
          chunkCount: chunks.length,
          ...extractedText.metadata
        }
      }
    });
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        role: actor.role,
        action: "INGEST_JOB_SUCCESS",
        targetType: "ingestion_job",
        targetId: String(completedJob.id),
        metadata: {
          fileId: String(file.id),
          knowledgeItemId: String(knowledgeItem.id)
        }
      }
    });

    return {
      job: serializeJob(completedJob),
      file: serializeFile(completedFile),
      knowledgeItem: {
        id: String(knowledgeItem.id),
        title: String(knowledgeItem.title),
        chunkCount: chunks.length
      }
    };
  });
}

export async function retryAdminKbIngestionJob(
  actor: AdminKbActor,
  jobId: string,
  db: AdminKbIngestionDb = prisma as unknown as AdminKbIngestionDb
) {
  const existing = await db.ingestionJob.findFirst({
    where: {
      id: jobId,
      createdByUserId: actor.role === "super_admin" ? undefined : actor.id
    }
  });

  if (!existing) {
    throw new ValidationError("投喂任务不存在。");
  }

  if (String(existing.status) !== "failed") {
    throw new ValidationError("只有失败任务可以重试。");
  }

  const retried = await db.ingestionJob.update({
    where: { id: jobId },
    data: {
      status: "pending",
      progress: 0,
      errorMessage: null,
      finishedAt: null,
      metadata: {
        retriedAt: new Date().toISOString(),
        previousStatus: existing.status
      }
    }
  });

  await db.auditLog.create({
    data: {
      userId: actor.id,
      role: actor.role,
      action: "INGEST_JOB_RETRY",
      targetType: "ingestion_job",
      targetId: jobId,
      metadata: {
        previousStatus: existing.status
      }
    }
  });

  return {
    job: serializeJob(retried)
  };
}
