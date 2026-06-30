import type {
  IngestAgentLearningInstruction,
  IngestMemoryPromptContext,
  IngestMemoryRecallCandidate
} from "@/lib/enterprise/ingest-memory-types";

export type IngestMemoryDebugSnapshot = {
  memoryParticipated: boolean;
  usedMemoryIds: string[];
  recalledMemoryIds: string[];
  injectedCharLength: number;
  appliedPolicies: string[];
  warnings: string[];
};

export function buildIngestMemoryDebugSnapshot(input: {
  retrievedMemories?: IngestMemoryRecallCandidate[];
  promptContext?: IngestMemoryPromptContext;
  agentLearningInstruction?: IngestAgentLearningInstruction;
  warnings?: string[];
}): IngestMemoryDebugSnapshot {
  const usedMemoryIds = input.promptContext?.usedMemoryIds ?? [];
  const recalledMemoryIds = (input.retrievedMemories ?? []).map((item) => item.memory.id);
  const warnings = [
    ...(input.warnings ?? []),
    ...(input.promptContext?.warnings ?? []),
    ...(input.agentLearningInstruction?.warnings ?? [])
  ].filter(Boolean);

  return {
    memoryParticipated: usedMemoryIds.length > 0 || Boolean(input.agentLearningInstruction?.instructionText),
    usedMemoryIds,
    recalledMemoryIds,
    injectedCharLength: input.promptContext?.memoryContextText.length ?? 0,
    appliedPolicies: input.agentLearningInstruction?.appliedPolicies ?? [],
    warnings
  };
}
