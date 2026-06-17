import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildContentHash, cleanIngestText, splitAdminKbChunks } from "@/lib/admin-kb/ingestion";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type { AppRole } from "@/lib/rbac/roles";
import {
  buildEnterpriseKnowledgeContent,
  cleanEnterpriseIngestInput,
  type EnterpriseIngestSourceType,
  type EnterpriseQAPair,
  type EnterpriseStructuredKnowledge
} from "@/lib/enterprise/ai-ingest-service";

export interface EnterpriseIngestActor {
  id: string;
  role: AppRole;
  tenantId?: string | null;
}

export interface CreateEnterpriseIngestLogInput {
  input: string;
  sourceType: EnterpriseIngestSourceType;
  sourceUrl?: string | null;
  agentId?: string | null;
  agentName?: string | null;
  structured: EnterpriseStructuredKnowledge;
}

export interface SaveEnterpriseIngestInput {
  jobId: string;
  structured?: EnterpriseStructuredKnowledge | null;
  originalInput?: string | null;
  sourceUrl?: string | null;
}

export const enterpriseAdminIngestJobSourceTypes = [
  "admin_ai_chat",
  "admin_ai_text",
  "admin_ai_file",
  "admin_ai_image",
  "admin_ai_url"
] as const;

function toJobSourceType(sourceType: EnterpriseIngestSourceType) {
  return `admin_ai_${sourceType}`;
}

function toKnowledgeSourceType(sourceType: EnterpriseIngestSourceType) {
  return sourceType === "chat" ? "admin_chat" : `admin_${sourceType}`;
}

function readJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function toJsonObject(value: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(readString).filter(Boolean).slice(0, 12);
}

function readQAPairs(value: unknown): EnterpriseQAPair[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = readJsonObject(item);
      const q = readString(record.q);
      const a = readString(record.a);

      return q && a ? { q, a } : null;
    })
    .filter((item): item is EnterpriseQAPair => Boolean(item))
    .slice(0, 8);
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampFivePointScore(value: unknown, fallback: number) {
  return Math.min(5, Math.max(1, Math.round(readNumber(value, fallback))));
}

function clampConfidence(value: unknown, fallback: number) {
  return Math.min(100, Math.max(1, Math.round(readNumber(value, fallback))));
}

export function normalizeEnterpriseStructuredKnowledge(value: unknown): EnterpriseStructuredKnowledge | null {
  const record = readJsonObject(value);
  const title = readString(record.title);
  const category = readString(record.category) || "未分类";
  const summary = readString(record.summary);
  const qaPairs = readQAPairs(record.qa_pairs);

  if (!title || !summary || qaPairs.length === 0) {
    return null;
  }

  const confidence = clampConfidence(record.confidence, 75);

  return {
    title,
    category,
    tags: readStringArray(record.tags),
    summary,
    qa_pairs: qaPairs,
    confidence,
    should_save: typeof record.should_save === "boolean" ? record.should_save : confidence >= 60,
    reason: readString(record.reason) || "AI 已完成结构化解析。",
    importance: clampFivePointScore(record.importance, Math.max(2, Math.round(confidence / 20))),
    clarityScore: clampFivePointScore(record.clarityScore, Math.round(confidence / 20)),
    completenessScore: clampFivePointScore(record.completenessScore, Math.round(confidence / 20)),
    usefulnessScore: clampFivePointScore(record.usefulnessScore, Math.round(confidence / 20)),
    confidenceScore: clampFivePointScore(record.confidenceScore, Math.round(confidence / 20)),
    providerUsed: readString(record.providerUsed) || "unknown",
    model: readString(record.model) || "unknown",
    fallbackUsed: typeof record.fallbackUsed === "boolean" ? record.fallbackUsed : false
  };
}

function readStoredStructuredKnowledge(metadata: unknown) {
  const record = readJsonObject(metadata);

  return normalizeEnterpriseStructuredKnowledge(record.ai_output);
}

function readStoredInput(metadata: unknown) {
  const record = readJsonObject(metadata);

  return readString(record.input);
}

function readStoredSourceType(metadata: unknown): EnterpriseIngestSourceType {
  const record = readJsonObject(metadata);
  const sourceType = readString(record.sourceType);

  if (sourceType === "chat" || sourceType === "text" || sourceType === "file" || sourceType === "image" || sourceType === "url") {
    return sourceType;
  }

  return "chat";
}

function readStoredSourceUrl(metadata: unknown) {
  const record = readJsonObject(metadata);

  return readString(record.sourceUrl) || null;
}

function buildJobWhere(actor: EnterpriseIngestActor, jobId: string) {
  return {
    id: jobId,
    ...(actor.tenantId ? { tenantId: actor.tenantId } : {}),
    ...(actor.role === "super_admin" ? {} : { createdByUserId: actor.id })
  };
}

function serializeJob(job: {
  id: string;
  sourceType: string;
  sourceId: string | null;
  status: string;
  progress: number;
  knowledgeItemId: string | null;
  createdAt: Date;
  updatedAt: Date;
  finishedAt: Date | null;
}) {
  return {
    id: job.id,
    sourceType: job.sourceType,
    sourceId: job.sourceId,
    status: job.status,
    progress: job.progress,
    knowledgeItemId: job.knowledgeItemId,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    finishedAt: job.finishedAt?.toISOString() ?? null
  };
}

export function serializeEnterpriseTrainingRecord(job: {
  id: string;
  sourceType: string;
  status: string;
  progress: number;
  knowledgeItemId: string | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
  finishedAt: Date | null;
  knowledgeItem: {
    id: string;
    title: string;
    category: string;
  } | null;
}) {
  const metadata = readJsonObject(job.metadata);
  const structured = readStoredStructuredKnowledge(metadata);
  const input = readStoredInput(metadata);
  const status = job.status === "completed" ? "saved" : job.status === "failed" ? "rejected" : "pending";

  return {
    id: job.id,
    jobId: job.id,
    input,
    ai_output: structured,
    resultTitle: job.knowledgeItem?.title ?? structured?.title ?? "AI投喂记录",
    category: job.knowledgeItem?.category ?? structured?.category ?? "未分类",
    status,
    sourceType: readStoredSourceType(metadata),
    timestamp: job.createdAt.toISOString(),
    savedAt: job.finishedAt?.toISOString() ?? null,
    knowledgeItemId: job.knowledgeItemId,
    hits: job.knowledgeItemId ? 1 : 0,
    progress: job.progress
  };
}

export async function getEnterpriseKnowledgeCategories(actor: EnterpriseIngestActor) {
  const items = await prisma.knowledgeItem.findMany({
    where: {
      ...(actor.tenantId ? { tenantId: actor.tenantId } : {}),
      ...(actor.role === "super_admin" ? {} : { userId: actor.id }),
      deletedAt: null
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: { category: true }
  });
  const categories = new Set<string>();

  for (const item of items) {
    const category = item.category.trim();

    if (category) {
      categories.add(category);
    }
  }

  return Array.from(categories).slice(0, 30);
}

export async function listEnterpriseTrainingRecords(actor: EnterpriseIngestActor, take = 20) {
  const jobs = await prisma.ingestionJob.findMany({
    where: {
      ...(actor.tenantId ? { tenantId: actor.tenantId } : {}),
      ...(actor.role === "super_admin" ? {} : { createdByUserId: actor.id }),
      sourceType: {
        in: [...enterpriseAdminIngestJobSourceTypes]
      }
    },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      knowledgeItem: {
        select: {
          id: true,
          title: true,
          category: true
        }
      }
    }
  });

  return jobs.map(serializeEnterpriseTrainingRecord);
}

export async function createEnterpriseIngestLog(actor: EnterpriseIngestActor, input: CreateEnterpriseIngestLogInput) {
  const cleanInput = cleanEnterpriseIngestInput(input.input);

  if (!cleanInput) {
    throw new ValidationError("投喂内容不能为空。");
  }

  const metadata = toJsonObject({
    adminIngestV1: true,
    stage: "parsed",
    status: "pending",
    sourceType: input.sourceType,
    sourceUrl: input.sourceUrl ?? null,
    agentId: input.agentId ?? null,
    agentName: input.agentName ?? null,
    input: cleanInput,
    ai_output: input.structured,
    training_record: {
      status: "pending",
      timestamp: new Date().toISOString(),
      category: input.structured.category
    }
  });

  const job = await prisma.ingestionJob.create({
    data: {
      sourceType: toJobSourceType(input.sourceType),
      sourceId: input.sourceType === "url" ? input.sourceUrl ?? null : null,
      status: "pending",
      progress: 45,
      createdByUserId: actor.id,
      tenantId: actor.tenantId ?? null,
      metadata
    }
  });

  await prisma.auditLog.create({
    data: {
      userId: actor.id,
      role: actor.role,
      action: "ADMIN_KB_AI_INGEST_PARSED",
      targetType: "ingestion_job",
      targetId: job.id,
      metadata: {
        sourceType: input.sourceType,
        category: input.structured.category,
        shouldSave: input.structured.should_save,
        fallbackUsed: input.structured.fallbackUsed
      }
    }
  });

  return {
    job: serializeJob(job),
    record: serializeEnterpriseTrainingRecord({
      ...job,
      knowledgeItem: null
    })
  };
}

export async function completeEnterpriseIngestSave(actor: EnterpriseIngestActor, input: SaveEnterpriseIngestInput) {
  const jobId = input.jobId.trim();

  if (!jobId) {
    throw new ValidationError("训练记录 ID 不能为空。");
  }

  const existing = await prisma.ingestionJob.findFirst({
    where: buildJobWhere(actor, jobId),
    include: {
      knowledgeItem: {
        select: {
          id: true,
          title: true,
          category: true
        }
      }
    }
  });

  if (!existing) {
    throw new NotFoundError("投喂训练记录不存在。");
  }

  if (existing.knowledgeItemId && existing.knowledgeItem) {
    return {
      job: serializeJob(existing),
      knowledgeItem: existing.knowledgeItem,
      record: serializeEnterpriseTrainingRecord(existing)
    };
  }

  const storedMetadata = readJsonObject(existing.metadata);
  const structured = input.structured ?? readStoredStructuredKnowledge(storedMetadata);

  if (!structured) {
    throw new ValidationError("缺少可保存的 AI 结构化结果。");
  }

  const originalInput = cleanIngestText(input.originalInput ?? readStoredInput(storedMetadata));

  if (!originalInput) {
    throw new ValidationError("缺少原始投喂内容，无法入库。");
  }

  const sourceType = readStoredSourceType(storedMetadata);
  const sourceUrl = input.sourceUrl ?? readStoredSourceUrl(storedMetadata);
  const content = buildEnterpriseKnowledgeContent({
    originalInput,
    structured
  });
  const chunks = splitAdminKbChunks(content, {
    sourceType: toKnowledgeSourceType(sourceType),
    title: structured.title,
    category: structured.category,
    tags: structured.tags,
    contentHash: buildContentHash(content),
    adminIngestJobId: existing.id,
    qaPairCount: structured.qa_pairs.length
  });

  if (chunks.length === 0) {
    throw new ValidationError("投喂内容为空，无法入库。");
  }

  const saved = await prisma.$transaction(async (tx) => {
    const knowledgeItem = await tx.knowledgeItem.create({
      data: {
        userId: actor.id,
        tenantId: actor.tenantId ?? null,
        title: structured.title,
        content,
        summary: structured.summary,
        tags: structured.tags,
        category: structured.category || "未分类",
        importance: structured.importance,
        clarityScore: structured.clarityScore,
        completenessScore: structured.completenessScore,
        usefulnessScore: structured.usefulnessScore,
        confidenceScore: structured.confidenceScore,
        sourceType: toKnowledgeSourceType(sourceType),
        sourceId: existing.id,
        sourceTitle: structured.title,
        sourceUrl,
        status: "active",
        chunks: {
          create: chunks.map((chunk) => ({
            chunkText: chunk.chunkText,
            chunkIndex: chunk.chunkIndex,
            summary: chunk.summary,
            metadata: chunk.metadata,
            charCount: chunk.charCount,
            tokenCount: chunk.tokenCount,
            contentHash: chunk.contentHash
          }))
        }
      },
      include: {
        chunks: {
          orderBy: { chunkIndex: "asc" }
        }
      }
    });
    const updatedMetadata = toJsonObject({
      ...storedMetadata,
      stage: "saved",
      status: "saved",
      savedAt: new Date().toISOString(),
      knowledgeItemId: knowledgeItem.id,
      training_record: {
        status: "saved",
        timestamp: existing.createdAt.toISOString(),
        savedAt: new Date().toISOString(),
        category: knowledgeItem.category,
        hits: 1
      }
    });
    const updatedJob = await tx.ingestionJob.update({
      where: { id: existing.id },
      data: {
        sourceId: knowledgeItem.id,
        knowledgeItemId: knowledgeItem.id,
        tenantId: actor.tenantId ?? null,
        status: "completed",
        progress: 100,
        finishedAt: new Date(),
        metadata: updatedMetadata
      },
      include: {
        knowledgeItem: {
          select: {
            id: true,
            title: true,
            category: true
          }
        }
      }
    });

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        role: actor.role,
        action: "ADMIN_KB_AI_INGEST_SAVED",
        targetType: "knowledge_item",
        targetId: knowledgeItem.id,
        metadata: {
          jobId: existing.id,
          sourceType,
          category: knowledgeItem.category,
          tagCount: knowledgeItem.tags.length,
          chunkCount: knowledgeItem.chunks.length
        }
      }
    });

    return {
      job: updatedJob,
      knowledgeItem: {
        id: knowledgeItem.id,
        title: knowledgeItem.title,
        category: knowledgeItem.category,
        chunkCount: knowledgeItem.chunks.length
      }
    };
  });

  return {
    job: serializeJob(saved.job),
    knowledgeItem: saved.knowledgeItem,
    record: serializeEnterpriseTrainingRecord(saved.job)
  };
}
