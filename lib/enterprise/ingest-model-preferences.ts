import {
  DEFAULT_INGEST_MODEL_OPTION,
  getIngestModelOptionByLabel
} from "@/lib/enterprise/ingest-model-options";

export const ADMIN_INGEST_MODEL_BY_AGENT_STORAGE_KEY = "admin-ingest-selected-model-by-agent-v1";

export type AdminIngestModelPreferencesByAgent = Record<string, string>;

function normalizeSelectableAgentModel(modelLabel: string | null | undefined) {
  return getIngestModelOptionByLabel(modelLabel).label;
}

export function parseAdminIngestModelPreferences(value: string | null | undefined): AdminIngestModelPreferencesByAgent {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(Object.entries(parsed)
      .filter(([agentId, modelLabel]) => Boolean(agentId.trim()) && typeof modelLabel === "string")
      .map(([agentId, modelLabel]) => [
        agentId,
        normalizeSelectableAgentModel(modelLabel as string)
      ]));
  } catch {
    return {};
  }
}

export function resolveAdminIngestAgentModel(input: {
  preferences: AdminIngestModelPreferencesByAgent;
  agentId: string | null | undefined;
}) {
  const storedLabel = input.agentId ? input.preferences[input.agentId] : null;

  return normalizeSelectableAgentModel(storedLabel || DEFAULT_INGEST_MODEL_OPTION.label);
}

export function setAdminIngestAgentModel(input: {
  preferences: AdminIngestModelPreferencesByAgent;
  agentId: string;
  modelLabel: string;
}): AdminIngestModelPreferencesByAgent {
  if (!input.agentId.trim()) {
    return input.preferences;
  }

  return {
    ...input.preferences,
    [input.agentId]: normalizeSelectableAgentModel(input.modelLabel)
  };
}

export function migrateLegacyAdminIngestModelPreference(input: {
  preferences: AdminIngestModelPreferencesByAgent;
  activeAgentId: string | null | undefined;
  legacyModelLabel: string | null | undefined;
}) {
  if (!input.activeAgentId || input.preferences[input.activeAgentId]) {
    return input.preferences;
  }

  return setAdminIngestAgentModel({
    preferences: input.preferences,
    agentId: input.activeAgentId,
    modelLabel: input.legacyModelLabel || DEFAULT_INGEST_MODEL_OPTION.label
  });
}
