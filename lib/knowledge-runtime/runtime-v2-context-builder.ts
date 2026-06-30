import type {
  RuntimeV2AgentPolicy,
  RuntimeV2Context,
  RuntimeV2Input,
  RuntimeV2Memory,
  RuntimeV2MemoryTraceItem,
  RuntimeV2Source,
} from "./runtime-v2-types";

function joinLines(lines: string[]): string {
  return lines.filter(Boolean).join("\n");
}

export function buildRuntimeV2Context(input: {
  scope: RuntimeV2Input;
  sources: RuntimeV2Source[];
  memories: RuntimeV2Memory[];
  memoryTrace?: RuntimeV2MemoryTraceItem[];
  policies: RuntimeV2AgentPolicy[];
}): RuntimeV2Context {
  const { scope, sources, memories, memoryTrace = [], policies } = input;
  const sourceLines = sources
    .slice(0, 5)
    .map((source, index) => `${index + 1}. ${source.title}${source.safeSnippet ? ` - ${source.safeSnippet}` : ""}`);
  const memoryLines = memories
    .slice(0, 5)
    .map((memory, index) => `${index + 1}. ${memory.title ?? memory.id}: ${memory.content}`);
  const policyLines = policies.map((policy) => `- ${policy.label}: ${policy.instructions.join(" ")}`);

  return {
    promptContext: joinLines([
      `[Runtime v2] mode=${scope.outputMode}`,
      sourceLines.length > 0 ? `[Knowledge]\n${sourceLines.join("\n")}` : "",
      memoryLines.length > 0 ? `[Memory v2 - scoped recall]\n${memoryLines.join("\n")}` : "",
      policyLines.length > 0 ? `[Policies]\n${policyLines.join("\n")}` : "",
    ]),
    usedMemoryIds: memories.map((memory) => memory.id),
    memoryTrace,
    appliedAgentPolicies: policies.map((policy) => policy.id),
  };
}
