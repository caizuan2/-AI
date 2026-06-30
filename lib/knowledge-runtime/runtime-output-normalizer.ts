import {
  type KnowledgeRuntimeInput,
  type KnowledgeRuntimeOutput
} from "./runtime-types";
import { normalizeRuntimeSources } from "./runtime-source-normalizer";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readRecord(value: unknown) {
  return isRecord(value) ? value : {};
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown) {
  const numericValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

  return Number.isFinite(numericValue) ? numericValue : undefined;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const text = readString(value);

    if (text) {
      return text;
    }
  }

  return "";
}

function buildTraceId(raw: UnknownRecord) {
  return firstString(
    raw.traceId,
    raw.trace_id,
    raw.gptOsTraceId,
    raw.requestId,
    readRecord(raw.feedback_meta).trace_id
  ) || `runtime_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function cleanCustomerCopy(value: string) {
  return value
    .replace(/【[^】]*(?:分析|策略|意图|诊断|系统|模型|路由|知识库)[^】]*】/g, "")
    .replace(/\b(?:traceId|trace_id|sourceApp|ingest_admin|admin_ingest|model_select|fallback_chain)\b[^\n]*/gi, "")
    .replace(/根据(?:知识库|资料|系统)(?:显示|检索|命中)[，,]?\s*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncateCustomerCopy(value: string) {
  const normalized = cleanCustomerCopy(value);

  if (normalized.length <= 300) {
    return normalized;
  }

  return `${normalized.slice(0, 300).replace(/[，。；、\s]+$/g, "")}。`;
}

function deriveCustomerCopy(answer: string) {
  const sections = [
    /【(?:标准回复话术|可直接复制给客户的话术|客户对话|成交话术)】([\s\S]*?)(?=\n?【|$)/i,
    /(?:客户可以这样回复|可以这样说|建议这样回复)[:：]\s*([\s\S]*?)(?=\n{2,}|$)/i
  ];

  for (const pattern of sections) {
    const match = answer.match(pattern);
    const text = truncateCustomerCopy(match?.[1] ?? "");

    if (text) {
      return text;
    }
  }

  const sentences = answer
    .split(/(?<=[。！？；;])|\n+/)
    .map((line) => cleanCustomerCopy(line))
    .filter((line) => line.length >= 8 && !/^(判断|分析|建议|下一步)/.test(line));

  return truncateCustomerCopy(sentences.slice(0, 4).join(""));
}

function getNestedSources(raw: UnknownRecord) {
  const finalizedAnswer = readRecord(raw.finalized_answer);

  return raw.sources ??
    raw.ragSources ??
    raw.rag_source ??
    raw.evidence ??
    finalizedAnswer.sources ??
    [];
}

export function normalizeRuntimeOutput(
  rawValue: unknown,
  input: Partial<KnowledgeRuntimeInput> = {}
): KnowledgeRuntimeOutput {
  const raw = readRecord(rawValue);
  const finalizedAnswer = readRecord(raw.finalized_answer);
  const answer = firstString(
    raw.answer,
    raw.final_answer,
    raw.finalized_answer,
    raw.content,
    raw.reply,
    readRecord(raw.message).content
  );
  const customerCopy = firstString(
    raw.customerCopy,
    raw.customer_copy,
    raw.customer_answer,
    raw.customerReply,
    finalizedAnswer.customerReply,
    finalizedAnswer.customer_copy
  ) || deriveCustomerCopy(answer);
  const explanation = firstString(
    raw.explanation,
    finalizedAnswer.problemUnderstanding,
    finalizedAnswer.evidenceSummary
  );
  const nextStep = firstString(
    raw.nextStep,
    raw.next_step,
    finalizedAnswer.nextAction
  );
  const sources = normalizeRuntimeSources(getNestedSources(raw));
  const confidence = readNumber(raw.confidence) ??
    readNumber(raw.relevance_score) ??
    readNumber(raw.answer_grounding_score);

  return {
    ok: !raw.errorCode,
    answer,
    customerCopy,
    ...(explanation ? { explanation } : {}),
    ...(nextStep ? { nextStep } : {}),
    ...(confidence !== undefined ? { confidence } : {}),
    sources,
    usedMemoryIds: [],
    agentId: input.agentId ?? firstString(raw.agentId, finalizedAnswer.agentId),
    expertId: input.expertId ?? firstString(raw.expert_id, raw.expertId),
    knowledgeBaseId: input.knowledgeBaseId ?? firstString(raw.knowledgeBaseId, raw.kb_id),
    kbId: input.kbId ?? firstString(raw.kbId, raw.kb_id),
    namespace: input.namespace ?? firstString(raw.namespace),
    tenantId: input.tenantId ?? firstString(raw.tenantId, raw.tenant_id),
    traceId: buildTraceId(raw),
    errorCode: firstString(raw.errorCode) || undefined,
    reason: firstString(raw.reason) || undefined
  };
}
