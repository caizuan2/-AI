import { ValidationError } from "@/lib/errors";
import {
  KNOWLEDGE_CANDIDATE_SOURCE_TYPES,
  KNOWLEDGE_CANDIDATE_STATUSES,
  KNOWLEDGE_FEEDBACK_TYPES,
  type CreateKnowledgeFeedbackInput,
  type ExtractKnowledgeInput,
  type KnowledgeCandidateSourceType,
  type OptimizeKnowledgeInput,
  type ReviewKnowledgeInput
} from "@/apps/team-os/features/ai-brain/types";

function record(value: unknown, label = "请求体"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError(`${label}必须是 JSON 对象。`);
  }
  return value as Record<string, unknown>;
}

function onlyKeys(value: Record<string, unknown>, keys: string[], label = "请求") {
  const allowed = new Set(keys);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new ValidationError(`${label}包含不支持的字段：${unknown.join("、")}。`);
}

function text(value: unknown, label: string, maxLength: number, optional = false) {
  if ((value === undefined || value === null || value === "") && optional) return undefined;
  if (typeof value !== "string" || !value.trim()) throw new ValidationError(`${label}不能为空。`);
  const normalized = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").trim();
  if (normalized.length > maxLength) throw new ValidationError(`${label}不能超过 ${maxLength} 个字符。`);
  return normalized;
}

function enumValue<T extends readonly string[]>(value: unknown, allowed: T, label: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) throw new ValidationError(`${label}不正确。`);
  return value as T[number];
}

export function parseExtractKnowledgeInput(value: unknown): ExtractKnowledgeInput {
  const body = record(value);
  onlyKeys(body, ["companyId", "teamId", "sourceType", "sourceId"]);
  return {
    companyId: text(body.companyId, "企业 ID", 120, true),
    teamId: text(body.teamId, "团队 ID", 120, true),
    sourceType: enumValue(body.sourceType, KNOWLEDGE_CANDIDATE_SOURCE_TYPES, "来源类型"),
    sourceId: text(body.sourceId, "来源记录 ID", 160)!
  };
}

export function parseKnowledgeFeedbackInput(value: unknown): CreateKnowledgeFeedbackInput {
  const body = record(value);
  onlyKeys(body, ["companyId", "teamId", "question", "answer", "feedbackType", "comment"]);
  const feedbackType = enumValue(body.feedbackType, KNOWLEDGE_FEEDBACK_TYPES, "反馈类型");
  const answer = text(body.answer, "AI 回答", 10_000, feedbackType === "MISSING");
  return {
    companyId: text(body.companyId, "企业 ID", 120, true),
    teamId: text(body.teamId, "团队 ID", 120, true),
    question: text(body.question, "问题", 2_000)!,
    answer: answer ?? "AI 未提供有效答案。",
    feedbackType,
    comment: text(body.comment, "补充说明", 2_000, true)
  };
}

export function parseOptimizeKnowledgeInput(value: unknown): OptimizeKnowledgeInput {
  const body = record(value);
  onlyKeys(body, ["companyId"]);
  return { companyId: text(body.companyId, "企业 ID", 120, true) };
}

export function parseReviewKnowledgeInput(value: unknown): ReviewKnowledgeInput {
  const body = record(value);
  onlyKeys(body, ["companyId", "candidateId", "decision", "note"]);
  return {
    companyId: text(body.companyId, "企业 ID", 120, true),
    candidateId: text(body.candidateId, "候选知识 ID", 160)!,
    decision: enumValue(body.decision, ["APPROVE", "REJECT"] as const, "审核结果"),
    note: text(body.note, "审核说明", 2_000, true)
  };
}

function assertQueryKeys(params: URLSearchParams, allowed: string[]) {
  const allow = new Set(allowed);
  const keys = Array.from(new Set(params.keys()));
  const unknown = keys.filter((key) => !allow.has(key));
  if (unknown.length > 0) throw new ValidationError(`查询参数包含不支持的字段：${unknown.join("、")}。`);
  for (const key of keys) {
    if (params.getAll(key).length > 1) throw new ValidationError(`查询参数 ${key} 不能重复。`);
  }
}

function queryText(params: URLSearchParams, key: string, label: string) {
  const value = params.get(key);
  if (value !== null && !value.trim()) throw new ValidationError(`${label}不能为空。`);
  return value?.trim() || undefined;
}

export function parseCandidateQuery(params: URLSearchParams) {
  assertQueryKeys(params, ["companyId", "status", "sourceType", "limit"]);
  const rawLimit = params.get("limit");
  const limit = rawLimit === null ? 50 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new ValidationError("候选知识数量必须是 1-100 之间的整数。");
  }
  const status = queryText(params, "status", "候选状态");
  const sourceType = queryText(params, "sourceType", "来源类型");
  return {
    companyId: queryText(params, "companyId", "企业 ID"),
    status: status ? enumValue(status, KNOWLEDGE_CANDIDATE_STATUSES, "候选状态") : undefined,
    sourceType: sourceType
      ? enumValue(sourceType, KNOWLEDGE_CANDIDATE_SOURCE_TYPES, "来源类型") as KnowledgeCandidateSourceType
      : undefined,
    limit
  };
}

export function parseBrainListQuery(params: URLSearchParams) {
  assertQueryKeys(params, ["companyId", "limit"]);
  const rawLimit = params.get("limit");
  const limit = rawLimit === null ? 100 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new ValidationError("记录数量必须是 1-100 之间的整数。");
  }
  return { companyId: queryText(params, "companyId", "企业 ID"), limit };
}
