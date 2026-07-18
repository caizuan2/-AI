import "server-only";

import type { MemoryIndexState, PublishedMemoryState } from "@/lib/enterprise/ingest-memory-index-types";

export function createEmptyPublishedMemoryState(): PublishedMemoryState {
  return {
    source: "admin-ingest-memory-publish-v1",
    version: 1,
    memories: [],
    updatedAt: Date.now()
  };
}

export function createEmptyMemoryIndexState(): MemoryIndexState {
  return {
    source: "admin-ingest-memory-index-v1",
    version: 1,
    entries: [],
    builtAt: Date.now()
  };
}

function readEnvMemoryDir(): string {
  return (process.env.ADMIN_INGEST_MEMORY_DIR || process.env.AI_KB_ADMIN_INGEST_MEMORY_DIR || "").trim();
}

async function pathExists(pathName: string): Promise<boolean> {
  try {
    const fs = await import("node:fs/promises");

    await fs.access(pathName);
    return true;
  } catch {
    return false;
  }
}

export async function getAdminIngestMemoryDir() {
  const path = await import("node:path");
  const envDir = readEnvMemoryDir();

  if (envDir) {
    return path.isAbsolute(envDir) ? envDir : path.resolve(process.cwd(), envDir);
  }

  if (process.platform !== "win32" && process.cwd().startsWith("/var/www/ai-knowledge-main-")) {
    return "/var/www/ai-knowledge-shared/admin-ingest/memory";
  }

  return path.join(process.cwd(), "artifacts", "admin-ingest", "memory");
}

export async function getAdminIngestMemoryCandidateFilePaths(fileName: string): Promise<string[]> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const candidates: string[] = [];
  const addCandidate = (filePath: string) => {
    if (!candidates.includes(filePath)) {
      candidates.push(filePath);
    }
  };

  addCandidate(path.join(await getAdminIngestMemoryDir(), fileName));
  addCandidate(path.join(process.cwd(), "artifacts", "admin-ingest", "memory", fileName));

  if (process.platform !== "win32") {
    try {
      const entries = await fs.readdir("/var/www", { withFileTypes: true });
      const releaseDirs = entries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith("ai-knowledge-main-"))
        .map((entry) => path.join("/var/www", entry.name));

      for (const releaseDir of releaseDirs) {
        addCandidate(path.join(releaseDir, "artifacts", "admin-ingest", "memory", fileName));
      }
    } catch {
      // Best-effort compatibility for legacy release directories.
    }
  }

  const existing = await Promise.all(candidates.map(async (filePath) => ({
    filePath,
    exists: await pathExists(filePath)
  })));

  return existing.filter((item) => item.exists).map((item) => item.filePath);
}

export async function getPublishedMemoryFilePath() {
  const path = await import("node:path");
  const dir = await getAdminIngestMemoryDir();

  return path.join(dir, "memory-published.json");
}

export async function getMemoryIndexFilePath() {
  const path = await import("node:path");
  const dir = await getAdminIngestMemoryDir();

  return path.join(dir, "memory-index.json");
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  if (typeof window !== "undefined") {
    return null;
  }

  try {
    const fs = await import("node:fs/promises");
    const raw = await fs.readFile(filePath, "utf8");

    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJsonFile(filePath: string, value: unknown) {
  if (typeof window !== "undefined") {
    return;
  }

  const fs = await import("node:fs/promises");
  const path = await import("node:path");

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function readPublishedMemoryState() {
  const filePaths = await getAdminIngestMemoryCandidateFilePaths("memory-published.json");
  let fallbackState: Partial<PublishedMemoryState> | null = null;

  for (const filePath of filePaths) {
    const state = await readJsonFile<Partial<PublishedMemoryState>>(filePath);

    if (!state) {
      continue;
    }

    if (!fallbackState) {
      fallbackState = state;
    }

    if (Array.isArray(state.memories) && state.memories.length > 0) {
      fallbackState = state;
      break;
    }
  }

  return {
    ...createEmptyPublishedMemoryState(),
    ...(fallbackState ?? {}),
    memories: Array.isArray(fallbackState?.memories) ? fallbackState.memories : []
  };
}

export async function writePublishedMemoryState(state: PublishedMemoryState) {
  const filePath = await getPublishedMemoryFilePath();
  await writeJsonFile(filePath, state);
}

export async function readMemoryIndexState() {
  const filePaths = await getAdminIngestMemoryCandidateFilePaths("memory-index.json");
  let fallbackState: Partial<MemoryIndexState> | null = null;

  for (const filePath of filePaths) {
    const state = await readJsonFile<Partial<MemoryIndexState>>(filePath);

    if (!state) {
      continue;
    }

    if (!fallbackState) {
      fallbackState = state;
    }

    if (Array.isArray(state.entries) && state.entries.length > 0) {
      fallbackState = state;
      break;
    }
  }

  return {
    ...createEmptyMemoryIndexState(),
    ...(fallbackState ?? {}),
    entries: Array.isArray(fallbackState?.entries) ? fallbackState.entries : [],
    builtAt: typeof fallbackState?.builtAt === "number" ? fallbackState.builtAt : Date.now()
  };
}

export async function writeMemoryIndexState(state: MemoryIndexState) {
  const filePath = await getMemoryIndexFilePath();
  await writeJsonFile(filePath, state);
}
