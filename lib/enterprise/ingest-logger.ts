import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildContentHash, cleanIngestText, splitAdminKbChunks } from "@/lib/admin-kb/ingestion";
import { normalizeKnowledgeSourceType } from "@/lib/admin-ingest/source-type";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type { AppRole } from "@/lib/rbac/roles";
import {
  buildEnterpriseKnowledgeContent,
  cleanEnterpriseIngestInput,
  type EnterpriseIngestSourceType,
  type EnterpriseQAPair,
  type EnterpriseStructuredKnowledge
} from "@/lib/enterprise/ai-ingest-service";
import {
  buildIngestSharedChunkMetadata,
  resolveAgentKnowledgeScope
} from "@/lib/enterprise/knowledge-access-scope";
import { mergeKnowledgeGovernanceMetadata } from "@/lib/enterprise/knowledge-governance";

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
  knowledgeBaseId?: string | null;
  namespace?: string | null;
  knowledgeVersion?: string | number | null;
  structured: EnterpriseStructuredKnowledge;
  doubaoMetadataRecovery?: {
    state: "completed" | "deferred";
    failureCode?: string | null;
    replyMarkdown: string;
    visibleResponseId?: string | null;
    requestedModel: string;
    actualModel: string;
  } | null;
}

export interface SaveEnterpriseIngestInput {
  jobId: string;
  structured?: EnterpriseStructuredKnowledge | null;
  originalInput?: string | null;
  sourceUrl?: string | null;
  agentId?: string | null;
  knowledgeBaseId?: string | null;
  namespace?: string | null;
  expertId?: string | null;
  requestedTenantId?: string | null;
  knowledgeVersion?: string | number | null;
}

export interface EnterpriseDoubaoMetadataRecoverySeed {
  recoveryState: "claimed" | "completed";
  jobId: string;
  attemptId: string;
  input: string;
  replyMarkdown: string;
  visibleReplyHash: string;
  visibleResponseId: string | null;
  requestedModel: string;
  actualModel: string;
  agentId: string;
  agentName: string;
  knowledgeBaseId: string;
  namespace: string;
  category: string;
  structured?: EnterpriseStructuredKnowledge;
  metadataResponseId?: string | null;
  saveRecommendation?: string | null;
}

export const enterpriseAdminIngestJobSourceTypes = [
  "admin_ai_chat",
  "admin_ai_text",
  "admin_ai_file",
  "admin_ai_image",
  "admin_ai_url"
] as const;

const DOUBAO_METADATA_RECOVERY_LEASE_MS = 5 * 60 * 1000;

function toJobSourceType(sourceType: EnterpriseIngestSourceType) {
  return `admin_ai_${sourceType}`;
}

function toKnowledgeSourceType(sourceType: EnterpriseIngestSourceType) {
  return normalizeKnowledgeSourceType(sourceType);
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

function readRawString(value: unknown) {
  return typeof value === "string" ? value : "";
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

function readStoredDoubaoRecovery(metadata: unknown) {
  const record = readJsonObject(metadata);

  return readJsonObject(record.doubaoMetadataRecovery);
}

function readStoredReplyMarkdown(metadata: unknown) {
  const record = readJsonObject(metadata);
  const recovery = readStoredDoubaoRecovery(record);
  const recoveryReply = readRawString(recovery.replyMarkdown);

  if (recoveryReply) {
    return recoveryReply;
  }

  const structured = readJsonObject(record.ai_output);
  const qaPairs = Array.isArray(structured.qa_pairs) ? structured.qa_pairs : [];
  const firstPair = qaPairs.length > 0 ? readJsonObject(qaPairs[0]) : {};

  return readRawString(firstPair.a);
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
    ...resolveAgentKnowledgeScope({
      agentId: input.agentId,
      knowledgeBaseId: input.knowledgeBaseId,
      namespace: input.namespace
    }),
    knowledgeVersion: input.knowledgeVersion ?? "v1",
    agentName: input.agentName ?? null,
    input: cleanInput,
    ai_output: input.structured,
    ...(input.doubaoMetadataRecovery ? {
      doubaoMetadataRecovery: {
        version: 1,
        state: input.doubaoMetadataRecovery.state,
        failureCode: input.doubaoMetadataRecovery.failureCode ?? null,
        replyMarkdown: input.doubaoMetadataRecovery.replyMarkdown,
        visibleReplyHash: buildContentHash(input.doubaoMetadataRecovery.replyMarkdown),
        visibleResponseId: input.doubaoMetadataRecovery.visibleResponseId ?? null,
        requestedModel: input.doubaoMetadataRecovery.requestedModel,
        actualModel: input.doubaoMetadataRecovery.actualModel,
        updatedAt: new Date().toISOString()
      }
    } : {}),
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

export async function claimEnterpriseDoubaoMetadataRecovery(
  actor: EnterpriseIngestActor,
  input: {
    jobId: string;
    attemptId: string;
    replyMarkdown: string;
    sourceResponseId: string;
  }
): Promise<EnterpriseDoubaoMetadataRecoverySeed> {
  const jobId = input.jobId.trim();
  const attemptId = input.attemptId.trim();
  const sourceResponseId = input.sourceResponseId.trim();
  const suppliedReplyMarkdown = input.replyMarkdown;

  if (!jobId || !attemptId || !sourceResponseId || !suppliedReplyMarkdown.trim()) {
    throw new ValidationError("豆包知识草稿恢复参数不完整。");
  }

  const existing = await prisma.ingestionJob.findFirst({
    where: buildJobWhere(actor, jobId)
  });

  if (!existing) {
    throw new NotFoundError("待恢复的豆包训练记录不存在。");
  }

  if (existing.status !== "pending" || existing.knowledgeItemId) {
    throw new ValidationError("当前训练记录已不处于待确认状态，不能重新整理知识草稿。");
  }

  const storedMetadata = readJsonObject(existing.metadata);
  const structured = readStoredStructuredKnowledge(storedMetadata);

  if (!structured || structured.providerUsed.trim().toLowerCase() !== "doubao" || structured.fallbackUsed) {
    throw new ValidationError("当前训练记录不是可恢复的豆包原始结果。");
  }

  const storedRecovery = readStoredDoubaoRecovery(storedMetadata);
  const storedState = readString(storedRecovery.state);
  const exactStoredRecoveryReply = readRawString(storedRecovery.replyMarkdown);
  const storedReplyMarkdown = readStoredReplyMarkdown(storedMetadata);
  const canonicalReplyMarkdown = storedReplyMarkdown || suppliedReplyMarkdown;

  if (!canonicalReplyMarkdown) {
    throw new ValidationError("训练记录缺少已完成的豆包正文，无法安全恢复知识草稿。");
  }

  const hasReplyMismatch = exactStoredRecoveryReply
    ? exactStoredRecoveryReply !== suppliedReplyMarkdown
    : Boolean(
        storedReplyMarkdown
        && storedReplyMarkdown.trim() !== suppliedReplyMarkdown.trim()
      );

  if (hasReplyMismatch) {
    throw new ValidationError("当前页面正文与训练记录不一致，已拒绝错绑知识草稿。");
  }

  const storedVisibleResponseId = readString(storedRecovery.visibleResponseId);

  if (storedVisibleResponseId && storedVisibleResponseId !== sourceResponseId) {
    throw new ValidationError("当前页面响应与训练记录不一致，已拒绝错绑知识草稿。");
  }

  const replyMarkdown = suppliedReplyMarkdown;
  const agentScope = resolveAgentKnowledgeScope({
    agentId: readString(storedMetadata.agentId),
    knowledgeBaseId: readString(storedMetadata.knowledgeBaseId),
    namespace: readString(storedMetadata.namespace)
  });
  const requestedModel = readString(storedRecovery.requestedModel) || structured.model;
  const actualModel = readString(storedRecovery.actualModel) || structured.model;
  const visibleResponseId = storedVisibleResponseId || sourceResponseId;
  const baseSeed = {
    jobId,
    attemptId,
    input: readStoredInput(storedMetadata),
    replyMarkdown,
    visibleReplyHash: buildContentHash(replyMarkdown),
    visibleResponseId,
    requestedModel,
    actualModel,
    agentId: agentScope.agentId,
    agentName: readString(storedMetadata.agentName),
    knowledgeBaseId: agentScope.knowledgeBaseId,
    namespace: agentScope.namespace,
    category: structured.category
  };

  if (storedState === "completed") {
    return {
      ...baseSeed,
      recoveryState: "completed",
      structured,
      metadataResponseId: readString(storedRecovery.metadataResponseId) || null,
      saveRecommendation: readString(storedRecovery.saveRecommendation) || null
    };
  }

  if (storedState === "retrying") {
    const startedAtMs = Date.parse(readString(storedRecovery.startedAt));
    const leaseAgeMs = Date.now() - startedAtMs;
    const hasActiveLease = Number.isFinite(startedAtMs) && leaseAgeMs < DOUBAO_METADATA_RECOVERY_LEASE_MS;

    if (hasActiveLease) {
      throw new ValidationError("当前豆包知识草稿正在重新整理，请勿重复提交。");
    }
  }

  const recoveryMetadata = {
    ...storedRecovery,
    version: 1,
    state: "retrying",
    activeAttemptId: attemptId,
    reclaimedAttemptId: storedState === "retrying"
      ? readString(storedRecovery.activeAttemptId) || null
      : null,
    replyMarkdown,
    visibleReplyHash: buildContentHash(replyMarkdown),
    visibleResponseId,
    requestedModel,
    actualModel,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const updatedMetadata = toJsonObject({
    ...storedMetadata,
    doubaoMetadataRecovery: recoveryMetadata
  });
  const claim = await prisma.ingestionJob.updateMany({
    where: {
      ...buildJobWhere(actor, jobId),
      updatedAt: existing.updatedAt,
      status: "pending",
      knowledgeItemId: null
    },
    data: {
      metadata: updatedMetadata
    }
  });

  if (claim.count !== 1) {
    throw new ValidationError("当前豆包知识草稿状态已变化，请刷新后重试。");
  }

  return {
    ...baseSeed,
    recoveryState: "claimed"
  };
}

export async function completeEnterpriseDoubaoMetadataRecovery(
  actor: EnterpriseIngestActor,
  input: {
    jobId: string;
    attemptId: string;
    structured: EnterpriseStructuredKnowledge;
    metadataResponseId: string;
    saveRecommendation: string;
    failureCode?: string | null;
  }
) {
  const existing = await prisma.ingestionJob.findFirst({
    where: buildJobWhere(actor, input.jobId)
  });

  if (!existing) {
    throw new NotFoundError("待恢复的豆包训练记录不存在。");
  }

  const storedMetadata = readJsonObject(existing.metadata);
  const recovery = readStoredDoubaoRecovery(storedMetadata);

  if (readString(recovery.state) !== "retrying" || readString(recovery.activeAttemptId) !== input.attemptId) {
    throw new ValidationError("豆包知识草稿恢复任务已过期，未覆盖当前训练记录。");
  }

  const completedMetadata = toJsonObject({
    ...storedMetadata,
    ai_output: input.structured,
    doubaoMetadataRecovery: {
      ...recovery,
      state: "completed",
      activeAttemptId: null,
      lastAttemptId: input.attemptId,
      metadataResponseId: input.metadataResponseId,
      saveRecommendation: input.saveRecommendation,
      failureCode: input.failureCode ?? null,
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    training_record: {
      ...readJsonObject(storedMetadata.training_record),
      status: "pending",
      category: input.structured.category,
      updatedAt: new Date().toISOString()
    }
  });
  const updated = await prisma.ingestionJob.updateMany({
    where: {
      ...buildJobWhere(actor, input.jobId),
      updatedAt: existing.updatedAt,
      status: "pending",
      knowledgeItemId: null
    },
    data: {
      metadata: completedMetadata
    }
  });

  if (updated.count !== 1) {
    throw new ValidationError("豆包知识草稿恢复结果已过期，未覆盖当前训练记录。");
  }

  const refreshed = await prisma.ingestionJob.findFirst({
    where: buildJobWhere(actor, input.jobId),
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

  if (!refreshed) {
    throw new NotFoundError("豆包训练记录更新后未找到。");
  }

  return serializeEnterpriseTrainingRecord(refreshed);
}

export async function failEnterpriseDoubaoMetadataRecovery(
  actor: EnterpriseIngestActor,
  input: {
    jobId: string;
    attemptId: string;
    failureCode: string;
    failureDetails?: Record<string, unknown>;
  }
) {
  const existing = await prisma.ingestionJob.findFirst({
    where: buildJobWhere(actor, input.jobId)
  });

  if (!existing) {
    return;
  }

  const storedMetadata = readJsonObject(existing.metadata);
  const recovery = readStoredDoubaoRecovery(storedMetadata);

  if (readString(recovery.state) !== "retrying" || readString(recovery.activeAttemptId) !== input.attemptId) {
    return;
  }

  await prisma.ingestionJob.updateMany({
    where: {
      ...buildJobWhere(actor, input.jobId),
      updatedAt: existing.updatedAt,
      status: "pending",
      knowledgeItemId: null
    },
    data: {
      metadata: toJsonObject({
        ...storedMetadata,
        doubaoMetadataRecovery: {
          ...recovery,
          state: "deferred",
          activeAttemptId: null,
          lastAttemptId: input.attemptId,
          failureCode: input.failureCode,
          failureDetails: input.failureDetails ?? {},
          failedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      })
    }
  });
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
  const storedStructured = readStoredStructuredKnowledge(storedMetadata);
  const doubaoRecovery = readStoredDoubaoRecovery(storedMetadata);
  const isDeferredDoubaoDraft = storedStructured?.providerUsed.trim().toLowerCase() === "doubao"
    && storedStructured.fallbackUsed === false
    && storedStructured.should_save === false;

  if (isDeferredDoubaoDraft && readString(doubaoRecovery.state) !== "completed") {
    throw new ValidationError("豆包知识草稿元数据尚未完成，不能正式入库。请先重新整理知识草稿。");
  }

  const structured = input.structured ?? storedStructured;

  if (!structured) {
    throw new ValidationError("缺少可保存的 AI 结构化结果。");
  }

  const originalInput = cleanIngestText(input.originalInput ?? readStoredInput(storedMetadata));

  if (!originalInput) {
    throw new ValidationError("缺少原始投喂内容，无法入库。");
  }

  const sourceType = readStoredSourceType(storedMetadata);
  const knowledgeSourceType = toKnowledgeSourceType(sourceType);
  const sourceUrl = input.sourceUrl ?? readStoredSourceUrl(storedMetadata);
  const agentScope = resolveAgentKnowledgeScope({
    agentId: input.agentId ?? readString(storedMetadata.agentId),
    knowledgeBaseId: input.knowledgeBaseId ?? readString(storedMetadata.knowledgeBaseId),
    namespace: input.namespace ?? readString(storedMetadata.namespace)
  });
  const expertId = readString(input.expertId) || readString(storedMetadata.expert_id) || readString(storedMetadata.expertId) || agentScope.agentId;
  const requestedTenantId = readString(input.requestedTenantId) || readString(storedMetadata.tenant_id) || readString(storedMetadata.tenantId) || "default";
  const knowledgeVersion = (input.knowledgeVersion ?? readString(storedMetadata.knowledgeVersion)) || "v1";
  const content = buildEnterpriseKnowledgeContent({
    originalInput,
    structured
  });
  const chunks = splitAdminKbChunks(content, {
    sourceType: knowledgeSourceType,
    title: structured.title,
    category: structured.category,
    tags: structured.tags,
    contentHash: buildContentHash(content),
    adminIngestJobId: existing.id,
    kb_id: agentScope.knowledgeBaseId,
    kbId: agentScope.knowledgeBaseId,
    expert_id: expertId,
    expertId,
    tenant_id: requestedTenantId,
    tenantId: requestedTenantId,
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
        sourceType: knowledgeSourceType,
        sourceId: existing.id,
        sourceTitle: structured.title,
        sourceUrl,
        status: "active",
        chunks: {
          create: chunks.map((chunk) => ({
            chunkText: chunk.chunkText,
            chunkIndex: chunk.chunkIndex,
            summary: chunk.summary,
            metadata: buildIngestSharedChunkMetadata(
              mergeKnowledgeGovernanceMetadata(chunk.metadata, {
                version: knowledgeVersion,
                sourceType: knowledgeSourceType,
                ingestTimestamp: new Date(),
                contentHash: chunk.contentHash,
                relevance: (
                  structured.clarityScore
                  + structured.completenessScore
                  + structured.usefulnessScore
                  + structured.confidenceScore
                ) / 20,
                usage: 0,
                feedback: structured.confidence / 100,
                freshness: 1
              }),
              {
                tenantId: actor.tenantId ?? null,
                createdByUserId: actor.id,
                ...agentScope
              }
            ),
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
      source: "admin_ingest",
      sourceApp: "ingest_admin",
      appType: "knowledge_base",
      visibility: "published",
      published: true,
      enabled: true,
      shared: true,
      sharedToUserApp: true,
      tenantId: actor.tenantId ?? null,
      tenant_id: requestedTenantId,
      createdByUserId: actor.id,
      kb_id: agentScope.knowledgeBaseId,
      expert_id: expertId,
      ...agentScope,
      knowledgeVersion,
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
          chunkCount: knowledgeItem.chunks.length,
          agentId: agentScope.agentId,
          knowledgeBaseId: agentScope.knowledgeBaseId,
          namespace: agentScope.namespace,
          knowledgeVersion
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
