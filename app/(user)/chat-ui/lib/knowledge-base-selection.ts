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

export function getKnowledgeBasesForSubmit(items: SelectedKnowledgeBase[]) {
  const activeItem = getActiveKnowledgeBase(normalizeSelectedKnowledgeBases(items));

  return activeItem ? [{ ...activeItem, active: true }] : [];
}

function normalizeMatchText(value: unknown) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[\s"'“”‘’`.,，。！？!?：:；;、（）()【】[\]{}<>《》\-_/\\|]+/g, "");
}

function getKnowledgeBaseMatchKeywords(item: SelectedKnowledgeBase) {
  const rawText = [
    item.title,
    item.name,
    item.expertName,
    item.category,
    item.description
  ].map(normalizeMatchText).filter(Boolean).join(" ");
  const keywords = new Set<string>();

  for (const value of [item.title, item.name, item.expertName, item.category]) {
    const normalized = normalizeMatchText(value);

    if (normalized.length >= 2) {
      keywords.add(normalized);
    }
  }

  if (/kks|瘦身|减肥|减脂|体重|脂达|胖达/.test(rawText)) {
    [
      "kks",
      "瘦身",
      "减肥",
      "减脂",
      "体重",
      "肥胖",
      "反弹",
      "代谢",
      "脂达人",
      "胖达人",
      "脂达",
      "胖达",
      "燃烧脂肪"
    ].forEach((keyword) => keywords.add(normalizeMatchText(keyword)));
  }

  if (/大健康|健康|养生|营养|调理/.test(rawText)) {
    [
      "大健康",
      "健康",
      "养生",
      "营养",
      "调理",
      "睡眠",
      "体检"
    ].forEach((keyword) => keywords.add(normalizeMatchText(keyword)));
  }

  if (/事业|创业|招商|商业|讲事业/.test(rawText)) {
    [
      "事业",
      "创业",
      "招商",
      "商业",
      "讲事业",
      "项目",
      "成交",
      "转化"
    ].forEach((keyword) => keywords.add(normalizeMatchText(keyword)));
  }

  return Array.from(keywords).filter((keyword) => keyword.length >= 2);
}

function scoreKnowledgeBaseQueryMatch(item: SelectedKnowledgeBase, query: string) {
  const normalizedQuery = normalizeMatchText(query);

  if (!normalizedQuery) {
    return 0;
  }

  return getKnowledgeBaseMatchKeywords(item).reduce((score, keyword) => {
    if (!normalizedQuery.includes(keyword)) {
      return score;
    }

    if (/^(kks|脂达人|胖达人|讲事业)$/.test(keyword)) {
      return score + 5;
    }

    return score + Math.min(4, Math.max(2, keyword.length));
  }, 0);
}

export function detectKnowledgeBaseScopeMismatch(query: string, items: SelectedKnowledgeBase[]) {
  const normalizedItems = normalizeSelectedKnowledgeBases(items);
  const activeItem = getActiveKnowledgeBase(normalizedItems);

  if (!activeItem || normalizedItems.length < 2) {
    return null;
  }

  const activeScore = scoreKnowledgeBaseQueryMatch(activeItem, query);
  const candidates = normalizedItems
    .filter((item) => item.kb_id !== activeItem.kb_id)
    .map((item) => ({
      item,
      score: scoreKnowledgeBaseQueryMatch(item, query)
    }))
    .filter((candidate) => candidate.score >= 3)
    .sort((left, right) => right.score - left.score);
  const bestCandidate = candidates[0];

  if (!bestCandidate || bestCandidate.score <= activeScore) {
    return null;
  }

  return {
    active: activeItem,
    target: bestCandidate.item,
    message: `这个问题更像属于「${bestCandidate.item.title}」知识库的内容，请切换到「${bestCandidate.item.title}」知识库后再提问。`
  };
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
