export interface RepairSafetyDecision {
  isSafe: boolean;
  affects_db: false;
  affects_rag_core: false;
  affects_api: false;
  reasons: string[];
}

export function validateRepairPatchSafety(patch: unknown): RepairSafetyDecision {
  const reasons: string[] = [];

  if (!patch || typeof patch !== "object") {
    reasons.push("patch must be an object.");
  }

  if (containsUnsafeExecutionIntent(patch)) {
    reasons.push("patch contains execution intent that may affect database, RAG core, API, or index.");
  }

  return {
    isSafe: reasons.length === 0,
    affects_db: false,
    affects_rag_core: false,
    affects_api: false,
    reasons,
  };
}

function containsUnsafeExecutionIntent(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  return Object.keys(value as Record<string, unknown>).some((key) => {
    const normalized = key.toLowerCase();
    return normalized.includes("write_db") ||
      normalized.includes("update_database") ||
      normalized.includes("rebuild_index") ||
      normalized.includes("modify_api") ||
      normalized.includes("rag_core");
  });
}
