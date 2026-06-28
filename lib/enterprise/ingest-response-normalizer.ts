"use client";

export type NormalizedIngestSuccessPayload = {
  ok: true;
  replyText: string;
  provider?: string;
  actualModel?: string;
  requestedModel?: string;
  fallback?: boolean;
  records?: unknown[];
  jobId?: string;
  knowledgeItemId?: string;
  raw: Record<string, unknown>;
};

export type NormalizedIngestErrorPayload = {
  ok: false;
  status?: number;
  errorCode?: string;
  message: string;
  provider?: string;
  actualModel?: string;
  requestId?: string;
  raw?: unknown;
};

const responseFields = [
  "jobId",
  "trainingRecord",
  "records",
  "provider",
  "model",
  "requestedModel",
  "actualModel",
  "responseId",
  "proofId",
  "createdAt",
  "usage",
  "gptProof",
  "modelDisplayName",
  "modelMode",
  "fallback",
  "fallbackUsed",
  "selectedModelLabel",
  "content",
  "answer",
  "reply",
  "visibleReply",
  "message",
  "replyMarkdown",
  "knowledgeDraft",
  "knowledgeLoop",
  "evolution",
  "storeDecision",
  "reusableKnowledgeUnits",
  "reviewRequiredUnits",
  "autoStoreCandidates",
  "memory",
  "memoryPlan",
  "knowledgeIntelligence",
  "ragOptimization",
  "metadata",
  "userClientCallPlan",
  "sourceFiles",
  "suggestedQuestions",
  "saveRecommendation",
  "diagnostics",
  "gptOS",
  "autonomousResult",
  "structured",
  "sync",
  "knowledgeItemId",
  "storedCount",
  "chunkCount",
  "indexedCount"
] as const;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : undefined;
}

function readAtPath(input: unknown, path: string[]) {
  let current = input;

  for (const key of path) {
    if (!isPlainRecord(current)) {
      return undefined;
    }

    current = current[key];
  }

  return current;
}

export function mergeIngestResponsePayload(input: unknown): Record<string, unknown> | null {
  if (!isPlainRecord(input)) {
    return null;
  }

  const merged: Record<string, unknown> = {};
  const candidates = [
    input,
    readAtPath(input, ["payload"]),
    readAtPath(input, ["payload", "data"]),
    readAtPath(input, ["data"]),
    readAtPath(input, ["data", "payload"]),
    readAtPath(input, ["data", "payload", "data"]),
    readAtPath(input, ["result"]),
    readAtPath(input, ["payload", "result"]),
    readAtPath(input, ["data", "result"])
  ];

  for (const candidate of candidates) {
    if (!isPlainRecord(candidate)) {
      continue;
    }

    for (const field of responseFields) {
      if (candidate[field] !== undefined) {
        merged[field] = candidate[field];
      }
    }

    if (candidate.ok !== undefined) {
      merged.ok = candidate.ok;
    }

    if (candidate.success !== undefined) {
      merged.success = candidate.success;
    }

    if (candidate.error !== undefined) {
      merged.error = candidate.error;
    }

    if (candidate.errorCode !== undefined) {
      merged.errorCode = candidate.errorCode;
    }

    if (candidate.requestId !== undefined) {
      merged.requestId = candidate.requestId;
    }
  }

  return Object.keys(merged).length > 0 ? merged : { ...input };
}

export function extractIngestReplyText(data: unknown) {
  const paths = [
    ["replyMarkdown"],
    ["content"],
    ["answer"],
    ["reply"],
    ["message", "content"],
    ["result", "content"],
    ["result", "answer"],
    ["payload", "replyMarkdown"],
    ["payload", "content"],
    ["payload", "answer"],
    ["payload", "reply"],
    ["payload", "message", "content"],
    ["payload", "data", "replyMarkdown"],
    ["payload", "data", "content"],
    ["payload", "data", "answer"],
    ["payload", "data", "reply"],
    ["payload", "data", "message", "content"],
    ["data", "replyMarkdown"],
    ["data", "content"],
    ["data", "answer"],
    ["data", "reply"],
    ["data", "message", "content"],
    ["data", "payload", "replyMarkdown"],
    ["data", "payload", "content"],
    ["data", "payload", "answer"],
    ["data", "payload", "reply"],
    ["data", "payload", "data", "replyMarkdown"],
    ["data", "payload", "data", "content"],
    ["data", "payload", "data", "answer"],
    ["data", "payload", "data", "reply"]
  ];

  for (const path of paths) {
    const value = readString(readAtPath(data, path));

    if (value) {
      return value;
    }
  }

  if (typeof readAtPath(data, ["message"]) === "string") {
    return readString(readAtPath(data, ["message"]));
  }

  return "";
}

export function isSuccessfulIngestResponse(httpOk: boolean, data: unknown) {
  if (!httpOk) {
    return false;
  }

  const merged = mergeIngestResponsePayload(data);
  const replyText = extractIngestReplyText(data) || extractIngestReplyText(merged);
  const records = readArray(merged?.records);

  return Boolean(
    replyText
    || merged?.ok === true
    || merged?.success === true
    || readAtPath(data, ["payload", "ok"]) === true
    || readAtPath(data, ["payload", "success"]) === true
    || readAtPath(data, ["data", "ok"]) === true
    || readAtPath(data, ["data", "success"]) === true
    || (records && records.length > 0)
    || (readString(merged?.jobId) && !merged?.error)
    || (readString(merged?.knowledgeItemId) && !merged?.error)
  );
}

export function normalizeIngestSuccessPayload(data: unknown): NormalizedIngestSuccessPayload | null {
  const raw = mergeIngestResponsePayload(data);

  if (!raw) {
    return null;
  }

  const replyText = extractIngestReplyText(data) || extractIngestReplyText(raw);
  const fallback = readBoolean(raw.fallback) ?? readBoolean(raw.fallbackUsed);

  return {
    ok: true,
    replyText,
    provider: readString(raw.provider) || undefined,
    actualModel: readString(raw.actualModel) || readString(raw.model) || undefined,
    requestedModel: readString(raw.requestedModel) || undefined,
    fallback,
    records: readArray(raw.records),
    jobId: readString(raw.jobId) || undefined,
    knowledgeItemId: readString(raw.knowledgeItemId) || undefined,
    raw
  };
}

export function normalizeIngestErrorPayload(
  response: Pick<Response, "status"> | null | undefined,
  data: unknown,
  error?: unknown
): NormalizedIngestErrorPayload {
  const raw = mergeIngestResponsePayload(data);
  const nestedError = isPlainRecord(raw?.error) ? raw.error : null;
  const errorMessage = error instanceof Error ? error.message : "";
  const message = readString(raw?.message)
    || readString(nestedError?.message)
    || errorMessage
    || "AI服务暂时不稳定，请稍后再试。";

  return {
    ok: false,
    status: response?.status,
    errorCode: readString(raw?.errorCode) || readString(nestedError?.code) || (error instanceof Error ? error.name : undefined),
    message,
    provider: readString(raw?.provider) || undefined,
    actualModel: readString(raw?.actualModel) || readString(raw?.model) || undefined,
    requestId: readString(raw?.requestId) || readString(raw?.responseId) || undefined,
    raw: data
  };
}
