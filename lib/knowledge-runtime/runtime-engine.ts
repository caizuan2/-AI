import { normalizeRuntimeScope } from "./runtime-agent-policy";
import { buildRuntimePromptContext } from "./runtime-context-builder";
import { readRuntimeMemories } from "./runtime-memory-reader";
import { normalizeRuntimeOutput } from "./runtime-output-normalizer";
import { normalizeRuntimeSources } from "./runtime-source-normalizer";
import type {
  KnowledgeRuntimeInput,
  KnowledgeRuntimeOutput
} from "./runtime-types";

type RuntimeEngineInput = {
  input?: Partial<KnowledgeRuntimeInput>;
  raw: unknown;
};

export async function runKnowledgeRuntime({
  input = {},
  raw
}: RuntimeEngineInput): Promise<KnowledgeRuntimeOutput> {
  const scope = normalizeRuntimeScope(input);
  const ragSources = normalizeRuntimeSources(
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>).sources
      : []
  );
  const memoryResult = await readRuntimeMemories(scope);
  const runtimeContext = buildRuntimePromptContext(scope, ragSources, memoryResult.memories);
  const output = normalizeRuntimeOutput(raw, scope);

  return {
    ...output,
    sources: output.sources.length > 0 ? output.sources : ragSources,
    usedMemoryIds: memoryResult.usedMemoryIds,
    raw: {
      runtimeContextAvailable: Boolean(runtimeContext),
      memoryWarning: memoryResult.warning
    }
  };
}
