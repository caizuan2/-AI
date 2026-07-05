import "server-only";

import type { IngestMemoryItem } from "./ingest-memory-types";
import { listMemoryDrafts } from "./ingest-memory-store";
import {
  canPublishMemoryDraft,
} from "./ingest-memory-publish-policy";
import type { PublishedMemoryItem, PublishedMemoryState } from "./ingest-memory-index-types";
import { readPublishedMemoryState, writePublishedMemoryState } from "./ingest-memory-shared-store";
import type { NormalizedMemoryScope } from "./ingest-memory-scope-normalizer";
import type { IngestMemoryOwnerScope } from "./ingest-memory-owner-scope";

type PublishMemoryDraftsInput = IngestMemoryOwnerScope & {
  draftIds?: string[];
  drafts?: IngestMemoryItem[];
  publishAllSaved?: boolean;
};

type PublishSkipReason = {
  draftId: string;
  title: string;
  reason: string;
  missingFields?: string[];
  canFixByScopeNormalizer?: boolean;
};

type PublishResult = {
  ok: true;
  publishedCount: number;
  skippedCount: number;
  totalPublished: number;
  publishedIds: string[];
  skipped: PublishSkipReason[];
  warnings: string[];
};

const PUBLISH_SOURCE = "admin-ingest-memory-publisher-v1";

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => readString(item))
    .filter(Boolean)
    .slice(0, 20);
}

function getDraftContent(draft: IngestMemoryItem): string {
  const primary = readString(draft.content);
  if (primary) {
    return primary;
  }

  const metaContent = readString(draft.meta?.content);
  if (metaContent) {
    return metaContent;
  }

  return readString(draft.summary);
}

function getDraftTags(draft: IngestMemoryItem): string[] {
  const explicitTags = asStringArray(draft.tags);
  if (explicitTags.length > 0) {
    return explicitTags;
  }

  return asStringArray(draft.meta?.tags);
}

function createMemoryKey(memory: PublishedMemoryItem): string {
  const scope = [
    memory.tenantId,
    memory.namespace,
    memory.knowledgeBaseId,
    memory.agentId,
    memory.title,
  ]
    .map((item) => item || "default")
    .join("|");

  return stableHash(`${scope}|${normalizeText(memory.content).slice(0, 2000)}`);
}

function createContentKey(memory: PublishedMemoryItem): string {
  return stableHash([
    memory.tenantId || "default",
    memory.knowledgeBaseId || memory.kbId || "default",
    memory.agentId || memory.expertId || "default",
    normalizeText(memory.title).toLowerCase(),
    normalizeText(memory.content).toLowerCase().slice(0, 2000)
  ].join("|"));
}

function hasDuplicate(existing: PublishedMemoryItem[], memory: PublishedMemoryItem): boolean {
  const sourceDraftId = memory.sourceDraftId;
  const memoryKey = createMemoryKey(memory);

  return existing.some((item) => {
    if (sourceDraftId && item.sourceDraftId === sourceDraftId) {
      return true;
    }

    return createMemoryKey(item) === memoryKey || createContentKey(item) === createContentKey(memory);
  });
}

export async function loadPublishedMemories(): Promise<PublishedMemoryItem[]> {
  const state = await readPublishedMemoryState();
  return state.memories;
}

export async function savePublishedMemories(memories: PublishedMemoryItem[]): Promise<PublishedMemoryState> {
  const nextState: PublishedMemoryState = {
    source: PUBLISH_SOURCE,
    version: 1,
    updatedAt: Date.now(),
    memories,
  };

  await writePublishedMemoryState(nextState);
  return nextState;
}

export async function listPublishedMemories(): Promise<PublishedMemoryItem[]> {
  return loadPublishedMemories();
}

export function normalizeDraftToPublishedMemory(draft: IngestMemoryItem, scope: NormalizedMemoryScope, publishReason = "publish-policy-approved"): PublishedMemoryItem {
  const knowledgeBaseId = scope.knowledgeBaseId;
  const kbId = scope.kbId || knowledgeBaseId;
  const agentId = scope.agentId;
  const expertId = scope.expertId || agentId;
  const namespace = scope.namespace;
  const tenantId = scope.tenantId;
  const content = getDraftContent(draft);

  const now = Date.now();
  const title = readString(draft.title) || "未命名训练记忆";
  const summary = readString(draft.summary) || normalizeText(content).slice(0, 160);

  return {
    id: `pub-${stableHash(`${draft.id}|${knowledgeBaseId}|${agentId}|${content}`)}`,
    sourceDraftId: draft.id,
    title,
    summary,
    content,
    tags: getDraftTags(draft),
    type: draft.type,
    status: "published",
    visibility: "shared",
    knowledgeBaseId,
    kbId,
    agentId,
    expertId,
    ownerAdminId: draft.ownerAdminId,
    ownerUserId: draft.ownerUserId,
    namespace,
    tenantId,
    sourceApp: "admin_ingest",
    createdAt: now,
    updatedAt: now,
    publishedAt: now,
    meta: {
      ...(draft.meta || {}),
      originalStatus: draft.status,
      ownerAdminId: draft.ownerAdminId,
      ownerUserId: draft.ownerUserId,
      publishedBy: PUBLISH_SOURCE,
      publishReason,
      contentHash: createContentKey({
        id: "hash",
        title,
        content,
        type: draft.type,
        status: "published",
        visibility: "shared",
        knowledgeBaseId,
        kbId,
        agentId,
        expertId,
        namespace,
        tenantId,
        sourceApp: "admin_ingest",
        publishedAt: now,
        updatedAt: now,
      }),
      sourceDraftId: draft.id,
      scopeResolvedBy: draft.meta?.scopeResolvedBy || "ingest-memory-publisher-v1",
      knowledgeBaseId,
      kbId,
      agentId,
      expertId,
      namespace,
      tenantId,
    },
  };
}

export async function publishMemoryDrafts(input: PublishMemoryDraftsInput = {}): Promise<PublishResult> {
  const allDrafts = input.drafts ?? (await listMemoryDrafts({
    ownerAdminId: input.ownerAdminId,
    ownerUserId: input.ownerUserId,
    includeLegacyUnowned: input.includeLegacyUnowned
  }));
  const draftIdSet = input.draftIds?.length ? new Set(input.draftIds) : null;
  const targetDrafts = draftIdSet ? allDrafts.filter((draft) => draftIdSet.has(draft.id)) : allDrafts;
  const state = await readPublishedMemoryState();
  const nextMemories = [...state.memories];
  const publishedIds: string[] = [];
  const skipped: PublishSkipReason[] = [];
  const warnings: string[] = [];

  for (const draft of targetDrafts) {
    const policy = canPublishMemoryDraft(draft);
    if (!policy.canPublish) {
      skipped.push({
        draftId: draft.id,
        title: draft.title,
        reason: policy.reason || "不符合发布条件",
        missingFields: policy.missingFields,
        canFixByScopeNormalizer: policy.canFixByScopeNormalizer,
      });
      continue;
    }

    if (!policy.normalizedScope) {
      skipped.push({
        draftId: draft.id,
        title: draft.title,
        reason: "发布策略通过但 normalizedScope 缺失，已阻止发布。",
        missingFields: ["normalizedScope"],
        canFixByScopeNormalizer: false,
      });
      continue;
    }

    const normalizedDraft = policy.normalizedDraft ?? draft;
    const published = normalizeDraftToPublishedMemory(normalizedDraft, policy.normalizedScope, policy.reason);
    if (hasDuplicate(nextMemories, published)) {
      skipped.push({
        draftId: draft.id,
        title: draft.title,
        reason: "已存在相同发布记忆",
      });
      continue;
    }

    nextMemories.push(published);
    publishedIds.push(published.id);
  }

  if (targetDrafts.length === 0) {
    warnings.push("没有找到可处理的训练记忆草稿。");
  }

  if (publishedIds.length === 0) {
    warnings.push("本次没有新增发布记忆；请确认草稿已保存到知识库且带有 kb/agent scope。");
  }

  await savePublishedMemories(nextMemories);

  return {
    ok: true,
    publishedCount: publishedIds.length,
    skippedCount: skipped.length,
    totalPublished: nextMemories.length,
    publishedIds,
    skipped,
    warnings,
  };
}

export async function publishMemoryDraft(draftId: string): Promise<PublishResult> {
  return publishMemoryDrafts({ draftIds: [draftId] });
}
