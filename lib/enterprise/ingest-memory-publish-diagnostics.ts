import type { IngestMemoryItem } from "@/lib/enterprise/ingest-memory-types";
import { canPublishMemoryDraft } from "@/lib/enterprise/ingest-memory-publish-policy";

export type MemoryPublishDiagnosticItem = {
  draftId: string;
  title: string;
  status: string;
  hasContent: boolean;
  savedToKnowledge: boolean;
  knowledgeBaseId?: string;
  kbId?: string;
  agentId?: string;
  expertId?: string;
  namespace?: string;
  tenantId?: string;
  canPublish: boolean;
  reason: string;
  missingFields: string[];
  canFixByScopeNormalizer: boolean;
  warnings: string[];
};

export type MemoryPublishDiagnostics = {
  draftCount: number;
  publishableCount: number;
  unpublishableCount: number;
  items: MemoryPublishDiagnosticItem[];
  skippedReasons: Record<string, number>;
  hasKks3377Content: boolean;
};

function readString(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function readBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === 1;
}

function getScopeValue(draft: IngestMemoryItem, key: string): string {
  if (key === "knowledgeBaseId") {
    return readString(draft.knowledgeBaseId) || readString(draft.meta?.knowledgeBaseId);
  }

  if (key === "agentId") {
    return readString(draft.agentId) || readString(draft.meta?.agentId);
  }

  return readString(draft.meta?.[key]);
}

function hasKks3377(draft: IngestMemoryItem): boolean {
  const text = JSON.stringify(draft);
  return /KKS|kks|33\s*循环|77\s*循环|瘦身|脂达人|脉达人|控体/.test(text);
}

export function diagnoseMemoryDrafts(drafts: IngestMemoryItem[]): MemoryPublishDiagnostics {
  const items = drafts.map((draft) => {
    const policy = canPublishMemoryDraft(draft);
    const scope = policy.normalizedScope;

    return {
      draftId: draft.id,
      title: draft.title,
      status: draft.status,
      hasContent: Boolean(readString(draft.content)),
      savedToKnowledge: readBoolean(draft.meta?.savedToKnowledge) || readBoolean(draft.meta?.knowledgeSaved),
      knowledgeBaseId: scope?.knowledgeBaseId ?? getScopeValue(draft, "knowledgeBaseId"),
      kbId: scope?.kbId ?? getScopeValue(draft, "kbId"),
      agentId: scope?.agentId ?? getScopeValue(draft, "agentId"),
      expertId: scope?.expertId ?? getScopeValue(draft, "expertId"),
      namespace: scope?.namespace ?? getScopeValue(draft, "namespace"),
      tenantId: scope?.tenantId ?? getScopeValue(draft, "tenantId"),
      canPublish: policy.canPublish,
      reason: policy.reason,
      missingFields: policy.missingFields ?? [],
      canFixByScopeNormalizer: Boolean(policy.normalizedScope || policy.canFixByScopeNormalizer),
      warnings: policy.warnings ?? []
    };
  });
  const skippedReasons: Record<string, number> = {};

  for (const item of items) {
    if (!item.canPublish) {
      skippedReasons[item.reason] = (skippedReasons[item.reason] ?? 0) + 1;
    }
  }

  return {
    draftCount: drafts.length,
    publishableCount: items.filter((item) => item.canPublish).length,
    unpublishableCount: items.filter((item) => !item.canPublish).length,
    items,
    skippedReasons,
    hasKks3377Content: drafts.some(hasKks3377)
  };
}
