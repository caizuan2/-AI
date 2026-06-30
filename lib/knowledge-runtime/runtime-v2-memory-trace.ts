import type { RuntimeV2Input, RuntimeV2Memory, RuntimeV2MemoryTraceItem } from "./runtime-v2-types";

function matches(label: string, left?: string | null, right?: string | null): string | null {
  return left && right && left === right ? label : null;
}

function matchedBy(memory: RuntimeV2Memory, scope: RuntimeV2Input): string[] {
  return [
    matches("knowledgeBaseId", memory.knowledgeBaseId, scope.knowledgeBaseId),
    matches("kbId", memory.kbId, scope.kbId),
    matches("agentId", memory.agentId, scope.agentId),
    matches("expertId", memory.expertId, scope.expertId),
    matches("namespace", memory.namespace, scope.namespace),
    matches("tenantId", memory.tenantId, scope.tenantId),
  ].filter((value): value is string => Boolean(value));
}

export function buildRuntimeV2MemoryTrace(
  memories: RuntimeV2Memory[],
  scope: RuntimeV2Input,
): RuntimeV2MemoryTraceItem[] {
  return memories.map((memory) => {
    const scopeMatches = matchedBy(memory, scope);
    const fallbackMatches = memory.matchedBy?.length ? memory.matchedBy : [];
    const allMatches = Array.from(new Set([...scopeMatches, ...fallbackMatches]));

    return {
      memoryId: memory.id,
      title: memory.title,
      score: memory.score,
      matchedBy: allMatches,
      source: memory.source ?? memory.sourceApp ?? memory.origin ?? null,
      applied: true,
      reason: allMatches.length > 0
        ? `Matched scoped memory by ${allMatches.join(", ")}.`
        : "Applied compatible runtime memory.",
    };
  });
}
