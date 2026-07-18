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

export type NormalizedIngestResult = {
  type: "success" | "auth_failure" | "model_health_failure" | "ingest_failure";
  ok: boolean;
  replyText: string;
  status?: number;
  errorCode?: string;
  message: string;
  provider?: string;
  actualModel?: string;
  requestedModel?: string;
  fallback?: boolean;
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
    ["knowledgeDraft", "replyMarkdown"],
    ["knowledgeDraft", "summary"],
    ["knowledgeDraft", "standardAnswer"],
    ["knowledgeDraft", "answer"],
    ["result", "replyMarkdown"],
    ["result", "content"],
    ["result", "answer"],
    ["result", "reply"],
    ["result", "knowledgeDraft", "replyMarkdown"],
    ["result", "knowledgeDraft", "summary"],
    ["result", "knowledgeDraft", "standardAnswer"],
    ["payload", "replyMarkdown"],
    ["payload", "content"],
    ["payload", "answer"],
    ["payload", "reply"],
    ["payload", "message", "content"],
    ["payload", "knowledgeDraft", "replyMarkdown"],
    ["payload", "knowledgeDraft", "summary"],
    ["payload", "knowledgeDraft", "standardAnswer"],
    ["payload", "data", "replyMarkdown"],
    ["payload", "data", "content"],
    ["payload", "data", "answer"],
    ["payload", "data", "reply"],
    ["payload", "data", "message", "content"],
    ["payload", "data", "knowledgeDraft", "replyMarkdown"],
    ["payload", "data", "knowledgeDraft", "summary"],
    ["payload", "data", "knowledgeDraft", "standardAnswer"],
    ["data", "replyMarkdown"],
    ["data", "content"],
    ["data", "answer"],
    ["data", "reply"],
    ["data", "message", "content"],
    ["data", "knowledgeDraft", "replyMarkdown"],
    ["data", "knowledgeDraft", "summary"],
    ["data", "knowledgeDraft", "standardAnswer"],
    ["data", "payload", "replyMarkdown"],
    ["data", "payload", "content"],
    ["data", "payload", "answer"],
    ["data", "payload", "reply"],
    ["data", "payload", "knowledgeDraft", "replyMarkdown"],
    ["data", "payload", "knowledgeDraft", "summary"],
    ["data", "payload", "knowledgeDraft", "standardAnswer"],
    ["data", "payload", "data", "replyMarkdown"],
    ["data", "payload", "data", "content"],
    ["data", "payload", "data", "answer"],
    ["data", "payload", "data", "reply"],
    ["data", "payload", "data", "knowledgeDraft", "replyMarkdown"],
    ["data", "payload", "data", "knowledgeDraft", "summary"],
    ["data", "payload", "data", "knowledgeDraft", "standardAnswer"]
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
    || (Boolean(merged?.knowledgeDraft) && !merged?.error)
  );
}

function getResponseStatus(responseOrStatus: Pick<Response, "status" | "ok"> | number | null | undefined) {
  return typeof responseOrStatus === "number" ? responseOrStatus : responseOrStatus?.status;
}

function getResponseOk(responseOrStatus: Pick<Response, "status" | "ok"> | number | null | undefined) {
  if (typeof responseOrStatus === "number") {
    return responseOrStatus >= 200 && responseOrStatus < 300;
  }

  if (typeof responseOrStatus?.ok === "boolean") {
    return responseOrStatus.ok;
  }

  const status = responseOrStatus?.status;

  return typeof status === "number" ? status >= 200 && status < 300 : false;
}

function collectTextSignals(data: unknown, error?: unknown) {
  const raw = mergeIngestResponsePayload(data);
  const nestedError = isPlainRecord(raw?.error) ? raw.error : null;
  const parts = [
    readString(raw?.errorCode),
    readString(nestedError?.code),
    readString(raw?.code),
    readString(raw?.message),
    readString(nestedError?.message),
    readString(raw?.status),
    error instanceof Error ? error.name : "",
    error instanceof Error ? error.message : "",
    typeof error === "string" ? error : ""
  ];

  return parts.filter(Boolean).join(" ").toLowerCase();
}

export function isIngestSuccessState(
  responseOrStatus: Pick<Response, "status" | "ok"> | number | null | undefined,
  data: unknown
) {
  return isSuccessfulIngestResponse(getResponseOk(responseOrStatus), data);
}

export function isAuthFailure(
  responseOrStatus: Pick<Response, "status" | "ok"> | number | null | undefined,
  data: unknown,
  error?: unknown
) {
  const status = getResponseStatus(responseOrStatus);
  const raw = mergeIngestResponsePayload(data);
  const text = collectTextSignals(data, error);
  const authenticated = readAtPath(data, ["data", "authenticated"]) ?? readAtPath(data, ["authenticated"]) ?? raw?.authenticated;
  const hasIngestAccess = readAtPath(data, ["data", "hasIngestAccess"]) ?? readAtPath(data, ["hasIngestAccess"]) ?? raw?.hasIngestAccess;

  return status === 401
    || status === 403
    || text.includes("auth_required")
    || text.includes("invalid_session")
    || text.includes("no_ingest_access")
    || text.includes("license_app_type_mismatch")
    || text.includes("unauthorized")
    || text.includes("forbidden")
    || text.includes("请先登录")
    || text.includes("重新登录")
    || text.includes("登录状态")
    || text.includes("没有权限")
    || text.includes("不能访问")
    || authenticated === false
    || hasIngestAccess === false;
}

export function isModelHealthFailure(
  responseOrStatus: Pick<Response, "status" | "ok"> | number | null | undefined,
  data: unknown,
  error?: unknown
) {
  const raw = mergeIngestResponsePayload(data);
  const text = collectTextSignals(data, error);
  const requestTested = readAtPath(data, ["requestTested"]) ?? readAtPath(data, ["data", "requestTested"]) ?? raw?.requestTested;
  const configured = readAtPath(data, ["configured"]) ?? readAtPath(data, ["data", "configured"]) ?? raw?.configured;

  return text.includes("health")
    || text.includes("模型健康")
    || text.includes("provider unavailable")
    || text.includes("model disabled")
    || text.includes("openai unavailable")
    || text.includes("gpt-5.5")
    || text.includes("gpt-55")
    || text.includes("disabled")
    || requestTested === false
    || configured === false;
}

export function normalizeIngestResult(
  responseOrStatus: Pick<Response, "status" | "ok"> | number | null | undefined,
  data: unknown,
  error?: unknown
): NormalizedIngestResult {
  const status = getResponseStatus(responseOrStatus);
  const raw = mergeIngestResponsePayload(data);
  const success = isIngestSuccessState(responseOrStatus, data);
  const successPayload = success ? normalizeIngestSuccessPayload(data) : null;

  if (successPayload) {
    return {
      type: "success",
      ok: true,
      replyText: successPayload.replyText,
      status,
      message: successPayload.replyText || "AI已完成知识整理。",
      provider: successPayload.provider,
      actualModel: successPayload.actualModel,
      requestedModel: successPayload.requestedModel,
      fallback: successPayload.fallback,
      raw: successPayload.raw
    };
  }

  const normalizedError = normalizeIngestErrorPayload(
    typeof responseOrStatus === "number" ? { status: responseOrStatus } : responseOrStatus,
    data,
    error
  );

  if (isAuthFailure(responseOrStatus, data, error)) {
    const code = normalizedError.errorCode || (status === 403 ? "NO_INGEST_ACCESS" : "AUTH_REQUIRED");

    return {
      type: "auth_failure",
      ok: false,
      replyText: "",
      status,
      errorCode: code,
      message: status === 403 || code === "NO_INGEST_ACCESS"
        ? "当前账号没有投喂权限，请确认卡密或账号权限。"
        : "请重新登录后再试。",
      provider: normalizedError.provider,
      actualModel: normalizedError.actualModel,
      raw: data
    };
  }

  if (isModelHealthFailure(responseOrStatus, data, error)) {
    return {
      type: "model_health_failure",
      ok: false,
      replyText: "",
      status,
      errorCode: normalizedError.errorCode || "MODEL_HEALTH_FAILURE",
      message: "模型健康检查暂不可用，已继续使用当前可用模型。",
      provider: normalizedError.provider || readString(raw?.provider) || undefined,
      actualModel: normalizedError.actualModel,
      raw: data
    };
  }

  return {
    type: "ingest_failure",
    ok: false,
    replyText: "",
    status,
    errorCode: normalizedError.errorCode || "INGEST_FAILURE",
    message: normalizedError.message,
    provider: normalizedError.provider,
    actualModel: normalizedError.actualModel,
    raw: data
  };
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
