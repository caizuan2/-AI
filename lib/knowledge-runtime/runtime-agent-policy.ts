import type { KnowledgeRuntimeInput } from "./runtime-types";

function clean(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function normalizeRuntimeScope(input: Partial<KnowledgeRuntimeInput>): Partial<KnowledgeRuntimeInput> {
  return {
    query: clean(input.query) ?? "",
    userId: clean(input.userId),
    sessionId: clean(input.sessionId),
    conversationId: clean(input.conversationId),
    agentId: clean(input.agentId ?? input.expertId),
    expertId: clean(input.expertId ?? input.agentId),
    knowledgeBaseId: clean(input.knowledgeBaseId ?? input.kbId),
    kbId: clean(input.kbId ?? input.knowledgeBaseId),
    namespace: clean(input.namespace),
    tenantId: clean(input.tenantId),
    appType: "user_app",
    channel: "chat-ui",
    platform: input.platform ?? "web",
    messages: input.messages
  };
}
