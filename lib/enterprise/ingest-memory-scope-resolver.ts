import { ingestChatAgents, type IngestChatAgent } from "@/lib/enterprise/mock-chat";
import type { IngestMemoryItem } from "@/lib/enterprise/ingest-memory-types";
import {
  normalizeMemoryScope,
  type MemoryScopeNormalizerResult,
} from "@/lib/enterprise/ingest-memory-scope-normalizer";

type ResolveMemoryScopeInput = {
  draft: IngestMemoryItem;
  fallbackAgentId?: string | null;
  fallbackExpertId?: string | null;
  fallbackKnowledgeBaseId?: string | null;
  fallbackKbId?: string | null;
  fallbackNamespace?: string | null;
  fallbackTenantId?: string | null;
};

function readString(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function normalize(value: unknown): string {
  return readString(value).toLowerCase();
}

function findAgentByDraft(draft: IngestMemoryItem): IngestChatAgent | null {
  const keys = [
    draft.agentId,
    draft.meta?.agentId,
    draft.meta?.expertId,
    draft.meta?.sourceAgent,
    draft.meta?.agentName,
    draft.title
  ]
    .map(normalize)
    .filter(Boolean);

  if (keys.length === 0) {
    return null;
  }

  return ingestChatAgents.find((agent) => {
    const agentKeys = [
      agent.id,
      agent.expertId,
      agent.name,
      agent.role,
      agent.category,
      agent.knowledgeBaseId,
      agent.namespace
    ]
      .map(normalize)
      .filter(Boolean);

    return keys.some((key) => agentKeys.some((agentKey) => key === agentKey || key.includes(agentKey) || agentKey.includes(key)));
  }) ?? null;
}

function deriveAgentFallbacks(agent: IngestChatAgent | null) {
  if (!agent) {
    return {};
  }

  const knowledgeBaseId = readString(agent.knowledgeBaseId) || (agent.id ? `kb-${agent.id}` : "");
  const agentId = readString(agent.id);
  const expertId = readString(agent.expertId) || agentId;
  const namespace = readString(agent.namespace) || knowledgeBaseId;
  const tenantId = readString(agent.tenantId) || "default";

  return {
    fallbackAgentId: agentId,
    fallbackExpertId: expertId,
    fallbackKnowledgeBaseId: knowledgeBaseId,
    fallbackKbId: knowledgeBaseId,
    fallbackNamespace: namespace,
    fallbackTenantId: tenantId
  };
}

export function resolveMemoryScopeFromAgentCatalog(input: ResolveMemoryScopeInput): MemoryScopeNormalizerResult {
  const agent = findAgentByDraft(input.draft);
  const agentFallbacks = deriveAgentFallbacks(agent);

  return normalizeMemoryScope({
    ...agentFallbacks,
    ...input
  });
}
