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

export async function getAdminIngestMemoryDir() {
  const path = await import("node:path");

  return path.join(process.cwd(), "artifacts", "admin-ingest", "memory");
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
  const filePath = await getPublishedMemoryFilePath();
  const state = await readJsonFile<Partial<PublishedMemoryState>>(filePath);

  return {
    ...createEmptyPublishedMemoryState(),
    ...(state ?? {}),
    memories: Array.isArray(state?.memories) ? state.memories : []
  };
}

export async function writePublishedMemoryState(state: PublishedMemoryState) {
  const filePath = await getPublishedMemoryFilePath();
  await writeJsonFile(filePath, state);
}

export async function readMemoryIndexState() {
  const filePath = await getMemoryIndexFilePath();
  const state = await readJsonFile<Partial<MemoryIndexState>>(filePath);

  return {
    ...createEmptyMemoryIndexState(),
    ...(state ?? {}),
    entries: Array.isArray(state?.entries) ? state.entries : [],
    builtAt: typeof state?.builtAt === "number" ? state.builtAt : Date.now()
  };
}

export async function writeMemoryIndexState(state: MemoryIndexState) {
  const filePath = await getMemoryIndexFilePath();
  await writeJsonFile(filePath, state);
}
