import type { IngestMemoryItem } from "@/lib/enterprise/ingest-memory-types";
import { resolvePublicExpertScope } from "@/lib/enterprise/public-expert-scope";

export type NormalizedMemoryScope = {
  knowledgeBaseId: string;
  kbId: string;
  agentId: string;
  expertId: string;
  namespace: string;
  tenantId: string;
};

export type MemoryScopeNormalizerInput = {
  draft: IngestMemoryItem;
  fallbackAgentId?: string | null;
  fallbackExpertId?: string | null;
  fallbackKnowledgeBaseId?: string | null;
  fallbackKbId?: string | null;
  fallbackNamespace?: string | null;
  fallbackTenantId?: string | null;
};

export type MemoryScopeNormalizerResult = {
  ok: boolean;
  draftWithScope: IngestMemoryItem;
  scope?: NormalizedMemoryScope;
  appliedFallbacks: string[];
  warnings: string[];
  missingFields: string[];
  reason?: string;
};

const SCOPE_RESOLVED_BY = "ingest-memory-scope-normalizer-v1";

type ScopePreset = {
  knowledgeBaseId: string;
  kbId: string;
  agentId: string;
  expertId: string;
  namespace: string;
  tenantId: string;
  reason: string;
};

function readString(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function readMetaString(draft: IngestMemoryItem, key: string): string {
  return readString(draft.meta?.[key]);
}

function hasPattern(text: string, pattern: RegExp): boolean {
  pattern.lastIndex = 0;
  return pattern.test(text);
}

function buildSearchText(draft: IngestMemoryItem): string {
  return [
    draft.id,
    draft.title,
    draft.summary,
    draft.content,
    draft.category,
    draft.agentId,
    readMetaString(draft, "agentId"),
    readMetaString(draft, "expertId"),
    readMetaString(draft, "sourceAgent"),
    ...(draft.tags || [])
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

function inferScopePreset(draft: IngestMemoryItem): ScopePreset | null {
  const text = buildSearchText(draft);

  if (hasPattern(text, /kks|瘦身|33\s*循环|77\s*循环|脂达人|脉达人|控体/i)) {
    return {
      knowledgeBaseId: "kb-kks-slim",
      kbId: "kb-kks-slim",
      agentId: "expert-kks",
      expertId: "expert-kks",
      namespace: "kb-kks-slim",
      tenantId: "default",
      reason: "matched-kks-slim-keywords"
    };
  }

  if (hasPattern(text, /事业|同行|讲事业|招商|成交|裂变|同频|合作|客户开发|伙伴/i)) {
    return {
      knowledgeBaseId: "kb-business-coach",
      kbId: "kb-business-coach",
      agentId: "expert-business",
      expertId: "expert-business",
      namespace: "kb-business-coach",
      tenantId: "default",
      reason: "matched-business-coach-keywords"
    };
  }

  if (hasPattern(text, /大健康|健康|体重管理|控体/i)) {
    return {
      knowledgeBaseId: "kb-health-expert",
      kbId: "kb-health-expert",
      agentId: "expert-health",
      expertId: "expert-health",
      namespace: "kb-health-expert",
      tenantId: "default",
      reason: "matched-health-expert-keywords"
    };
  }

  if (hasPattern(text, /expert-agent-expert-career|expert-career|career|sales|business/i)) {
    return {
      knowledgeBaseId: "kb-business-coach",
      kbId: "kb-business-coach",
      agentId: "expert-business",
      expertId: "expert-business",
      namespace: "kb-business-coach",
      tenantId: "default",
      reason: "matched-business-agent-id"
    };
  }

  return null;
}

function applyFallback(current: string, next: string, key: string, appliedFallbacks: string[]) {
  if (current) {
    return current;
  }

  if (next) {
    appliedFallbacks.push(key);
  }

  return next;
}

export function normalizeMemoryScope(input: MemoryScopeNormalizerInput): MemoryScopeNormalizerResult {
  const { draft } = input;
  const appliedFallbacks: string[] = [];
  const warnings: string[] = [];
  const preset = inferScopePreset(draft);

  let knowledgeBaseId = readString(draft.knowledgeBaseId) || readMetaString(draft, "knowledgeBaseId");
  let kbId = readMetaString(draft, "kbId");
  let agentId = readString(draft.agentId) || readMetaString(draft, "agentId");
  let expertId = readMetaString(draft, "expertId");
  let namespace = readMetaString(draft, "namespace");
  let tenantId = readMetaString(draft, "tenantId");

  knowledgeBaseId = applyFallback(knowledgeBaseId, readString(input.fallbackKnowledgeBaseId), "fallbackKnowledgeBaseId", appliedFallbacks);
  kbId = applyFallback(kbId, readString(input.fallbackKbId), "fallbackKbId", appliedFallbacks);
  agentId = applyFallback(agentId, readString(input.fallbackAgentId), "fallbackAgentId", appliedFallbacks);
  expertId = applyFallback(expertId, readString(input.fallbackExpertId), "fallbackExpertId", appliedFallbacks);
  namespace = applyFallback(namespace, readString(input.fallbackNamespace), "fallbackNamespace", appliedFallbacks);
  tenantId = applyFallback(tenantId, readString(input.fallbackTenantId), "fallbackTenantId", appliedFallbacks);

  if (!knowledgeBaseId && kbId) {
    knowledgeBaseId = kbId;
    appliedFallbacks.push("knowledgeBaseId<-kbId");
  }

  if (!kbId && knowledgeBaseId) {
    kbId = knowledgeBaseId;
    appliedFallbacks.push("kbId<-knowledgeBaseId");
  }

  if (!agentId && expertId) {
    agentId = expertId;
    appliedFallbacks.push("agentId<-expertId");
  }

  if (!expertId && agentId) {
    expertId = agentId;
    appliedFallbacks.push("expertId<-agentId");
  }

  if (preset) {
    knowledgeBaseId = applyFallback(knowledgeBaseId, preset.knowledgeBaseId, `preset:${preset.reason}:knowledgeBaseId`, appliedFallbacks);
    kbId = applyFallback(kbId, preset.kbId, `preset:${preset.reason}:kbId`, appliedFallbacks);
    agentId = applyFallback(agentId, preset.agentId, `preset:${preset.reason}:agentId`, appliedFallbacks);
    expertId = applyFallback(expertId, preset.expertId, `preset:${preset.reason}:expertId`, appliedFallbacks);
    namespace = applyFallback(namespace, preset.namespace, `preset:${preset.reason}:namespace`, appliedFallbacks);
    tenantId = applyFallback(tenantId, preset.tenantId, `preset:${preset.reason}:tenantId`, appliedFallbacks);
  }

  if (!namespace && kbId) {
    namespace = kbId;
    appliedFallbacks.push("namespace<-kbId");
  }

  if (!namespace) {
    namespace = "default";
    appliedFallbacks.push("namespace<-default");
    warnings.push("namespace 缺失，已补为 default。");
  }

  if (!tenantId) {
    tenantId = "default";
    appliedFallbacks.push("tenantId<-default");
  }

  const publicScope = resolvePublicExpertScope({
    agentId,
    expertId,
    knowledgeBaseId,
    kbId,
    namespace,
    tenantId
  });

  if (publicScope) {
    if (knowledgeBaseId !== publicScope.knowledgeBaseId) {
      appliedFallbacks.push("publicScope:knowledgeBaseId");
    }

    if (agentId !== publicScope.agentId) {
      appliedFallbacks.push("publicScope:agentId");
    }

    knowledgeBaseId = publicScope.knowledgeBaseId;
    kbId = publicScope.kbId;
    agentId = publicScope.agentId;
    expertId = publicScope.expertId;
    namespace = publicScope.namespace;
    tenantId = publicScope.tenantId;
  }

  const missingFields = [
    !knowledgeBaseId ? "knowledgeBaseId" : "",
    !kbId ? "kbId" : "",
    !agentId ? "agentId" : "",
    !expertId ? "expertId" : "",
    !namespace ? "namespace" : "",
    !tenantId ? "tenantId" : ""
  ].filter(Boolean);

  const draftWithScope: IngestMemoryItem = {
    ...draft,
    knowledgeBaseId: knowledgeBaseId || draft.knowledgeBaseId,
    agentId: agentId || draft.agentId,
    meta: {
      ...(draft.meta || {}),
      ...(knowledgeBaseId ? { knowledgeBaseId } : {}),
      ...(kbId ? { kbId } : {}),
      ...(agentId ? { agentId } : {}),
      ...(expertId ? { expertId } : {}),
      ...(namespace ? { namespace } : {}),
      ...(tenantId ? { tenantId } : {}),
      scopeResolvedBy: SCOPE_RESOLVED_BY,
      scopeResolveReason: preset?.reason ?? (appliedFallbacks.length > 0 ? "fallback-fields" : "explicit-scope")
    }
  };

  if (missingFields.length > 0) {
    return {
      ok: false,
      draftWithScope,
      appliedFallbacks,
      warnings,
      missingFields,
      reason: `缺少 scope 字段：${missingFields.join(", ")}`
    };
  }

  return {
    ok: true,
    draftWithScope,
    scope: {
      knowledgeBaseId,
      kbId,
      agentId,
      expertId,
      namespace,
      tenantId
    },
    appliedFallbacks,
    warnings,
    missingFields: [],
    reason: preset?.reason ?? (appliedFallbacks.length > 0 ? "scope-normalized" : "explicit-scope")
  };
}

export const INGEST_MEMORY_SCOPE_RESOLVED_BY = SCOPE_RESOLVED_BY;
