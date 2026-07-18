import type {
  KnowledgeRuntimeInput,
  KnowledgeRuntimeSource
} from "./runtime-types";

function line(label: string, value?: string) {
  return value ? `${label}: ${value}` : "";
}

export function buildRuntimePromptContext(
  input: Partial<KnowledgeRuntimeInput>,
  sources: KnowledgeRuntimeSource[] = [],
  memories: KnowledgeRuntimeSource[] = []
) {
  const recentMessages = (input.messages ?? [])
    .slice(-12)
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");
  const sourceSummary = sources
    .slice(0, 5)
    .map((source, index) => `${index + 1}. ${source.title}${source.snippet ? ` - ${source.snippet}` : ""}`)
    .join("\n");
  const memorySummary = memories
    .slice(0, 5)
    .map((memory, index) => `${index + 1}. ${memory.title}${memory.snippet ? ` - ${memory.snippet}` : ""}`)
    .join("\n");

  return [
    line("Agent", input.agentId ?? input.expertId),
    line("KnowledgeBase", input.knowledgeBaseId ?? input.kbId),
    line("Namespace", input.namespace),
    line("Tenant", input.tenantId),
    sourceSummary ? `RAG sources:\n${sourceSummary}` : "",
    memorySummary ? `Runtime memories:\n${memorySummary}` : "",
    recentMessages ? `Recent messages:\n${recentMessages}` : "",
    line("Current question", input.query)
  ].filter(Boolean).join("\n\n");
}
