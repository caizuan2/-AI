import "server-only";

import type { MemoryIndexEntry, MemoryIndexState, PublishedMemoryItem } from "./ingest-memory-index-types";
import { readMemoryIndexState, writeMemoryIndexState } from "./ingest-memory-shared-store";
import { loadPublishedMemories } from "./ingest-memory-publisher";

const INDEX_SOURCE = "admin-ingest-memory-index-builder-v1";

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isCjkToken(token: string): boolean {
  return /^[\u3400-\u9fff]$/.test(token);
}

function uniqueTokens(tokens: string[]): string[] {
  return Array.from(new Set(tokens.map((token) => token.trim().toLowerCase()).filter(Boolean)));
}

export function buildSearchText(memory: PublishedMemoryItem): string {
  return [
    memory.type,
    memory.title,
    memory.summary,
    memory.content,
    ...(memory.tags || []),
    memory.knowledgeBaseId,
    memory.kbId,
    memory.agentId,
    memory.expertId,
    memory.namespace,
    memory.tenantId,
  ]
    .filter(Boolean)
    .join("\n");
}

function collectSpecialTokens(text: string): string[] {
  const tokens: string[] = [];
  const normalized = text.toLowerCase();
  const patterns = [
    /33\s*循环/gi,
    /77\s*循环/gi,
    /kks/gi,
    /脂达人/gi,
    /脉达人/gi,
    /控体/gi,
    /瘦身/gi,
    /考虑考虑/gi
  ];

  for (const pattern of patterns) {
    const matches = normalized.match(pattern) || [];
    for (const match of matches) {
      tokens.push(match.replace(/\s+/g, ""));
    }
  }

  return tokens;
}

export function tokenizeMemoryForIndex(text: string): string[] {
  const coarseTokens = text.match(/[a-z0-9]+|[\u3400-\u9fff]/gi) || [];
  const tokens: string[] = collectSpecialTokens(text);
  let cjkRun = "";
  let lastToken = "";

  for (const rawToken of coarseTokens) {
    const token = rawToken.toLowerCase();
    tokens.push(token);

    if (/^\d+$/.test(lastToken) && isCjkToken(token)) {
      tokens.push(`${lastToken}${token}`);
    }

    if (isCjkToken(token)) {
      cjkRun += token;
      lastToken = token;
      continue;
    }

    if (cjkRun.length > 0) {
      for (let index = 0; index < cjkRun.length - 1; index += 1) {
        tokens.push(cjkRun.slice(index, index + 2));
      }
      cjkRun = "";
    }

    lastToken = token;
  }

  if (cjkRun.length > 0) {
    for (let index = 0; index < cjkRun.length - 1; index += 1) {
      tokens.push(cjkRun.slice(index, index + 2));
    }
  }

  return uniqueTokens(tokens);
}

function buildEntry(memory: PublishedMemoryItem): MemoryIndexEntry {
  const searchText = buildSearchText(memory);

  return {
    memoryId: memory.id,
    sourceDraftId: memory.sourceDraftId,
    title: memory.title,
    summary: memory.summary,
    contentPreview: readString(memory.content).slice(0, 260),
    tags: memory.tags || [],
    status: memory.status,
    visibility: memory.visibility,
    knowledgeBaseId: memory.knowledgeBaseId,
    kbId: memory.kbId || memory.knowledgeBaseId,
    agentId: memory.agentId,
    expertId: memory.expertId || memory.agentId,
    namespace: memory.namespace,
    tenantId: memory.tenantId,
    sourceApp: memory.sourceApp,
    tokens: tokenizeMemoryForIndex(searchText),
    searchText,
    updatedAt: memory.updatedAt,
  };
}

export async function loadMemoryIndex(): Promise<MemoryIndexState> {
  return readMemoryIndexState();
}

export async function saveMemoryIndex(entries: MemoryIndexEntry[], warnings: string[] = []): Promise<MemoryIndexState> {
  const state: MemoryIndexState = {
    source: INDEX_SOURCE,
    version: 1,
    builtAt: Date.now(),
    entries,
    warnings,
  };

  await writeMemoryIndexState(state);
  return state;
}

export async function buildMemoryIndex(memories?: PublishedMemoryItem[]): Promise<MemoryIndexState> {
  const publishedMemories = memories ?? (await loadPublishedMemories());
  const entries = publishedMemories
    .filter((memory) => memory.status === "published" || memory.status === "shared")
    .filter((memory) => memory.visibility === "shared" || memory.visibility === "public")
    .filter((memory) => memory.knowledgeBaseId && memory.agentId && memory.content)
    .map(buildEntry);
  const warnings: string[] = [];

  if (publishedMemories.length > 0 && entries.length === 0) {
    warnings.push("INDEX_BUILD_FAILED: published memory exists but no index entry was built.");
  }

  return saveMemoryIndex(entries, warnings);
}

export async function rebuildMemoryIndex(): Promise<MemoryIndexState> {
  return buildMemoryIndex();
}
