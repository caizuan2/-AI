import { assertRuntimeV2Scope } from "./runtime-v2-guard";
import { readRuntimeV2Memories } from "./runtime-v2-memory-bridge";
import { buildRuntimeV2AgentPolicies } from "./runtime-v2-agent-policy";
import { buildRuntimeV2Context } from "./runtime-v2-context-builder";
import { finalizeRuntimeV2Output } from "./runtime-v2-output-contract";
import { normalizeRuntimeV2Sources } from "./runtime-v2-source-policy";
import type { RuntimeV2Input, RuntimeV2Output, RuntimeV2Source } from "./runtime-v2-types";

function mergeRuntimeSources(rawRecord: Record<string, unknown> | null): RuntimeV2Source[] {
  if (!rawRecord) return [];

  const candidates = [
    rawRecord.sources,
    rawRecord.runtime_sources,
    rawRecord.ragSources,
    rawRecord.rag_sources,
  ];
  const merged: RuntimeV2Source[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    for (const source of normalizeRuntimeV2Sources(candidate)) {
      const key = source.id ?? `${source.title ?? ""}:${source.safeSnippet ?? source.snippet ?? ""}`;

      if (seen.has(key)) continue;

      seen.add(key);
      merged.push(source);
    }
  }

  return merged;
}

export async function runRuntimeV2(
  rawValue: unknown,
  input: Partial<RuntimeV2Input>,
): Promise<RuntimeV2Output> {
  const scope = assertRuntimeV2Scope(input);
  const rawRecord = rawValue && typeof rawValue === "object"
    ? rawValue as Record<string, unknown>
    : null;
  const sources = mergeRuntimeSources(rawRecord);
  const memoryResult = await readRuntimeV2Memories(scope, {
    sources,
    rawValue,
  });
  const policies = buildRuntimeV2AgentPolicies(scope);
  const context = buildRuntimeV2Context({
    scope,
    sources,
    memories: memoryResult.memories,
    memoryTrace: memoryResult.memoryTrace,
    policies,
  });

  return finalizeRuntimeV2Output(rawValue, scope, {
    sources,
    memories: memoryResult.memories.filter((memory) => context.usedMemoryIds.includes(memory.id)),
    memoryTrace: context.memoryTrace,
    memoryWarnings: memoryResult.warnings,
    policies: policies.filter((policy) => context.appliedAgentPolicies.includes(policy.id)),
  });
}
