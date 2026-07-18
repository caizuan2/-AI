import { runRuntimeV2 } from "./runtime-v2-engine";
import type { RuntimeV2Input, RuntimeV2Output, RuntimeV2OutputMode } from "./runtime-v2-types";

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function readOutputMode(value: unknown): RuntimeV2OutputMode {
  if (
    value === "analysis" ||
    value === "explain" ||
    value === "faq" ||
    value === "sop" ||
    value === "customer_reply" ||
    value === "sales_closing" ||
    value === "sales_followup"
  ) {
    return value;
  }
  return "auto";
}

export function normalizeLegacyRuntimeInput(value: unknown): Partial<RuntimeV2Input> {
  const record = readRecord(value) ?? {};
  const metadata = readRecord(record.metadata) ?? {};
  const runtimeInput = readRecord(record.runtime_input) ?? {};

  return {
    query: readString(runtimeInput.query, record.query, record.message, record.question, record.text) ?? "",
    userId: readString(runtimeInput.userId, record.userId, record.user_id),
    conversationId: readString(
      runtimeInput.conversationId,
      record.conversationId,
      record.conversation_id,
      metadata.conversationId,
    ),
    agentId: readString(runtimeInput.agentId, record.agentId, record.agent_id, metadata.agentId),
    expertId: readString(runtimeInput.expertId, record.expertId, record.expert_id, metadata.expertId),
    knowledgeBaseId: readString(
      runtimeInput.knowledgeBaseId,
      record.knowledgeBaseId,
      record.knowledge_base_id,
      metadata.knowledgeBaseId,
    ),
    kbId: readString(runtimeInput.kbId, record.kbId, record.kb_id, metadata.kbId),
    namespace: readString(runtimeInput.namespace, record.namespace, metadata.namespace),
    tenantId: readString(runtimeInput.tenantId, record.tenantId, record.tenant_id, metadata.tenantId),
    appType: "user_app",
    channel: record.channel === "knowledge-query" ? "knowledge-query" : "chat-ui",
    platform: record.platform === "exe" || record.platform === "apk" ? record.platform : "web",
    outputMode: readOutputMode(runtimeInput.outputMode ?? record.outputMode ?? record.mode),
  };
}

export const normalizeLegacyAskPayload = normalizeLegacyRuntimeInput;

export async function routeUserChatToRuntimeV2(
  rawValue: unknown,
  input?: Partial<RuntimeV2Input>,
): Promise<RuntimeV2Output> {
  return runRuntimeV2(rawValue, {
    ...normalizeLegacyRuntimeInput(rawValue),
    ...input,
    appType: "user_app",
    channel: "chat-ui",
  });
}

export async function routeKnowledgeQueryToRuntimeV2(
  rawValue: unknown,
  input?: Partial<RuntimeV2Input>,
): Promise<RuntimeV2Output> {
  return runRuntimeV2(rawValue, {
    ...normalizeLegacyRuntimeInput(rawValue),
    ...input,
    appType: "user_app",
    channel: "knowledge-query",
  });
}
