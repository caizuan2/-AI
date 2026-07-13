import type {
  IngestMemoryExtractionInput,
  IngestMemoryExtractionResult,
  IngestMemoryItem
} from "@/lib/enterprise/ingest-memory-types";
import { resolvePublicExpertScope } from "@/lib/enterprise/public-expert-scope";

const CAREER_AGENT_ID = "expert-career";
const CAREER_KNOWLEDGE_BASE_ID = "kb-business-coach";

type MemoryScopeInput = {
  agentId?: string;
  knowledgeBaseId?: string;
};

function normalizeDedupText(value: unknown) {
  return typeof value === "string"
    ? value
        .replace(/\s+/g, " ")
        .replace(/\s*([，。！？；：,.!?;:])\s*/g, "$1")
        .trim()
        .toLowerCase()
    : "";
}

function stableHash(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

export function resolveCareerMemoryScope(input: MemoryScopeInput) {
  const providedScopeValues = [
    input.agentId?.trim(),
    input.knowledgeBaseId?.trim()
  ].filter((value): value is string => Boolean(value));

  if (providedScopeValues.length === 0) {
    return null;
  }

  const resolvedScopes = providedScopeValues.map((value) => resolvePublicExpertScope({
    agentId: value,
    knowledgeBaseId: value
  }));
  const allValuesResolveToCareer = resolvedScopes.every((scope) => (
    scope?.agentId === CAREER_AGENT_ID
    && scope.knowledgeBaseId === CAREER_KNOWLEDGE_BASE_ID
  ));
  const publicScope = resolvedScopes[0];

  return allValuesResolveToCareer
    ? publicScope
    : null;
}

export function canonicalizeCareerMemoryExtractionInput(
  input: IngestMemoryExtractionInput
): IngestMemoryExtractionInput {
  const scope = resolveCareerMemoryScope(input);

  if (!scope) {
    return input;
  }

  return {
    ...input,
    agentId: scope.agentId,
    knowledgeBaseId: scope.knowledgeBaseId
  };
}

export function canonicalizeCareerMemoryDraft(draft: IngestMemoryItem): IngestMemoryItem {
  const scope = resolveCareerMemoryScope(draft);

  if (!scope) {
    return draft;
  }

  const originalAgentId = draft.agentId?.trim();
  const originalKnowledgeBaseId = draft.knowledgeBaseId?.trim();

  const canonicalDraft: IngestMemoryItem = {
    ...draft,
    agentId: scope.agentId,
    knowledgeBaseId: scope.knowledgeBaseId,
    meta: {
      ...(draft.meta ?? {}),
      agentId: scope.agentId,
      expertId: scope.expertId,
      knowledgeBaseId: scope.knowledgeBaseId,
      kbId: scope.kbId,
      namespace: scope.namespace,
      tenantId: scope.tenantId,
      ...(originalAgentId && originalAgentId !== scope.agentId
        ? { sourceAgentId: originalAgentId }
        : {}),
      ...(originalKnowledgeBaseId && originalKnowledgeBaseId !== scope.knowledgeBaseId
        ? { sourceKnowledgeBaseId: originalKnowledgeBaseId }
        : {}),
      scopeResolvedBy: "career-memory-extraction-v1"
    }
  };
  const dedupKey = createCareerMemoryDraftDedupKey(canonicalDraft);

  return dedupKey
    ? { ...canonicalDraft, id: `mem-career-${stableHash(dedupKey)}` }
    : canonicalDraft;
}

export function canonicalizeCareerMemoryExtractionResult(
  result: IngestMemoryExtractionResult
): IngestMemoryExtractionResult {
  const scope = resolveCareerMemoryScope(result);

  if (!scope) {
    return result;
  }

  return {
    ...result,
    agentId: scope.agentId,
    knowledgeBaseId: scope.knowledgeBaseId,
    memories: result.memories.map(canonicalizeCareerMemoryDraft),
    draftCandidates: result.draftCandidates.map(canonicalizeCareerMemoryDraft)
  };
}

export function createCareerMemoryDraftDedupKey(draft: IngestMemoryItem) {
  const scope = resolveCareerMemoryScope(draft);

  if (!scope) {
    return null;
  }

  const conversationId = normalizeDedupText(draft.sourceConversationId);
  const content = normalizeDedupText(draft.content || draft.summary);
  const ownerId = normalizeDedupText(
    draft.ownerAdminId
    || draft.ownerUserId
    || draft.meta?.ownerAdminId
    || draft.meta?.ownerUserId
  ) || "unowned";

  if (!conversationId || !content) {
    return null;
  }

  return [
    scope.agentId,
    scope.knowledgeBaseId,
    ownerId,
    conversationId,
    content
  ].join("|");
}
