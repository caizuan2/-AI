import "server-only";

import { searchKnowledgeChunks, type KnowledgeSearchResponse } from "@/lib/knowledge/search";
import { getRequestIdFromHeaders, REQUEST_ID_HEADER } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const CORE_INGEST_PATH = "/api/core/ingest";
const KNOWLEDGE_OPTIMIZE_PATH = "/api/admin/knowledge/optimize";
const MAX_QUERY_LENGTH = 2_000;
const MAX_TOP_K = 20;
const MAX_CANDIDATE_ID_LENGTH = 160;
const MAX_TITLE_LENGTH = 300;
const MAX_CATEGORY_LENGTH = 160;
const MAX_CORE_INGEST_LENGTH = 100_000;
const UPSTREAM_TIMEOUT_MS = 15_000;

export type KnowledgeBaseAdapterErrorCode =
  | "INVALID_INPUT"
  | "ACTOR_NOT_FOUND"
  | "TENANT_CHECK_FAILED"
  | "TENANT_MISMATCH"
  | "ADAPTER_NOT_CONFIGURED"
  | "KNOWLEDGE_SEARCH_FAILED"
  | "UPSTREAM_UNAUTHENTICATED"
  | "UPSTREAM_FORBIDDEN"
  | "UPSTREAM_REJECTED"
  | "UPSTREAM_REDIRECT"
  | "UPSTREAM_SERVER_ERROR"
  | "UPSTREAM_NETWORK_ERROR"
  | "UPSTREAM_INVALID_RESPONSE";

export type KnowledgeBaseAdapterSuccess<T> = {
  ok: true;
  success: true;
  data: T;
  httpStatus: number;
  requestId: string;
  safeToRetry: false;
};

export type KnowledgeBaseAdapterError = {
  ok: false;
  success: false;
  code: KnowledgeBaseAdapterErrorCode;
  message: string;
  httpStatus: number | null;
  requestId: string;
  /**
   * true means the adapter can prove that no knowledge write was accepted.
   * A network error, redirect, invalid success body, or 5xx result is unknown
   * and must never be retried automatically.
   */
  safeToRetry: boolean;
  requestDispatched: boolean;
};

export type KnowledgeBaseAdapterResult<T> =
  | KnowledgeBaseAdapterSuccess<T>
  | KnowledgeBaseAdapterError;

export interface KnowledgeBaseSearchInput {
  actorUserId: string;
  companyId: string;
  query: string;
  topK?: number;
  agentId?: string | null;
  knowledgeBaseId?: string | null;
  namespace?: string | null;
  knowledgeVersion?: string | number | null;
  minQualityScore?: number | null;
  includeLowQuality?: boolean;
  requestId?: string;
}

export interface PublishKnowledgeCandidateInput {
  request: Request;
  actorUserId: string;
  companyId: string;
  candidateId: string;
  title: string;
  content: string;
  category: string;
  agentId?: string | null;
  knowledgeBaseId?: string | null;
  namespace?: string | null;
}

export interface PublishedKnowledgeCandidate {
  publishedKnowledgeId: string;
  stage: string;
  candidateReference: string;
}

export interface KnowledgeOptimizationRecommendation {
  type?: string;
  agentId?: string;
  knowledgeBaseId?: string;
  namespace?: string;
  chunkIds?: string[];
  titles?: string[];
  message?: string;
}

export interface KnowledgeOptimizationPayload {
  ok?: boolean;
  success?: boolean;
  summary?: Record<string, unknown>;
  release?: Record<string, unknown>;
  core?: Record<string, unknown>;
  recommendations?: KnowledgeOptimizationRecommendation[];
  diagnostics?: Record<string, unknown>;
}

export interface FetchKnowledgeOptimizationInput {
  request: Request;
  actorUserId: string;
  companyId: string;
  limit?: number;
  agentId?: string | null;
  knowledgeBaseId?: string | null;
  namespace?: string | null;
}

type JsonRecord = Record<string, unknown>;

function cleanRequiredText(value: unknown, label: string, maxLength: number) {
  const text = typeof value === "string" ? value.trim() : "";

  if (!text) {
    return { error: `${label}不能为空。`, value: "" };
  }

  if (text.length > maxLength) {
    return { error: `${label}不能超过 ${maxLength} 个字符。`, value: "" };
  }

  return { error: null, value: text };
}

function readRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function boundedMessage(value: unknown, fallback: string) {
  const message = readString(value)?.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ");

  return message ? message.slice(0, 300) : fallback;
}

function makeError(input: {
  code: KnowledgeBaseAdapterErrorCode;
  message: string;
  httpStatus?: number | null;
  requestId: string;
  safeToRetry: boolean;
  requestDispatched: boolean;
}): KnowledgeBaseAdapterError {
  return {
    ok: false,
    success: false,
    code: input.code,
    message: input.message,
    httpStatus: input.httpStatus ?? null,
    requestId: input.requestId,
    safeToRetry: input.safeToRetry,
    requestDispatched: input.requestDispatched
  };
}

function makeSuccess<T>(data: T, httpStatus: number, requestId: string): KnowledgeBaseAdapterSuccess<T> {
  return {
    ok: true,
    success: true,
    data,
    httpStatus,
    requestId,
    safeToRetry: false
  };
}

async function verifyActorTenant(input: {
  actorUserId: string;
  companyId: string;
  requestId: string;
}): Promise<KnowledgeBaseAdapterError | null> {
  const actorUserId = input.actorUserId.trim();
  const companyId = input.companyId.trim();

  if (!actorUserId || !companyId) {
    return makeError({
      code: "INVALID_INPUT",
      message: "用户 ID 和企业 ID 不能为空。",
      httpStatus: 400,
      requestId: input.requestId,
      safeToRetry: true,
      requestDispatched: false
    });
  }

  let user: { isActive: boolean; tenantId: string | null } | null;

  try {
    user = await prisma.user.findUnique({
      where: { id: actorUserId },
      select: { isActive: true, tenantId: true }
    });
  } catch {
    return makeError({
      code: "TENANT_CHECK_FAILED",
      message: "暂时无法验证企业知识库租户。",
      httpStatus: 503,
      requestId: input.requestId,
      safeToRetry: true,
      requestDispatched: false
    });
  }

  if (!user?.isActive) {
    return makeError({
      code: "ACTOR_NOT_FOUND",
      message: "当前账号不存在或已停用。",
      httpStatus: 403,
      requestId: input.requestId,
      safeToRetry: true,
      requestDispatched: false
    });
  }

  if (!user.tenantId || user.tenantId !== companyId) {
    return makeError({
      code: "TENANT_MISMATCH",
      message: "所选企业尚未绑定到当前账号的知识库租户，已拒绝调用知识库。",
      httpStatus: 403,
      requestId: input.requestId,
      safeToRetry: true,
      requestDispatched: false
    });
  }

  return null;
}

function parseConfiguredOrigin(value: string | undefined) {
  const configured = value?.trim();

  if (!configured) {
    return null;
  }

  try {
    const url = new URL(configured);

    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      (url.protocol === "http:" && !isLocalHostname(url.hostname))
    ) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

function isLocalHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");

  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function resolveTrustedBaseOrigin(request: Request) {
  const configuredValues = [process.env.APP_URL, process.env.NEXT_PUBLIC_APP_URL]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  if (configuredValues.length > 0) {
    for (const configuredValue of configuredValues) {
      const origin = parseConfiguredOrigin(configuredValue);

      if (origin) {
        return origin;
      }
    }

    return null;
  }

  try {
    const requestUrl = new URL(request.url);

    if (
      (requestUrl.protocol === "http:" || requestUrl.protocol === "https:") &&
      !requestUrl.username &&
      !requestUrl.password &&
      isLocalHostname(requestUrl.hostname)
    ) {
      return requestUrl.origin;
    }
  } catch {
    return null;
  }

  return null;
}

function buildForwardHeaders(request: Request, companyId: string, requestId: string, hasBody: boolean) {
  const headers = new Headers({
    Accept: "application/json",
    [REQUEST_ID_HEADER]: requestId,
    "x-tenant-id": companyId
  });
  const cookie = request.headers.get("cookie");

  if (cookie) {
    headers.set("cookie", cookie);
  }

  if (hasBody) {
    headers.set("content-type", "application/json");
  }

  return headers;
}

async function readJsonResponse(response: Response) {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

  if (!contentType.includes("application/json")) {
    return null;
  }

  return response.json().catch(() => null) as Promise<unknown>;
}

function readResponseRequestId(response: Response, payload: unknown, fallback: string) {
  const root = readRecord(payload);
  const error = readRecord(root?.error);

  return response.headers.get(REQUEST_ID_HEADER)?.trim()
    || readString(root?.requestId)
    || readString(error?.requestId)
    || fallback;
}

function upstreamError(
  response: Response,
  payload: unknown,
  requestId: string
): KnowledgeBaseAdapterError {
  const root = readRecord(payload);
  const nestedError = readRecord(root?.error);
  const upstreamMessage = root?.message ?? nestedError?.message;
  const safeToRetry = response.status >= 400 && response.status < 500;

  if (response.status === 401) {
    return makeError({
      code: "UPSTREAM_UNAUTHENTICATED",
      message: boundedMessage(upstreamMessage, "知识库会话已失效，请重新登录。"),
      httpStatus: response.status,
      requestId,
      safeToRetry: true,
      requestDispatched: true
    });
  }

  if (response.status === 403) {
    return makeError({
      code: "UPSTREAM_FORBIDDEN",
      message: boundedMessage(upstreamMessage, "当前账号没有知识库管理员权限或投喂授权。"),
      httpStatus: response.status,
      requestId,
      safeToRetry: true,
      requestDispatched: true
    });
  }

  if (response.status >= 400 && response.status < 500) {
    return makeError({
      code: "UPSTREAM_REJECTED",
      message: boundedMessage(upstreamMessage, "知识库拒绝了本次请求。"),
      httpStatus: response.status,
      requestId,
      safeToRetry,
      requestDispatched: true
    });
  }

  if (response.status >= 300 && response.status < 400) {
    return makeError({
      code: "UPSTREAM_REDIRECT",
      message: "知识库接口发生意外跳转，写入结果未知，请勿自动重试。",
      httpStatus: response.status,
      requestId,
      safeToRetry: false,
      requestDispatched: true
    });
  }

  return makeError({
    code: "UPSTREAM_SERVER_ERROR",
    message: "知识库服务处理失败，写入结果未知，请勿自动重试。",
    httpStatus: response.status,
    requestId,
    safeToRetry: false,
    requestDispatched: true
  });
}

/**
 * Searches only through the existing knowledge search service. The explicit
 * user-to-tenant equality check is required because the lower-level service
 * accepts a caller-supplied tenant scope.
 */
export async function searchKnowledgeBase(
  input: KnowledgeBaseSearchInput
): Promise<KnowledgeBaseAdapterResult<KnowledgeSearchResponse>> {
  const requestId = input.requestId?.trim() || `ai-brain-search-${Date.now()}`;
  const tenantError = await verifyActorTenant({
    actorUserId: input.actorUserId,
    companyId: input.companyId,
    requestId
  });

  if (tenantError) {
    return tenantError;
  }

  const query = cleanRequiredText(input.query, "检索内容", MAX_QUERY_LENGTH);

  if (query.error) {
    return makeError({
      code: "INVALID_INPUT",
      message: query.error,
      httpStatus: 400,
      requestId,
      safeToRetry: true,
      requestDispatched: false
    });
  }

  if (input.topK !== undefined && !Number.isFinite(input.topK)) {
    return makeError({
      code: "INVALID_INPUT",
      message: "检索数量必须是有效数字。",
      httpStatus: 400,
      requestId,
      safeToRetry: true,
      requestDispatched: false
    });
  }

  const topK = input.topK === undefined
    ? undefined
    : Math.max(1, Math.min(MAX_TOP_K, Math.round(input.topK)));

  try {
    const result = await searchKnowledgeChunks(
      query.value,
      topK,
      input.actorUserId.trim(),
      {
        tenantId: input.companyId.trim(),
        agentId: input.agentId,
        knowledgeBaseId: input.knowledgeBaseId,
        namespace: input.namespace,
        knowledgeVersion: input.knowledgeVersion,
        minQualityScore: input.minQualityScore,
        includeLowQuality: input.includeLowQuality
      }
    );

    return makeSuccess(result, 200, requestId);
  } catch {
    return makeError({
      code: "KNOWLEDGE_SEARCH_FAILED",
      message: "知识库检索暂时不可用。",
      requestId,
      safeToRetry: false,
      requestDispatched: true
    });
  }
}

function buildCandidateReference(candidateId: string) {
  return `team-os://knowledge-candidate/${encodeURIComponent(candidateId)}`;
}

/**
 * Publishes through the protected official HTTP endpoint. It deliberately does
 * not translate TEAM_* roles into knowledge roles: the forwarded session must
 * independently satisfy the upstream kb_admin and ingest-license guards.
 */
export async function publishKnowledgeCandidateToKnowledgeBase(
  input: PublishKnowledgeCandidateInput
): Promise<KnowledgeBaseAdapterResult<PublishedKnowledgeCandidate>> {
  const requestId = getRequestIdFromHeaders(input.request.headers);
  const tenantError = await verifyActorTenant({
    actorUserId: input.actorUserId,
    companyId: input.companyId,
    requestId
  });

  if (tenantError) {
    return tenantError;
  }

  const candidateId = cleanRequiredText(input.candidateId, "候选知识 ID", MAX_CANDIDATE_ID_LENGTH);
  const title = cleanRequiredText(input.title, "知识标题", MAX_TITLE_LENGTH);
  const content = cleanRequiredText(input.content, "知识内容", MAX_CORE_INGEST_LENGTH);
  const category = cleanRequiredText(input.category, "知识分类", MAX_CATEGORY_LENGTH);
  const validationError = candidateId.error || title.error || content.error || category.error;

  if (validationError) {
    return makeError({
      code: "INVALID_INPUT",
      message: validationError,
      httpStatus: 400,
      requestId,
      safeToRetry: true,
      requestDispatched: false
    });
  }

  const candidateReference = buildCandidateReference(candidateId.value);
  const ingestText = [
    `标题：${title.value}`,
    `分类：${category.value}`,
    "内容：",
    content.value
  ].join("\n\n");

  if (ingestText.length > MAX_CORE_INGEST_LENGTH) {
    return makeError({
      code: "INVALID_INPUT",
      message: `知识内容与元数据合计不能超过 ${MAX_CORE_INGEST_LENGTH} 个字符。`,
      httpStatus: 400,
      requestId,
      safeToRetry: true,
      requestDispatched: false
    });
  }

  const baseOrigin = resolveTrustedBaseOrigin(input.request);

  if (!baseOrigin) {
    return makeError({
      code: "ADAPTER_NOT_CONFIGURED",
      message: "知识库服务地址未配置。生产环境必须设置 APP_URL 或 NEXT_PUBLIC_APP_URL。",
      httpStatus: 503,
      requestId,
      safeToRetry: true,
      requestDispatched: false
    });
  }

  let response: Response;

  try {
    response = await fetch(new URL(CORE_INGEST_PATH, baseOrigin), {
      method: "POST",
      headers: buildForwardHeaders(input.request, input.companyId.trim(), requestId, true),
      body: JSON.stringify({
        input: ingestText,
        source: "chat",
        sourceUrl: candidateReference,
        autoSave: true,
        agentId: input.agentId ?? null,
        knowledgeBaseId: input.knowledgeBaseId ?? null,
        namespace: input.namespace ?? null,
        agentName: "AI Team OS Enterprise AI Brain"
      }),
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    });
  } catch {
    return makeError({
      code: "UPSTREAM_NETWORK_ERROR",
      message: "无法确认知识库是否已接收本次写入，请勿自动重试。",
      requestId,
      safeToRetry: false,
      requestDispatched: true
    });
  }

  const payload = await readJsonResponse(response);
  const responseRequestId = readResponseRequestId(response, payload, requestId);

  if (!response.ok) {
    return upstreamError(response, payload, responseRequestId);
  }

  const root = readRecord(payload);
  const data = readRecord(root?.data);
  const knowledgeItem = readRecord(data?.knowledgeItem);
  const standardKnowledgeItem = readRecord(data?.standardKnowledgeItem);
  const publishedKnowledgeId = readString(knowledgeItem?.id) || readString(standardKnowledgeItem?.id);

  if (!publishedKnowledgeId) {
    return makeError({
      code: "UPSTREAM_INVALID_RESPONSE",
      message: "知识库返回成功但缺少知识 ID，写入结果未知，请勿自动重试。",
      httpStatus: response.status,
      requestId: responseRequestId,
      safeToRetry: false,
      requestDispatched: true
    });
  }

  return makeSuccess({
    publishedKnowledgeId,
    stage: readString(data?.stage) ?? "saved",
    candidateReference
  }, response.status, responseRequestId);
}

/**
 * Optional read-only bridge to the existing Knowledge OS optimizer. The
 * upstream kb_admin guard remains authoritative; this adapter performs no role
 * mapping and contains no copied optimization or retrieval logic.
 */
export async function fetchKnowledgeBaseOptimization(
  input: FetchKnowledgeOptimizationInput
): Promise<KnowledgeBaseAdapterResult<KnowledgeOptimizationPayload>> {
  const requestId = getRequestIdFromHeaders(input.request.headers);
  const tenantError = await verifyActorTenant({
    actorUserId: input.actorUserId,
    companyId: input.companyId,
    requestId
  });

  if (tenantError) {
    return tenantError;
  }

  const baseOrigin = resolveTrustedBaseOrigin(input.request);

  if (!baseOrigin) {
    return makeError({
      code: "ADAPTER_NOT_CONFIGURED",
      message: "知识库服务地址未配置。生产环境必须设置 APP_URL 或 NEXT_PUBLIC_APP_URL。",
      httpStatus: 503,
      requestId,
      safeToRetry: true,
      requestDispatched: false
    });
  }

  const url = new URL(KNOWLEDGE_OPTIMIZE_PATH, baseOrigin);
  const requestedLimit = Number.isFinite(input.limit) ? input.limit! : 120;
  url.searchParams.set("includeShared", "true");
  url.searchParams.set("limit", String(Math.max(1, Math.min(500, Math.round(requestedLimit)))));

  if (input.agentId?.trim()) url.searchParams.set("agentId", input.agentId.trim());
  if (input.knowledgeBaseId?.trim()) url.searchParams.set("knowledgeBaseId", input.knowledgeBaseId.trim());
  if (input.namespace?.trim()) url.searchParams.set("namespace", input.namespace.trim());

  let response: Response;

  try {
    response = await fetch(url, {
      method: "GET",
      headers: buildForwardHeaders(input.request, input.companyId.trim(), requestId, false),
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    });
  } catch {
    return makeError({
      code: "UPSTREAM_NETWORK_ERROR",
      message: "知识优化服务暂时不可用。",
      requestId,
      safeToRetry: false,
      requestDispatched: true
    });
  }

  const payload = await readJsonResponse(response);
  const responseRequestId = readResponseRequestId(response, payload, requestId);

  if (!response.ok) {
    return upstreamError(response, payload, responseRequestId);
  }

  const optimization = readRecord(payload);

  if (!optimization) {
    return makeError({
      code: "UPSTREAM_INVALID_RESPONSE",
      message: "知识优化接口返回了无法识别的响应。",
      httpStatus: response.status,
      requestId: responseRequestId,
      safeToRetry: false,
      requestDispatched: true
    });
  }

  return makeSuccess(optimization as KnowledgeOptimizationPayload, response.status, responseRequestId);
}
