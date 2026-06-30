import type { IngestMemoryItem } from "@/lib/enterprise/ingest-memory-types";
import { resolveMemoryScopeFromAgentCatalog } from "@/lib/enterprise/ingest-memory-scope-resolver";
import type { NormalizedMemoryScope } from "@/lib/enterprise/ingest-memory-scope-normalizer";

export type MemoryPublishPolicyResult = {
  canPublish: boolean;
  reason: string;
  normalizedStatus: "published" | "saved" | "confirmed" | "shared" | "draft" | "suggested_merge" | "rejected" | "conflict" | "failed" | "missing_scope" | "missing_content" | "private";
  normalizedScope?: NormalizedMemoryScope;
  normalizedDraft?: IngestMemoryItem;
  missingFields?: string[];
  canFixByScopeNormalizer?: boolean;
  warnings?: string[];
};

function readMetaBoolean(draft: IngestMemoryItem, key: string) {
  const value = draft.meta?.[key];

  return value === true || value === "true" || value === 1;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export function getDraftKnowledgeBaseId(draft: IngestMemoryItem) {
  const resolved = resolveMemoryScopeFromAgentCatalog({ draft });
  return resolved.scope?.knowledgeBaseId || readString(draft.knowledgeBaseId) || readString(draft.meta?.knowledgeBaseId) || readString(draft.meta?.kbId);
}

export function getDraftKbId(draft: IngestMemoryItem) {
  const resolved = resolveMemoryScopeFromAgentCatalog({ draft });
  return resolved.scope?.kbId || readString(draft.meta?.kbId) || readString(draft.knowledgeBaseId) || readString(draft.meta?.knowledgeBaseId);
}

export function getDraftAgentId(draft: IngestMemoryItem) {
  const resolved = resolveMemoryScopeFromAgentCatalog({ draft });
  return resolved.scope?.agentId || readString(draft.agentId) || readString(draft.meta?.agentId) || readString(draft.meta?.expertId);
}

export function getDraftExpertId(draft: IngestMemoryItem) {
  const resolved = resolveMemoryScopeFromAgentCatalog({ draft });
  return resolved.scope?.expertId || readString(draft.meta?.expertId) || readString(draft.agentId) || readString(draft.meta?.agentId);
}

export function getDraftNamespace(draft: IngestMemoryItem) {
  const resolved = resolveMemoryScopeFromAgentCatalog({ draft });
  return resolved.scope?.namespace || readString(draft.meta?.namespace) || "default";
}

export function getDraftTenantId(draft: IngestMemoryItem) {
  const resolved = resolveMemoryScopeFromAgentCatalog({ draft });
  return resolved.scope?.tenantId || readString(draft.meta?.tenantId) || "default";
}

export function canPublishMemoryDraft(draft: IngestMemoryItem): MemoryPublishPolicyResult {
  const title = readString(draft.title);
  const content = readString(draft.content);
  const scopeResult = resolveMemoryScopeFromAgentCatalog({ draft });
  const savedToKnowledge = readMetaBoolean(draft, "savedToKnowledge") || readMetaBoolean(draft, "saved_to_knowledge");
  const savedAt = readString(draft.meta?.savedAt);
  const knowledgeSaved = readMetaBoolean(draft, "knowledgeSaved") || readMetaBoolean(draft, "saved");
  const source = readString(draft.meta?.source) || readString(draft.meta?.publishSource);
  const status = draft.status;
  const confidence = typeof draft.confidence === "number" ? draft.confidence : 1;
  const metaStatus = readString(draft.meta?.status).toLowerCase();

  if (!title || !content) {
    return {
      canPublish: false,
      reason: "标题或内容为空，不能发布。",
      normalizedStatus: "missing_content",
      normalizedDraft: scopeResult.draftWithScope,
      missingFields: scopeResult.missingFields,
      warnings: scopeResult.warnings
    };
  }

  if (status === "rejected" || metaStatus === "rejected") {
    return {
      canPublish: false,
      reason: "rejected 草稿不会发布。",
      normalizedStatus: "rejected",
      normalizedDraft: scopeResult.draftWithScope,
      normalizedScope: scopeResult.scope,
      warnings: scopeResult.warnings
    };
  }

  if (metaStatus === "conflict") {
    return {
      canPublish: false,
      reason: "conflict 草稿需要人工处理，不能发布。",
      normalizedStatus: "conflict",
      normalizedDraft: scopeResult.draftWithScope,
      normalizedScope: scopeResult.scope,
      warnings: scopeResult.warnings
    };
  }

  if (metaStatus === "failed") {
    return {
      canPublish: false,
      reason: "failed 草稿不能发布。",
      normalizedStatus: "failed",
      normalizedDraft: scopeResult.draftWithScope,
      normalizedScope: scopeResult.scope,
      warnings: scopeResult.warnings
    };
  }

  if (readMetaBoolean(draft, "doNotPublish")) {
    return {
      canPublish: false,
      reason: "草稿标记 doNotPublish，不能发布。",
      normalizedStatus: "rejected",
      normalizedDraft: scopeResult.draftWithScope,
      normalizedScope: scopeResult.scope,
      warnings: scopeResult.warnings
    };
  }

  if (readMetaBoolean(draft, "internalOnly") || readString(draft.meta?.visibility).toLowerCase() === "private") {
    return {
      canPublish: false,
      reason: "草稿为 private/internal only，不能发布到共享运行时。",
      normalizedStatus: "private",
      normalizedDraft: scopeResult.draftWithScope,
      normalizedScope: scopeResult.scope,
      warnings: scopeResult.warnings
    };
  }

  if (!scopeResult.ok || !scopeResult.scope) {
    return {
      canPublish: false,
      reason: scopeResult.reason || "缺少 knowledgeBaseId/kbId 或 agentId/expertId，不能发布到运行时索引。",
      normalizedStatus: "missing_scope",
      normalizedDraft: scopeResult.draftWithScope,
      missingFields: scopeResult.missingFields,
      canFixByScopeNormalizer: scopeResult.appliedFallbacks.length > 0,
      warnings: scopeResult.warnings
    };
  }

  if (confidence < 0.3) {
    return {
      canPublish: false,
      reason: "confidence 低于 0.3，需继续复核。",
      normalizedStatus: "draft",
      normalizedDraft: scopeResult.draftWithScope,
      normalizedScope: scopeResult.scope,
      warnings: scopeResult.warnings
    };
  }

  if (status === "confirmed") {
    return {
      canPublish: true,
      reason: "confirmed 草稿允许发布。",
      normalizedStatus: "confirmed",
      normalizedDraft: scopeResult.draftWithScope,
      normalizedScope: scopeResult.scope,
      warnings: scopeResult.warnings
    };
  }

  if (status === "saved" || savedToKnowledge || knowledgeSaved || savedAt || /knowledge-save|save-to-knowledge/.test(source)) {
    return {
      canPublish: true,
      reason: "已保存到知识库，允许发布到运行时索引。",
      normalizedStatus: "saved",
      normalizedDraft: scopeResult.draftWithScope,
      normalizedScope: scopeResult.scope,
      warnings: scopeResult.warnings
    };
  }

  if (status === "draft" || status === "suggested_merge") {
    return {
      canPublish: true,
      reason: "draft 内容完整且 scope 可解析，允许发布到运行时索引。",
      normalizedStatus: status,
      normalizedDraft: scopeResult.draftWithScope,
      normalizedScope: scopeResult.scope,
      warnings: scopeResult.warnings
    };
  }

  return {
    canPublish: false,
    reason: "当前状态未达到发布条件。",
    normalizedStatus: "draft",
    normalizedDraft: scopeResult.draftWithScope,
    normalizedScope: scopeResult.scope,
    warnings: scopeResult.warnings
  };
}
