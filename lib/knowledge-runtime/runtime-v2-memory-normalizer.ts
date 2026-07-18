import type { RuntimeV2Memory, RuntimeV2Source } from "./runtime-v2-types";

const MAX_MEMORY_CONTENT = 800;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | undefined {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

  return Number.isFinite(numeric) ? numeric : undefined;
}

function compact(value: string | null | undefined): string | null {
  if (!value) return null;
  const next = value.replace(/\s+/g, " ").trim();

  if (!next) return null;

  return next.length > MAX_MEMORY_CONTENT ? `${next.slice(0, MAX_MEMORY_CONTENT).trim()}...` : next;
}

function readRecordString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = readString(record[key]);

    if (value) return value;
  }

  return null;
}

function readMetadataString(source: RuntimeV2Source, keys: string[]): string | null {
  for (const key of keys) {
    const value = readString(source.metadata?.[key]);

    if (value) return value;
  }

  return null;
}

function stableId(prefix: string, value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }

  return `${prefix}_${Math.abs(hash).toString(36)}`;
}

export function normalizeRuntimeV2MemoryCandidate(
  value: unknown,
  origin: RuntimeV2Memory["origin"] = "explicit",
): RuntimeV2Memory | null {
  if (!isRecord(value)) return null;

  const content = compact(readRecordString(value, [
    "content",
    "summary",
    "snippet",
    "safeSnippet",
    "contentPreview",
    "answer",
    "customerCopy",
    "customer_copy",
  ]));
  const title = readRecordString(value, ["title", "name", "label", "sourceTitle"]);

  if (!content && !title) return null;

  const fallbackId = stableId(`memory_${origin}`, `${title ?? ""}:${content ?? ""}`);
  const knowledgeBaseId = readRecordString(value, [
    "knowledgeBaseId",
    "knowledge_base_id",
    "kbId",
    "kb_id",
  ]);
  const kbId = readRecordString(value, [
    "kbId",
    "kb_id",
    "knowledgeBaseId",
    "knowledge_base_id",
  ]);
  const agentId = readRecordString(value, [
    "agentId",
    "agent_id",
    "expertId",
    "expert_id",
  ]);
  const expertId = readRecordString(value, [
    "expertId",
    "expert_id",
    "agentId",
    "agent_id",
  ]);

  return {
    id: readRecordString(value, ["id", "memoryId", "memory_id", "chunkId", "chunk_id"]) ?? fallbackId,
    title: title ?? undefined,
    content: content ?? title ?? "",
    score: readNumber(value.score) ?? readNumber(value.relevance_score) ?? readNumber(value.similarity),
    agentId,
    expertId,
    knowledgeBaseId,
    kbId,
    namespace: readRecordString(value, ["namespace"]),
    tenantId: readRecordString(value, ["tenantId", "tenant_id"]),
    source: readRecordString(value, ["source", "sourceId", "source_id", "fileId", "file_id"]),
    sourceApp: readRecordString(value, ["sourceApp", "source_app"]),
    origin,
  };
}

export function normalizeRuntimeV2MemoryCandidates(
  value: unknown,
  origin: RuntimeV2Memory["origin"] = "explicit",
): RuntimeV2Memory[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeRuntimeV2MemoryCandidate(item, origin))
      .filter((item): item is RuntimeV2Memory => Boolean(item));
  }

  const single = normalizeRuntimeV2MemoryCandidate(value, origin);

  return single ? [single] : [];
}

export function sourceToRuntimeV2Memory(source: RuntimeV2Source, index: number): RuntimeV2Memory | null {
  const content = compact(source.safeSnippet ?? source.snippet ?? source.contentPreview ?? null);
  const title = source.title ?? source.id ?? `source-${index + 1}`;

  if (!content && !title) return null;

  return {
    id: source.id ?? stableId("memory_source", `${title}:${content ?? ""}`),
    title,
    content: content ?? title,
    score: source.score,
    agentId: source.agentId ?? readMetadataString(source, ["agentId", "agent_id", "expertId", "expert_id"]),
    expertId: source.expertId ?? readMetadataString(source, ["expertId", "expert_id", "agentId", "agent_id"]),
    knowledgeBaseId: source.knowledgeBaseId ?? readMetadataString(source, [
      "knowledgeBaseId",
      "knowledge_base_id",
      "kbId",
      "kb_id",
    ]),
    kbId: source.kbId ?? readMetadataString(source, [
      "kbId",
      "kb_id",
      "knowledgeBaseId",
      "knowledge_base_id",
    ]),
    namespace: source.namespace ?? readMetadataString(source, ["namespace"]),
    tenantId: source.tenantId ?? readMetadataString(source, ["tenantId", "tenant_id"]),
    source: source.id ?? null,
    sourceApp: source.sourceApp ?? readMetadataString(source, ["sourceApp", "source_app"]),
    origin: "source",
  };
}
