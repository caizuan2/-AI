import { normalizeRuntimeOutput } from "./runtime-output-normalizer";
import { buildRuntimeV2MemoryAwareCustomerCopy } from "./runtime-v2-customer-copy-policy";
import { normalizeRuntimeV2Sources } from "./runtime-v2-source-policy";
import { createRuntimeV2TraceId, readRuntimeV2TraceId } from "./runtime-v2-trace";
import type {
  RuntimeV2AgentPolicy,
  RuntimeV2Input,
  RuntimeV2Memory,
  RuntimeV2MemoryTraceItem,
  RuntimeV2Output,
  RuntimeV2Source,
} from "./runtime-v2-types";

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readConfidence(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(1, value));
  }
  return 0.72;
}

function undefinedIfNull(value: string | null | undefined): string | undefined {
  return value ?? undefined;
}

function toLegacyRuntimeInput(input: RuntimeV2Input) {
  return {
    query: input.query,
    userId: undefinedIfNull(input.userId),
    sessionId: undefinedIfNull(input.sessionId),
    conversationId: undefinedIfNull(input.conversationId),
    agentId: undefinedIfNull(input.agentId),
    expertId: undefinedIfNull(input.expertId),
    knowledgeBaseId: undefinedIfNull(input.knowledgeBaseId),
    kbId: undefinedIfNull(input.kbId),
    namespace: undefinedIfNull(input.namespace),
    tenantId: undefinedIfNull(input.tenantId),
    appType: input.appType,
    channel: "chat-ui" as const,
    platform: input.platform === "unknown" ? "web" as const : input.platform,
    messages: input.messages,
  };
}

function mergeSources(raw: unknown, normalizedSources: RuntimeV2Source[]): RuntimeV2Source[] {
  const rawRecord = readRecord(raw);
  const candidates = [
    rawRecord?.sources,
    rawRecord?.runtime_sources,
    rawRecord?.ragSources,
    rawRecord?.rag_sources,
  ];

  for (const candidate of candidates) {
    const next = normalizeRuntimeV2Sources(candidate);
    if (next.length > 0) return next;
  }

  return normalizedSources;
}

export function finalizeRuntimeV2Output(
  rawValue: unknown,
  input: RuntimeV2Input,
  extras?: {
    memories?: RuntimeV2Memory[];
    memoryTrace?: RuntimeV2MemoryTraceItem[];
    memoryWarnings?: string[];
    policies?: RuntimeV2AgentPolicy[];
    sources?: RuntimeV2Source[];
  },
): RuntimeV2Output {
  const legacy = normalizeRuntimeOutput(rawValue, toLegacyRuntimeInput(input));
  const rawRecord = readRecord(rawValue);
  const sources = mergeSources(rawValue, extras?.sources ?? normalizeRuntimeV2Sources(legacy.sources));
  const memories = extras?.memories ?? [];
  const memoryTrace = extras?.memoryTrace ?? [];
  const customerCopy = buildRuntimeV2MemoryAwareCustomerCopy(
    rawRecord?.customerCopy ?? rawRecord?.customer_answer ?? legacy.customerCopy,
    input,
    memories,
  );
  const answer = readText(rawRecord?.answer) || legacy.answer || customerCopy;
  const nextStep =
    readText(rawRecord?.nextStep) ||
    readText(rawRecord?.next_step) ||
    legacy.nextStep ||
    "继续补充客户当前情况，我会给出下一步建议。";
  const traceId =
    readRuntimeV2TraceId(rawValue) ?? legacy.traceId ?? createRuntimeV2TraceId(input.conversationId);

  return {
    ok: true,
    answer,
    customerCopy,
    explanation: readText(rawRecord?.explanation),
    sources,
    traceId,
    confidence: readConfidence(rawRecord?.confidence ?? legacy.confidence),
    nextStep,
    runtimeVersion: "v2",
    memoryApplied: memories.length > 0,
    usedMemoryIds: memories.map((memory) => memory.id),
    memoryTrace,
    memoryWarnings: extras?.memoryWarnings,
    appliedAgentPolicies: (extras?.policies ?? []).map((policy) => policy.id),
    knowledgeBaseId: input.knowledgeBaseId,
    kbId: input.kbId,
    agentId: input.agentId,
    expertId: input.expertId,
    namespace: input.namespace,
    tenantId: input.tenantId,
    raw: rawRecord?.raw,
  };
}

export function ensureCustomerCopy(output: RuntimeV2Output): RuntimeV2Output {
  return output.customerCopy ? output : { ...output, customerCopy: output.answer };
}

export function ensureTraceId(output: RuntimeV2Output): RuntimeV2Output {
  return output.traceId ? output : { ...output, traceId: createRuntimeV2TraceId() };
}

export function ensureSources(output: RuntimeV2Output): RuntimeV2Output {
  return Array.isArray(output.sources) ? output : { ...output, sources: [] };
}

export function stripInternalMetadata(output: RuntimeV2Output): RuntimeV2Output {
  const { raw: _raw, ...safeOutput } = output;
  void _raw;
  return safeOutput;
}

export function ensureSafeCompliance(output: RuntimeV2Output): RuntimeV2Output {
  return output;
}
