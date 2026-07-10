import "server-only";

import type {
  MemoryIndexEntry,
  RuntimeMemorySearchInput,
  RuntimeMemorySearchResultItem,
} from "./ingest-memory-index-types";
import { loadMemoryIndex, tokenizeMemoryForIndex } from "./ingest-memory-index-builder";
import { loadPublishedMemories } from "./ingest-memory-publisher";
import { resolvePublicExpertScope, publicExpertScopeAliasesFor } from "./public-expert-scope";

type RuntimeMemorySearchResult = {
  ok: true;
  memoryApplied: boolean;
  memories: RuntimeMemorySearchResultItem[];
  memoryTrace: Array<{
    memoryId: string;
    score: number;
    reason: string;
    matchedTokens: string[];
  }>;
  usedMemoryIds: string[];
  warnings: string[];
};

type ScopeMatchResult = {
  matches: boolean;
  sameKb: boolean;
  sameAgent: boolean;
  sameNamespace: boolean;
  sameTenant: boolean;
};

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeScopeValue(value: unknown): string {
  return readString(value).toLowerCase();
}

function scopeEquals(inputValue: string, entryValue?: string): boolean {
  const normalizedEntry = normalizeScopeValue(entryValue);
  return Boolean(inputValue && normalizedEntry && inputValue === normalizedEntry);
}

function hasAliasOverlap(left: unknown, right: unknown): boolean {
  const leftAliases = publicExpertScopeAliasesFor(left).map(normalizeScopeValue).filter(Boolean);
  const rightAliases = publicExpertScopeAliasesFor(right).map(normalizeScopeValue).filter(Boolean);

  if (leftAliases.length === 0 || rightAliases.length === 0) {
    return false;
  }

  const rightSet = new Set(rightAliases);
  return leftAliases.some((alias) => rightSet.has(alias));
}

function optionalScopeMatches(inputValue: string, entryValue?: string): boolean {
  const normalizedEntry = normalizeScopeValue(entryValue);
  if (!inputValue || inputValue === "default") {
    return true;
  }

  if (!normalizedEntry || normalizedEntry === "default") {
    return true;
  }

  return inputValue === normalizedEntry;
}

function namespaceMatches(inputValue: string, entryValue: string, sameKb: boolean): boolean {
  if (!inputValue || inputValue === "default") {
    return true;
  }

  if (!entryValue || entryValue === "default") {
    return true;
  }

  if (sameKb && inputValue === "default") {
    return true;
  }

  return inputValue === entryValue;
}

function entryScopeMatch(entry: MemoryIndexEntry, input: RuntimeMemorySearchInput): ScopeMatchResult {
  const requestedPublicScope = resolvePublicExpertScope(input);
  const entryPublicScope = resolvePublicExpertScope(entry);
  const requestedKb = normalizeScopeValue(requestedPublicScope?.knowledgeBaseId || input.knowledgeBaseId || input.kbId);
  const requestedAgent = normalizeScopeValue(requestedPublicScope?.agentId || input.agentId || input.expertId);
  const requestedTenant = normalizeScopeValue(input.tenantId) || "default";
  const requestedNamespace = normalizeScopeValue(requestedPublicScope?.namespace || input.namespace) || "default";
  const entryKb = entryPublicScope?.knowledgeBaseId || entry.knowledgeBaseId || entry.kbId;
  const entryAgent = entryPublicScope?.agentId || entry.agentId || entry.expertId;
  const entryNamespace = normalizeScopeValue(entryPublicScope?.namespace || entry.namespace);

  const sameKb =
    scopeEquals(requestedKb, entryKb) ||
    scopeEquals(requestedKb, entry.knowledgeBaseId) ||
    scopeEquals(requestedKb, entry.kbId) ||
    hasAliasOverlap(requestedKb, entry.knowledgeBaseId) ||
    hasAliasOverlap(requestedKb, entry.kbId);
  const sameAgent =
    scopeEquals(requestedAgent, entryAgent) ||
    scopeEquals(requestedAgent, entry.agentId) ||
    scopeEquals(requestedAgent, entry.expertId) ||
    hasAliasOverlap(requestedAgent, entry.agentId) ||
    hasAliasOverlap(requestedAgent, entry.expertId);
  const sameNamespace = namespaceMatches(requestedNamespace, entryNamespace, sameKb);
  const sameTenant = optionalScopeMatches(requestedTenant, entry.tenantId);

  return {
    matches:
    sameKb &&
    sameAgent &&
    sameTenant &&
    sameNamespace,
    sameKb,
    sameAgent,
    sameNamespace,
    sameTenant,
  };
}

const EXACT_TERM_GROUPS = [
  ["沟通五步", "五步沟通", "沟通5步", "5步沟通"],
  ["讲事业", "事业导师"],
  ["招商", "招商会"],
  ["成交", "成交话术"],
  ["破冰", "破冰流程"],
  ["同频"],
  ["一对一沟通", "一对一"],
  ["33循环", "33周期"],
  ["77循环", "77周期"],
  ["脂达人", "脉达人", "控体"]
];

function normalizeExactTermText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "");
}

function collectRuntimeExactTerms(query: string): string[] {
  const normalizedQuery = normalizeExactTermText(query);
  const matches: string[] = [];

  for (const group of EXACT_TERM_GROUPS) {
    if (group.some((term) => normalizedQuery.includes(normalizeExactTermText(term)))) {
      matches.push(...group.map(normalizeExactTermText));
    }
  }

  return Array.from(new Set(matches.filter(Boolean)));
}

function buildEntryExactSearchText(entry: MemoryIndexEntry): string {
  return normalizeExactTermText([
    entry.title,
    entry.summary || "",
    entry.contentPreview,
    entry.searchText,
    ...(entry.tags || [])
  ].filter(Boolean).join("\n"));
}

function scoreEntry(
  entry: MemoryIndexEntry,
  queryTokens: string[],
  exactTerms: string[],
  scopeMatch: ScopeMatchResult
): RuntimeMemorySearchResultItem | null {
  const tokenSet = new Set(entry.tokens);
  const matchedTokens = queryTokens.filter((token) => tokenSet.has(token));
  const uniqueMatches = Array.from(new Set(matchedTokens));
  const tokenScore = queryTokens.length > 0 ? uniqueMatches.length / queryTokens.length : 0;
  const titleScore = uniqueMatches.some((token) => entry.title.toLowerCase().includes(token)) ? 0.12 : 0;
  const tagScore = (entry.tags || []).some((tag) =>
    uniqueMatches.some((token) => tag.toLowerCase().includes(token)),
  )
    ? 0.08
    : 0;
  const entryExactText = buildEntryExactSearchText(entry);
  const exactMatches = exactTerms.filter((term) => entryExactText.includes(term));
  const exactScore = exactMatches.length > 0 ? Math.min(0.45, 0.22 + exactMatches.length * 0.08) : 0;
  const score = Math.min(1, tokenScore + titleScore + tagScore + exactScore);

  if (score < 0.2 && exactMatches.length === 0) {
    return null;
  }

  const displayMatches = Array.from(new Set([...uniqueMatches, ...exactMatches])).slice(0, 20);

  return {
    memoryId: entry.memoryId,
    title: entry.title,
    summary: entry.summary,
    contentPreview: entry.contentPreview,
    score: Number(score.toFixed(3)),
    reason: [
      exactMatches.length > 0 ? `exact phrase:${exactMatches.slice(0, 4).join(",")}` : "",
      uniqueMatches.length > 0 ? `matched token:${uniqueMatches.slice(0, 8).join(",")}` : "scope-match",
      scopeMatch.sameKb ? "same kb" : "",
      scopeMatch.sameAgent ? "same agent" : "",
      scopeMatch.sameNamespace ? "namespace compatible" : "",
      scopeMatch.sameTenant ? "tenant compatible" : ""
    ].filter(Boolean).join(" | "),
    matchedTokens: displayMatches,
    sourceApp: entry.sourceApp,
    knowledgeBaseId: entry.knowledgeBaseId,
    kbId: entry.kbId,
    agentId: entry.agentId,
    expertId: entry.expertId,
    namespace: entry.namespace,
    tenantId: entry.tenantId,
  };
}

export async function searchRuntimeMemories(input: RuntimeMemorySearchInput): Promise<RuntimeMemorySearchResult> {
  const warnings: string[] = [];
  const requestedKb = normalizeScopeValue(input.knowledgeBaseId || input.kbId);
  const requestedAgent = normalizeScopeValue(input.agentId || input.expertId);
  const query = readString(input.query);

  if (!query) {
    return {
      ok: true,
      memoryApplied: false,
      memories: [],
      memoryTrace: [],
      usedMemoryIds: [],
      warnings: ["query 为空，跳过 Memory 检索。"],
    };
  }

  if (!requestedKb || !requestedAgent) {
    return {
      ok: true,
      memoryApplied: false,
      memories: [],
      memoryTrace: [],
      usedMemoryIds: [],
      warnings: ["缺少 knowledgeBaseId/kbId 或 agentId/expertId，禁止全库 Memory 检索。"],
    };
  }

  const [index, publishedMemories] = await Promise.all([
    loadMemoryIndex(),
    loadPublishedMemories(),
  ]);
  if (index.entries.length === 0) {
    return {
      ok: true,
      memoryApplied: false,
      memories: [],
      memoryTrace: [],
      usedMemoryIds: [],
      warnings: ["Memory 索引为空，请先发布并重建索引。"],
    };
  }

  const queryTokens = tokenizeMemoryForIndex(query);
  const exactTerms = collectRuntimeExactTerms(query);
  const limit = Math.max(1, Math.min(input.limit ?? 5, 10));
  const publishedById = new Map(publishedMemories.map((memory) => [memory.id, memory]));
  const matched = index.entries
    .map((entry) => ({ entry, scopeMatch: entryScopeMatch(entry, input) }))
    .filter((item) => item.scopeMatch.matches)
    .map((item) => scoreEntry(item.entry, queryTokens, exactTerms, item.scopeMatch))
    .filter((item): item is RuntimeMemorySearchResultItem => Boolean(item))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((item) => {
      const published = publishedById.get(item.memoryId);

      return {
        ...item,
        content: published?.content || item.contentPreview,
        summary: published?.summary || item.summary,
      };
    });

  if (matched.length === 0) {
    warnings.push("当前 scope 下没有可用 Memory 命中。");
  }

  return {
    ok: true,
    memoryApplied: matched.length > 0,
    memories: matched,
    memoryTrace: matched.map((item) => ({
      memoryId: item.memoryId,
      score: item.score,
      reason: item.reason,
      matchedTokens: item.matchedTokens,
    })),
    usedMemoryIds: matched.map((item) => item.memoryId),
    warnings,
  };
}

export async function getRuntimeMemoryStatus() {
  const [index, memories] = await Promise.all([loadMemoryIndex(), loadPublishedMemories()]);

  return {
    ok: true,
    publishedCount: memories.length,
    indexedCount: index.entries.length,
    lastBuiltAt: index.builtAt,
    source: index.source,
  };
}
