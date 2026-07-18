import type {
  KnowledgeRuntimeInput,
  KnowledgeRuntimeMemoryResult
} from "./runtime-types";

export async function readRuntimeMemories(input: Partial<KnowledgeRuntimeInput>): Promise<KnowledgeRuntimeMemoryResult> {
  void input;

  return {
    memories: [],
    usedMemoryIds: [],
    warning: "MEMORY_RUNTIME_UNAVAILABLE"
  };
}
