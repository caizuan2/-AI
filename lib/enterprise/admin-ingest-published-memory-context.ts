import "server-only";

import { buildAgentLearningInstruction } from "@/lib/enterprise/ingest-agent-learning-policy";
import type { PublishedMemoryItem } from "@/lib/enterprise/ingest-memory-index-types";
import { loadPublishedMemories } from "@/lib/enterprise/ingest-memory-publisher";
import { searchRuntimeMemories } from "@/lib/enterprise/ingest-memory-runtime-search";
import type { IngestAgentLearningState } from "@/lib/enterprise/ingest-memory-types";
import {
  publicExpertScopeValuesOverlap,
  resolvePublicExpertScope
} from "@/lib/enterprise/public-expert-scope";

const DEFAULT_MAX_MEMORY_CONTEXT_CHARS = 6_000;
const MAX_MEMORY_RESULTS = 5;

type RuntimeSearch = typeof searchRuntimeMemories;
type RuntimeSearchResult = Awaited<ReturnType<RuntimeSearch>>;
type RuntimeMemory = RuntimeSearchResult["memories"][number];

export type AdminIngestPublishedMemoryContext = {
  memoryContextText: string;
  agentLearningInstruction: string;
  usedMemoryIds: string[];
  appliedPolicies: string[];
  retrievedMemories: Array<{
    memory: { id: string; title: string };
    score: number;
    reason: string;
    matchedFields: string[];
  }>;
  warnings: string[];
};

type Dependencies = {
  searchRuntimeMemories?: RuntimeSearch;
  loadPublishedMemories?: typeof loadPublishedMemories;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTenant(value: unknown) {
  return clean(value).toLowerCase() || "default";
}

function unique(values: string[], limit: number) {
  return Array.from(new Set(values.map(clean).filter(Boolean))).slice(0, limit);
}

function metaStrings(memory: PublishedMemoryItem, key: string) {
  const value = memory.meta?.[key];

  return Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
}

function isConfirmedLearningPolicy(memory: PublishedMemoryItem) {
  if (clean(memory.type).toLowerCase() === "agent_preference") {
    return true;
  }

  const policyKind = clean(memory.meta?.policyKind).toLowerCase();
  const policyStatus = clean(memory.meta?.policyStatus).toLowerCase();
  const explicitlyConfirmed = memory.meta?.learningPolicyConfirmed === true
    || memory.meta?.policyConfirmed === true;
  const typedConfirmedPolicy = policyStatus === "confirmed"
    && (policyKind === "agent_learning" || policyKind === "agent_preference");

  return explicitlyConfirmed || typedConfirmedPolicy;
}

function buildPublishedLearningState(input: {
  actorId: string;
  agentId: string;
  knowledgeBaseId: string;
  memories: PublishedMemoryItem[];
}): IngestAgentLearningState | null {
  const policies = input.memories.filter(isConfirmedLearningPolicy);

  if (policies.length === 0) {
    return null;
  }

  const preferenceTexts = unique(policies.map((memory) => (
    clean(memory.content) || clean(memory.summary)
  )), 3).map((value) => value.replace(/\s+/g, " ").slice(0, 800));
  const learnedTopics = unique(policies.flatMap((memory) => [
    memory.title,
    ...(memory.tags ?? [])
  ]), 12);
  const riskBoundaries = unique(policies.flatMap((memory) => [
    ...metaStrings(memory, "riskBoundaries"),
    ...(clean(memory.type).toLowerCase() === "risk"
      ? [clean(memory.summary) || clean(memory.content)]
      : [])
  ]), 8);
  const recentCorrections = unique(policies.flatMap((memory) => [
    ...metaStrings(memory, "recentCorrections"),
    ...metaStrings(memory, "corrections")
  ]), 8);

  return {
    agentId: input.agentId,
    knowledgeBaseId: input.knowledgeBaseId,
    ownerAdminId: input.actorId,
    ownerUserId: input.actorId,
    learnedTopics,
    preferredAnswerStyle: preferenceTexts.length
      ? `遵循当前已发布的 Agent 偏好：${preferenceTexts.join("；")}`
      : undefined,
    riskBoundaries,
    recentCorrections,
    updatedAt: Math.max(...policies.map((memory) => memory.updatedAt || memory.publishedAt))
  };
}

function isCurrentlyPublishedMemory(memory: PublishedMemoryItem) {
  const activeStatus = memory.status === "published" || memory.status === "shared";
  const readableVisibility = memory.visibility === "shared" || memory.visibility === "public";

  return Boolean(clean(memory.id) && clean(memory.content) && activeStatus && readableVisibility);
}

function hydrateRuntimeMemory(
  runtimeMemory: RuntimeMemory,
  publishedMemory: PublishedMemoryItem
): RuntimeMemory {
  return {
    ...runtimeMemory,
    title: clean(publishedMemory.title) || runtimeMemory.title,
    summary: clean(publishedMemory.summary),
    content: clean(publishedMemory.content),
    contentPreview: clean(publishedMemory.summary) || clean(publishedMemory.content).slice(0, 600),
    sourceApp: publishedMemory.sourceApp,
    knowledgeBaseId: publishedMemory.knowledgeBaseId,
    kbId: publishedMemory.kbId,
    agentId: publishedMemory.agentId,
    expertId: publishedMemory.expertId,
    namespace: publishedMemory.namespace,
    tenantId: publishedMemory.tenantId
  };
}

function clipPreservingEdges(text: string, maxChars: number) {
  const normalized = text.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  if (normalized.length <= maxChars) {
    return normalized;
  }

  const marker = "\n…[长期记忆中段已按容量压缩]…\n";

  if (maxChars <= marker.length + 8) {
    return normalized.slice(0, maxChars);
  }

  const available = Math.max(0, maxChars - marker.length);
  const head = Math.ceil(available * 0.65);

  return `${normalized.slice(0, head)}${marker}${normalized.slice(-(available - head))}`;
}

function matchesStrictScope(memory: RuntimeMemory, input: {
  agentId: string;
  knowledgeBaseId: string;
  namespace?: string | null;
  tenantId?: string | null;
}) {
  const requestedAgent = resolvePublicExpertScope({ agentId: input.agentId });
  const requestedKnowledgeBase = resolvePublicExpertScope({ knowledgeBaseId: input.knowledgeBaseId });
  const requestedNamespace = clean(input.namespace)
    ? resolvePublicExpertScope({ namespace: input.namespace })
    : requestedKnowledgeBase;
  const candidateAgent = resolvePublicExpertScope({
    agentId: memory.agentId,
    expertId: memory.expertId
  });
  const candidateKnowledgeBase = resolvePublicExpertScope({
    knowledgeBaseId: memory.knowledgeBaseId,
    kbId: memory.kbId
  });
  const candidateNamespace = clean(memory.namespace)
    ? resolvePublicExpertScope({ namespace: memory.namespace })
    : candidateKnowledgeBase;
  const canonicalScopes = [
    requestedAgent,
    requestedKnowledgeBase,
    requestedNamespace,
    candidateAgent,
    candidateKnowledgeBase,
    candidateNamespace
  ];
  const canonical = canonicalScopes.every(Boolean)
    ? canonicalScopes as Array<NonNullable<typeof requestedAgent>>
    : null;
  const sameCanonicalScope = canonical
    ? canonical.every((scope) => (
        scope.agentId === canonical[0].agentId
        && scope.knowledgeBaseId === canonical[0].knowledgeBaseId
        && scope.namespace === canonical[0].namespace
      ))
    : false;
  const sameAgent = sameCanonicalScope || publicExpertScopeValuesOverlap(
    input.agentId,
    memory.agentId || memory.expertId
  );
  const sameKnowledgeBase = sameCanonicalScope || publicExpertScopeValuesOverlap(
    input.knowledgeBaseId,
    memory.knowledgeBaseId || memory.kbId
  );
  const sameNamespace = sameCanonicalScope || (
    !clean(input.namespace)
      ? !clean(memory.namespace) || sameKnowledgeBase
      : publicExpertScopeValuesOverlap(input.namespace, memory.namespace)
  );
  const sameTenant = normalizeTenant(input.tenantId) === normalizeTenant(memory.tenantId);

  return Boolean(sameCanonicalScope && sameAgent && sameKnowledgeBase && sameNamespace && sameTenant);
}

function buildMemoryContext(memories: RuntimeMemory[], maxChars: number) {
  if (memories.length === 0) {
    return { text: "", usedMemoryIds: [] as string[], truncated: false };
  }

  const header = [
    "【当前 Agent 已发布长期记忆】",
    "以下内容来自已发布并建立运行索引的长期记忆，只能用于当前 Agent 和固定知识库。"
  ].join("\n");
  const labels = memories.map((memory, index) => (
    `[长期记忆 ${index + 1}｜${(clean(memory.title) || "未命名").slice(0, 60)}｜id:${memory.memoryId.slice(0, 80)}]`
  ));
  const fixedChars = header.length + labels.reduce((sum, label) => sum + label.length + 2, 0);
  const perMemoryBudget = Math.max(8, Math.floor((maxChars - fixedChars) / memories.length));
  let truncated = false;
  const blocks = memories.map((memory, index) => {
    const source = clean(memory.content) || clean(memory.summary) || clean(memory.contentPreview);
    const clipped = clipPreservingEdges(source, perMemoryBudget);

    if (clipped.length < source.length) {
      truncated = true;
    }

    return `${labels[index]}\n${clipped}`;
  });
  const text = [header, ...blocks].join("\n\n").slice(0, maxChars);

  if (text.length >= maxChars) {
    truncated = true;
  }

  return {
    text,
    usedMemoryIds: memories.map((memory) => memory.memoryId),
    truncated
  };
}

export async function buildAdminIngestPublishedMemoryContext(input: {
  query: string;
  actorId: string;
  agentId: string;
  knowledgeBaseId: string;
  namespace?: string | null;
  tenantId?: string | null;
  maxChars?: number;
}, dependencies: Dependencies = {}): Promise<AdminIngestPublishedMemoryContext> {
  const warnings: string[] = [];
  const search = dependencies.searchRuntimeMemories ?? searchRuntimeMemories;
  const loadPublished = dependencies.loadPublishedMemories ?? loadPublishedMemories;
  const maxChars = Math.max(1_000, Math.min(input.maxChars ?? DEFAULT_MAX_MEMORY_CONTEXT_CHARS, 12_000));

  if (!clean(input.agentId) || !clean(input.knowledgeBaseId)) {
    return {
      memoryContextText: "",
      agentLearningInstruction: "",
      usedMemoryIds: [],
      appliedPolicies: [],
      retrievedMemories: [],
      warnings: ["PUBLISHED_MEMORY_SCOPE_MISSING"]
    };
  }

  let runtimeResult: RuntimeSearchResult | null = null;
  let publishedMemories: PublishedMemoryItem[] | null = null;

  const [runtimeOutcome, publishedOutcome] = await Promise.allSettled([
    search({
      query: input.query,
      agentId: input.agentId,
      expertId: input.agentId,
      knowledgeBaseId: input.knowledgeBaseId,
      kbId: input.knowledgeBaseId,
      namespace: input.namespace ?? undefined,
      tenantId: input.tenantId ?? undefined,
      limit: MAX_MEMORY_RESULTS
    }),
    loadPublished()
  ]);

  if (runtimeOutcome.status === "fulfilled") {
    runtimeResult = runtimeOutcome.value;
  } else {
    warnings.push("PUBLISHED_MEMORY_RECALL_UNAVAILABLE");
  }

  if (publishedOutcome.status === "fulfilled") {
    publishedMemories = publishedOutcome.value;
  } else {
    warnings.push("PUBLISHED_MEMORY_STORE_UNAVAILABLE");
  }

  const currentPublishedById = new Map(
    (publishedMemories ?? [])
      .filter(isCurrentlyPublishedMemory)
      .map((memory) => [memory.id, memory])
  );
  const runtimeMemories = runtimeResult?.memories ?? [];
  const currentPublishedMemories = runtimeMemories
    .map((memory) => {
      const publishedMemory = currentPublishedById.get(memory.memoryId);
      return publishedMemory ? hydrateRuntimeMemory(memory, publishedMemory) : null;
    })
    .filter((memory): memory is RuntimeMemory => Boolean(memory));
  const scopedMemories = currentPublishedMemories
    .filter((memory) => matchesStrictScope(memory, input))
    .slice(0, MAX_MEMORY_RESULTS);

  if (currentPublishedMemories.length < runtimeMemories.length) {
    warnings.push("STALE_OR_UNPUBLISHED_MEMORY_INDEX_SKIPPED");
  }

  if (scopedMemories.length < currentPublishedMemories.length) {
    warnings.push("CROSS_SCOPE_PUBLISHED_MEMORY_SKIPPED");
  }

  warnings.push(...(runtimeResult?.warnings ?? []));
  const memoryContext = buildMemoryContext(scopedMemories, maxChars);

  if (memoryContext.truncated) {
    warnings.push("PUBLISHED_MEMORY_CONTEXT_TRUNCATED");
  }

  const scopedPublishedMemories = scopedMemories
    .map((memory) => currentPublishedById.get(memory.memoryId))
    .filter((memory): memory is PublishedMemoryItem => Boolean(memory));
  const learningState = buildPublishedLearningState({
    actorId: input.actorId,
    agentId: input.agentId,
    knowledgeBaseId: input.knowledgeBaseId,
    memories: scopedPublishedMemories
  });
  const learningInstruction = buildAgentLearningInstruction({
    agentId: input.agentId,
    learningState,
    userInstruction: input.query,
    memoryContext: memoryContext.text
  });
  warnings.push(...(learningInstruction.warnings ?? []));

  return {
    memoryContextText: memoryContext.text,
    agentLearningInstruction: learningInstruction.instructionText,
    usedMemoryIds: memoryContext.usedMemoryIds,
    appliedPolicies: learningInstruction.appliedPolicies,
    retrievedMemories: scopedMemories.map((memory) => ({
      memory: { id: memory.memoryId, title: memory.title },
      score: memory.score,
      reason: memory.reason,
      matchedFields: memory.matchedTokens
    })),
    warnings: Array.from(new Set(warnings.filter(Boolean)))
  };
}
