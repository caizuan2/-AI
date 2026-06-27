import { NextResponse } from "next/server";
import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { buildContentHash, cleanIngestText, splitAdminKbChunks } from "@/lib/admin-kb/ingestion";
import { normalizeKnowledgeSourceType } from "@/lib/admin-ingest/source-type";
import { requireKbAdmin } from "@/lib/auth/guards";
import { ValidationError } from "@/lib/errors";
import { hasDatabaseUrl } from "@/lib/server-config";
import { prisma } from "@/lib/prisma";
import {
  buildEnterpriseKnowledgeContent,
  type EnterpriseQAPair,
  type EnterpriseStructuredKnowledge
} from "@/lib/enterprise/ai-ingest-service";
import { normalizeEnterpriseStructuredKnowledge } from "@/lib/enterprise/ingest-logger";
import {
  completeEnterpriseIngestSave,
  listEnterpriseTrainingRecords
} from "@/lib/enterprise/ingest-logger";
import {
  buildIngestSharedChunkMetadata,
  resolveAgentKnowledgeScope
} from "@/lib/enterprise/knowledge-access-scope";
import { mergeKnowledgeGovernanceMetadata } from "@/lib/enterprise/knowledge-governance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noSaveableContentResponse() {
  return NextResponse.json({
    ok: false,
    success: false,
    code: "NO_SAVEABLE_CONTENT",
    errorCode: "NO_SAVEABLE_CONTENT",
    message: "没有可保存的知识内容。",
    error: {
      code: "NO_SAVEABLE_CONTENT",
      message: "没有可保存的知识内容。"
    }
  }, { status: 400 });
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(value: unknown, limit = 12) {
  return Array.isArray(value)
    ? value.map(readString).filter(Boolean).slice(0, limit)
    : [];
}

function readRecord(value: unknown) {
  return isPlainObject(value) ? value : {};
}

function readFirstString(...values: unknown[]) {
  for (const value of values) {
    const text = readString(value);

    if (text) {
      return text;
    }
  }

  return "";
}

function clampScore(value: unknown, fallback: number, max = 100) {
  const numberValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(1, Math.round(numberValue)));
}

function toFivePointScore(value: unknown, fallback = 4) {
  return Math.min(5, Math.max(1, Math.round(clampScore(value, fallback, 5))));
}

function readQAPairs(value: unknown): EnterpriseQAPair[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = readRecord(item);
      const q = readString(record.q);
      const a = readString(record.a);

      return q && a ? { q, a } : null;
    })
    .filter((item): item is EnterpriseQAPair => Boolean(item))
    .slice(0, 8);
}

function structuredFromDraft(value: unknown, content: string): EnterpriseStructuredKnowledge | null {
  const draft = readRecord(value);
  const title = readString(draft.title) || readString(draft.resultTitle) || (content ? content.slice(0, 32) : "");
  const summary = readString(draft.summary) || readString(draft.standardAnswer) || content.slice(0, 260);
  const standardQuestion = readString(draft.standardQuestion) || `关于“${title || "这条知识"}”，应该如何处理？`;
  const standardAnswer = readString(draft.standardAnswer) || summary || content;
  const qaPairs = readQAPairs(draft.qaPairs).length > 0
    ? readQAPairs(draft.qaPairs)
    : standardQuestion && standardAnswer
      ? [{ q: standardQuestion, a: standardAnswer }]
      : [];

  if (!title || !summary || qaPairs.length === 0) {
    return null;
  }

  const confidence = clampScore(draft.trainingScore, 78);
  const score = toFivePointScore(Math.round(confidence / 20), 4);

  return {
    title,
    category: readString(draft.category) || "默认知识库",
    tags: readStringArray(draft.tags).length > 0 ? readStringArray(draft.tags) : ["GPT投喂"],
    summary,
    qa_pairs: qaPairs,
    confidence,
    should_save: readString(draft.recommendation) !== "暂不入库",
    reason: readString(draft.saveRecommendation) || "AI 回复已生成可入库知识。",
    importance: score,
    clarityScore: score,
    completenessScore: Math.max(2, score - 1),
    usefulnessScore: score,
    confidenceScore: score,
    providerUsed: readString(draft.providerUsed) || readString(draft.generatedBy) || "admin-ingest",
    model: readString(draft.model) || readString(draft.sourceModel) || "unknown",
    fallbackUsed: typeof draft.fallbackUsed === "boolean" ? draft.fallbackUsed : false
  };
}

function fallbackStructuredFromContent(content: string, titleHint: string): EnterpriseStructuredKnowledge | null {
  const clean = cleanIngestText(content);

  if (!clean) {
    return null;
  }

  const title = titleHint || clean.slice(0, 32) || "管理员投喂知识";
  const summary = clean.length > 260 ? `${clean.slice(0, 260)}...` : clean;

  return {
    title,
    category: "默认知识库",
    tags: ["GPT投喂"],
    summary,
    qa_pairs: [{ q: `关于“${title}”，应该如何处理？`, a: summary }],
    confidence: 72,
    should_save: true,
    reason: "根据当前 AI 回复内容生成可保存知识。",
    importance: 4,
    clarityScore: 4,
    completenessScore: 3,
    usefulnessScore: 4,
    confidenceScore: 4,
    providerUsed: "admin-ingest",
    model: "unknown",
    fallbackUsed: true
  };
}

function readActorTenantId(actor: Awaited<ReturnType<typeof requireKbAdmin>>) {
  return "tenantId" in actor && typeof actor.tenantId === "string" ? actor.tenantId : null;
}

function readSaveRequest(body: unknown) {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const jobId = typeof body.jobId === "string" ? body.jobId.trim() : "";
  const draftId = readString(body.draftId);
  const messageId = readString(body.messageId);
  const title = readString(body.title);
  const content = readString(body.content);
  const replyMarkdown = readString(body.replyMarkdown);
  const originalInput = typeof body.originalInput === "string" ? body.originalInput : null;
  const sourceUrl = typeof body.sourceUrl === "string" && body.sourceUrl.trim() ? body.sourceUrl.trim() : null;
  const sourceFiles = readStringArray(body.sourceFiles);
  const knowledgeDraft = body.knowledgeDraft;
  const draftRecord = readRecord(knowledgeDraft);
  const activeKnowledgeBase = readRecord(body.activeKnowledgeBase);
  const knowledgeVersion = readString(body.knowledgeVersion) || readString(body.version) || readString(readRecord(knowledgeDraft).knowledgeVersion);
  const expertId = readFirstString(
    body.expert_id,
    body.expertId,
    draftRecord.expert_id,
    draftRecord.expertId,
    activeKnowledgeBase.expert_id,
    activeKnowledgeBase.expertId
  );
  const tenantId = readFirstString(
    body.tenant_id,
    body.tenantId,
    draftRecord.tenant_id,
    draftRecord.tenantId,
    activeKnowledgeBase.tenant_id,
    activeKnowledgeBase.tenantId
  );
  const agentId = readFirstString(body.agentId, body.agent_id, draftRecord.agentId, draftRecord.agent_id, expertId);
  const agentScope = resolveAgentKnowledgeScope({
    agentId,
    knowledgeBaseId: readFirstString(
      body.kb_id,
      body.kbId,
      body.knowledgeBaseId,
      draftRecord.kb_id,
      draftRecord.kbId,
      draftRecord.knowledgeBaseId,
      activeKnowledgeBase.kb_id,
      activeKnowledgeBase.kbId,
      activeKnowledgeBase.knowledgeBaseId
    ),
    namespace: readFirstString(body.namespace, draftRecord.namespace, activeKnowledgeBase.namespace)
  });
  const saveableText = cleanIngestText([
    originalInput,
    content,
    replyMarkdown,
    readString(readRecord(knowledgeDraft).summary),
    readString(readRecord(knowledgeDraft).standardAnswer)
  ].filter(Boolean).join("\n\n"));
  const structured = normalizeEnterpriseStructuredKnowledge(body.structured)
    ?? normalizeEnterpriseStructuredKnowledge(body.knowledge)
    ?? structuredFromDraft(knowledgeDraft, saveableText)
    ?? fallbackStructuredFromContent(saveableText, title);

  return {
    jobId: jobId || null,
    draftId: draftId || null,
    messageId: messageId || null,
    originalInput,
    sourceUrl,
    agentId: agentScope.agentId,
    knowledgeBaseId: agentScope.knowledgeBaseId,
    namespace: agentScope.namespace,
    expertId,
    tenantId,
    knowledgeVersion,
    structured,
    content: saveableText,
    sourceFiles,
    knowledgeDraft,
    knowledgeLoop: body.knowledgeLoop ?? null,
    memory: body.memory ?? null
  };
}

async function saveDraftOnlyKnowledge(
  actor: Awaited<ReturnType<typeof requireKbAdmin>>,
  input: ReturnType<typeof readSaveRequest>
) {
  const structured = input.structured;

  if (!structured) {
    throw new ValidationError("没有可保存的知识内容。");
  }

  const originalInput = cleanIngestText(input.originalInput ?? input.content);
  const content = buildEnterpriseKnowledgeContent({
    originalInput: originalInput || structured.summary,
    structured
  });
  const sourceId = input.draftId ?? input.messageId ?? null;
  const knowledgeSourceType = normalizeKnowledgeSourceType("admin_chat");
  const chunks = splitAdminKbChunks(content, {
    sourceType: knowledgeSourceType,
    title: structured.title,
    category: structured.category,
    tags: structured.tags,
    contentHash: buildContentHash(content),
    draftId: input.draftId,
    messageId: input.messageId,
    kb_id: input.knowledgeBaseId,
    kbId: input.knowledgeBaseId,
    expert_id: input.expertId || input.agentId,
    expertId: input.expertId || input.agentId,
    tenant_id: input.tenantId || "default",
    tenantId: input.tenantId || "default",
    qaPairCount: structured.qa_pairs.length
  });

  if (chunks.length === 0) {
    throw new ValidationError("没有可保存的知识内容。");
  }

  const saved = await prisma.$transaction(async (tx) => {
    const tenantId = readActorTenantId(actor);
    const knowledgeItem = await tx.knowledgeItem.create({
      data: {
        userId: actor.id,
        tenantId,
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
        sourceId,
        sourceTitle: structured.title,
        sourceUrl: input.sourceUrl,
        sourceMessageId: input.messageId,
        status: "active",
        chunks: {
          create: chunks.map((chunk) => ({
            chunkText: chunk.chunkText,
            chunkIndex: chunk.chunkIndex,
            summary: chunk.summary,
            metadata: buildIngestSharedChunkMetadata(
              mergeKnowledgeGovernanceMetadata(chunk.metadata, {
                version: input.knowledgeVersion,
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
                tenantId,
                createdByUserId: actor.id,
                agentId: input.agentId,
                knowledgeBaseId: input.knowledgeBaseId,
                namespace: input.namespace
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

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        role: actor.role,
        action: "ADMIN_KB_AI_INGEST_SAVED",
        targetType: "knowledge_item",
        targetId: knowledgeItem.id,
        metadata: {
          jobId: null,
          draftId: input.draftId,
          messageId: input.messageId,
          sourceType: "draft_only",
          sourceFiles: input.sourceFiles,
          category: knowledgeItem.category,
          tagCount: knowledgeItem.tags.length,
          chunkCount: knowledgeItem.chunks.length,
          agentId: input.agentId,
          knowledgeBaseId: input.knowledgeBaseId,
          namespace: input.namespace,
          kb_id: input.knowledgeBaseId,
          expert_id: input.expertId || input.agentId,
          tenant_id: input.tenantId || "default",
          knowledgeVersion: input.knowledgeVersion || "v1"
        }
      }
    });

    return {
      id: knowledgeItem.id,
      title: knowledgeItem.title,
      category: knowledgeItem.category,
      chunkCount: knowledgeItem.chunks.length
    };
  });

  return saved;
}

export async function POST(request: Request) {
  let actor: Awaited<ReturnType<typeof requireKbAdmin>>;

  try {
    actor = await requireKbAdmin(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "admin_kb_enterprise_save"
    });
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("保存管理员 AI 投喂知识"));
  }

  let input: ReturnType<typeof readSaveRequest>;

  try {
    input = readSaveRequest(await request.json());
  } catch (error) {
    return apiError(error instanceof Error ? error : new ValidationError("请求体必须是合法 JSON。"));
  }

  try {
    if (!input.jobId && !input.draftId && !input.messageId && !input.content && !input.structured) {
      return noSaveableContentResponse();
    }

    if (!input.jobId) {
      const knowledgeItem = await saveDraftOnlyKnowledge(actor, input);
      const records = await listEnterpriseTrainingRecords(actor);

      return apiSuccess({
        records,
        success: true,
        status: "saved",
        message: "已保存到知识库，但未找到对应训练记录，请刷新训练记录。",
        knowledgeItem,
        knowledgeItemId: knowledgeItem.id,
        storedCount: 1,
        chunkCount: knowledgeItem.chunkCount,
        indexedCount: knowledgeItem.chunkCount,
        fallbackUsed: false
      }, { status: 201 });
    }

    const result = await completeEnterpriseIngestSave(actor, {
      jobId: input.jobId,
      originalInput: input.originalInput,
      sourceUrl: input.sourceUrl,
      agentId: input.agentId,
      knowledgeBaseId: input.knowledgeBaseId,
      namespace: input.namespace,
      expertId: input.expertId,
      requestedTenantId: input.tenantId || "default",
      knowledgeVersion: input.knowledgeVersion,
      structured: input.structured
    });
    const records = await listEnterpriseTrainingRecords(actor);

    const savedKnowledgeItem = result.knowledgeItem as unknown as { chunkCount?: unknown } | null;
    const chunkCount = typeof savedKnowledgeItem?.chunkCount === "number" ? savedKnowledgeItem.chunkCount : 0;

    return apiSuccess({
      ...result,
      records,
      success: true,
      status: "saved",
      message: "已保存知识入库，训练记录已更新。",
      knowledgeItemId: result.knowledgeItem?.id ?? result.job.knowledgeItemId ?? null,
      storedCount: result.knowledgeItem ? 1 : 0,
      chunkCount,
      indexedCount: chunkCount
    }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
