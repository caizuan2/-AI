import type {
  RuntimeV2Channel,
  RuntimeV2Input,
  RuntimeV2OutputMode,
  RuntimeV2Platform,
} from "./runtime-v2-types";

export class RuntimeV2GuardError extends Error {
  code = "RUNTIME_V2_SCOPE_INVALID";
}

const OUTPUT_MODES = new Set<RuntimeV2OutputMode>([
  "auto",
  "analysis",
  "explain",
  "faq",
  "sop",
  "customer_reply",
  "sales_closing",
  "sales_followup",
]);

const CHANNELS = new Set<RuntimeV2Channel>(["chat-ui", "knowledge-query"]);
const PLATFORMS = new Set<RuntimeV2Platform>(["web", "exe", "apk", "unknown"]);

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const next = value.trim();
  return next.length > 0 ? next : null;
}

function readOutputMode(value: unknown): RuntimeV2OutputMode {
  return typeof value === "string" && OUTPUT_MODES.has(value as RuntimeV2OutputMode)
    ? (value as RuntimeV2OutputMode)
    : "auto";
}

function readChannel(value: unknown): RuntimeV2Channel {
  return typeof value === "string" && CHANNELS.has(value as RuntimeV2Channel)
    ? (value as RuntimeV2Channel)
    : "chat-ui";
}

function readPlatform(value: unknown): RuntimeV2Platform {
  return typeof value === "string" && PLATFORMS.has(value as RuntimeV2Platform)
    ? (value as RuntimeV2Platform)
    : "web";
}

export function normalizeRuntimeV2Scope(input: Partial<RuntimeV2Input>): RuntimeV2Input {
  return {
    query: cleanText(input.query) ?? "",
    userId: cleanText(input.userId),
    sessionId: cleanText(input.sessionId),
    conversationId: cleanText(input.conversationId),
    agentId: cleanText(input.agentId),
    expertId: cleanText(input.expertId),
    knowledgeBaseId: cleanText(input.knowledgeBaseId),
    kbId: cleanText(input.kbId),
    namespace: cleanText(input.namespace),
    tenantId: cleanText(input.tenantId),
    appType: "user_app",
    channel: readChannel(input.channel),
    platform: readPlatform(input.platform),
    outputMode: readOutputMode(input.outputMode),
    messages: Array.isArray(input.messages)
      ? input.messages
          .map((message) => ({
            role: message?.role === "assistant" ? "assistant" as const : "user" as const,
            content: cleanText(message?.content) ?? "",
          }))
          .filter((message) => message.content)
      : undefined,
  };
}

export const normalizeRuntimeScope = normalizeRuntimeV2Scope;

export function assertRuntimeV2Scope(input: Partial<RuntimeV2Input>): RuntimeV2Input {
  const scope = normalizeRuntimeV2Scope(input);

  if (!scope.query) {
    throw new RuntimeV2GuardError("Runtime v2 query is required.");
  }

  if (scope.appType !== "user_app") {
    throw new RuntimeV2GuardError("Runtime v2 only accepts user_app requests.");
  }

  return scope;
}

export const assertRuntimeScope = assertRuntimeV2Scope;

export function isCrossKnowledgeBaseLeak(input: Partial<RuntimeV2Input>): boolean {
  const scope = normalizeRuntimeV2Scope(input);

  return Boolean(
    scope.knowledgeBaseId &&
    scope.kbId &&
    scope.knowledgeBaseId !== scope.kbId,
  );
}

export function canUseRuntimeV2Memory(
  memory: {
    agentId?: string | null;
    expertId?: string | null;
    knowledgeBaseId?: string | null;
    kbId?: string | null;
    namespace?: string | null;
    tenantId?: string | null;
  },
  scope: RuntimeV2Input,
): boolean {
  const same = (a?: string | null, b?: string | null) => !a || !b || a === b;

  return (
    same(memory.agentId, scope.agentId) &&
    same(memory.expertId, scope.expertId) &&
    same(memory.knowledgeBaseId, scope.knowledgeBaseId) &&
    same(memory.kbId, scope.kbId) &&
    same(memory.namespace, scope.namespace) &&
    same(memory.tenantId, scope.tenantId)
  );
}

export const canUseRuntimeMemory = canUseRuntimeV2Memory;
