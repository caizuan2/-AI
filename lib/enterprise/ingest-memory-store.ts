import type {
  IngestAgentLearningEvent,
  IngestMemoryItem,
  IngestMemoryStatus
} from "@/lib/enterprise/ingest-memory-types";

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

  return path.join(process.cwd(), "artifacts", "admin-ingest", "memory", "memory-drafts.json");
}

async function readFromFile(): Promise<PersistedMemoryState | null> {
  if (typeof window !== "undefined") {
    return null;
  }

  try {
    const fs = await import("node:fs/promises");
    const filePath = await getMemoryFilePath();
    const raw = await fs.readFile(filePath, "utf8");

    return normalizeState(JSON.parse(raw) as Partial<PersistedMemoryState>);
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
    .filter((draft) => !input.agentId || draft.agentId === input.agentId)
    .filter((draft) => !input.knowledgeBaseId || draft.knowledgeBaseId === input.knowledgeBaseId)
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
    .filter((event) => !input.agentId || event.agentId === input.agentId)
    .filter((event) => !input.knowledgeBaseId || event.knowledgeBaseId === input.knowledgeBaseId)
    .sort((left, right) => right.createdAt - left.createdAt);
}
