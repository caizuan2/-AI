import "server-only";

import { Prisma } from "@prisma/client";
import { isPlainObject } from "@/lib/api/responses";
import { ValidationError } from "@/lib/errors";
import { createChunkEmbeddings, splitContentIntoChunks } from "@/lib/knowledge/chunks";
import { normalizeQualityScores } from "@/lib/knowledge/quality";
import { isKnowledgeReviewStatus } from "@/lib/knowledge/review";
import { isKnowledgeLifecycleStatus } from "@/lib/knowledge/status";
import {
  defaultKnowledgeSourceType,
  isKnowledgeSourceType,
  type KnowledgeSourceType
} from "@/lib/knowledge/source-types";
import { estimateTokenCount } from "@/lib/logger";
import { toVectorLiteral } from "@/lib/knowledge/vector";
import { prisma } from "@/lib/prisma";

export const knowledgeExportFormats = ["json", "markdown", "csv"] as const;

const MAX_IMPORTED_CONTENT_CHARS = 100_000;

export type KnowledgeExportFormat = (typeof knowledgeExportFormats)[number];

export interface KnowledgeExportResponse {
  format: KnowledgeExportFormat;
  filename: string;
  mimeType: string;
  exportedAt: string;
  itemCount: number;
  content: string;
}

export interface KnowledgeImportResult {
  imported: number;
  skippedDuplicates: number;
  failed: number;
  createdItems: Array<{
    id: string;
    title: string;
  }>;
  duplicates: Array<{
    index: number;
    title: string;
    reason: string;
    existingId: string | null;
    existingTitle: string | null;
  }>;
  errors: Array<{
    index: number;
    title: string | null;
    message: string;
  }>;
}

type ExportKnowledgeItem = {
  id: string;
  title: string;
  content: string;
  summary: string;
  tags: string[];
  category: string;
  importance: number;
  clarityScore: number;
  completenessScore: number;
  usefulnessScore: number;
  confidenceScore: number;
  sourceType: string;
  sourceId: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
  sourceMessageId: string | null;
  expiresAt: Date | null;
  status: string;
  reviewStatus: string;
  lastReviewedAt: Date | null;
  nextReviewAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  chunks: Array<{
    id: string;
    chunkText: string;
    chunkIndex: number;
    metadata: Prisma.JsonValue;
    createdAt: Date;
  }>;
};

type ImportKnowledgeItem = {
  originalId: string | null;
  title: string;
  content: string;
  summary: string;
  tags: string[];
  category: string;
  importance: number;
  clarityScore: number;
  completenessScore: number;
  usefulnessScore: number;
  confidenceScore: number;
  sourceType: KnowledgeSourceType;
  sourceId: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
  sourceMessageId: string | null;
  expiresAt: Date | null;
  status: "active" | "stale" | "archived";
  reviewStatus: "NEEDS_REVIEW" | "MASTERED" | "EXPIRED";
  lastReviewedAt: Date | null;
  nextReviewAt: Date | null;
};

type DuplicateTarget = {
  id: string | null;
  title: string;
};

type DuplicateIndex = {
  content: Map<string, DuplicateTarget>;
  titleSummary: Map<string, DuplicateTarget>;
  sourceUrl: Map<string, DuplicateTarget>;
  sourceMessageId: Map<string, DuplicateTarget>;
};

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNullableString(value: unknown) {
  const text = readString(value);

  return text ? text : null;
}

function normalizeTextKey(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeUrlKey(value: string | null) {
  return value ? value.trim().toLowerCase() : "";
}

function parseDateOrNull(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const date = new Date(value);

  return Number.isFinite(date.getTime()) ? date : null;
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(value.map((tag) => (typeof tag === "string" ? tag.trim() : "")).filter(Boolean))
  ).slice(0, 12);
}

function normalizeImportance(value: unknown) {
  const importance = typeof value === "number" ? Math.round(value) : Number.NaN;

  return Number.isInteger(importance) && importance >= 1 && importance <= 5 ? importance : 3;
}

function normalizeImportItem(value: unknown, index: number): ImportKnowledgeItem {
  if (!isPlainObject(value)) {
    throw new ValidationError(`第 ${index + 1} 条知识必须是 JSON 对象。`);
  }

  const title = readString(value.title);
  const content = readString(value.content);
  const summary = readString(value.summary);
  const category = readString(value.category) || "未分类";
  const sourceType = isKnowledgeSourceType(value.sourceType) ? value.sourceType : "imported_text";
  const status = isKnowledgeLifecycleStatus(value.status) ? value.status : "active";
  const reviewStatus = isKnowledgeReviewStatus(value.reviewStatus) ? value.reviewStatus : "NEEDS_REVIEW";
  const qualityScores = normalizeQualityScores({
    clarityScore: typeof value.clarityScore === "number" ? value.clarityScore : undefined,
    completenessScore: typeof value.completenessScore === "number" ? value.completenessScore : undefined,
    usefulnessScore: typeof value.usefulnessScore === "number" ? value.usefulnessScore : undefined,
    confidenceScore: typeof value.confidenceScore === "number" ? value.confidenceScore : undefined
  });

  if (!title) {
    throw new ValidationError(`第 ${index + 1} 条知识缺少标题。`);
  }

  if (!content) {
    throw new ValidationError(`第 ${index + 1} 条知识缺少正文。`);
  }

  if (content.length > MAX_IMPORTED_CONTENT_CHARS) {
    throw new ValidationError(`第 ${index + 1} 条知识正文过长，请控制在 ${MAX_IMPORTED_CONTENT_CHARS} 字以内。`);
  }

  if (!summary) {
    throw new ValidationError(`第 ${index + 1} 条知识缺少摘要。`);
  }

  return {
    originalId: readNullableString(value.id),
    title,
    content,
    summary,
    tags: normalizeTags(value.tags),
    category,
    importance: normalizeImportance(value.importance),
    ...qualityScores,
    sourceType: sourceType || defaultKnowledgeSourceType,
    sourceId: readNullableString(value.sourceId),
    sourceTitle: readNullableString(value.sourceTitle),
    sourceUrl: readNullableString(value.sourceUrl),
    sourceMessageId: readNullableString(value.sourceMessageId),
    expiresAt: parseDateOrNull(value.expiresAt),
    status,
    reviewStatus,
    lastReviewedAt: parseDateOrNull(value.lastReviewedAt),
    nextReviewAt: parseDateOrNull(value.nextReviewAt)
  };
}

export function isKnowledgeExportFormat(value: unknown): value is KnowledgeExportFormat {
  return typeof value === "string" && knowledgeExportFormats.includes(value as KnowledgeExportFormat);
}

export function parseKnowledgeImportPayload(payload: unknown): ImportKnowledgeItem[] {
  const rawItems = Array.isArray(payload)
    ? payload
    : isPlainObject(payload) && Array.isArray(payload.items)
      ? payload.items
      : null;

  if (!rawItems) {
    throw new ValidationError("导入文件必须是知识数组，或包含 items 数组的导出 JSON。");
  }

  if (rawItems.length === 0) {
    throw new ValidationError("导入文件中没有知识记录。");
  }

  if (rawItems.length > 200) {
    throw new ValidationError("单次最多导入 200 条知识。");
  }

  return rawItems.map((item, index) => normalizeImportItem(item, index));
}

function formatDate(value: Date | null) {
  return value ? value.toISOString() : null;
}

function serializeForJson(items: ExportKnowledgeItem[], exportedAt: string) {
  return JSON.stringify(
    {
      version: 1,
      app: "ai-knowledge-base-app",
      exportedAt,
      items: items.map((item) => ({
        id: item.id,
        title: item.title,
        content: item.content,
        summary: item.summary,
        tags: item.tags,
        category: item.category,
        importance: item.importance,
        clarityScore: item.clarityScore,
        completenessScore: item.completenessScore,
        usefulnessScore: item.usefulnessScore,
        confidenceScore: item.confidenceScore,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        sourceTitle: item.sourceTitle,
        sourceUrl: item.sourceUrl,
        sourceMessageId: item.sourceMessageId,
        expiresAt: formatDate(item.expiresAt),
        status: item.status,
        reviewStatus: item.reviewStatus,
        lastReviewedAt: formatDate(item.lastReviewedAt),
        nextReviewAt: formatDate(item.nextReviewAt),
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        chunks: item.chunks.map((chunk) => ({
          id: chunk.id,
          chunkText: chunk.chunkText,
          chunkIndex: chunk.chunkIndex,
          metadata: chunk.metadata,
          createdAt: chunk.createdAt.toISOString()
        }))
      }))
    },
    null,
    2
  );
}

function sanitizeMarkdownInline(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function serializeForMarkdown(items: ExportKnowledgeItem[], exportedAt: string) {
  const lines = [
    "# 知识库导出",
    "",
    `导出时间：${exportedAt}`,
    `知识数量：${items.length}`,
    ""
  ];

  for (const item of items) {
    lines.push(
      `## ${sanitizeMarkdownInline(item.title)}`,
      "",
      `- 分类：${item.category}`,
      `- 标签：${item.tags.length > 0 ? item.tags.join("、") : "无"}`,
      `- 重要度：${item.importance}/5`,
      `- 状态：${item.status}`,
      `- 来源类型：${item.sourceType}`
    );

    if (item.sourceTitle) {
      lines.push(`- 来源标题：${item.sourceTitle}`);
    }

    if (item.sourceUrl) {
      lines.push(`- 来源链接：${item.sourceUrl}`);
    }

    lines.push(
      `- 创建时间：${item.createdAt.toISOString()}`,
      "",
      "### 摘要",
      "",
      item.summary,
      "",
      "### 正文",
      "",
      item.content,
      "",
      "---",
      ""
    );
  }

  return lines.join("\n");
}

function csvCell(value: unknown) {
  const rawText = Array.isArray(value)
    ? value.join("; ")
    : value === null || value === undefined
      ? ""
      : String(value);
  const text = /^[=+\-@]/.test(rawText) ? `'${rawText}` : rawText;

  return `"${text.replace(/"/g, '""')}"`;
}

function serializeForCsv(items: ExportKnowledgeItem[]) {
  const headers = [
    "title",
    "summary",
    "content",
    "tags",
    "category",
    "importance",
    "clarityScore",
    "completenessScore",
    "usefulnessScore",
    "confidenceScore",
    "sourceType",
    "sourceTitle",
    "sourceUrl",
    "status",
    "createdAt",
    "updatedAt"
  ];
  const rows = items.map((item) => [
    item.title,
    item.summary,
    item.content,
    item.tags,
    item.category,
    item.importance,
    item.clarityScore,
    item.completenessScore,
    item.usefulnessScore,
    item.confidenceScore,
    item.sourceType,
    item.sourceTitle,
    item.sourceUrl,
    item.status,
    item.createdAt.toISOString(),
    item.updatedAt.toISOString()
  ]);

  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

export function serializeKnowledgeExport(
  items: ExportKnowledgeItem[],
  format: KnowledgeExportFormat
): KnowledgeExportResponse {
  const exportedAt = new Date().toISOString();
  const suffix = exportedAt.slice(0, 10);
  const config: Record<KnowledgeExportFormat, { extension: string; mimeType: string; content: string }> = {
    json: {
      extension: "json",
      mimeType: "application/json;charset=utf-8",
      content: serializeForJson(items, exportedAt)
    },
    markdown: {
      extension: "md",
      mimeType: "text/markdown;charset=utf-8",
      content: serializeForMarkdown(items, exportedAt)
    },
    csv: {
      extension: "csv",
      mimeType: "text/csv;charset=utf-8",
      content: serializeForCsv(items)
    }
  };

  return {
    format,
    filename: `knowledge-export-${suffix}.${config[format].extension}`,
    mimeType: config[format].mimeType,
    exportedAt,
    itemCount: items.length,
    content: config[format].content
  };
}

export function createDuplicateIndex(items: Array<{
  id: string | null;
  title: string;
  summary: string;
  content: string;
  sourceUrl: string | null;
  sourceMessageId: string | null;
}>): DuplicateIndex {
  const index: DuplicateIndex = {
    content: new Map(),
    titleSummary: new Map(),
    sourceUrl: new Map(),
    sourceMessageId: new Map()
  };

  for (const item of items) {
    addDuplicateTarget(index, item);
  }

  return index;
}

export function addDuplicateTarget(
  index: DuplicateIndex,
  item: {
    id: string | null;
    title: string;
    summary: string;
    content: string;
    sourceUrl: string | null;
    sourceMessageId: string | null;
  }
) {
  const target = {
    id: item.id,
    title: item.title
  };
  const contentKey = normalizeTextKey(item.content);
  const titleSummaryKey = `${normalizeTextKey(item.title)}::${normalizeTextKey(item.summary)}`;
  const sourceUrlKey = normalizeUrlKey(item.sourceUrl);
  const sourceMessageIdKey = normalizeTextKey(item.sourceMessageId ?? "");

  if (contentKey) {
    index.content.set(contentKey, target);
  }

  if (titleSummaryKey !== "::") {
    index.titleSummary.set(titleSummaryKey, target);
  }

  if (sourceUrlKey) {
    index.sourceUrl.set(sourceUrlKey, target);
  }

  if (sourceMessageIdKey) {
    index.sourceMessageId.set(sourceMessageIdKey, target);
  }
}

export function findDuplicateKnowledgeItem(index: DuplicateIndex, item: ImportKnowledgeItem) {
  const checks: Array<[string, string, Map<string, DuplicateTarget>]> = [
    ["正文完全一致", normalizeTextKey(item.content), index.content],
    ["标题和摘要一致", `${normalizeTextKey(item.title)}::${normalizeTextKey(item.summary)}`, index.titleSummary],
    ["来源链接一致", normalizeUrlKey(item.sourceUrl), index.sourceUrl],
    ["来源消息一致", normalizeTextKey(item.sourceMessageId ?? ""), index.sourceMessageId]
  ];

  for (const [reason, key, map] of checks) {
    if (!key || key === "::") {
      continue;
    }

    const matched = map.get(key);

    if (matched) {
      return {
        reason,
        target: matched
      };
    }
  }

  return null;
}

export async function createImportedKnowledgeItem(
  userId: string,
  item: ImportKnowledgeItem,
  fallbackExpiresAt: Date
) {
  const chunks = splitContentIntoChunks(item.content, {
    title: item.title,
    category: item.category,
    tags: item.tags,
    summary: item.summary,
    sourceType: item.sourceType,
    sourceTitle: item.sourceTitle,
    sourceUrl: item.sourceUrl
  });
  const embeddings = await createChunkEmbeddings(chunks, {
    operation: "knowledge_import_chunk_embedding",
    userId
  });
  const embeddingsByIndex = new Map(embeddings.map((embedding) => [embedding.chunkIndex, embedding]));

  return prisma.$transaction(async (tx) => {
    const created = await tx.knowledgeItem.create({
      data: {
        userId,
        title: item.title,
        content: item.content,
        summary: item.summary,
        tags: item.tags,
        category: item.category,
        importance: item.importance,
        clarityScore: item.clarityScore,
        completenessScore: item.completenessScore,
        usefulnessScore: item.usefulnessScore,
        confidenceScore: item.confidenceScore,
        sourceType: item.sourceType,
        sourceId: item.sourceId ?? item.originalId,
        sourceTitle: item.sourceTitle,
        sourceUrl: item.sourceUrl,
        sourceMessageId: item.sourceMessageId,
        expiresAt: item.expiresAt ?? fallbackExpiresAt,
        status: item.status,
        reviewStatus: item.reviewStatus,
        lastReviewedAt: item.lastReviewedAt,
        nextReviewAt: item.nextReviewAt,
        chunks: {
          create: chunks.map((chunk) => {
            const embedding = embeddingsByIndex.get(chunk.chunkIndex);

            return {
              chunkText: chunk.chunkText,
              chunkIndex: chunk.chunkIndex,
              metadata: {
                ...chunk.metadata,
                charLength: chunk.chunkText.length,
                embeddingModel: embedding?.model ?? null,
                embeddingSkipped: embedding?.embedding === null,
                embeddingError: embedding?.errorMessage ?? null,
                embeddingStatus: embedding?.embedding ? "indexed" : "missing",
                importedBy: "json_import",
                originalKnowledgeItemId: item.originalId
              },
              charCount: chunk.chunkText.length,
              tokenCount: estimateTokenCount(chunk.chunkText),
              embeddingModel: embedding?.model ?? null
            };
          })
        }
      },
      select: {
        id: true,
        title: true,
        summary: true,
        content: true,
        sourceUrl: true,
        sourceMessageId: true,
        chunks: {
          select: {
            id: true,
            chunkIndex: true
          },
          orderBy: { chunkIndex: "asc" }
        }
      }
    });

    for (const chunk of created.chunks) {
      const embedding = embeddingsByIndex.get(chunk.chunkIndex)?.embedding;

      if (!embedding) {
        continue;
      }

      await tx.$executeRaw`
        UPDATE "knowledge_chunks"
        SET "embedding" = ${toVectorLiteral(embedding)}::vector
        WHERE "id" = ${chunk.id}
      `;
    }

    return created;
  });
}
