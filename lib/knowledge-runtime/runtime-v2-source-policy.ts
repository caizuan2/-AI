import { normalizeRuntimeSources } from "./runtime-source-normalizer";
import type { RuntimeV2Source } from "./runtime-v2-types";

const MAX_SNIPPET_LENGTH = 160;

function compactSnippet(value?: string): string | undefined {
  if (!value) return undefined;
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return undefined;
  return compact.length > MAX_SNIPPET_LENGTH
    ? `${compact.slice(0, MAX_SNIPPET_LENGTH)}...`
    : compact;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readMetadataString(source: { metadata?: Record<string, unknown> }, key: string): string | null {
  return readString(source.metadata?.[key]);
}

export function normalizeRuntimeV2Sources(value: unknown): RuntimeV2Source[] {
  return normalizeRuntimeSources(value).map((source) => ({
    id: source.id,
    title: source.title,
    type: source.type,
    score: source.score,
    snippet: compactSnippet(source.snippet),
    safeSnippet: compactSnippet(source.snippet),
    contentPreview: compactSnippet(source.snippet),
    metadata: source.metadata,
    sourceApp: readMetadataString(source, "sourceApp") ?? readMetadataString(source, "source_app"),
    knowledgeBaseId:
      readMetadataString(source, "knowledgeBaseId") ??
      readMetadataString(source, "knowledge_base_id") ??
      readMetadataString(source, "kbId") ??
      readMetadataString(source, "kb_id"),
    kbId:
      readMetadataString(source, "kbId") ??
      readMetadataString(source, "kb_id") ??
      readMetadataString(source, "knowledgeBaseId") ??
      readMetadataString(source, "knowledge_base_id"),
    agentId:
      readMetadataString(source, "agentId") ??
      readMetadataString(source, "agent_id") ??
      readMetadataString(source, "expertId") ??
      readMetadataString(source, "expert_id"),
    expertId:
      readMetadataString(source, "expertId") ??
      readMetadataString(source, "expert_id") ??
      readMetadataString(source, "agentId") ??
      readMetadataString(source, "agent_id"),
    namespace: readMetadataString(source, "namespace"),
    tenantId:
      readMetadataString(source, "tenantId") ??
      readMetadataString(source, "tenant_id"),
  }));
}
