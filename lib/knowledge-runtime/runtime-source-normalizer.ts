import type { KnowledgeRuntimeSource } from "./runtime-types";

type UnknownRecord = Record<string, unknown>;

const SENSITIVE_METADATA_KEYS = new Set([
  "path",
  "filePath",
  "localPath",
  "absolutePath",
  "password",
  "token",
  "secret",
  "apiKey",
  "DATABASE_URL",
  "DIRECT_URL"
]);

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown) {
  const numericValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

  return Number.isFinite(numericValue) ? numericValue : undefined;
}

function cleanSnippet(value: unknown) {
  return readString(value)
    .replace(/\s+/g, " ")
    .replace(/[A-Za-z]:\\[^\s]+/g, "")
    .slice(0, 240)
    .trim();
}

function cleanMetadata(record: UnknownRecord) {
  const metadata: UnknownRecord = {};

  for (const [key, value] of Object.entries(record)) {
    if (SENSITIVE_METADATA_KEYS.has(key)) {
      continue;
    }

    if (["string", "number", "boolean"].includes(typeof value) || value === null) {
      metadata[key] = value;
    }
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function sourceTypeFromRecord(record: UnknownRecord): KnowledgeRuntimeSource["type"] {
  const rawType = readString(record.type || record.kind || record.sourceType).toLowerCase();

  if (["knowledge", "memory", "faq", "sop", "case", "risk", "rag"].includes(rawType)) {
    return rawType as KnowledgeRuntimeSource["type"];
  }

  return readString(record.sourceApp) ? "rag" : "unknown";
}

function normalizeOneSource(value: unknown): KnowledgeRuntimeSource | null {
  if (!isRecord(value)) {
    const text = cleanSnippet(value);

    return text ? { title: text, type: "unknown", snippet: text } : null;
  }

  const id = readString(value.id) ||
    readString(value.chunk_id) ||
    readString(value.item_id) ||
    readString(value.file_id) ||
    readString(value.knowledgeBaseId) ||
    readString(value.kb_id);
  const title = readString(value.title) ||
    readString(value.name) ||
    readString(value.file_name) ||
    readString(value.source) ||
    "知识来源";
  const snippet = cleanSnippet(value.snippet) ||
    cleanSnippet(value.content_preview) ||
    cleanSnippet(value.contentPreview) ||
    cleanSnippet(value.summary) ||
    cleanSnippet(value.content);
  const score = readNumber(value.score) ?? readNumber(value.relevance_score);

  return {
    ...(id ? { id } : {}),
    title,
    type: sourceTypeFromRecord(value),
    ...(score !== undefined ? { score } : {}),
    ...(snippet ? { snippet } : {}),
    metadata: cleanMetadata(value)
  };
}

export function normalizeRuntimeSources(rawSources: unknown, limit = 5): KnowledgeRuntimeSource[] {
  const values = Array.isArray(rawSources) ? rawSources : rawSources ? [rawSources] : [];
  const seen = new Set<string>();
  const sources: KnowledgeRuntimeSource[] = [];

  for (const value of values) {
    const source = normalizeOneSource(value);

    if (!source) {
      continue;
    }

    const key = [
      source.id ?? "",
      source.title ?? "",
      source.snippet ?? ""
    ].join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    sources.push(source);

    if (sources.length >= limit) {
      break;
    }
  }

  return sources;
}
