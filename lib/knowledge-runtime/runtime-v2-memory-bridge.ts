import { canUseRuntimeV2Memory } from "./runtime-v2-guard";
import {
  normalizeRuntimeV2MemoryCandidates,
  sourceToRuntimeV2Memory,
} from "./runtime-v2-memory-normalizer";
import { buildRuntimeV2MemoryTrace } from "./runtime-v2-memory-trace";
import type {
  RuntimeV2Input,
  RuntimeV2Memory,
  RuntimeV2MemoryTraceItem,
  RuntimeV2Source,
} from "./runtime-v2-types";

export interface RuntimeV2MemoryBridgeResult {
  memories: RuntimeV2Memory[];
  usedMemoryIds: string[];
  memoryTrace: RuntimeV2MemoryTraceItem[];
  warnings: string[];
}

export interface RuntimeV2MemoryBridgeOptions {
  sources?: RuntimeV2Source[];
  rawValue?: unknown;
}

const MAX_MEMORIES = 5;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function textTokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[\s,.;:!?，。！？、；："'()[\]{}<>/\\|_-]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2),
  );
}

function queryScore(memory: RuntimeV2Memory, input: RuntimeV2Input) {
  const queryTokens = textTokens(input.query);

  if (queryTokens.size === 0) return 0;

  const contentTokens = textTokens(`${memory.title ?? ""} ${memory.content}`);
  let overlap = 0;

  queryTokens.forEach((token) => {
    if (contentTokens.has(token)) {
      overlap += 1;
    }
  });

  return Math.min(0.25, overlap / Math.max(1, queryTokens.size) * 0.25);
}

function scopeScore(memory: RuntimeV2Memory, input: RuntimeV2Input) {
  let score = 0;
  const matchedBy: string[] = [];
  const add = (label: string, left?: string | null, right?: string | null, value = 0.16) => {
    if (left && right && left === right) {
      score += value;
      matchedBy.push(label);
    }
  };

  add("knowledgeBaseId", memory.knowledgeBaseId, input.knowledgeBaseId, 0.22);
  add("kbId", memory.kbId, input.kbId, 0.2);
  add("agentId", memory.agentId, input.agentId, 0.18);
  add("expertId", memory.expertId, input.expertId, 0.18);
  add("namespace", memory.namespace, input.namespace, 0.12);
  add("tenantId", memory.tenantId, input.tenantId, 0.1);

  return { score, matchedBy };
}

function rankMemory(memory: RuntimeV2Memory, input: RuntimeV2Input): RuntimeV2Memory {
  const scope = scopeScore(memory, input);
  const baseScore = typeof memory.score === "number" && Number.isFinite(memory.score)
    ? Math.max(0, Math.min(1, memory.score))
    : 0.45;

  return {
    ...memory,
    score: Math.max(0, Math.min(1, baseScore * 0.55 + scope.score + queryScore(memory, input))),
    matchedBy: Array.from(new Set([...(memory.matchedBy ?? []), ...scope.matchedBy])),
  };
}

function dedupeMemories(memories: RuntimeV2Memory[]) {
  const seen = new Set<string>();
  const result: RuntimeV2Memory[] = [];

  for (const memory of memories) {
    const key = memory.id || `${memory.title ?? ""}:${memory.content.slice(0, 80)}`;

    if (seen.has(key)) continue;

    seen.add(key);
    result.push(memory);
  }

  return result;
}

function collectExplicitMemories(rawValue: unknown): RuntimeV2Memory[] {
  if (!isRecord(rawValue)) return [];

  return [
    rawValue.memories,
    rawValue.memory,
    rawValue.runtimeMemories,
    rawValue.runtime_memories,
    rawValue.memoryV2,
    rawValue.memory_v2,
  ].flatMap((value) => normalizeRuntimeV2MemoryCandidates(value, "explicit"));
}

function collectSourceMemories(sources: RuntimeV2Source[] = []): RuntimeV2Memory[] {
  return sources
    .map((source, index) => sourceToRuntimeV2Memory(source, index))
    .filter((memory): memory is RuntimeV2Memory => Boolean(memory));
}

export async function readRuntimeV2Memories(
  input: RuntimeV2Input,
  options: RuntimeV2MemoryBridgeOptions = {},
): Promise<RuntimeV2MemoryBridgeResult> {
  const warnings: string[] = [];
  const candidates = dedupeMemories([
    ...collectExplicitMemories(options.rawValue),
    ...collectSourceMemories(options.sources),
  ]);
  const scopedMemories = candidates
    .filter((memory) => canUseRuntimeV2Memory(memory, input))
    .map((memory) => rankMemory(memory, input))
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
    .slice(0, MAX_MEMORIES);

  if (candidates.length === 0) {
    warnings.push("MEMORY_CANDIDATES_EMPTY");
  }

  if (candidates.length > 0 && scopedMemories.length === 0) {
    warnings.push("MEMORY_SCOPE_EMPTY");
  }

  return {
    memories: scopedMemories,
    usedMemoryIds: scopedMemories.map((memory) => memory.id),
    memoryTrace: buildRuntimeV2MemoryTrace(scopedMemories, input),
    warnings,
  };
}

export function rankRuntimeV2Memories(
  memories: RuntimeV2Memory[],
): RuntimeV2Memory[] {
  return [...memories].sort((left, right) => (right.score ?? 0) - (left.score ?? 0));
}

export function buildRuntimeV2MemoryContext(memories: RuntimeV2Memory[]): string {
  return rankRuntimeV2Memories(memories)
    .slice(0, MAX_MEMORIES)
    .map((memory, index) => `${index + 1}. ${memory.title ?? memory.id}: ${memory.content}`)
    .join("\n");
}
