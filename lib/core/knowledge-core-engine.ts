import "server-only";

import { prisma } from "@/lib/prisma";
import { generateRagAnswer, type RagContext } from "@/lib/ai/rag-answer";
import { cleanUserFacingRagAnswer } from "@/lib/ai/rag-output";
import { getRequestIdFromHeaders } from "@/lib/logger";
import { retrieveKnowledge, type RetrievedKnowledgeChunk } from "@/lib/rag/retriever";
import type { AppRole } from "@/lib/rbac/roles";
import { getOrCreateUserSettings } from "@/lib/settings";
import {
  CHAT_TOP_K,
  RAG_MAX_CONTEXT_CHARS,
  RAG_MAX_CONTEXT_CHUNKS,
  getChatModelForProvider,
  hasUsableChatProvider,
  isAIFallbackAllowed
} from "@/lib/server-config";
import { getProviderReadiness } from "@/lib/ai/providers";
import { AIError, ValidationError } from "@/lib/errors";
import type { TenantAnalyticsContext, TenantContext } from "@/lib/core/tenant-context";
import { indexKnowledgeItemEmbedding } from "@/lib/core/embedding-service";
import { semanticSearch, type SemanticSearchResult } from "@/lib/core/semantic-search";
import {
  analyzeEnterpriseIngest,
  type EnterpriseIngestSourceType,
  type EnterpriseStructuredKnowledge
} from "@/lib/enterprise/ai-ingest-service";
import {
  completeEnterpriseIngestSave,
  createEnterpriseIngestLog,
  enterpriseAdminIngestJobSourceTypes,
  getEnterpriseKnowledgeCategories,
  listEnterpriseTrainingRecords
} from "@/lib/enterprise/ingest-logger";

export type CoreKnowledgeSource = "admin_ingest" | "file" | "chat" | "url";

export interface KnowledgeCoreActor {
  id: string;
  role: AppRole;
  tenantId?: string | null;
  tenantName?: string | null;
  tenantPlan?: string | null;
  tenantStatus?: string | null;
}

export interface CoreKnowledgeItem {
  id: string;
  tenantId: string | null;
  title: string;
  content: string;
  category: string;
  tags: string[];
  source: CoreKnowledgeSource;
  structured_qa: Array<{ q: string; a: string }>;
  embedding?: number[] | null;
  embeddingModel?: string | null;
  indexedAt?: string | null;
  confidence: number;
  createdAt: string;
}

export interface CoreIngestInput {
  input: string;
  source?: CoreKnowledgeSource;
  sourceUrl?: string | null;
  agentId?: string | null;
  knowledgeBaseId?: string | null;
  namespace?: string | null;
  agentName?: string | null;
  autoSave?: boolean;
  requestId?: string;
}

export interface CoreQueryInput {
  question: string;
  topK?: number;
  semantic?: boolean;
  agentId?: string | null;
  knowledgeBaseId?: string | null;
  namespace?: string | null;
  requestId?: string;
}

const MAX_CORE_QUERY_CHARS = 2_000;

function trimText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function requireTenant(actor: KnowledgeCoreActor): TenantContext {
  const tenantId = trimText(actor.tenantId);

  if (!tenantId) {
    throw new ValidationError("缺少企业租户上下文，无法访问知识核心。");
  }

  return {
    tenantId,
    tenantName: trimText(actor.tenantName) || "默认企业空间",
    tenantPlan: trimText(actor.tenantPlan) || "starter",
    tenantStatus: trimText(actor.tenantStatus) || "active",
    actorUserId: actor.id,
    scope: "tenant",
    readonlyView: false
  };
}

function toEnterpriseSourceType(source: CoreKnowledgeSource): EnterpriseIngestSourceType {
  if (source === "file" || source === "url") {
    return source;
  }

  return "chat";
}

function toCoreSource(sourceType: string | null | undefined): CoreKnowledgeSource {
  if (sourceType?.includes("file") || sourceType === "document") {
    return "file";
  }

  if (sourceType?.includes("url") || sourceType === "web_url") {
    return "url";
  }

  if (sourceType?.includes("chat")) {
    return "chat";
  }

  return "admin_ingest";
}

function normalizeTopK(value: unknown) {
  const topK = typeof value === "number" ? Math.round(value) : CHAT_TOP_K;

  return Number.isInteger(topK) && topK > 0 ? Math.min(topK, 20) : CHAT_TOP_K;
}

function buildFallbackAnswer(question: string, sources: CoreQuerySource[]) {
  if (sources.length === 0) {
    return `这个问题当前没有足够的内部资料可以直接确认。可以先补充和「${question}」相关的标准口径、适用边界或案例，我再帮你整理成可直接使用的回答。`;
  }

  const summary = sources
    .slice(0, 3)
    .map((source) => source.chunkText.replace(/\s+/g, " ").slice(0, 180))
    .join(" ");

  return `${summary} 建议按当前知识库资料谨慎回答；涉及承诺、资格、金额、审批或制度边界时，应先确认正式规则。`;
}

function toRagContexts(results: RetrievedKnowledgeChunk[]): RagContext[] {
  let usedChars = 0;
  const contexts: RagContext[] = [];

  for (const result of results.slice(0, RAG_MAX_CONTEXT_CHUNKS)) {
    const remaining = RAG_MAX_CONTEXT_CHARS - usedChars;

    if (remaining <= 0) {
      break;
    }

    const content = result.chunkText.slice(0, remaining);

    usedChars += content.length;
    contexts.push({
      id: result.knowledgeItemId,
      title: result.title,
      content,
      summary: result.summary,
      category: result.category,
      sourceType: result.sourceType,
      sourceId: result.chunkId,
      sourceTitle: result.sourceTitle,
      sourceUrl: result.sourceUrl,
      score: result.score,
      similarity: result.similarity
    });
  }

  return contexts;
}

export interface CoreQuerySource {
  citationIndex: number;
  chunkId: string;
  knowledgeItemId: string;
  title: string;
  summary: string;
  chunkText: string;
  category: string;
  sourceType: string;
  sourceTitle: string | null;
  sourceUrl: string | null;
  createdAt: string;
  similarity: number;
  score: number;
}

function toCoreSources(results: RetrievedKnowledgeChunk[]): CoreQuerySource[] {
  return results.map((result, index) => ({
    citationIndex: index + 1,
    chunkId: result.chunkId,
    knowledgeItemId: result.knowledgeItemId,
    title: result.title,
    summary: result.summary,
    chunkText: result.chunkText,
    category: result.category,
    sourceType: result.sourceType,
    sourceTitle: result.sourceTitle,
    sourceUrl: result.sourceUrl,
    createdAt: result.createdAt,
    similarity: result.similarity,
    score: result.score
  }));
}

function semanticResultToContext(result: SemanticSearchResult): RagContext {
  return {
    id: result.id,
    title: result.title,
    content: result.summary || result.content.slice(0, RAG_MAX_CONTEXT_CHARS),
    summary: result.summary,
    category: result.category,
    sourceType: result.sourceType,
    sourceId: result.id,
    sourceTitle: result.sourceTitle,
    sourceUrl: result.sourceUrl,
    score: result.score,
    similarity: result.similarity
  };
}

function semanticResultToSource(result: SemanticSearchResult, index: number): CoreQuerySource {
  return {
    citationIndex: index + 1,
    chunkId: `semantic:${result.id}`,
    knowledgeItemId: result.id,
    title: result.title,
    summary: result.summary,
    chunkText: result.summary || result.content.slice(0, 700),
    category: result.category,
    sourceType: result.sourceType,
    sourceTitle: result.sourceTitle,
    sourceUrl: result.sourceUrl,
    createdAt: result.createdAt,
    similarity: result.similarity,
    score: result.score
  };
}

function mergeSources(primary: CoreQuerySource[], secondary: CoreQuerySource[]) {
  const seen = new Set<string>();
  const merged: CoreQuerySource[] = [];

  for (const source of [...primary, ...secondary]) {
    const key = source.knowledgeItemId;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push({
      ...source,
      citationIndex: merged.length + 1
    });
  }

  return merged;
}

function mergeContexts(primary: RagContext[], secondary: RagContext[]) {
  const seen = new Set<string>();
  const merged: RagContext[] = [];

  for (const context of [...primary, ...secondary]) {
    if (seen.has(context.id)) {
      continue;
    }

    seen.add(context.id);
    merged.push(context);
  }

  return merged.slice(0, RAG_MAX_CONTEXT_CHUNKS);
}

function toCoreKnowledgeItem(input: {
  id: string;
  tenantId: string | null;
  title: string;
  content: string;
  category: string;
  tags: string[];
  sourceType: string;
  qaPairs: Array<{ q: string; a: string }>;
  embedding?: number[] | null;
  embeddingModel?: string | null;
  indexedAt?: Date | string | null;
  confidence: number;
  createdAt: Date | string;
}): CoreKnowledgeItem {
  return {
    id: input.id,
    tenantId: input.tenantId,
    title: input.title,
    content: input.content,
    category: input.category,
    tags: input.tags,
    source: toCoreSource(input.sourceType),
    structured_qa: input.qaPairs,
    embedding: input.embedding ?? null,
    embeddingModel: input.embeddingModel ?? null,
    indexedAt: input.indexedAt instanceof Date ? input.indexedAt.toISOString() : input.indexedAt ? new Date(input.indexedAt).toISOString() : null,
    confidence: input.confidence,
    createdAt: input.createdAt instanceof Date ? input.createdAt.toISOString() : new Date(input.createdAt).toISOString()
  };
}

async function getSavedCoreKnowledgeItem(knowledgeItemId: string, tenantId: string, structured: EnterpriseStructuredKnowledge) {
  const item = await prisma.knowledgeItem.findFirst({
    where: {
      id: knowledgeItemId,
      tenantId
    },
    select: {
      id: true,
      tenantId: true,
      title: true,
      content: true,
      category: true,
      tags: true,
      sourceType: true,
      embedding: true,
      embeddingModel: true,
      indexedAt: true,
      createdAt: true
    }
  });

  if (!item) {
    return null;
  }

  return toCoreKnowledgeItem({
    ...item,
    embedding: Array.isArray(item.embedding) ? item.embedding.filter((value): value is number => typeof value === "number") : null,
    qaPairs: structured.qa_pairs,
    confidence: structured.confidence
  });
}

export async function ingestKnowledgeCore(actor: KnowledgeCoreActor, input: CoreIngestInput) {
  const rawInput = trimText(input.input);
  const source = input.source ?? "admin_ingest";
  const tenant = requireTenant(actor);
  const enterpriseActor = {
    id: actor.id,
    role: actor.role,
    tenantId: tenant.tenantId
  };

  if (!rawInput) {
    throw new ValidationError("投喂内容不能为空。");
  }

  const enterpriseSourceType = toEnterpriseSourceType(source);
  const categories = await getEnterpriseKnowledgeCategories(enterpriseActor);
  const structured = await analyzeEnterpriseIngest({
    input: rawInput,
    sourceType: enterpriseSourceType,
    sourceUrl: input.sourceUrl,
    existingCategories: categories,
    requestId: input.requestId,
    userId: actor.id
  });
  const log = await createEnterpriseIngestLog(enterpriseActor, {
    input: rawInput,
    sourceType: enterpriseSourceType,
    sourceUrl: input.sourceUrl,
    agentId: input.agentId,
    knowledgeBaseId: input.knowledgeBaseId,
    namespace: input.namespace,
    agentName: input.agentName,
    structured
  });
  const shouldAutoSave = input.autoSave !== false;

  if (!shouldAutoSave) {
    return {
      core: "knowledge-core-engine",
      stage: "parsed",
      draft: structured,
      job: log.job,
      record: log.record,
      knowledgeItem: null,
      standardKnowledgeItem: null,
      tenant,
      records: await listEnterpriseTrainingRecords(enterpriseActor)
    };
  }

  const saved = await completeEnterpriseIngestSave(enterpriseActor, {
    jobId: log.job.id,
    structured,
    originalInput: rawInput,
    sourceUrl: input.sourceUrl,
    agentId: input.agentId,
    knowledgeBaseId: input.knowledgeBaseId,
    namespace: input.namespace
  });
  const embedding = saved.knowledgeItem
    ? await indexKnowledgeItemEmbedding({
      knowledgeItemId: saved.knowledgeItem.id,
      tenantId: tenant.tenantId,
      userId: actor.id,
      requestId: input.requestId
    })
    : null;
  const standardKnowledgeItem = saved.knowledgeItem
    ? await getSavedCoreKnowledgeItem(saved.knowledgeItem.id, tenant.tenantId, structured)
    : null;

  return {
    core: "knowledge-core-engine",
    stage: "saved",
    draft: structured,
    job: saved.job,
    record: saved.record,
    knowledgeItem: saved.knowledgeItem,
    standardKnowledgeItem,
    vectorStatus: embedding ? {
      indexed: true,
      model: embedding.model,
      provider: embedding.provider,
      fallbackUsed: embedding.fallbackUsed,
      dimensions: embedding.dimensions,
      indexedAt: embedding.knowledgeItem.indexedAt
    } : {
      indexed: false,
      model: null,
      provider: null,
      fallbackUsed: false,
      dimensions: 0,
      indexedAt: null
    },
    tenant,
    records: await listEnterpriseTrainingRecords(enterpriseActor)
  };
}

export async function queryKnowledgeCore(actor: KnowledgeCoreActor, input: CoreQueryInput) {
  const question = trimText(input.question);
  const tenant = requireTenant(actor);

  if (!question) {
    throw new ValidationError("请输入问题。");
  }

  if (question.length > MAX_CORE_QUERY_CHARS) {
    throw new ValidationError(`问题过长，请控制在 ${MAX_CORE_QUERY_CHARS} 字以内。`);
  }

  const startedAt = Date.now();
  const settings = await getOrCreateUserSettings(actor.id);
  const topK = normalizeTopK(input.topK ?? settings.ragTopK);
  const provider = settings.preferredProvider === "qwen" || settings.preferredProvider === "openai" || settings.preferredProvider === "deepseek"
    ? settings.preferredProvider
    : undefined;
  const model = provider ? settings.preferredModel?.trim() || getChatModelForProvider(provider) : undefined;
  const semantic = input.semantic === false
    ? null
    : await semanticSearch({
      tenantId: tenant.tenantId,
      userId: actor.id,
      query: question,
      topK,
      agentId: input.agentId,
      knowledgeBaseId: input.knowledgeBaseId,
      namespace: input.namespace,
      requestId: input.requestId
    });
  const retrieval = await retrieveKnowledge({
    query: question,
    topK,
    minSimilarity: settings.ragMinScore ?? undefined,
    minResults: 3,
    userId: actor.id,
    tenantId: tenant.tenantId,
    agentId: input.agentId,
    knowledgeBaseId: input.knowledgeBaseId,
    namespace: input.namespace,
    requestId: input.requestId
  });
  const semanticSources = semantic?.results.map(semanticResultToSource) ?? [];
  const ragSources = toCoreSources(retrieval.results);
  const sources = mergeSources(semanticSources, ragSources);
  const semanticContexts = semantic?.results.map(semanticResultToContext) ?? [];
  const contexts = mergeContexts(semanticContexts, toRagContexts(retrieval.results));

  let answer = buildFallbackAnswer(question, sources);
  let providerUsed = "local";
  let modelUsed = "local-fallback";
  let fallbackUsed = true;
  let originalProviderErrorCode: string | undefined;

  if (contexts.length > 0 && hasUsableChatProvider(provider)) {
    try {
      const ragAnswer = await generateRagAnswer(question, contexts, {
        requestId: input.requestId,
        userId: actor.id,
        provider,
        model,
        agentId: input.agentId,
        knowledgeBaseId: input.knowledgeBaseId,
        namespace: input.namespace,
        answerMode: retrieval.answerMode,
        confidence: retrieval.confidence,
        intentLabel: retrieval.intent.label,
        retrievalMessage: retrieval.message
      });

      answer = cleanUserFacingRagAnswer(ragAnswer.answer);
      providerUsed = ragAnswer.providerUsed;
      modelUsed = ragAnswer.model;
      fallbackUsed = ragAnswer.fallbackUsed;
      originalProviderErrorCode = ragAnswer.originalProviderErrorCode;
    } catch (error) {
      if (!isAIFallbackAllowed()) {
        throw error;
      }
    }
  } else if (!isAIFallbackAllowed() && contexts.length > 0) {
    throw new AIError("生产环境必须配置真实 AI 生成模型，不能使用本地问答 fallback。");
  }

  const latencyMs = Date.now() - startedAt;

  await prisma.knowledgeQueryLog.create({
    data: {
      userId: actor.id,
      tenantId: tenant.tenantId,
      query: question,
      providerUsed,
      modelUsed,
      topK,
      latencyMs,
      tokenUsage: {
        core: "knowledge-core-engine",
        requestId: input.requestId,
        tenantId: tenant.tenantId,
        tenantName: tenant.tenantName,
        sourceCount: sources.length,
        semanticSourceCount: semanticSources.length,
        semanticMode: semantic?.mode ?? "disabled",
        fallbackUsed,
        originalProviderErrorCode,
        answerMode: retrieval.answerMode,
        confidence: retrieval.confidence
      },
      cached: false
    }
  }).catch(() => undefined);

  return {
    core: "knowledge-core-engine",
    tenant,
    answer: cleanUserFacingRagAnswer(answer),
    finalAnswer: cleanUserFacingRagAnswer(answer),
    rawAnswer: answer,
    sources,
    retrievalMessage: retrieval.message,
    retrieval: {
      mode: retrieval.mode,
      semanticMode: semantic?.mode ?? "disabled",
      answerMode: retrieval.answerMode,
      confidence: retrieval.confidence,
      intent: retrieval.intent.label,
      totalCandidates: retrieval.totalCandidates,
      filteredCandidates: retrieval.filteredCandidates,
      returnedSourceCount: sources.length,
      usedSourceCount: contexts.length,
      queries: retrieval.queries,
      suggestedKnowledgeTypes: retrieval.suggestedKnowledgeTypes,
      relaxedRetrievalUsed: retrieval.relaxedRetrievalUsed,
      keywordFallbackUsed: retrieval.keywordFallbackUsed,
      semanticSourceCount: semanticSources.length,
      semanticEmbedding: semantic?.embedding ?? null
    },
    providerUsed,
    modelUsed,
    fallbackUsed,
    originalProviderErrorCode,
    cached: false,
    latencyMs,
    requestId: input.requestId
  };
}

function readNumericMetadata(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return 0;
  }

  const record = value as Record<string, unknown>;
  const numberValue = record[key];

  return typeof numberValue === "number" && Number.isFinite(numberValue) ? numberValue : 0;
}

function readStringMetadata(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }

  const record = value as Record<string, unknown>;
  const stringValue = record[key];

  return typeof stringValue === "string" ? stringValue : "";
}

function readGroupCount(value: { _count?: unknown }) {
  if (typeof value._count === "number") {
    return value._count;
  }

  if (value._count && typeof value._count === "object" && "_all" in value._count) {
    const count = (value._count as { _all?: unknown })._all;

    return typeof count === "number" ? count : 0;
  }

  return 0;
}

export async function getKnowledgeCoreAnalytics(context?: TenantAnalyticsContext) {
  const providerReadiness = getProviderReadiness();
  const tenantWhere = context?.scope === "tenant" && context.tenantId
    ? { tenantId: context.tenantId }
    : {};
  const knowledgeWhere = {
    ...tenantWhere,
    deletedAt: null
  };
  const trainingWhere = {
    ...tenantWhere,
    sourceType: { in: [...enterpriseAdminIngestJobSourceTypes] }
  };
  const [
    knowledgeCount,
    chunkCount,
    activeKnowledgeCount,
    vectorIndexedCount,
    trainingTotal,
    trainingSaved,
    trainingPending,
    queryTotal,
    recentQueries,
    categories,
    sourceGroups,
    tenants,
    topKnowledge
  ] = await prisma.$transaction([
    prisma.knowledgeItem.count({ where: knowledgeWhere }),
    prisma.knowledgeChunk.count({
      where: Object.keys(tenantWhere).length > 0
        ? { knowledgeItem: { is: tenantWhere } }
        : {}
    }),
    prisma.knowledgeItem.count({ where: { ...knowledgeWhere, status: "active" } }),
    prisma.knowledgeItem.count({ where: { ...knowledgeWhere, indexedAt: { not: null } } }),
    prisma.ingestionJob.count({ where: trainingWhere }),
    prisma.ingestionJob.count({ where: { ...trainingWhere, status: "completed" } }),
    prisma.ingestionJob.count({ where: { ...trainingWhere, status: "pending" } }),
    prisma.knowledgeQueryLog.count({ where: tenantWhere }),
    prisma.knowledgeQueryLog.findMany({
      where: tenantWhere,
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        query: true,
        providerUsed: true,
        modelUsed: true,
        latencyMs: true,
        tokenUsage: true,
        cached: true,
        createdAt: true
      }
    }),
    prisma.knowledgeItem.groupBy({
      by: ["category"],
      where: knowledgeWhere,
      _count: { _all: true },
      orderBy: { _count: { category: "desc" } },
      take: 12
    }),
    prisma.knowledgeItem.groupBy({
      by: ["sourceType"],
      where: knowledgeWhere,
      _count: { _all: true },
      orderBy: { _count: { sourceType: "desc" } },
      take: 12
    }),
    prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        name: true,
        plan: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            users: true,
            knowledgeItems: true,
            ingestionJobs: true,
            queryLogs: true
          }
        }
      }
    }),
    prisma.knowledgeItem.findMany({
      where: knowledgeWhere,
      orderBy: [
        { updatedAt: "desc" }
      ],
      take: 8,
      select: {
        id: true,
        title: true,
        category: true,
        indexedAt: true,
        embeddingModel: true,
        updatedAt: true
      }
    })
  ]);
  const queriesWithSources = recentQueries.filter((query) => readNumericMetadata(query.tokenUsage, "sourceCount") > 0).length;
  const semanticQueryCount = recentQueries.filter((query) => {
    const mode = readStringMetadata(query.tokenUsage, "semanticMode");

    return mode === "semantic" || mode === "hybrid";
  }).length;
  const keywordQueryCount = recentQueries.filter((query) => readStringMetadata(query.tokenUsage, "semanticMode") === "keyword").length;
  const averageLatencyMs = recentQueries.length === 0
    ? 0
    : Math.round(recentQueries.reduce((sum, query) => sum + query.latencyMs, 0) / recentQueries.length);

  return {
    core: "knowledge-core-engine",
    tenant: context?.scope === "tenant" ? {
      id: context.tenantId,
      name: context.tenantName,
      plan: context.tenantPlan,
      status: context.tenantStatus,
      readonlyView: context.readonlyView
    } : {
      id: null,
      name: "全部企业",
      plan: "all",
      status: "aggregate",
      readonlyView: true
    },
    summary: {
      knowledgeCount,
      activeKnowledgeCount,
      chunkCount,
      vectorIndexedCount,
      vectorPendingCount: Math.max(0, activeKnowledgeCount - vectorIndexedCount),
      vectorCoverageRate: activeKnowledgeCount === 0 ? 0 : Math.round((vectorIndexedCount / activeKnowledgeCount) * 100),
      trainingTotal,
      trainingSaved,
      trainingPending,
      queryTotal,
      semanticQueryCount,
      keywordQueryCount,
      recentQueryHitRate: recentQueries.length === 0 ? 0 : Math.round((queriesWithSources / recentQueries.length) * 100),
      averageLatencyMs
    },
    categories: categories.map((item) => ({
      category: item.category || "未分类",
      count: readGroupCount(item)
    })),
    sources: sourceGroups.map((item) => ({
      source: toCoreSource(item.sourceType),
      rawSourceType: item.sourceType,
      count: readGroupCount(item)
    })),
    tenants: tenants.map((tenant) => ({
      id: tenant.id,
      name: tenant.name,
      plan: tenant.plan,
      status: tenant.status,
      userCount: tenant._count.users,
      knowledgeCount: tenant._count.knowledgeItems,
      trainingCount: tenant._count.ingestionJobs,
      queryCount: tenant._count.queryLogs,
      createdAt: tenant.createdAt.toISOString(),
      updatedAt: tenant.updatedAt.toISOString()
    })),
    vector: {
      indexedCount: vectorIndexedCount,
      pendingCount: Math.max(0, activeKnowledgeCount - vectorIndexedCount),
      coverageRate: activeKnowledgeCount === 0 ? 0 : Math.round((vectorIndexedCount / activeKnowledgeCount) * 100),
      topKnowledge: topKnowledge.map((item) => ({
        id: item.id,
        title: item.title,
        category: item.category,
        indexed: Boolean(item.indexedAt),
        embeddingModel: item.embeddingModel,
        updatedAt: item.updatedAt.toISOString()
      }))
    },
    trainingRecords: await listEnterpriseTrainingRecords({
      id: context?.actorUserId ?? "super-admin",
      role: "super_admin",
      tenantId: context?.tenantId ?? null
    }, 20),
    modelControl: {
      providerChain: providerReadiness.providerChain,
      primaryProvider: providerReadiness.primaryProvider,
      fallbackProvider: providerReadiness.fallbackProvider,
      secondaryFallbackProvider: providerReadiness.secondaryFallbackProvider,
      qwenConfigured: providerReadiness.qwenConfigured,
      openaiConfigured: providerReadiness.openaiConfigured,
      deepseekConfigured: providerReadiness.deepseekConfigured
    },
    enterpriseIsolation: {
      strategy: "tenantId scoped knowledge and role guarded APIs",
      adminIngest: "kb_admin writes tenant-bound knowledge",
      userChat: "licensed user queries tenant-bound knowledge",
      superAdmin: "super_admin reads aggregate analytics or selected tenant readonly view"
    },
    generatedAt: new Date().toISOString()
  };
}

export function getCoreRequestId(request: Request) {
  return getRequestIdFromHeaders(request.headers);
}
