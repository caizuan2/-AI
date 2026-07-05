import type {
  IngestAgentLearningEvent,
  IngestMemoryItem,
  IngestMemoryStatus
} from "@/lib/enterprise/ingest-memory-types";
import { publicExpertScopeValuesOverlap } from "@/lib/enterprise/public-expert-scope";
import {
  getAdminIngestMemoryCandidateFilePaths,
  getAdminIngestMemoryDir
} from "@/lib/enterprise/ingest-memory-shared-store";

type PersistedMemoryState = {
  source: "admin-ingest-memory-layer-v1";
  version: 1;
  drafts: IngestMemoryItem[];
  agentLearningEvents: IngestAgentLearningEvent[];
  updatedAt: number;
};

type MemoryGlobal = typeof globalThis & {
  __adminIngestMemoryStateV1?: PersistedMemoryState;
};

const globalMemory = globalThis as MemoryGlobal;

function readScopeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeScopeString(value: unknown): string {
  return readScopeString(value).toLowerCase();
}

function metaString(record: { meta?: Record<string, unknown> }, key: string): string {
  return readScopeString(record.meta?.[key]);
}

function scopeValueMatches(requested: string | undefined, values: unknown[]): boolean {
  const normalizedRequested = normalizeScopeString(requested);

  if (!normalizedRequested) {
    return true;
  }

  return values.some((value) => {
    const normalizedValue = normalizeScopeString(value);

    return Boolean(
      normalizedValue &&
      (normalizedValue === normalizedRequested || publicExpertScopeValuesOverlap(normalizedRequested, normalizedValue))
    );
  });
}

function scopedRecordMatches(input: {
  agentId?: string;
  knowledgeBaseId?: string;
}, candidate: {
  agentValues: unknown[];
  knowledgeBaseValues: unknown[];
}) {
  const hasAgentScope = Boolean(readScopeString(input.agentId));
  const hasKnowledgeBaseScope = Boolean(readScopeString(input.knowledgeBaseId));
  const agentMatches = scopeValueMatches(input.agentId, candidate.agentValues);
  const knowledgeBaseMatches = scopeValueMatches(input.knowledgeBaseId, candidate.knowledgeBaseValues);

  if (hasAgentScope && hasKnowledgeBaseScope) {
    return agentMatches || knowledgeBaseMatches;
  }

  return agentMatches && knowledgeBaseMatches;
}

function memoryDraftMatchesScope(draft: IngestMemoryItem, input: {
  agentId?: string;
  knowledgeBaseId?: string;
}) {
  return scopedRecordMatches(input, {
    agentValues: [
      draft.agentId,
      metaString(draft, "agentId"),
      metaString(draft, "expertId"),
      metaString(draft, "sourceAgent")
    ],
    knowledgeBaseValues: [
      draft.knowledgeBaseId,
      metaString(draft, "knowledgeBaseId"),
      metaString(draft, "kbId"),
      metaString(draft, "namespace")
    ]
  });
}

function learningEventMatchesScope(event: IngestAgentLearningEvent, input: {
  agentId?: string;
  knowledgeBaseId?: string;
}) {
  return scopedRecordMatches(input, {
    agentValues: [event.agentId],
    knowledgeBaseValues: [event.knowledgeBaseId]
  });
}

function createEmptyState(): PersistedMemoryState {
  return {
    source: "admin-ingest-memory-layer-v1",
    version: 1,
    drafts: [],
    agentLearningEvents: [],
    updatedAt: Date.now()
  };
}

function normalizeState(input: Partial<PersistedMemoryState> | null | undefined): PersistedMemoryState {
  return {
    source: "admin-ingest-memory-layer-v1",
    version: 1,
    drafts: Array.isArray(input?.drafts) ? input.drafts : [],
    agentLearningEvents: Array.isArray(input?.agentLearningEvents) ? input.agentLearningEvents : [],
    updatedAt: typeof input?.updatedAt === "number" ? input.updatedAt : Date.now()
  };
}

async function getMemoryFilePath() {
  const path = await import("node:path");

  return path.join(await getAdminIngestMemoryDir(), "memory-drafts.json");
}

async function readFromFile(): Promise<PersistedMemoryState | null> {
  if (typeof window !== "undefined") {
    return null;
  }

  try {
    const fs = await import("node:fs/promises");
    const filePaths = await getAdminIngestMemoryCandidateFilePaths("memory-drafts.json");
    let fallbackState: PersistedMemoryState | null = null;

    for (const filePath of filePaths) {
      try {
        const raw = await fs.readFile(filePath, "utf8");
        const state = normalizeState(JSON.parse(raw) as Partial<PersistedMemoryState>);

        if (!fallbackState) {
          fallbackState = state;
        }

        if (state.drafts.length > 0 || state.agentLearningEvents.length > 0) {
          fallbackState = state;
          break;
        }
      } catch {
        // Keep scanning other candidate files.
      }
    }

    return fallbackState;
  } catch {
    return null;
  }
}

async function writeToFile(state: PersistedMemoryState) {
  if (typeof window !== "undefined") {
    return;
  }

  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const filePath = await getMemoryFilePath();

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  } catch (error) {
    console.warn("[admin-ingest-memory:store:write-warning]", {
      message: error instanceof Error ? error.message : String(error ?? "")
    });
  }
}

async function loadState() {
  const fileState = await readFromFile();
  const state = fileState ?? globalMemory.__adminIngestMemoryStateV1 ?? createEmptyState();

  globalMemory.__adminIngestMemoryStateV1 = state;
  return state;
}

async function persistState(state: PersistedMemoryState) {
  const nextState = {
    ...state,
    updatedAt: Date.now()
  };

  globalMemory.__adminIngestMemoryStateV1 = nextState;
  await writeToFile(nextState);
  return nextState;
}

export async function loadMemoryDrafts() {
  const state = await loadState();

  return state.drafts;
}

export async function listMemoryDrafts(input: {
  agentId?: string;
  knowledgeBaseId?: string;
  status?: IngestMemoryStatus;
} = {}) {
  const drafts = await loadMemoryDrafts();

  return drafts
    .filter((draft) => memoryDraftMatchesScope(draft, input))
    .filter((draft) => !input.status || draft.status === input.status)
    .sort((left, right) => (right.updatedAt ?? right.createdAt) - (left.updatedAt ?? left.createdAt));
}

export async function saveMemoryDraft(draft: IngestMemoryItem) {
  const state = await loadState();
  const nextDraft = {
    ...draft,
    meta: {
      ...(draft.meta ?? {}),
      source: "admin-ingest-memory-layer-v1"
    },
    updatedAt: Date.now()
  };
  const drafts = [nextDraft, ...state.drafts.filter((item) => item.id !== draft.id)].slice(0, 500);
  const nextState = await persistState({
    ...state,
    drafts
  });

  return nextState.drafts.find((item) => item.id === nextDraft.id) ?? nextDraft;
}

export async function updateMemoryDraftStatus(id: string, status: IngestMemoryStatus) {
  const state = await loadState();
  const drafts = state.drafts.map((draft) => draft.id === id
    ? { ...draft, status, updatedAt: Date.now() }
    : draft);

  await persistState({ ...state, drafts });
  return drafts.find((draft) => draft.id === id) ?? null;
}

export async function appendAgentLearningEvent(event: IngestAgentLearningEvent) {
  const state = await loadState();
  const agentLearningEvents = [event, ...state.agentLearningEvents.filter((item) => item.id !== event.id)].slice(0, 400);

  await persistState({
    ...state,
    agentLearningEvents
  });

  return event;
}

export async function loadAgentLearningEvents(input: {
  agentId?: string;
  knowledgeBaseId?: string;
} = {}) {
  const state = await loadState();

  return state.agentLearningEvents
    .filter((event) => learningEventMatchesScope(event, input))
    .sort((left, right) => right.createdAt - left.createdAt);
}
