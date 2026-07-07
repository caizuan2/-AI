"use client";

import type { CurrentChatUser, ExpertMarketItem, SelectedKnowledgeBase } from "../types";

const KNOWLEDGE_BASE_SELECTION_STORAGE_PREFIX = "xiaodong:user:selectedKnowledgeBases";
const MAX_SELECTED_KNOWLEDGE_BASES = 8;

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function getKnowledgeBaseUserIdentity(user: CurrentChatUser | null | undefined) {
  return cleanText(user?.id) || cleanText(user?.phone) || cleanText(user?.email) || cleanText(user?.account) || null;
}

export function getKnowledgeBaseSelectionStorageKey(user: CurrentChatUser | null | undefined) {
  const identity = getKnowledgeBaseUserIdentity(user);

  return identity ? `${KNOWLEDGE_BASE_SELECTION_STORAGE_PREFIX}:${encodeURIComponent(identity)}` : null;
}

export function normalizeSelectedKnowledgeBases(items: unknown): SelectedKnowledgeBase[] {
  if (!Array.isArray(items)) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: SelectedKnowledgeBase[] = [];

  for (const item of items) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const record = item as Record<string, unknown>;
    const kbId = cleanText(record.kb_id || record.kbId || record.knowledgeBaseId).slice(0, 120);
    const expertId = cleanText(record.expert_id || record.expertId || record.agentId).slice(0, 120);
    const tenantId = cleanText(record.tenant_id || record.tenantId).slice(0, 120);
    const namespace = cleanText(record.namespace).slice(0, 120);
    const title = cleanText(record.title || record.name).slice(0, 120);

    if (!kbId || !title || seen.has(kbId)) {
      continue;
    }

    seen.add(kbId);
    normalized.push({
      kb_id: kbId,
      kbId,
      knowledgeBaseId: kbId,
      expert_id: expertId || undefined,
      expertId: expertId || undefined,
      agentId: expertId || undefined,
      tenant_id: tenantId || undefined,
      tenantId: tenantId || undefined,
      namespace: namespace || tenantId || "default",
      title,
      name: title,
      expertName: cleanText(record.expertName).slice(0, 120) || undefined,
      category: cleanText(record.category).slice(0, 80) || undefined,
      description: cleanText(record.description).slice(0, 240) || undefined,
      active: record.active === true
    });

    if (normalized.length >= MAX_SELECTED_KNOWLEDGE_BASES) {
      break;
    }
  }

  if (normalized.length === 0) {
    return [];
  }

  const activeIndex = normalized.findIndex((item) => item.active);

  return normalized.map((item, index) => ({
    ...item,
    active: activeIndex >= 0 ? index === activeIndex : index === 0
  }));
}

export function readStoredKnowledgeBases(user: CurrentChatUser | null | undefined) {
  if (typeof window === "undefined") {
    return [];
  }

  const storageKey = getKnowledgeBaseSelectionStorageKey(user);

  if (!storageKey) {
    return [];
  }

  try {
    return normalizeSelectedKnowledgeBases(JSON.parse(window.localStorage.getItem(storageKey) ?? "[]"));
  } catch {
    return [];
  }
}

export function writeStoredKnowledgeBases(user: CurrentChatUser | null | undefined, items: SelectedKnowledgeBase[]) {
  if (typeof window === "undefined") {
    return;
  }

  const storageKey = getKnowledgeBaseSelectionStorageKey(user);

  if (!storageKey) {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(normalizeSelectedKnowledgeBases(items)));
  } catch {
    // Knowledge base chips are a UI preference; storage failures must not block chat.
  }
}

export function getActiveKnowledgeBase(items: SelectedKnowledgeBase[]) {
  return items.find((item) => item.active) ?? items[0] ?? null;
}

export function addKnowledgeBaseSelection(
  current: SelectedKnowledgeBase[],
  item: ExpertMarketItem
) {
  const kbId = item.kb_id || item.kbId || item.knowledgeBaseId || "";
  const nextItem: SelectedKnowledgeBase = {
    kb_id: kbId,
    kbId,
    knowledgeBaseId: kbId,
    expert_id: item.expert_id || item.expertId || item.agentId,
    expertId: item.expertId || item.expert_id || item.agentId,
    agentId: item.agentId || item.expert_id || item.expertId,
    tenant_id: item.tenant_id || item.tenantId,
    tenantId: item.tenantId || item.tenant_id,
    namespace: item.namespace || item.tenant_id || item.tenantId || "default",
    title: item.title,
    name: item.name || item.title,
    expertName: item.expertName,
    category: item.category,
    description: item.description,
    active: current.length === 0
  };

  return normalizeSelectedKnowledgeBases([...current, nextItem]);
}

export function removeKnowledgeBaseSelection(current: SelectedKnowledgeBase[], kbId: string) {
  return normalizeSelectedKnowledgeBases(current.filter((item) => item.kb_id !== kbId));
}

export function setActiveKnowledgeBaseSelection(current: SelectedKnowledgeBase[], kbId: string) {
  return normalizeSelectedKnowledgeBases(current.map((item) => ({
    ...item,
    active: item.kb_id === kbId
  })));
}
