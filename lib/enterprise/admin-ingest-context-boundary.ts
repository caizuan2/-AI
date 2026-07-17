export const ADMIN_INGEST_CONTEXT_LIMITS = {
  contextSummary: 48_000,
  memoryContextText: 6_000,
  agentLearningInstruction: 4_000,
  usedMemoryIds: 20
} as const;

export type AdminIngestContextWireFields = {
  contextSummary?: string | null;
  memoryContextText?: string | null;
  agentLearningInstruction?: string | null;
  usedMemoryIds?: string[];
};

function readBoundedText(value: unknown, maxChars: number) {
  const text = typeof value === "string" ? value.trim() : "";

  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

function readMemoryIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value
    .map((item) => typeof item === "string" ? item.trim() : "")
    .filter(Boolean)))
    .slice(0, ADMIN_INGEST_CONTEXT_LIMITS.usedMemoryIds);
}

export function buildAdminIngestContextRequestFields(
  input: AdminIngestContextWireFields
) {
  return {
    contextSummary: input.contextSummary,
    memoryContextText: input.memoryContextText,
    agentLearningInstruction: input.agentLearningInstruction,
    usedMemoryIds: input.usedMemoryIds ?? []
  };
}

export function readAdminIngestContextRequestFields(body: Record<string, unknown>) {
  return {
    contextSummary: readBoundedText(
      body.contextSummary,
      ADMIN_INGEST_CONTEXT_LIMITS.contextSummary
    ) || null,
    memoryContextText: readBoundedText(
      body.memoryContextText,
      ADMIN_INGEST_CONTEXT_LIMITS.memoryContextText
    ) || null,
    agentLearningInstruction: readBoundedText(
      body.agentLearningInstruction,
      ADMIN_INGEST_CONTEXT_LIMITS.agentLearningInstruction
    ) || null,
    usedMemoryIds: readMemoryIds(body.usedMemoryIds)
  };
}
