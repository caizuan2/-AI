"use client";

import {
  type IngestChatAgent,
  type IngestKnowledgeDraft,
  type IngestTrainingRecord
} from "@/lib/enterprise/mock-chat";
import {
  ADMIN_INGEST_SYNC_TARGET,
  type AdminIngestPlatform
} from "@/lib/enterprise/admin-ingest-app-config";
import {
  getGptModelSelectionByDisplayName,
  type GptTier,
  type GptVersion
} from "@/lib/enterprise/gpt-model-options";
import {
  getIngestModelOptionByProvider,
  getIngestModelOptionByLabel,
  normalizeIngestModelSelection,
  type IngestModelProvider
} from "@/lib/enterprise/ingest-model-options";
import type {
  GptKnowledgeDraft,
  GptSaveRecommendation
} from "@/lib/enterprise/gpt-knowledge-draft";
import type { GptOSRouteResult } from "@/lib/enterprise/gpt-os-agent-router";
import type {
  AutonomousTaskRequest,
  AutonomousTaskResult
} from "@/lib/enterprise/gpt-os-autonomous-executor";
import type { GptUserClientCallPlan } from "@/lib/enterprise/gpt-user-client-call-plan";
import type { GptCallProof, OpenAIGptUsage } from "@/lib/enterprise/gpt-call-proof";
import { sanitizeGptOSUserMessage } from "@/lib/enterprise/gpt-os-fallback-normalizer";
import {
  normalizeIngestErrorPayload,
  normalizeIngestResult,
  normalizeIngestSuccessPayload
} from "@/lib/enterprise/ingest-response-normalizer";
import { normalizeJsonToIngestStreamEvent } from "@/lib/enterprise/ingest-stream-normalizer";
import { GPTOSRendererV3, processAIOutput } from "@/lib/enterprise/gpt-os-style-layer";
import { enrichDraftWithKnowledgeFactoryV5 } from "@/lib/enterprise/knowledge-factory-v5";
import {
  KnowledgeEvolutionEngine,
  type KnowledgeEvolutionResult
} from "@/lib/enterprise/knowledge-evolution-engine";
import {
  KnowledgeLoopEngine,
  type KnowledgeCandidateSource,
  type KnowledgeLoopCandidate,
  type KnowledgeLoopResult,
  type KnowledgeStoreDecision
} from "@/lib/enterprise/knowledge-loop-engine";
import {
  KnowledgeMemoryAdapter,
  type KnowledgeMemoryPlan,
  type KnowledgeMemoryReport,
  type SavedKnowledgeLike
} from "@/lib/enterprise/knowledge-memory-adapter";
import { AIRuntimeOrchestrator } from "@/lib/enterprise/runtime/ai-runtime-orchestrator";
import { resolvePublicExpertScope } from "@/lib/enterprise/public-expert-scope";
import { buildAdminIngestContextRequestFields } from "@/lib/enterprise/admin-ingest-context-boundary";
import { AdminIngestRequestError } from "@/lib/enterprise/admin-ingest-request-error";

export const ingestSyncTarget = ADMIN_INGEST_SYNC_TARGET;

export type IngestSyncTarget = typeof ingestSyncTarget[number];
export type IngestPlatform = AdminIngestPlatform;
export type IngestLicenseStatus = "未检查" | "已激活" | "未激活" | "本地预览";

export interface IngestConnectionStatus {
  enterpriseSpace: "本地预览" | "已连接";
  knowledgeBase: string;
  licenseStatus: IngestLicenseStatus;
  checkedAt?: string;
}

export interface IngestGptHealthStatus {
  ok: boolean;
  configured: boolean;
  provider: IngestModelProvider;
  baseUrlConfigured: boolean;
  baseUrlSource?: "configured" | "default";
  modelConfigured: boolean;
  modelSource?: "configured" | "preferred" | "default";
  apiKeyConfigured: boolean;
  selectedModelLabel: string;
  model: string;
  requestedModel?: string;
  actualModel?: string;
  mode: "highest" | "fixed";
  message: string;
  diagnostics: string[];
  checkedAt?: string;
  requestTested?: boolean;
  errorCode?: "OPENAI_API_KEY_MISSING" | "OPENAI_BASE_URL_INVALID" | "OPENAI_RESPONSES_REQUEST_FAILED" | "OPENAI_RESPONSES_PARSE_FAILED" | "OPENAI_TIMEOUT" | "DEEPSEEK_API_KEY_MISSING" | "DEEPSEEK_BASE_URL_INVALID" | "DEEPSEEK_REQUEST_FAILED" | "DEEPSEEK_RESPONSE_PARSE_FAILED" | "DEEPSEEK_TIMEOUT" | "DOUBAO_API_KEY_MISSING" | "DOUBAO_API_KEY_INVALID" | "DOUBAO_BASE_URL_INVALID" | "DOUBAO_RATE_LIMITED" | "DOUBAO_INFERENCE_LIMIT_PAUSED" | "DOUBAO_QUOTA_EXCEEDED" | "DOUBAO_SAFETY_REJECTED" | "DOUBAO_MODEL_UNAVAILABLE" | "DOUBAO_REQUEST_FAILED" | "DOUBAO_RESPONSE_PARSE_FAILED" | "DOUBAO_TIMEOUT" | "QWEN_API_KEY_MISSING" | "QWEN_BASE_URL_INVALID" | "QWEN_REQUEST_FAILED" | "QWEN_RESPONSE_PARSE_FAILED" | "QWEN_TIMEOUT" | "KIMI_API_KEY_MISSING" | "KIMI_BASE_URL_INVALID" | "KIMI_REQUEST_FAILED" | "KIMI_RESPONSE_PARSE_FAILED" | "KIMI_TIMEOUT";
}

export interface IngestUploadState {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  isImage?: boolean;
  previewUrl?: string;
  rawFile?: File;
  extractedText?: string;
  summary?: string;
  mimeType?: string;
  parseStatus?: "parsed" | "partial" | "metadata_only" | "unsupported" | "ocr_pending";
  pageSummaries?: string[];
  slideTexts?: Array<{ slideIndex: number; text: string }>;
  totalPages?: number;
  processedPageStart?: number | null;
  processedPageEnd?: number | null;
  nextPage?: number | null;
  complete?: boolean;
  successfulPages?: number[];
  failedPages?: number[];
  lowConfidencePages?: number[];
  coveragePercent?: number;
  successRatePercent?: number;
  deadlineReached?: boolean;
  limitationNote?: string;
  status: "selected" | "pending_parse" | "ready_to_send" | "parsing" | "attached" | "parsed" | "failed";
  source: "admin_ingest";
  platform: IngestPlatform;
  syncTarget: IngestSyncTarget[];
  tenantId?: string | null;
  userId?: string | null;
  agentId?: string | null;
  createdAt: string;
}

export interface IngestVoiceState {
  isVoiceSupported: boolean;
  isRecording: boolean;
  transcript: string;
  error: string;
  platform: IngestPlatform;
  syncTarget: IngestSyncTarget[];
}

export interface IngestNotification {
  id: string;
  type: "success" | "file" | "license" | "tenant" | "sync" | "fallback" | "info";
  title: string;
  description: string;
  read: boolean;
  source: "admin_ingest";
  platform: IngestPlatform;
  syncTarget: IngestSyncTarget[];
  createdAt: string;
}

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  message?: string;
  userMessage?: string;
  errorCode?: string;
  error?: {
    message?: string;
    code?: string;
  };
}

interface GptIngestResponse {
  jobId?: string | null;
  messageId?: string | null;
  attemptId?: string | null;
  sourceResponseId?: string | null;
  metadataResponseId?: string | null;
  metadataState?: "ready" | "unavailable";
  trainingRecord?: AdminTrainingRecordResponse | null;
  records?: AdminTrainingRecordResponse[];
  provider: IngestModelProvider;
  model: string;
  requestedProvider?: string;
  actualProvider?: string;
  requestedModel?: string;
  actualModel?: string;
  responseId?: string;
  proofId?: string;
  createdAt?: string;
  usage?: OpenAIGptUsage;
  gptProof?: GptCallProof;
  modelDisplayName?: string;
  modelMode: "highest" | "fixed";
  fallback?: boolean;
  fallbackUsed?: boolean;
  modelDiagnostics?: Record<string, unknown>;
  selectedModelLabel?: string;
  content?: string;
  answer?: string;
  reply?: string;
  visibleReply?: string;
  message?: string | {
    content?: string;
  };
  replyMarkdown?: string;
  knowledgeDraft?: GptKnowledgeDraft;
  knowledgeLoop?: KnowledgeLoopResult;
  evolution?: KnowledgeEvolutionResult;
  storeDecision?: KnowledgeStoreDecision;
  reusableKnowledgeUnits?: KnowledgeLoopCandidate[];
  reviewRequiredUnits?: KnowledgeLoopCandidate[];
  autoStoreCandidates?: KnowledgeLoopCandidate[];
  memory?: KnowledgeMemoryReport;
  memoryPlan?: KnowledgeMemoryPlan;
  knowledgeIntelligence?: IngestKnowledgeDraft["knowledgeIntelligence"];
  ragOptimization?: IngestKnowledgeDraft["ragOptimization"];
  metadata?: {
    knowledgeLoopVersion?: "v1";
    autoStoreEnabled?: boolean;
    requiresReview?: boolean;
    [key: string]: unknown;
  };
  userClientCallPlan?: GptUserClientCallPlan;
  sourceFiles?: Array<{
    fileName: string;
    mimeType?: string;
    parseStatus?: string;
    limitationNote?: string;
  }>;
  suggestedQuestions?: string[];
  saveRecommendation?: GptSaveRecommendation;
  diagnostics?: string[];
  gptOS?: GptOSRouteResult;
  autonomousResult?: AutonomousTaskResult;
  structured?: {
    title?: string;
    category?: string;
    summary?: string;
    tags?: string[];
    question?: string;
    answer?: string;
    confidence?: number;
    saveSuggestion?: boolean;
    followUpQuestions?: string[];
  };
  sync?: {
    platform?: IngestPlatform;
    syncTarget?: IngestSyncTarget[];
  };
}

interface GptFailureResponse {
  ok: false;
  success?: false;
  fallback?: boolean;
  provider?: IngestModelProvider;
  errorCode: "ADMIN_INGEST_SELECTED_MODEL_UNAVAILABLE" | "ADMIN_INGEST_DOUBAO_METADATA_RECOVERY_FAILED" | "ATTACHMENT_CONTENT_MISSING" | "ATTACHMENT_EVIDENCE_MISMATCH" | "OPENAI_API_KEY_MISSING" | "OPENAI_BASE_URL_INVALID" | "OPENAI_RESPONSES_REQUEST_FAILED" | "OPENAI_RESPONSES_PARSE_FAILED" | "OPENAI_RATE_LIMIT" | "OPENAI_TIMEOUT" | "OPENAI_FULL_REQUEST_FAILED" | "OPENAI_PRO_QUALITY_FAILED" | "DEEPSEEK_API_KEY_MISSING" | "DEEPSEEK_BASE_URL_INVALID" | "DEEPSEEK_REQUEST_FAILED" | "DEEPSEEK_RESPONSE_PARSE_FAILED" | "DEEPSEEK_TIMEOUT" | "DEEPSEEK_PRO_QUALITY_FAILED" | "DOUBAO_API_KEY_MISSING" | "DOUBAO_API_KEY_INVALID" | "DOUBAO_BASE_URL_INVALID" | "DOUBAO_RATE_LIMITED" | "DOUBAO_INFERENCE_LIMIT_PAUSED" | "DOUBAO_QUOTA_EXCEEDED" | "DOUBAO_SAFETY_REJECTED" | "DOUBAO_MODEL_UNAVAILABLE" | "DOUBAO_REQUEST_FAILED" | "DOUBAO_RESPONSE_PARSE_FAILED" | "DOUBAO_TIMEOUT" | "QWEN_API_KEY_MISSING" | "QWEN_BASE_URL_INVALID" | "QWEN_REQUEST_FAILED" | "QWEN_RESPONSE_PARSE_FAILED" | "QWEN_TIMEOUT" | "QWEN_PRO_QUALITY_FAILED" | "KIMI_API_KEY_MISSING" | "KIMI_BASE_URL_INVALID" | "KIMI_REQUEST_FAILED" | "KIMI_RESPONSE_PARSE_FAILED" | "KIMI_TIMEOUT" | "KIMI_PRO_QUALITY_FAILED";
  causeCode?: string;
  message: string;
  userMessage?: string;
  retryable?: boolean;
  selectedModelLabel?: string;
  model?: string;
  requestedProvider?: string;
  actualProvider?: string | null;
  requestedModel?: string;
  actualModel?: string | null;
  fallbackUsed?: boolean;
  requestId?: string;
  failureDetails?: {
    parseStage?: string;
    finishReason?: string;
    eventCount?: number;
    receivedChars?: number;
    receivedContent?: boolean;
    timeoutStage?: string;
    abortSource?: string;
    retryAfterMs?: number;
  };
  raw?: null;
  diagnostics?: unknown;
}

export interface IngestStreamingState {
  thinking: boolean;
  message: string;
}

export interface IngestStreamingOptions {
  onToken?: (chunk: string, fullText: string) => void;
  onThinking?: (state: IngestStreamingState) => void;
  onVisibleReply?: (event: {
    requestId: string;
    replyMarkdown: string;
    actualModel?: string;
    responseId?: string;
    metadataPending: true;
  }) => void;
  onStatus?: (event: {
    type: "queue_wait" | "rate_limit_wait" | "metadata_status";
    phase?: "visible" | "continuation" | "metadata" | "health";
    queueDepth?: number;
    retryAfterMs?: number;
    attempt?: number;
    state?: "pending" | "completed" | "deferred";
    failureCode?: string;
  }) => void;
  signal?: AbortSignal;
  chunkIntervalMs?: number;
  thinkingDelayMs?: number;
  mergeWindowMs?: number;
}

interface UrlIngestPreviewResponse {
  stage: "preview";
  job: {
    id: string;
  };
  draft: {
    jobId: string;
    title: string;
    category: string;
    tags: string[];
    summary: string;
    qa_pairs: Array<{ q: string; a: string }>;
    confidence: number;
    should_save: boolean;
    providerUsed: string;
    model: string;
    fallbackUsed: boolean;
    saveStatus: "pending" | "saved" | "rejected";
    sourceUrl: string;
  };
  records?: AdminTrainingRecordResponse[];
  preview: boolean;
  message: string;
  replyMarkdown?: string;
}

interface AdminTrainingRecordResponse {
  id?: string;
  jobId?: string;
  input?: string;
  ai_output?: unknown;
  resultTitle?: string;
  category?: string;
  status?: "pending" | "saved" | "rejected" | "completed" | "failed" | "stored" | "indexed" | "knowledge_saved";
  sourceType?: string;
  timestamp?: string;
  hits?: number;
}

interface AdminSavedKnowledgeResponse extends SavedKnowledgeLike {
  id: string;
  title: string;
  category: string;
  chunkCount: number;
}

export function getFriendlyIngestError(response: Pick<Response, "status">, payload: ApiEnvelope<unknown> | null) {
  if (payload?.errorCode === "ADMIN_INGEST_SELECTED_MODEL_UNAVAILABLE") {
    return payload.userMessage || payload.message || "当前模型暂时不可用，系统未切换其他模型。您的输入和附件已保留，请稍后重试。";
  }

  const raw = [
    payload?.message,
    payload?.error?.message,
    payload?.error?.code
  ].filter(Boolean).join(" ").toLowerCase();

  if (
    response.status === 401
    || raw.includes("auth_required")
    || raw.includes("invalid_session")
    || raw.includes("unauthorized")
    || raw.includes("login")
    || raw.includes("请先登录")
    || raw.includes("重新登录")
    || raw.includes("登录状态")
  ) {
    return "请重新登录后再试。";
  }

  if (
    response.status === 403
    || raw.includes("forbidden")
    || raw.includes("no_ingest_access")
    || raw.includes("license_app_type_mismatch")
    || raw.includes("没有权限")
    || raw.includes("不能访问")
  ) {
    return "当前账号没有投喂权限，请确认卡密或账号权限。";
  }

  if (raw.includes("license") || raw.includes("卡密") || raw.includes("授权") || raw.includes("expired")) {
    return raw.includes("expired")
      ? "当前账号卡密已过期，请完成续费授权后使用 AI 投喂。"
      : "当前账号未激活卡密，请先完成授权后使用 AI 投喂。";
  }

  if (raw.includes("tenant") || raw.includes("租户") || raw.includes("企业")) {
    return "企业空间未加载，已切换为本地预览模式。";
  }

  if (raw.includes("openai api key") || raw.includes("missing_ai_api_key") || raw.includes("未配置 openai")) {
    return "AI服务授权暂不可用，请检查模型连接后再试。";
  }

  if (raw.includes("deepseek_api_key") || raw.includes("deepseek api key") || raw.includes("deepseek") && raw.includes("未配置")) {
    return "AI服务授权暂不可用，请检查模型连接后再试。";
  }

  if (raw.includes("timeout") || raw.includes("超时")) {
    return "AI响应较慢，请稍后再试。";
  }

  if (raw.includes("gpt") || raw.includes("openai")) {
    return "AI服务暂时不稳定，请稍后再试。";
  }

  if (raw.includes("deepseek")) {
    return "AI服务暂时不稳定，请稍后再试。";
  }

  return "接口暂不可用，请稍后重试。";
}

async function readApiData<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;

  if (!response.ok || !payload?.ok || !payload.data) {
    throw new Error(getFriendlyIngestError(response, payload));
  }

  return payload.data;
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeClientScopeId(value: string | null | undefined, fallback: string) {
  return (value ?? "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^0-9A-Za-z_\-:.]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || fallback;
}

function buildClientAgentKnowledgeScope(agent: IngestChatAgent) {
  const agentId = normalizeClientScopeId(agent.id, "chief");
  const knowledgeBaseId = normalizeClientScopeId(agent.knowledgeBaseId, `kb:${agentId}`);
  const namespace = normalizeClientScopeId(agent.namespace, `agent:${agentId}:kb:${knowledgeBaseId}`);
  const publicScope = resolvePublicExpertScope({
    agentId,
    expertId: agent.expertId,
    knowledgeBaseId,
    namespace,
    tenantId: agent.tenantId
  });

  if (publicScope) {
    return {
      agentId: publicScope.agentId,
      knowledgeBaseId: publicScope.knowledgeBaseId,
      namespace: publicScope.namespace
    };
  }

  return {
    agentId,
    knowledgeBaseId,
    namespace
  };
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readTags(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function readQaPairs(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      const q = readString(record.q);
      const a = readString(record.a);

      return q && a ? { q, a } : null;
    })
    .filter((item): item is { q: string; a: string } => Boolean(item));
}

function readOptionalStringArray(value: unknown) {
  const values = readTags(value);

  return values.length > 0 ? values : undefined;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isGptFailureResponse(value: unknown): value is GptFailureResponse {
  return isPlainRecord(value) && value.ok === false;
}

function toAdminIngestRequestError(
  payload: GptFailureResponse,
  status: number,
  fallbackRequestId: string
) {
  const userMessage = sanitizeGptOSUserMessage(
    payload.userMessage || payload.message || "AI服务暂时不稳定，请稍后再试。"
  );

  return new AdminIngestRequestError(userMessage, {
    status,
    errorCode: payload.errorCode,
    causeCode: payload.causeCode,
    retryable: payload.retryable,
    provider: payload.provider,
    requestedProvider: payload.requestedProvider,
    actualProvider: payload.actualProvider,
    selectedModelLabel: payload.selectedModelLabel,
    requestedModel: payload.requestedModel,
    actualModel: payload.actualModel,
    fallbackUsed: payload.fallbackUsed,
    requestId: payload.requestId || fallbackRequestId,
    failureDetails: payload.failureDetails
  });
}

type AdminIngestBrowserSseTerminal = {
  status: number;
  payload: ApiEnvelope<GptIngestResponse> | GptFailureResponse | null;
};

type AdminIngestBrowserSseCallbacks = {
  expectedRequestId: string;
  onVisibleReply?: IngestStreamingOptions["onVisibleReply"];
  onStatus?: IngestStreamingOptions["onStatus"];
};

function parseAdminIngestSseBlock(
  block: string,
  callbacks: AdminIngestBrowserSseCallbacks
): AdminIngestBrowserSseTerminal | null {
  let eventName = "message";
  const dataLines: string[] = [];

  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).replace(/^ /, ""));
    }
  }

  if (dataLines.length === 0 || eventName === "accepted" || eventName === "heartbeat") {
    return null;
  }

  let envelope: unknown;

  try {
    envelope = JSON.parse(dataLines.join("\n")) as unknown;
  } catch {
    throw new AdminIngestRequestError("豆包浏览器流式结果解析失败，系统未切换其他模型。", {
      status: 503,
      errorCode: "ADMIN_INGEST_SELECTED_MODEL_UNAVAILABLE",
      causeCode: "DOUBAO_RESPONSE_PARSE_FAILED",
      retryable: true,
      provider: "doubao-pro",
      requestedProvider: "doubao-pro",
      fallbackUsed: false,
      failureDetails: { parseStage: "browser_sse_event" }
    });
  }

  if (!isPlainRecord(envelope)) {
    return null;
  }

  const eventRequestId = readString(envelope.requestId);

  if (eventRequestId && eventRequestId !== callbacks.expectedRequestId) {
    return null;
  }

  if (eventName === "visible") {
    const replyMarkdown = typeof envelope.replyMarkdown === "string"
      ? envelope.replyMarkdown
      : "";

    if (!eventRequestId || !replyMarkdown) {
      throw new AdminIngestRequestError("豆包可见正文事件不完整，系统未切换其他模型。", {
        status: 503,
        errorCode: "ADMIN_INGEST_SELECTED_MODEL_UNAVAILABLE",
        causeCode: "DOUBAO_RESPONSE_PARSE_FAILED",
        retryable: true,
        provider: "doubao-pro",
        requestedProvider: "doubao-pro",
        requestId: callbacks.expectedRequestId,
        fallbackUsed: false,
        failureDetails: { parseStage: "browser_sse_event" }
      });
    }

    callbacks.onVisibleReply?.({
      requestId: eventRequestId,
      replyMarkdown,
      actualModel: readString(envelope.actualModel),
      responseId: readString(envelope.responseId),
      metadataPending: true
    });
    return null;
  }

  if (eventName === "status") {
    const type = readString(envelope.type);

    if (type === "queue_wait" || type === "rate_limit_wait" || type === "metadata_status") {
      const phase = readString(envelope.phase);
      const state = readString(envelope.state);
      callbacks.onStatus?.({
        type,
        phase: phase === "visible" || phase === "continuation" || phase === "metadata" || phase === "health"
          ? phase
          : undefined,
        queueDepth: Number.isSafeInteger(Number(envelope.queueDepth)) && Number(envelope.queueDepth) >= 0
          ? Number(envelope.queueDepth)
          : undefined,
        retryAfterMs: Number.isSafeInteger(Number(envelope.retryAfterMs)) && Number(envelope.retryAfterMs) >= 0
          ? Number(envelope.retryAfterMs)
          : undefined,
        attempt: Number.isSafeInteger(Number(envelope.attempt)) && Number(envelope.attempt) >= 0
          ? Number(envelope.attempt)
          : undefined,
        state: state === "pending" || state === "completed" || state === "deferred"
          ? state
          : undefined,
        failureCode: readString(envelope.failureCode)
      });
    }

    return null;
  }

  if (eventName !== "final" && eventName !== "error") {
    return null;
  }

  const status = Number(envelope.status);
  const payload = envelope.payload;

  if (!Number.isInteger(status) || status < 200 || status > 599) {
    throw new AdminIngestRequestError("豆包浏览器流式状态无效，系统未切换其他模型。", {
      status: 503,
      errorCode: "ADMIN_INGEST_SELECTED_MODEL_UNAVAILABLE",
      causeCode: "DOUBAO_RESPONSE_PARSE_FAILED",
      retryable: true,
      provider: "doubao-pro",
      requestedProvider: "doubao-pro",
      fallbackUsed: false,
      failureDetails: { parseStage: "browser_sse_event" }
    });
  }

  return {
    status,
    payload: isPlainRecord(payload)
      ? payload as unknown as ApiEnvelope<GptIngestResponse> | GptFailureResponse
      : null
  };
}

async function readAdminIngestResponse(
  response: Response,
  signal: AbortSignal | undefined,
  callbacks: AdminIngestBrowserSseCallbacks
): Promise<AdminIngestBrowserSseTerminal> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

  if (!contentType.includes("text/event-stream")) {
    return {
      status: response.status,
      payload: await response.json().catch(() => null) as ApiEnvelope<GptIngestResponse> | GptFailureResponse | null
    };
  }

  const reader = response.body?.getReader();

  if (!reader) {
    throw new AdminIngestRequestError("豆包浏览器流式连接没有响应正文，系统未切换其他模型。", {
      status: 503,
      errorCode: "ADMIN_INGEST_SELECTED_MODEL_UNAVAILABLE",
      causeCode: "DOUBAO_REQUEST_FAILED",
      retryable: true,
      provider: "doubao-pro",
      requestedProvider: "doubao-pro",
      fallbackUsed: false,
      failureDetails: { parseStage: "browser_sse_body" }
    });
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let streamAcknowledged = false;

  try {
    while (true) {
      if (signal?.aborted) {
        throw signal.reason instanceof Error
          ? signal.reason
          : new DOMException("The operation was aborted.", "AbortError");
      }

      const chunk = await reader.read();

      if (chunk.done) {
        buffer += decoder.decode();
        break;
      }

      buffer += decoder.decode(chunk.value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        if (/^event:\s*(?:accepted|heartbeat)\s*$/im.test(block)) {
          streamAcknowledged = true;
        }

        const terminal = parseAdminIngestSseBlock(block, callbacks);

        if (terminal) {
          return terminal;
        }
      }
    }

    if (buffer.trim()) {
      const terminal = parseAdminIngestSseBlock(buffer, callbacks);

      if (terminal) {
        return terminal;
      }
    }

    throw new AdminIngestRequestError("豆包浏览器流式连接提前结束，系统未切换其他模型。", {
      status: 503,
      errorCode: "ADMIN_INGEST_SELECTED_MODEL_UNAVAILABLE",
      causeCode: "DOUBAO_REQUEST_FAILED",
      retryable: true,
      provider: "doubao-pro",
      requestedProvider: "doubao-pro",
      fallbackUsed: false,
      failureDetails: { parseStage: "browser_sse_eof" }
    });
  } catch (error) {
    if (error instanceof AdminIngestRequestError) {
      throw error;
    }

    if (signal?.aborted) {
      throw signal.reason instanceof Error
        ? signal.reason
        : new DOMException("The operation was aborted.", "AbortError");
    }

    if (streamAcknowledged || /^event:\s*(?:accepted|heartbeat)\s*$/im.test(buffer)) {
      throw new AdminIngestRequestError("豆包浏览器长连接中断，系统未切换其他模型。", {
        status: 503,
        errorCode: "ADMIN_INGEST_SELECTED_MODEL_UNAVAILABLE",
        causeCode: "DOUBAO_REQUEST_FAILED",
        retryable: true,
        provider: "doubao-pro",
        requestedProvider: "doubao-pro",
        fallbackUsed: false,
        failureDetails: { parseStage: "browser_sse_network" }
      });
    }

    throw error;
  } finally {
    try {
      await reader.cancel();
    } catch {
      // The response stream may already be closed or aborted.
    }

    try {
      reader.releaseLock();
    } catch {
      // The reader can already be released by the browser after abort.
    }
  }
}

function readGptResponseContent(data: GptIngestResponse) {
  const messageContent = typeof data.message === "string"
    ? data.message
    : isPlainRecord(data.message)
      ? readString(data.message.content)
      : "";

  return readString(data.replyMarkdown)
    || readString(data.content)
    || readString(data.answer)
    || readString(data.reply)
    || messageContent;
}

function applyExpressionLayer(output: string, model?: string, source = "admin_ingest_client") {
  return processAIOutput(output, {
    model,
    source,
    mode: "visible_output"
  }).output;
}

function inferKnowledgeCandidateSource(attachments?: IngestUploadState[]): KnowledgeCandidateSource {
  const first = attachments?.[0];
  const fileName = first?.fileName.toLowerCase() ?? "";
  const mimeType = first?.mimeType?.toLowerCase() || first?.fileType.toLowerCase() || "";

  if (/\.pptx?$/.test(fileName) || mimeType.includes("presentation")) {
    return "ppt";
  }

  if (/\.docx?$/.test(fileName) || mimeType.includes("word")) {
    return "word";
  }

  if (first) {
    return "document";
  }

  return "conversation";
}

function buildKnowledgeLoopBundle(input: {
  text: string;
  replyMarkdown: string;
  draft: IngestKnowledgeDraft;
  attachments?: IngestUploadState[];
}): {
  knowledgeLoop?: KnowledgeLoopResult;
  evolution?: KnowledgeEvolutionResult;
  storeDecision?: KnowledgeStoreDecision;
  reusableKnowledgeUnits?: KnowledgeLoopCandidate[];
  reviewRequiredUnits?: KnowledgeLoopCandidate[];
  autoStoreCandidates?: KnowledgeLoopCandidate[];
  metadata: {
    knowledgeLoopVersion: "v1";
    autoStoreEnabled: false;
    requiresReview: boolean;
    errorHandled?: boolean;
  };
} {
  try {
    const loopEngine = new KnowledgeLoopEngine({
      autoStoreAvailable: false
    });
    const knowledgeLoop = loopEngine.processConversation({
      text: input.text,
      replyMarkdown: input.replyMarkdown,
      draft: {
        title: input.draft.title,
        summary: input.draft.summary,
        category: input.draft.category,
        tags: input.draft.tags,
        standardQuestion: input.draft.standardQuestion,
        standardAnswer: input.draft.standardAnswer,
        scenarios: input.draft.scenarios
      },
      source: inferKnowledgeCandidateSource(input.attachments),
      autoStoreAvailable: false
    });
    const evolution = new KnowledgeEvolutionEngine().normalizeDraft(knowledgeLoop.draft);
    const reusableKnowledgeUnits = knowledgeLoop.candidates.filter((candidate) => candidate.reusable);
    const reviewRequiredUnits = knowledgeLoop.candidates.filter((candidate) => candidate.storeAction === "review_required");
    const autoStoreCandidates = knowledgeLoop.candidates.filter((candidate) => candidate.storeAction === "auto_store");

    return {
      knowledgeLoop,
      evolution,
      storeDecision: knowledgeLoop.storeDecision,
      reusableKnowledgeUnits,
      reviewRequiredUnits,
      autoStoreCandidates,
      metadata: {
        knowledgeLoopVersion: "v1",
        autoStoreEnabled: false,
        requiresReview: knowledgeLoop.storeDecision.requiresReview || reviewRequiredUnits.length > 0
      }
    };
  } catch {
    return {
      metadata: {
        knowledgeLoopVersion: "v1",
        autoStoreEnabled: false,
        requiresReview: true,
        errorHandled: true
      }
    };
  }
}

function buildDraftMemoryPlan(draft: IngestKnowledgeDraft) {
  return new KnowledgeMemoryAdapter().buildMemoryPlan(draft);
}

function buildDraftMemoryReport(plan: KnowledgeMemoryPlan): KnowledgeMemoryReport {
  return {
    enabled: true,
    mode: plan.mode,
    storedCount: 0,
    draftCount: plan.candidates.length,
    indexedCount: 0,
    failedCount: 0,
    retrievalCheck: plan.retrievalCheck,
    warnings: plan.warnings,
    recommendedAction: plan.recommendedAction,
    intelligence: plan.intelligence,
    ragOptimization: plan.ragOptimization
  };
}

function attachMemoryPlan(draft: IngestKnowledgeDraft): IngestKnowledgeDraft {
  const memoryPlan = draft.memoryPlan ?? buildDraftMemoryPlan(draft);

  return {
    ...draft,
    memoryPlan,
    memory: draft.memory ?? buildDraftMemoryReport(memoryPlan),
    knowledgeIntelligence: draft.knowledgeIntelligence ?? memoryPlan.intelligence,
    ragOptimization: draft.ragOptimization ?? memoryPlan.ragOptimization
  };
}

function waitForStream(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("生成已停止"));
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    function onAbort() {
      clearTimeout(timer);
      reject(new Error("生成已停止"));
    }

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function streamStyledOutput(output: string, options?: IngestStreamingOptions, preserveRawOutput = false) {
  if (!options?.onToken && !options?.onThinking) {
    return;
  }

  const renderer = new GPTOSRendererV3();
  const interval = Math.min(50, Math.max(20, options.chunkIntervalMs ?? 30));
  const mergeWindow = Math.min(60, Math.max(20, options.mergeWindowMs ?? 30));
  const thinkingDelay = Math.max(0, options.thinkingDelayMs ?? 3000);
  const chunkSize = output.length > 3000 ? 14 : output.length > 1200 ? 7 : 2;
  const chunks = createSmoothedStreamChunks(preserveRawOutput ? output : renderer.formatStream(output), chunkSize);
  let visibleText = "";

  options.onThinking?.({ thinking: true, message: "AI正在思考..." });

  if (thinkingDelay > 0) {
    await waitForStream(thinkingDelay, options.signal);
  }

  options.onThinking?.({ thinking: false, message: "正在生成回答..." });

  for (const chunk of chunks) {
    if (options.signal?.aborted) {
      throw new Error("生成已停止");
    }

    const formattedChunk = preserveRawOutput ? chunk : renderer.formatStream(chunk);
    visibleText = `${visibleText}${formattedChunk}`;
    options.onToken?.(formattedChunk, visibleText);
    await waitForStream(Math.max(interval, mergeWindow), options.signal);
  }
}

function createSmoothedStreamChunks(output: string, targetSize: number) {
  const chunks: string[] = [];
  let buffer = "";

  for (const char of output) {
    buffer = `${buffer}${char}`;

    if (/[。！？!?；;：:\n]/.test(char) || buffer.length >= targetSize) {
      chunks.push(buffer);
      buffer = "";
    }
  }

  if (buffer) {
    chunks.push(buffer);
  }

  return chunks;
}

function toRecordTime(value?: string) {
  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) {
    return "刚刚";
  }

  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function normalizeDraftFromUnknown(data: unknown, input: string, agent: IngestChatAgent, status: IngestKnowledgeDraft["saveStatus"]): IngestKnowledgeDraft {
  const record = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const directQuestion = readString(record.question);
  const directAnswer = readString(record.answer);
  const standardQuestion = readString(record.standardQuestion);
  const standardAnswer = readString(record.standardAnswer);
  const qaPairs = readQaPairs(record.qa_pairs ?? record.structured_qa ?? record.qaPairs);
  const title = readString(record.title) || `${agent.role.replace("知识库", "") || agent.name}投喂知识`;
  const category = readString(record.category) || agent.role || "默认知识库";
  const summary = readString(record.summary) || readString(record.content) || input.slice(0, 120);
  const confidence = readNumber(record.confidence ?? record.trainingScore, 82);
  const firstPair = qaPairs[0] ?? (standardQuestion || standardAnswer || directQuestion || directAnswer ? {
    q: standardQuestion || directQuestion || `关于“${title}”，应该如何处理？`,
    a: standardAnswer || directAnswer || summary
  } : {
    q: `关于“${title}”，应该如何处理？`,
    a: summary || `建议按当前 ${agent.name} 的知识口径处理，并保留来源记录。`
  });
  const saveRecommendation = readString(record.saveRecommendation);
  const saveSuggestion = typeof record.saveSuggestion === "boolean"
    ? record.saveSuggestion
    : saveRecommendation
      ? saveRecommendation === "可以入库"
      : confidence >= 80;
  const recommendation = saveRecommendation === "暂缓入库"
    ? "暂不入库"
    : saveRecommendation === "需要补充资料"
      ? "需要复核"
      : saveSuggestion
        ? "建议入库"
        : "需要复核";

  const draft: IngestKnowledgeDraft = {
    id: readString(record.id) || `draft-${Date.now()}`,
    jobId: readString(record.jobId) || null,
    title,
    category,
    categories: readOptionalStringArray(record.categories) ?? [category],
    tags: readTags(record.tags).length > 0 ? readTags(record.tags) : [category.replace("知识库", ""), "AI投喂"].filter(Boolean),
    summary,
    qaPairs: qaPairs.length > 0 ? qaPairs : [firstPair],
    standardQuestion: firstPair.q,
    standardAnswer: firstPair.a,
    standardQuestions: readOptionalStringArray(record.standardQuestions) ?? [firstPair.q],
    standardAnswers: readOptionalStringArray(record.standardAnswers) ?? [firstPair.a],
    trainingScore: Math.min(100, Math.max(1, Math.round(confidence))),
    recommendation,
    saveStatus: status,
    sourceType: "chat",
    scenarios: readOptionalStringArray(record.scenarios),
    sourceMaterials: readOptionalStringArray(record.sourceMaterials),
    complianceNotes: readOptionalStringArray(record.complianceNotes),
    missingFields: readOptionalStringArray(record.missingFields),
    suggestedQuestions: readOptionalStringArray(record.suggestedQuestions ?? record.followUpQuestions),
    userClientCallPlan: isPlainRecord(record.userClientCallPlan) ? record.userClientCallPlan as unknown as GptUserClientCallPlan : undefined,
    saveRecommendation: saveRecommendation || undefined,
    sourceModel: readString(record.sourceModel) || readString(record.model) || undefined,
    generatedBy: readString(record.generatedBy) || readString(record.providerUsed) || undefined,
    providerUsed: readString(record.providerUsed) || "core-engine",
    model: readString(record.model) || "knowledge-core",
    modelMode: record.modelMode === "fixed" ? "fixed" : record.modelMode === "highest" ? "highest" : undefined,
    replyMarkdown: readString(record.replyMarkdown) || undefined,
    fallbackUsed: Boolean(record.fallbackUsed),
    gptProof: isPlainRecord(record.gptProof) ? record.gptProof as unknown as GptCallProof : undefined,
    gptOS: isPlainRecord(record.gptOS) ? record.gptOS as unknown as GptOSRouteResult : undefined,
    actualModel: readString(record.actualModel) || undefined,
    responseId: readString(record.responseId) || undefined,
    usage: isPlainRecord(record.usage) ? record.usage as unknown as OpenAIGptUsage : undefined,
    knowledgeLoop: isPlainRecord(record.knowledgeLoop) ? record.knowledgeLoop as unknown as KnowledgeLoopResult : undefined,
    evolution: isPlainRecord(record.evolution) ? record.evolution as unknown as KnowledgeEvolutionResult : undefined,
    storeDecision: isPlainRecord(record.storeDecision) ? record.storeDecision as unknown as KnowledgeStoreDecision : undefined,
    reusableKnowledgeUnits: Array.isArray(record.reusableKnowledgeUnits) ? record.reusableKnowledgeUnits as KnowledgeLoopCandidate[] : undefined,
    reviewRequiredUnits: Array.isArray(record.reviewRequiredUnits) ? record.reviewRequiredUnits as KnowledgeLoopCandidate[] : undefined,
    autoStoreCandidates: Array.isArray(record.autoStoreCandidates) ? record.autoStoreCandidates as KnowledgeLoopCandidate[] : undefined,
    memory: isPlainRecord(record.memory) ? record.memory as unknown as KnowledgeMemoryReport : undefined,
    memoryPlan: isPlainRecord(record.memoryPlan) ? record.memoryPlan as unknown as KnowledgeMemoryPlan : undefined,
    knowledgeIntelligence: isPlainRecord(record.knowledgeIntelligence) ? record.knowledgeIntelligence as IngestKnowledgeDraft["knowledgeIntelligence"] : undefined,
    ragOptimization: isPlainRecord(record.ragOptimization) ? record.ragOptimization as IngestKnowledgeDraft["ragOptimization"] : undefined
  };

  const enrichedDraft = enrichDraftWithKnowledgeFactoryV5(draft, {
    text: [
      input,
      summary,
      firstPair.q,
      firstPair.a,
      readString(record.replyMarkdown)
    ].filter(Boolean).join("\n\n"),
    title,
    category,
    tags: draft.tags,
    sourceType: draft.sourceType
  });

  return attachMemoryPlan(enrichedDraft);
}

export function createTrainingRecord(input: {
  originalInput: string;
  draft: IngestKnowledgeDraft;
  agent: IngestChatAgent;
  status?: IngestTrainingRecord["saveStatus"];
  sourceType?: string;
  tenantId?: string | null;
  userId?: string | null;
  platform?: IngestPlatform;
}): IngestTrainingRecord {
  const now = new Date().toISOString();
  const saveStatus = input.status ?? (input.draft.saveStatus === "保存失败" ? "失败" : input.draft.saveStatus);

  return {
    id: `record-${input.draft.jobId ?? input.draft.id ?? Date.now()}`,
    jobId: input.draft.jobId,
    tenantId: input.tenantId ?? null,
    userId: input.userId ?? null,
    agentId: input.agent.id,
    expertId: input.agent.expertId ?? null,
    agentName: input.agent.name,
    expertName: input.agent.expertId ? input.agent.name : null,
    input: input.originalInput,
    resultTitle: input.draft.title,
    saveStatus,
    category: input.draft.category,
    time: toRecordTime(now),
    hits: 0,
    sourceType: input.sourceType ?? "admin_ingest",
    source: "admin_ingest",
    platform: input.platform ?? "web",
    syncTarget: [...ingestSyncTarget],
    createdAt: now,
    updatedAt: now,
    aiOutput: input.draft
  };
}

function getDraftRecordIdentifiers(draft: IngestKnowledgeDraft) {
  return new Set([draft.jobId, draft.id, draft.responseId].filter((value): value is string => Boolean(value)));
}

function isTrainingRecordLinkedToDraft(record: IngestTrainingRecord, draft: IngestKnowledgeDraft) {
  const draftIds = getDraftRecordIdentifiers(draft);

  if (draftIds.size === 0) {
    return false;
  }

  return [
    record.jobId,
    record.id,
    record.aiOutput?.jobId,
    record.aiOutput?.id,
    record.aiOutput?.responseId
  ].some((value) => Boolean(value && draftIds.has(value)));
}

function markTrainingRecordSaved(record: IngestTrainingRecord, draft: IngestKnowledgeDraft): IngestTrainingRecord {
  return {
    ...record,
    saveStatus: "已保存",
    aiOutput: record.aiOutput
      ? { ...record.aiOutput, saveStatus: "已保存" }
      : { ...draft, saveStatus: "已保存" }
  };
}

function ensureSavedTrainingRecord(input: {
  records: IngestTrainingRecord[];
  originalInput: string;
  draft: IngestKnowledgeDraft;
  agent: IngestChatAgent;
  tenantId?: string | null;
  userId?: string | null;
  platform: IngestPlatform;
}) {
  const hasLinkedRecord = input.records.some((record) => isTrainingRecordLinkedToDraft(record, input.draft));
  const syncedRecords = input.records.map((record) => isTrainingRecordLinkedToDraft(record, input.draft)
    ? markTrainingRecordSaved(record, input.draft)
    : record);

  if (hasLinkedRecord) {
    return syncedRecords;
  }

  return [
    createTrainingRecord({
      originalInput: input.originalInput,
      draft: input.draft,
      agent: input.agent,
      status: "已保存",
      tenantId: input.tenantId ?? null,
      userId: input.userId ?? null,
      platform: input.platform
    }),
    ...syncedRecords
  ];
}

function normalizeTrainingRecordStatus(status: AdminTrainingRecordResponse["status"]): IngestKnowledgeDraft["saveStatus"] {
  if (["saved", "completed", "stored", "indexed", "knowledge_saved"].includes(status ?? "")) {
    return "已保存";
  }

  if (["rejected", "failed"].includes(status ?? "")) {
    return "已拒绝";
  }

  return "待确认";
}

export function normalizeTrainingRecord(record: AdminTrainingRecordResponse, agent: IngestChatAgent, platform: IngestPlatform = "web"): IngestTrainingRecord {
  const draftStatus = normalizeTrainingRecordStatus(record.status);
  const recordStatus: IngestTrainingRecord["saveStatus"] = draftStatus === "保存失败" ? "失败" : draftStatus;
  const fallbackDraft = normalizeDraftFromUnknown(record.ai_output, record.input ?? record.resultTitle ?? "", agent, draftStatus);

  return {
    id: record.id ?? `record-${Date.now()}`,
    jobId: record.jobId ?? fallbackDraft.jobId,
    tenantId: null,
    userId: null,
    agentId: agent.id,
    agentName: agent.name,
    input: record.input ?? "",
    resultTitle: record.resultTitle ?? fallbackDraft.title,
    saveStatus: recordStatus,
    category: record.category ?? fallbackDraft.category,
    time: toRecordTime(record.timestamp),
    hits: record.hits ?? 0,
    sourceType: record.sourceType ?? "admin_ingest",
    source: "admin_ingest",
    platform,
    syncTarget: [...ingestSyncTarget],
    createdAt: record.timestamp,
    updatedAt: record.timestamp,
    aiOutput: fallbackDraft
  };
}

function gptResponseToDraft(data: GptIngestResponse, originalInput: string, agent: IngestChatAgent): IngestKnowledgeDraft {
  const generatedId = data.jobId || data.trainingRecord?.jobId || `gpt-${Date.now()}`;
  const structured = data.structured ?? {};

  return normalizeDraftFromUnknown({
    ...(data.knowledgeDraft ?? structured),
    userClientCallPlan: data.userClientCallPlan ?? data.knowledgeDraft?.userClientCallPlan,
    suggestedQuestions: data.suggestedQuestions ?? structured.followUpQuestions,
    saveRecommendation: data.saveRecommendation ?? data.knowledgeDraft?.saveRecommendation,
    id: generatedId,
    jobId: data.jobId || data.trainingRecord?.jobId || null,
    providerUsed: data.provider,
    model: data.modelDisplayName || data.model,
    sourceModel: data.model,
    actualModel: data.actualModel || data.model,
    responseId: data.responseId,
    usage: data.usage,
    gptProof: data.gptProof,
    gptOS: data.gptOS,
    knowledgeLoop: data.knowledgeLoop,
    evolution: data.evolution,
    storeDecision: data.storeDecision,
    reusableKnowledgeUnits: data.reusableKnowledgeUnits,
    reviewRequiredUnits: data.reviewRequiredUnits,
    autoStoreCandidates: data.autoStoreCandidates,
    memory: data.memory,
    memoryPlan: data.memoryPlan,
    knowledgeIntelligence: data.knowledgeIntelligence ?? data.knowledgeDraft?.knowledgeIntelligence,
    ragOptimization: data.ragOptimization ?? data.knowledgeDraft?.ragOptimization,
    generatedBy: data.provider,
    modelMode: data.modelMode,
    replyMarkdown: data.replyMarkdown,
    fallbackUsed: data.fallbackUsed === true
  }, originalInput, agent, "待确认");
}

export async function sendCoreIngest(input: {
  text: string;
  agent: IngestChatAgent;
  category: string;
  model: string;
  modelProvider?: IngestModelProvider;
  gptTier?: GptTier;
  gptTierLabel?: string;
  gptVersion?: GptVersion;
  selectedModelLabel?: string;
  tenantId?: string | null;
  userId?: string | null;
  attachments?: IngestUploadState[];
  recentMessages?: Array<{
    role: "user" | "assistant";
    content: string;
    model?: string | null;
    provider?: string | null;
  }>;
  previousKnowledgeDrafts?: Array<Partial<IngestKnowledgeDraft>>;
  recentTrainingRecords?: Array<{
    input?: string;
    resultTitle?: string;
    category?: string;
    saveStatus?: string;
  }>;
  autonomous?: AutonomousTaskRequest;
  platform?: IngestPlatform;
  streaming?: IngestStreamingOptions;
  requestId?: string;
  conversationId?: string;
  knowledgeBaseId?: string | null;
  contextSummary?: string;
  memoryContextText?: string;
  agentLearningInstruction?: string;
  usedMemoryIds?: string[];
}) {
  const platform = input.platform ?? "web";
  const normalizedModelSelection = normalizeIngestModelSelection({
    provider: input.modelProvider,
    selectedModelLabel: input.selectedModelLabel ?? input.model,
    modelDisplayName: input.model,
    preferredModel: input.model
  });
  const selectedModelOption = normalizedModelSelection.option;
  const modelProvider = normalizedModelSelection.provider;
  const gptSelection = getGptModelSelectionByDisplayName(modelProvider === "openai" ? input.selectedModelLabel ?? input.model : "GPT-5.5 超高");
  const selectedModelLabel = normalizedModelSelection.label;
  const preferredModel = normalizedModelSelection.actualModel;
  const runtimeOrchestrator = new AIRuntimeOrchestrator();
  const runtimeResult = runtimeOrchestrator.handleRequest(input.text, {
    source: "admin_ingest",
    runtimeEntry: "admin_ingest_client",
    userId: input.userId ?? null,
    tenantId: input.tenantId ?? null,
    platform,
    category: input.category,
    agentName: input.agent.name,
    agentRole: input.agent.role,
    model: selectedModelLabel,
    provider: modelProvider,
    recentMessages: input.recentMessages ?? [],
    previousKnowledgeDrafts: input.previousKnowledgeDrafts ?? [],
    recentTrainingRecords: input.recentTrainingRecords ?? []
  });
  const agentKnowledgeScope = buildClientAgentKnowledgeScope(input.agent);
  const requestId = input.requestId ?? runtimeResult.requestId;
  const useDoubaoBrowserSse = platform === "web" && modelProvider === "doubao-pro";

  if (modelProvider !== "doubao-pro") {
    try {
      const health = await checkGptHealthStatus({
        provider: modelProvider,
        selectedModelLabel,
        preferredModel
      });
      const healthState = normalizeIngestResult(health.ok ? 200 : 503, health);

      if (healthState.type === "auth_failure") {
        console.warn("[admin-ingest:auth-access:health-warning]", {
          status: healthState.status,
          errorCode: healthState.errorCode,
          provider: health.provider,
          actualModel: health.actualModel ?? health.model,
          requestId,
          message: healthState.message
        });
      }

      if (healthState.type === "model_health_failure") {
        console.warn("[admin-ingest:model-health:warning]", {
          status: healthState.status,
          errorCode: healthState.errorCode,
          provider: health.provider,
          actualModel: health.actualModel ?? health.model,
          requestId,
          message: healthState.message
        });
      }
    } catch (error) {
      console.warn("[admin-ingest:model-health:non-blocking]", {
        requestId,
        message: error instanceof Error ? error.message : String(error ?? "")
      });
    }
  }

  try {
    const response = await fetch("/api/admin/kb/ingest/gpt", {
      method: "POST",
      credentials: "include",
      signal: input.streaming?.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: useDoubaoBrowserSse ? "text/event-stream, application/json" : "application/json",
        "x-request-id": requestId
      },
      body: JSON.stringify({
        input: input.text,
        source: "admin_ingest",
        sourceApp: "admin_ingest",
        ...agentKnowledgeScope,
        conversationId: input.conversationId,
        knowledgeBaseId: input.knowledgeBaseId ?? agentKnowledgeScope.knowledgeBaseId,
        knowledgeVersion: "v1",
        expertId: input.agent.expertId ?? null,
        agentName: input.agent.name,
        expertName: input.agent.expertId ? input.agent.name : null,
        agentDescription: input.agent.description,
        targetUser: input.agent.role,
        category: input.category,
        model: selectedModelOption.label,
        tenantId: input.tenantId ?? null,
        userId: input.userId ?? null,
        attachments: input.attachments ?? [],
        platform,
        syncTarget: [...ingestSyncTarget],
        modelProvider,
        modelMode: "highest",
        preferredModel,
        gptTier: modelProvider === "openai" ? input.gptTier ?? gptSelection.tier : undefined,
        gptTierLabel: modelProvider === "openai" ? input.gptTierLabel ?? gptSelection.tierLabel : undefined,
        gptVersion: modelProvider === "openai" ? input.gptVersion ?? gptSelection.version : undefined,
        selectedModelLabel,
        modelDisplayName: selectedModelLabel,
        recentMessages: input.recentMessages ?? [],
        ...buildAdminIngestContextRequestFields(input),
        previousKnowledgeDrafts: input.previousKnowledgeDrafts ?? [],
        recentTrainingRecords: input.recentTrainingRecords ?? [],
        runtimeContext: {
          requestId,
          conversationId: input.conversationId,
          contextSummary: input.contextSummary,
          retrievalMode: runtimeResult.diagnostics.retrievalMode,
          retrieval: runtimeResult.retrieval,
          commercialDecision: runtimeResult.decision,
          outputStrategy: runtimeResult.strategy,
          validation: runtimeResult.validation
        },
        autonomous: input.autonomous,
        autoSave: false
      })
    });
    const transportResult = await readAdminIngestResponse(response, input.streaming?.signal, {
      expectedRequestId: requestId,
      onVisibleReply: input.streaming?.onVisibleReply,
      onStatus: input.streaming?.onStatus
    });
    const payload = transportResult.payload;
    const responseStatus = transportResult.status;
    const responseMeta = {
      status: responseStatus,
      ok: responseStatus >= 200 && responseStatus < 300
    };
    const ingestResult = normalizeIngestResult(responseMeta, payload);

    if (isGptFailureResponse(payload) && payload.errorCode === "ADMIN_INGEST_SELECTED_MODEL_UNAVAILABLE") {
      throw toAdminIngestRequestError(payload, responseStatus, requestId);
    }

    if (ingestResult.type === "auth_failure") {
      console.warn("[admin-ingest:auth-access:error]", {
        url: "/api/admin/kb/ingest/gpt",
        status: ingestResult.status,
        errorCode: ingestResult.errorCode,
        message: ingestResult.message,
        requestId
      });
      throw new Error(`${ingestResult.errorCode ?? "AUTH_REQUIRED"}: ${ingestResult.message}`);
    }

    if (ingestResult.type === "model_health_failure") {
      console.warn("[admin-ingest:model-health:warning]", {
        url: "/api/admin/kb/ingest/gpt",
        status: ingestResult.status,
        errorCode: ingestResult.errorCode,
        message: ingestResult.message,
        provider: ingestResult.provider,
        actualModel: ingestResult.actualModel,
        requestId
      });
      throw new Error(`${ingestResult.errorCode ?? "MODEL_HEALTH_FAILURE"}: ${ingestResult.message}`);
    }

    if (isGptFailureResponse(payload) && ingestResult.type !== "success") {
      const userMessage = sanitizeGptOSUserMessage(payload.userMessage || payload.message || "AI服务暂时不稳定，请稍后再试。");

      if (payload.errorCode === "ATTACHMENT_CONTENT_MISSING" || payload.errorCode === "ATTACHMENT_EVIDENCE_MISMATCH") {
        console.warn("[admin-ingest:attachment-evidence:warning]", {
          status: responseStatus,
          errorCode: payload.errorCode,
          requestId
        });
        throw new Error(`${payload.errorCode}: ${userMessage}`);
      }

      console.error("[admin-ingest:gpt:error]", {
        url: "/api/admin/kb/ingest/gpt",
        status: responseStatus,
        errorCode: payload.errorCode,
        message: payload.message,
        provider: payload.provider,
        model: payload.model,
        requestId
      });

      throw toAdminIngestRequestError(payload, responseStatus, requestId);
    }

    if (ingestResult.type !== "success" || !ingestResult.raw) {
      const normalizedError = normalizeIngestErrorPayload(responseMeta, payload);
      console.error("[admin-ingest:gpt:error]", {
        url: "/api/admin/kb/ingest/gpt",
        status: normalizedError.status,
        errorCode: normalizedError.errorCode,
        message: normalizedError.message,
        provider: normalizedError.provider,
        actualModel: normalizedError.actualModel,
        requestId
      });
      throw new AdminIngestRequestError(getFriendlyIngestError(responseMeta, payload), {
        status: normalizedError.status,
        errorCode: normalizedError.errorCode,
        provider: normalizedError.provider,
        actualModel: normalizedError.actualModel,
        requestId
      });
    }

    const normalizedSuccess = normalizeIngestSuccessPayload(payload);
    const data = ingestResult.raw as unknown as GptIngestResponse;
    const actualProvider = String(normalizedSuccess?.provider ?? data.provider ?? "").trim().toLowerCase();
    const preserveRawSelectedModelOutput = actualProvider === "doubao"
      || actualProvider === "doubao-pro"
      || actualProvider === "deepseek"
      || actualProvider === "deepseek-pro";
    const rawSelectedModelReply = typeof data.replyMarkdown === "string" ? data.replyMarkdown : "";
    const replyContent = preserveRawSelectedModelOutput
      ? rawSelectedModelReply || ingestResult.replyText || normalizedSuccess?.replyText || readGptResponseContent(data)
      : ingestResult.replyText || normalizedSuccess?.replyText || readGptResponseContent(data);
    const visibleReply = replyContent
      || readString(data.structured?.summary)
      || readString(data.structured?.answer)
      || readString(data.knowledgeDraft?.summary)
      || readString(data.knowledgeDraft?.standardAnswer)
      || "AI已完成知识整理，训练记录已更新。";

    console.info("[admin-ingest:gpt:success]", {
      provider: normalizedSuccess?.provider ?? data.provider,
      actualModel: normalizedSuccess?.actualModel ?? data.actualModel ?? data.model,
      contentLength: visibleReply.length,
      requestId
    });

    const styledReply = preserveRawSelectedModelOutput
      ? visibleReply
      : applyExpressionLayer(visibleReply, selectedModelLabel, "admin_ingest_model_reply");
    const runtimeFinalOutput = runtimeOrchestrator.generateFinalOutput({
      query: input.text,
      baseResponse: styledReply,
      retrieval: runtimeResult.retrieval,
      decision: runtimeResult.decision,
      strategy: runtimeResult.strategy
    });
    const runtimeFeedback = runtimeOrchestrator.collectFeedbackLoop({
      query: input.text,
      responseText: styledReply,
      retrieval: runtimeResult.retrieval,
      decision: runtimeResult.decision
    });
    await streamStyledOutput(styledReply, input.streaming, preserveRawSelectedModelOutput);
    const streamEvent = normalizeJsonToIngestStreamEvent({
      requestId,
      conversationId: input.conversationId,
      text: styledReply
    });
    const normalizedData = {
      ...data,
      replyMarkdown: styledReply,
      runtimeOrchestrator: {
        ...runtimeResult,
        finalOutput: runtimeFinalOutput,
        feedback: runtimeFeedback
      }
    };
    const draft = gptResponseToDraft(normalizedData, input.text, input.agent);

    if (preserveRawSelectedModelOutput) {
      draft.replyMarkdown = styledReply;
    }

    const knowledgeLoopBundle = buildKnowledgeLoopBundle({
      text: input.text,
      replyMarkdown: styledReply,
      draft,
      attachments: input.attachments
    });

    draft.fallbackUsed = draft.fallbackUsed ?? false;
    draft.knowledgeLoop = knowledgeLoopBundle.knowledgeLoop;
    draft.evolution = knowledgeLoopBundle.evolution;
    draft.storeDecision = knowledgeLoopBundle.storeDecision;
    draft.reusableKnowledgeUnits = knowledgeLoopBundle.reusableKnowledgeUnits;
    draft.reviewRequiredUnits = knowledgeLoopBundle.reviewRequiredUnits;
    draft.autoStoreCandidates = knowledgeLoopBundle.autoStoreCandidates;
    const memoryPlan = buildDraftMemoryPlan(draft);
    draft.memoryPlan = memoryPlan;
    draft.memory = buildDraftMemoryReport(memoryPlan);
    draft.knowledgeIntelligence = draft.knowledgeIntelligence ?? memoryPlan.intelligence;
    draft.ragOptimization = draft.ragOptimization ?? memoryPlan.ragOptimization;

    const records = data.records?.length
      ? data.records.map((record) => normalizeTrainingRecord(record, input.agent, platform))
      : [createTrainingRecord({
        originalInput: input.text,
        draft,
        agent: input.agent,
        tenantId: input.tenantId ?? null,
        userId: input.userId ?? null,
        platform
      })];

    return {
      draft,
      records,
      preview: false,
      provider: draft.providerUsed ?? modelProvider,
      model: normalizedData.modelDisplayName ?? selectedModelLabel,
      requestedProvider: normalizedData.requestedProvider ?? modelProvider,
      actualProvider: normalizedData.actualProvider ?? normalizedData.provider ?? draft.providerUsed ?? modelProvider,
      requestedModel: normalizedData.requestedModel,
      actualModel: normalizedData.actualModel ?? normalizedData.model,
      fallbackUsed: normalizedData.fallbackUsed === true,
      modelDiagnostics: normalizedData.modelDiagnostics,
      responseId: normalizedData.responseId,
      usage: normalizedData.usage,
      gptProof: normalizedData.gptProof,
      diagnostics: normalizedData.diagnostics ?? [],
      autonomousResult: normalizedData.autonomousResult ?? normalizedData.gptOS?.autonomousResult,
      modelMode: draft.modelMode,
      visibleReply: styledReply,
      replyMarkdown: preserveRawSelectedModelOutput ? styledReply : draft.replyMarkdown,
      requestId,
      conversationId: input.conversationId,
      ok: true,
      status: responseStatus,
      replyText: styledReply,
      retryable: false,
      streamEvent,
      runtimeOrchestrator: normalizedData.runtimeOrchestrator,
      knowledgeLoop: draft.knowledgeLoop,
      evolution: draft.evolution,
      storeDecision: draft.storeDecision,
      memory: draft.memory,
      memoryPlan: draft.memoryPlan,
      knowledgeIntelligence: draft.knowledgeIntelligence,
      ragOptimization: draft.ragOptimization,
      metadata: knowledgeLoopBundle.metadata,
      saveSuggestion: draft.recommendation === "建议入库",
      message: `${selectedModelLabel} 已生成结构化知识：${draft.title}`
    };
  } catch (error) {
    if (error instanceof AdminIngestRequestError) {
      throw error;
    }

    throw new Error(sanitizeGptOSUserMessage(error instanceof Error
      ? error.message
      : "AI服务暂时不稳定，请稍后再试。"));
  }
}

export async function retryDoubaoKnowledgeDraftMetadata(input: {
  originalInput: string;
  replyMarkdown: string;
  sourceResponseId: string;
  messageId: string;
  draft: IngestKnowledgeDraft;
  agent: IngestChatAgent;
  tenantId?: string | null;
  userId?: string | null;
  platform?: IngestPlatform;
  signal?: AbortSignal;
}) {
  const jobId = input.draft.jobId?.trim() ?? "";
  const sourceResponseId = input.sourceResponseId.trim();
  const messageId = input.messageId.trim();

  if (!jobId || !sourceResponseId || !messageId || !input.replyMarkdown.trim()) {
    throw new AdminIngestRequestError("当前豆包正文缺少待确认任务或响应标识，无法重新整理知识草稿。", {
      status: 422,
      errorCode: "ADMIN_INGEST_DOUBAO_METADATA_RECOVERY_FAILED",
      causeCode: "DOUBAO_RESPONSE_PARSE_FAILED",
      retryable: false,
      provider: "doubao-pro",
      requestedProvider: "doubao-pro",
      actualProvider: "doubao-pro",
      fallbackUsed: false
    });
  }

  const platform = input.platform ?? "web";
  const doubaoOption = getIngestModelOptionByProvider("doubao-pro");
  const requestId = `metadata-recovery-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const attemptId = `${requestId}:attempt-1`;
  const agentKnowledgeScope = buildClientAgentKnowledgeScope(input.agent);
  const response = await fetch("/api/admin/kb/ingest/gpt", {
    method: "POST",
    credentials: "include",
    signal: input.signal,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-request-id": requestId
    },
    body: JSON.stringify({
      operation: "retry_doubao_metadata",
      input: input.originalInput || "重新整理豆包知识草稿",
      replyMarkdown: input.replyMarkdown,
      sourceResponseId,
      jobId,
      messageId,
      attemptId,
      ...agentKnowledgeScope,
      tenantId: input.tenantId ?? null,
      userId: input.userId ?? null,
      platform,
      syncTarget: [...ingestSyncTarget],
      modelProvider: "doubao-pro",
      modelMode: "highest",
      preferredModel: doubaoOption.defaultModel,
      selectedModelLabel: doubaoOption.label,
      modelDisplayName: doubaoOption.label
    })
  });
  const payload = await response.json().catch(() => null) as ApiEnvelope<GptIngestResponse> | GptFailureResponse | null;

  if (!response.ok || !payload || isGptFailureResponse(payload) || payload.ok !== true || !payload.data) {
    if (payload && isGptFailureResponse(payload)) {
      throw toAdminIngestRequestError(payload, response.status, requestId);
    }

    const message = payload && "message" in payload && typeof payload.message === "string"
      ? payload.message
      : "豆包知识草稿暂时未整理完成，正文仍已完整保留。";
    throw new AdminIngestRequestError(message, {
      status: response.status || 503,
      errorCode: "ADMIN_INGEST_DOUBAO_METADATA_RECOVERY_FAILED",
      causeCode: "DOUBAO_REQUEST_FAILED",
      retryable: response.status >= 500,
      provider: "doubao-pro",
      requestedProvider: "doubao-pro",
      actualProvider: "doubao-pro",
      requestedModel: doubaoOption.defaultModel,
      actualModel: doubaoOption.defaultModel,
      requestId,
      fallbackUsed: false
    });
  }

  const data = payload.data;
  const actualProvider = String(data.actualProvider ?? data.provider ?? "").trim().toLowerCase();
  const actualModel = String(data.actualModel ?? data.model ?? "").trim();

  if (
    data.jobId !== jobId
    || data.messageId !== messageId
    || data.attemptId !== attemptId
    || data.sourceResponseId !== sourceResponseId
    || data.metadataState !== "ready"
    || data.replyMarkdown !== input.replyMarkdown
    || actualProvider !== "doubao-pro"
    || actualModel !== doubaoOption.defaultModel
    || data.fallbackUsed === true
  ) {
    throw new AdminIngestRequestError("豆包知识草稿恢复结果与当前正文绑定不一致，已拒绝更新。", {
      status: 502,
      errorCode: "ADMIN_INGEST_DOUBAO_METADATA_RECOVERY_FAILED",
      causeCode: "DOUBAO_RESPONSE_PARSE_FAILED",
      retryable: false,
      provider: "doubao-pro",
      requestedProvider: "doubao-pro",
      actualProvider,
      requestedModel: doubaoOption.defaultModel,
      actualModel,
      requestId,
      fallbackUsed: false
    });
  }

  const metadataDraft = gptResponseToDraft(data, input.originalInput, input.agent);
  const recoveredDraft: IngestKnowledgeDraft = {
    ...metadataDraft,
    id: input.draft.id,
    jobId,
    providerUsed: input.draft.providerUsed ?? "doubao",
    model: input.draft.model,
    sourceModel: input.draft.sourceModel,
    actualModel: input.draft.actualModel ?? actualModel,
    modelMode: input.draft.modelMode,
    responseId: sourceResponseId,
    usage: input.draft.usage,
    gptProof: input.draft.gptProof,
    gptOS: input.draft.gptOS,
    sourceType: input.draft.sourceType,
    sourceMaterials: input.draft.sourceMaterials,
    replyMarkdown: input.replyMarkdown,
    standardAnswer: input.replyMarkdown,
    standardAnswers: [input.replyMarkdown],
    fallbackUsed: false,
    saveStatus: "待确认",
    knowledgeLoop: undefined,
    evolution: undefined,
    storeDecision: undefined,
    reusableKnowledgeUnits: undefined,
    reviewRequiredUnits: undefined,
    autoStoreCandidates: undefined,
    memory: undefined,
    memoryPlan: undefined,
    knowledgeIntelligence: undefined,
    ragOptimization: undefined
  };
  const knowledgeLoopBundle = buildKnowledgeLoopBundle({
    text: input.originalInput,
    replyMarkdown: input.replyMarkdown,
    draft: recoveredDraft
  });
  recoveredDraft.knowledgeLoop = knowledgeLoopBundle.knowledgeLoop;
  recoveredDraft.evolution = knowledgeLoopBundle.evolution;
  recoveredDraft.storeDecision = knowledgeLoopBundle.storeDecision;
  recoveredDraft.reusableKnowledgeUnits = knowledgeLoopBundle.reusableKnowledgeUnits;
  recoveredDraft.reviewRequiredUnits = knowledgeLoopBundle.reviewRequiredUnits;
  recoveredDraft.autoStoreCandidates = knowledgeLoopBundle.autoStoreCandidates;
  const memoryPlan = buildDraftMemoryPlan(recoveredDraft);
  recoveredDraft.memoryPlan = memoryPlan;
  recoveredDraft.memory = buildDraftMemoryReport(memoryPlan);
  recoveredDraft.knowledgeIntelligence = memoryPlan.intelligence;
  recoveredDraft.ragOptimization = memoryPlan.ragOptimization;

  const serverRecords = data.records?.length
    ? data.records.map((record) => normalizeTrainingRecord(record, input.agent, platform))
    : data.trainingRecord
      ? [normalizeTrainingRecord(data.trainingRecord, input.agent, platform)]
      : [];
  const hasCurrentRecord = serverRecords.some((record) => record.jobId === jobId);
  const records = (hasCurrentRecord ? serverRecords : [
    createTrainingRecord({
      originalInput: input.originalInput,
      draft: recoveredDraft,
      agent: input.agent,
      tenantId: input.tenantId,
      userId: input.userId,
      platform
    }),
    ...serverRecords
  ]).map((record) => record.jobId === jobId
    ? {
        ...record,
        resultTitle: recoveredDraft.title,
        category: recoveredDraft.category,
        saveStatus: "待确认" as const,
        aiOutput: recoveredDraft,
        updatedAt: new Date().toISOString()
      }
    : record);

  return {
    draft: recoveredDraft,
    records,
    jobId,
    messageId,
    attemptId,
    sourceResponseId,
    metadataResponseId: data.metadataResponseId ?? null,
    replyMarkdown: input.replyMarkdown,
    provider: "doubao-pro" as const,
    requestedModel: data.requestedModel ?? doubaoOption.defaultModel,
    actualModel,
    fallbackUsed: false as const,
    diagnostics: data.diagnostics ?? []
  };
}

export async function saveKnowledgeDraft(input: {
  draft: IngestKnowledgeDraft;
  agent: IngestChatAgent;
  originalInput: string;
  tenantId?: string | null;
  userId?: string | null;
  platform?: IngestPlatform;
}) {
  const platform = input.platform ?? "web";
  const agentKnowledgeScope = buildClientAgentKnowledgeScope(input.agent);
  const draftWithMetadata = input.draft as unknown as { metadata?: unknown };
  const draftMetadata = typeof draftWithMetadata.metadata === "object" && draftWithMetadata.metadata !== null
    ? draftWithMetadata.metadata as Record<string, unknown>
    : {};
  const knowledgeVersion = typeof draftMetadata.knowledgeGovernanceVersion === "string" && draftMetadata.knowledgeGovernanceVersion.trim()
    ? draftMetadata.knowledgeGovernanceVersion.trim()
    : "v1";
  const memoryAdapter = new KnowledgeMemoryAdapter();
  const memoryPlan = input.draft.memoryPlan ?? memoryAdapter.buildMemoryPlan(input.draft);
  const qaPairs = memoryPlan.qaPairs.length > 0
    ? memoryPlan.qaPairs
    : input.draft.qaPairs?.length
      ? input.draft.qaPairs
      : [{ q: input.draft.standardQuestion, a: input.draft.standardAnswer }];
  const structured = {
    title: input.draft.title,
    category: input.draft.category,
    tags: input.draft.tags,
    summary: memoryPlan.structuredSummary || input.draft.summary || input.draft.standardAnswer,
    qa_pairs: qaPairs,
    confidence: input.draft.trainingScore,
    should_save: input.draft.recommendation !== "暂不入库",
    scenarios: input.draft.scenarios ?? [],
    sourceMaterials: input.draft.sourceMaterials ?? [],
    complianceNotes: input.draft.complianceNotes ?? [],
    userClientCallPlan: input.draft.userClientCallPlan,
    missingFields: input.draft.missingFields ?? [],
    suggestedQuestions: input.draft.suggestedQuestions ?? [],
    saveRecommendation: input.draft.saveRecommendation ?? input.draft.recommendation,
    sourceModel: input.draft.sourceModel ?? input.draft.model ?? "unknown",
    generatedBy: input.draft.generatedBy ?? input.draft.providerUsed ?? "unknown",
    providerUsed: input.draft.providerUsed ?? "unknown",
    model: input.draft.model ?? "unknown",
    fallbackUsed: input.draft.fallbackUsed ?? false,
    knowledgeFactory: input.draft.knowledgeFactory,
    knowledgeFactoryV3: input.draft.knowledgeFactoryV3,
    knowledgeUnits: input.draft.knowledgeFactory?.units ?? [],
    evolvingKnowledgeUnits: input.draft.knowledgeFactoryV3?.evolvedUnits ?? [],
    promotedKnowledgeUnits: input.draft.knowledgeFactoryV3?.promotedUnits ?? [],
    retrievalHints: input.draft.knowledgeFactory?.retrievalHints ?? [],
    retrievalEnhancement: input.draft.knowledgeFactoryV3?.retrievalEnhancement,
    generationPlan: input.draft.knowledgeFactory?.generationPlan ?? [],
    knowledgeLoop: input.draft.knowledgeLoop,
    evolution: input.draft.evolution,
    storeDecision: input.draft.storeDecision,
    reusableKnowledgeUnits: input.draft.reusableKnowledgeUnits ?? [],
    reviewRequiredUnits: input.draft.reviewRequiredUnits ?? [],
    autoStoreCandidates: input.draft.autoStoreCandidates ?? [],
    memory: input.draft.memory ?? buildDraftMemoryReport(memoryPlan),
    memoryPlan,
    knowledgeIntelligence: input.draft.knowledgeIntelligence ?? memoryPlan.intelligence,
    ragOptimization: input.draft.ragOptimization ?? memoryPlan.ragOptimization,
    knowledgeLoopMetadata: {
      knowledgeLoopVersion: "v1",
      autoStoreEnabled: false,
      requiresReview: input.draft.storeDecision?.requiresReview ?? true
    }
  };

  try {
    const response = await fetch("/api/admin/kb/save", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId: input.draft.jobId ?? null,
        draftId: input.draft.id,
        messageId: input.draft.responseId ?? input.draft.id,
        title: input.draft.title,
        content: input.draft.standardAnswer || input.draft.summary || input.draft.replyMarkdown || null,
        replyMarkdown: input.draft.replyMarkdown ?? null,
        knowledgeDraft: input.draft,
        knowledgeLoop: input.draft.knowledgeLoop ?? null,
        memory: input.draft.memory ?? null,
        sourceFiles: input.draft.sourceMaterials ?? [],
        tags: input.draft.tags,
        scenario: input.draft.scenarios?.[0] ?? null,
        originalInput: input.originalInput,
        structured,
        knowledge: structured,
        ...agentKnowledgeScope,
        knowledgeVersion,
        expertId: input.agent.expertId ?? null,
        agentName: input.agent.name,
        expertName: input.agent.expertId ? input.agent.name : null,
        tenantId: input.tenantId ?? null,
        userId: input.userId ?? null,
        source: "admin_ingest",
        sourceApp: "admin_ingest",
        platform,
        syncTarget: [...ingestSyncTarget]
      })
    });
    const data = await readApiData<{
      records?: AdminTrainingRecordResponse[];
      record?: AdminTrainingRecordResponse;
      knowledgeItem?: AdminSavedKnowledgeResponse;
      status?: "saved";
      knowledgeItemId?: string | null;
      storedCount?: number;
      chunkCount?: number;
      indexedCount?: number;
      message?: string;
    }>(response);
    const responseRecords = data.records?.length ? data.records : data.record ? [data.record] : [];
    const retrievalCandidate = memoryPlan.candidates[0] ?? input.draft.knowledgeLoop?.candidates[0] ?? null;
    const retrievalCheck = await memoryAdapter.runRetrievalCheck(retrievalCandidate, {
      expectedTitle: data.knowledgeItem?.title ?? input.draft.title
    });
    const memory = memoryAdapter.buildStoredKnowledgeReport({
      draft: input.draft,
      savedKnowledge: data.knowledgeItem ?? null,
      retrievalCheck
    });
    const savedDraft = {
      ...input.draft,
      saveStatus: "已保存" as const,
      memoryPlan,
      memory,
      knowledgeIntelligence: input.draft.knowledgeIntelligence ?? memoryPlan.intelligence,
      ragOptimization: input.draft.ragOptimization ?? memoryPlan.ragOptimization
    };
    const normalizedResponseRecords = responseRecords.map((record) => normalizeTrainingRecord(record, input.agent, platform));

    return {
      draft: savedDraft,
      records: ensureSavedTrainingRecord({
        records: normalizedResponseRecords,
        originalInput: input.originalInput,
        draft: savedDraft,
        agent: input.agent,
        tenantId: input.tenantId ?? null,
        userId: input.userId ?? null,
        platform
      }),
      preview: false,
      message: data.message ?? "已保存知识入库，训练记录已更新。"
    };
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "保存接口暂不可用，未写入长期知识库。");
  }
}

export function createUploadState(file: File, context: {
  tenantId?: string | null;
  userId?: string | null;
  agentId?: string | null;
  platform?: IngestPlatform;
} = {}): IngestUploadState {
  const isImage = file.type.startsWith("image/") || /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(file.name);
  const previewUrl = isImage && typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
    ? URL.createObjectURL(file)
    : undefined;

  return {
    id: `upload-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    fileName: file.name,
    fileType: file.type || file.name.split(".").pop() || "unknown",
    fileSize: file.size,
    isImage,
    previewUrl,
    rawFile: file,
    mimeType: file.type || "application/octet-stream",
    parseStatus: "metadata_only",
    status: "ready_to_send",
    source: "admin_ingest",
    platform: context.platform ?? "web",
    syncTarget: [...ingestSyncTarget],
    tenantId: context.tenantId ?? null,
    userId: context.userId ?? null,
    agentId: context.agentId ?? null,
    createdAt: new Date().toISOString()
  };
}

interface ParseFileResponse {
  ok: boolean;
  data?: {
    fileName: string;
    fileType: string;
    mimeType: string;
    sizeBytes: number;
    parseStatus: "parsed" | "partial" | "metadata_only" | "unsupported" | "ocr_pending";
    extractedText: string;
    pageSummaries: string[];
    slideTexts: Array<{ slideIndex: number; text: string }>;
    totalPages?: number;
    processedPageStart?: number | null;
    processedPageEnd?: number | null;
    nextPage?: number | null;
    complete?: boolean;
    successfulPages?: number[];
    failedPages?: number[];
    lowConfidencePages?: number[];
    coveragePercent?: number;
    successRatePercent?: number;
    deadlineReached?: boolean;
    limitationNote: string;
  };
  message?: string;
  error?: {
    message?: string;
  };
}

export interface AdminIngestFileModelAffinity {
  modelProvider: "deepseek-pro" | "doubao-pro";
  preferredModel: string;
  selectedModelLabel: string;
  strictModelAffinity: true;
}

export interface AdminIngestFileParseProgress {
  fileId: string;
  fileName: string;
  totalPages: number;
  processedPageStart: number | null;
  processedPageEnd: number | null;
  successfulPages: number[];
  failedPages: number[];
  lowConfidencePages: number[];
  coveragePercent: number;
  complete: boolean;
  deadlineReached: boolean;
}

export interface AdminIngestFileParseOptions {
  signal?: AbortSignal;
  pageBatchSize?: number;
  requestTimeoutMs?: number;
  onProgress?: (progress: AdminIngestFileParseProgress) => void;
}

export class AdminIngestFileParseCancelledError extends Error {
  readonly code = "ADMIN_INGEST_FILE_PARSE_CANCELLED";

  constructor(readonly files: IngestUploadState[]) {
    super("附件解析已取消，已保留完成页面和续传位置。");
    this.name = "AdminIngestFileParseCancelledError";
  }
}

const DEFAULT_FILE_PARSE_BATCH_SIZE = 4;
const MAX_FILE_PARSE_BATCH_SIZE = 6;
const DEFAULT_FILE_PARSE_REQUEST_TIMEOUT_MS = 135_000;
const MAX_FILE_PARSE_BATCHES = 2_500;

function uniqueSortedPositiveIntegers(values: number[] = []) {
  return Array.from(new Set(values.filter((value) => Number.isInteger(value) && value > 0)))
    .sort((left, right) => left - right);
}

function mergeUniqueText(values: string[] = [], additions: string[] = []) {
  return Array.from(new Set([...values, ...additions].map((value) => value.trim()).filter(Boolean)));
}

function mergeSlideTexts(
  values: Array<{ slideIndex: number; text: string }> = [],
  additions: Array<{ slideIndex: number; text: string }> = []
) {
  const bySlide = new Map<number, string>();

  for (const slide of [...values, ...additions]) {
    if (Number.isInteger(slide.slideIndex) && slide.slideIndex > 0 && slide.text.trim()) {
      bySlide.set(slide.slideIndex, slide.text.trim());
    }
  }

  return Array.from(bySlide, ([slideIndex, text]) => ({ slideIndex, text }))
    .sort((left, right) => left.slideIndex - right.slideIndex);
}

function mergeExtractedText(values: string[] = []) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).join("\n\n");
}

function createParseRequestSignal(parentSignal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => controller.abort(parentSignal?.reason);

  if (parentSignal?.aborted) {
    abortFromParent();
  } else {
    parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  }

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("ADMIN_INGEST_FILE_PARSE_TIMEOUT"));
  }, timeoutMs);

  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup: () => {
      clearTimeout(timeoutId);
      parentSignal?.removeEventListener("abort", abortFromParent);
    }
  };
}

export function stripUploadRuntimeFields(file: IngestUploadState): Omit<IngestUploadState, "rawFile"> {
  const safeFile = { ...file };

  delete safeFile.rawFile;

  return safeFile;
}

export async function parseUploadedFileForGpt(
  file: IngestUploadState,
  modelAffinity?: AdminIngestFileModelAffinity,
  options: AdminIngestFileParseOptions = {}
): Promise<IngestUploadState> {
  if (!file.rawFile) {
    return {
      ...file,
      parseStatus: file.parseStatus ?? (file.extractedText || file.summary ? "parsed" : "metadata_only"),
      limitationNote: file.limitationNote ?? "当前附件没有原始 File 对象，只能把已有元数据传给 GPT。"
    };
  }

  if (
    file.complete === true
    && (file.extractedText || file.pageSummaries?.length || file.slideTexts?.length)
  ) {
    return {
      ...file,
      status: "parsed",
      parseStatus: file.parseStatus ?? "parsed"
    };
  }

  const pageBatchSize = Math.min(
    MAX_FILE_PARSE_BATCH_SIZE,
    Math.max(1, Math.floor(options.pageBatchSize ?? DEFAULT_FILE_PARSE_BATCH_SIZE))
  );
  const requestTimeoutMs = Math.min(
    180_000,
    Math.max(10_000, Math.floor(options.requestTimeoutMs ?? DEFAULT_FILE_PARSE_REQUEST_TIMEOUT_MS))
  );
  const resumePage = file.complete === false && Number.isInteger(file.nextPage) && (file.nextPage ?? 0) > 0
    ? file.nextPage as number
    : 1;
  const extractedTextParts: string[] = file.extractedText ? [file.extractedText] : [];
  let pageSummaries: string[] = [...(file.pageSummaries ?? [])];
  let slideTexts: Array<{ slideIndex: number; text: string }> = [...(file.slideTexts ?? [])];
  let successfulPages: number[] = uniqueSortedPositiveIntegers(file.successfulPages);
  let failedPages: number[] = uniqueSortedPositiveIntegers(file.failedPages);
  let lowConfidencePages: number[] = uniqueSortedPositiveIntegers(file.lowConfidencePages);
  let limitationNotes: string[] = file.limitationNote ? [file.limitationNote] : [];
  let totalPages = file.totalPages ?? 0;
  let pageStart = resumePage;
  let processedPageStart: number | null = file.processedPageStart ?? null;
  let processedPageEnd: number | null = file.processedPageEnd ?? null;
  let nextPage: number | null = resumePage;
  let coveragePercent = file.coveragePercent ?? 0;
  let successRatePercent = file.successRatePercent ?? 0;
  let deadlineReached = file.deadlineReached === true;
  let lastData: NonNullable<ParseFileResponse["data"]> | null = null;

  const buildCurrentUploadState = (input: {
    cancelled?: boolean;
    resumePage?: number;
  } = {}): IngestUploadState => {
    const extractedText = mergeExtractedText(extractedTextParts);
    const hasEvidence = Boolean(extractedText || pageSummaries.length > 0 || slideTexts.length > 0);
    const effectiveNextPage = input.cancelled ? input.resumePage ?? pageStart : nextPage;
    const complete = input.cancelled ? false : effectiveNextPage === null && lastData?.complete !== false;
    const processedPageCount = uniqueSortedPositiveIntegers([...successfulPages, ...failedPages]).length;
    const finalSuccessRatePercent = processedPageCount > 0
      ? Math.round((successfulPages.length / processedPageCount) * 10_000) / 100
      : successRatePercent;
    const parseStatus = hasEvidence
      ? complete && failedPages.length === 0 && lowConfidencePages.length === 0
        ? "parsed" as const
        : "partial" as const
      : lastData?.parseStatus ?? "metadata_only" as const;
    const cancellationNote = input.cancelled
      ? `已停止解析；此前成功页面和第 ${effectiveNextPage ?? pageStart} 页续传位置已保留。`
      : "";

    return {
      ...file,
      fileType: lastData?.mimeType || file.fileType,
      fileSize: lastData?.sizeBytes || file.fileSize,
      mimeType: lastData?.mimeType || file.mimeType,
      extractedText: extractedText || undefined,
      summary: extractedText ? extractedText.slice(0, 360) : file.summary,
      pageSummaries,
      slideTexts,
      totalPages,
      processedPageStart,
      processedPageEnd,
      nextPage: effectiveNextPage,
      complete,
      successfulPages,
      failedPages,
      lowConfidencePages,
      coveragePercent: complete ? 100 : coveragePercent,
      successRatePercent: finalSuccessRatePercent,
      deadlineReached,
      parseStatus,
      limitationNote: mergeUniqueText(limitationNotes, [cancellationNote]).join(" "),
      status: hasEvidence ? "parsed" : input.cancelled ? "ready_to_send" : "failed"
    };
  };

  const throwCancelled = (nextResumePage = pageStart): never => {
    throw new AdminIngestFileParseCancelledError([
      buildCurrentUploadState({ cancelled: true, resumePage: nextResumePage })
    ]);
  };

  for (let batchIndex = 0; batchIndex < MAX_FILE_PARSE_BATCHES && nextPage !== null; batchIndex += 1) {
    if (options.signal?.aborted) {
      throwCancelled(pageStart);
    }

    const formData = new FormData();

    formData.append("file", file.rawFile);
    formData.append("fileName", file.fileName);
    formData.append("mimeType", file.mimeType || file.fileType || file.rawFile.type || "application/octet-stream");
    formData.append("pageStart", String(pageStart));
    formData.append("pageBatchSize", String(pageBatchSize));

    if (modelAffinity) {
      formData.append("modelProvider", modelAffinity.modelProvider);
      formData.append("preferredModel", modelAffinity.preferredModel);
      formData.append("selectedModelLabel", modelAffinity.selectedModelLabel);
      formData.append("strictModelAffinity", String(modelAffinity.strictModelAffinity));
    }

    const requestSignal = createParseRequestSignal(options.signal, requestTimeoutMs);
    let response: Response;

    try {
      response = await fetch("/api/admin/kb/ingest/files/parse", {
        method: "POST",
        credentials: "include",
        body: formData,
        signal: requestSignal.signal
      });
    } catch {
      if (options.signal?.aborted) {
        throwCancelled(pageStart);
      }

      const timeoutMessage = requestSignal.timedOut()
        ? `第 ${pageStart} 页起的解析批次超过 ${Math.round(requestTimeoutMs / 1000)} 秒，已保留此前成功页面，可稍后重试。`
        : "附件解析服务暂时不可用，已保留此前成功页面。";
      limitationNotes = mergeUniqueText(limitationNotes, [timeoutMessage]);

      if (extractedTextParts.length === 0 && pageSummaries.length === 0 && slideTexts.length === 0) {
        return {
          ...file,
          status: "failed",
          parseStatus: "metadata_only",
          limitationNote: timeoutMessage
        };
      }

      deadlineReached ||= requestSignal.timedOut();
      break;
    } finally {
      requestSignal.cleanup();
    }

    const payload = await response.json().catch(() => null) as ParseFileResponse | null;

    if (!response.ok || !payload?.ok || !payload.data) {
      const failureMessage = payload?.message ?? payload?.error?.message ?? "文件解析失败，已保留此前成功页面。";
      limitationNotes = mergeUniqueText(limitationNotes, [failureMessage]);

      if (extractedTextParts.length === 0 && pageSummaries.length === 0 && slideTexts.length === 0) {
        return {
          ...file,
          status: "failed",
          parseStatus: "metadata_only",
          limitationNote: failureMessage
        };
      }

      break;
    }

    const data = payload.data;
    const previousPageStart = pageStart;
    lastData = data;
    totalPages = Math.max(totalPages, data.totalPages ?? 0);
    processedPageStart = processedPageStart ?? data.processedPageStart ?? null;
    processedPageEnd = Math.max(processedPageEnd ?? 0, data.processedPageEnd ?? 0) || null;
    successfulPages = uniqueSortedPositiveIntegers([...successfulPages, ...(data.successfulPages ?? [])]);
    failedPages = uniqueSortedPositiveIntegers([...failedPages, ...(data.failedPages ?? [])]);
    lowConfidencePages = uniqueSortedPositiveIntegers([...lowConfidencePages, ...(data.lowConfidencePages ?? [])]);
    pageSummaries = mergeUniqueText(pageSummaries, data.pageSummaries);
    slideTexts = mergeSlideTexts(slideTexts, data.slideTexts);
    limitationNotes = mergeUniqueText(limitationNotes, [data.limitationNote]);
    coveragePercent = data.coveragePercent ?? (data.complete ? 100 : coveragePercent);
    successRatePercent = data.successRatePercent ?? successRatePercent;
    deadlineReached ||= data.deadlineReached === true;

    if (data.extractedText?.trim()) {
      extractedTextParts.push(data.extractedText);
    }

    nextPage = data.complete === true ? null : data.nextPage ?? null;
    if (data.totalPages !== undefined || data.processedPageStart != null || data.processedPageEnd != null) {
      options.onProgress?.({
        fileId: file.id,
        fileName: file.fileName,
        totalPages,
        processedPageStart: data.processedPageStart ?? processedPageStart,
        processedPageEnd: data.processedPageEnd ?? processedPageEnd,
        successfulPages,
        failedPages,
        lowConfidencePages,
        coveragePercent,
        complete: nextPage === null,
        deadlineReached: data.deadlineReached === true
      });
    }

    if (nextPage !== null && nextPage <= previousPageStart) {
      limitationNotes = mergeUniqueText(limitationNotes, [
        `第 ${previousPageStart} 页起的批次没有取得可续传进度，已停止自动重试并保留成功页面。`
      ]);
      break;
    }

    if (nextPage !== null) {
      pageStart = nextPage;
    }
  }

  const retryPages = [...failedPages];

  for (const retryPage of retryPages) {
    if (options.signal?.aborted) {
      throwCancelled(retryPage);
    }

    const retryFormData = new FormData();

    retryFormData.append("file", file.rawFile);
    retryFormData.append("fileName", file.fileName);
    retryFormData.append("mimeType", file.mimeType || file.fileType || file.rawFile.type || "application/octet-stream");
    retryFormData.append("pageStart", String(retryPage));
    retryFormData.append("pageBatchSize", "1");

    if (modelAffinity) {
      retryFormData.append("modelProvider", modelAffinity.modelProvider);
      retryFormData.append("preferredModel", modelAffinity.preferredModel);
      retryFormData.append("selectedModelLabel", modelAffinity.selectedModelLabel);
      retryFormData.append("strictModelAffinity", String(modelAffinity.strictModelAffinity));
    }

    const retrySignal = createParseRequestSignal(options.signal, requestTimeoutMs);

    try {
      const retryResponse = await fetch("/api/admin/kb/ingest/files/parse", {
        method: "POST",
        credentials: "include",
        body: retryFormData,
        signal: retrySignal.signal
      });
      const retryPayload = await retryResponse.json().catch(() => null) as ParseFileResponse | null;
      const retryData = retryResponse.ok && retryPayload?.ok ? retryPayload.data : null;

      if (!retryData || !(retryData.successfulPages ?? []).includes(retryPage)) {
        limitationNotes = mergeUniqueText(limitationNotes, [`第 ${retryPage} 页单页重试后仍未获得可靠文字证据。`]);
        continue;
      }

      failedPages = failedPages.filter((page) => page !== retryPage);
      successfulPages = uniqueSortedPositiveIntegers([...successfulPages, retryPage]);
      lowConfidencePages = uniqueSortedPositiveIntegers([
        ...lowConfidencePages.filter((page) => page !== retryPage),
        ...(retryData.lowConfidencePages ?? [])
      ]);
      pageSummaries = mergeUniqueText(pageSummaries, retryData.pageSummaries);
      slideTexts = mergeSlideTexts(slideTexts, retryData.slideTexts);
      limitationNotes = mergeUniqueText(limitationNotes, [retryData.limitationNote, `第 ${retryPage} 页单页重试成功。`]);

      if (retryData.extractedText?.trim()) {
        extractedTextParts.push(retryData.extractedText);
      }

      options.onProgress?.({
        fileId: file.id,
        fileName: file.fileName,
        totalPages,
        processedPageStart,
        processedPageEnd,
        successfulPages,
        failedPages,
        lowConfidencePages,
        coveragePercent,
        complete: nextPage === null,
        deadlineReached
      });
    } catch {
      if (options.signal?.aborted) {
        throwCancelled(retryPage);
      }

      limitationNotes = mergeUniqueText(limitationNotes, [
        retrySignal.timedOut()
          ? `第 ${retryPage} 页单页重试超时，已保留其他成功页面。`
          : `第 ${retryPage} 页单页重试失败，已保留其他成功页面。`
      ]);
    } finally {
      retrySignal.cleanup();
    }
  }

  return buildCurrentUploadState();
}

export async function parseUploadedFilesForGpt(
  files: IngestUploadState[],
  concurrency = 2,
  modelAffinity?: AdminIngestFileModelAffinity,
  options: AdminIngestFileParseOptions = {}
) {
  const results = new Array<IngestUploadState>(files.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < files.length) {
      const index = nextIndex;
      nextIndex += 1;

      try {
        results[index] = await parseUploadedFileForGpt({
          ...files[index],
          status: "parsing"
        }, modelAffinity, options);
      } catch (error) {
        if (error instanceof AdminIngestFileParseCancelledError) {
          results[index] = error.files[0] ?? files[index];
          throw new AdminIngestFileParseCancelledError(
            files.map((original, fileIndex) => results[fileIndex] ?? original)
          );
        }

        throw error;
      }
    }
  }

  await Promise.all(Array.from(
    { length: Math.min(Math.max(1, Math.floor(concurrency)), files.length) },
    () => worker()
  ));

  return results;
}

export async function sendUrlIngestPreview(input: {
  url: string;
  agent: IngestChatAgent;
  category: string;
  model: string;
  modelProvider?: IngestModelProvider;
  gptTier?: GptTier;
  gptTierLabel?: string;
  gptVersion?: GptVersion;
  selectedModelLabel?: string;
  tenantId?: string | null;
  userId?: string | null;
  platform?: IngestPlatform;
}) {
  const platform = input.platform ?? "web";
  const normalizedModelSelection = normalizeIngestModelSelection({
    provider: input.modelProvider,
    selectedModelLabel: input.selectedModelLabel ?? input.model,
    modelDisplayName: input.model,
    preferredModel: input.model
  });
  const selectedModelOption = normalizedModelSelection.option;
  const modelProvider = normalizedModelSelection.provider;
  const gptSelection = getGptModelSelectionByDisplayName(modelProvider === "openai" ? input.selectedModelLabel ?? input.model : "GPT-5.5 超高");
  const selectedModelLabel = normalizedModelSelection.label;
  const agentKnowledgeScope = buildClientAgentKnowledgeScope(input.agent);
  const response = await fetch("/api/admin/kb/ingest/url", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: input.url,
      sourceUrl: input.url,
      source: "admin_ingest",
      sourceApp: "admin_ingest",
      sourceType: "url",
      ...agentKnowledgeScope,
      knowledgeVersion: "v1",
      expertId: input.agent.expertId ?? null,
      agentName: input.agent.name,
      expertName: input.agent.expertId ? input.agent.name : null,
      category: input.category,
      model: selectedModelOption.label,
      tenantId: input.tenantId ?? null,
      userId: input.userId ?? null,
      platform,
      syncTarget: [...ingestSyncTarget],
      modelProvider,
      modelMode: "highest",
      preferredModel: normalizedModelSelection.actualModel,
      gptTier: modelProvider === "openai" ? input.gptTier ?? gptSelection.tier : undefined,
      gptTierLabel: modelProvider === "openai" ? input.gptTierLabel ?? gptSelection.tierLabel : undefined,
      gptVersion: modelProvider === "openai" ? input.gptVersion ?? gptSelection.version : undefined,
      selectedModelLabel,
      modelDisplayName: selectedModelLabel,
      autoSave: false
    })
  });
  const data = await readApiData<UrlIngestPreviewResponse>(response);
  const styledReplyMarkdown = data.replyMarkdown
    ? applyExpressionLayer(data.replyMarkdown, selectedModelLabel, "admin_ingest_url_preview")
    : undefined;
  const draft = normalizeDraftFromUnknown({
    ...data.draft,
    jobId: data.job.id,
    providerUsed: data.draft.providerUsed,
    model: data.draft.model || selectedModelLabel,
    fallbackUsed: data.draft.fallbackUsed,
    replyMarkdown: styledReplyMarkdown
  }, input.url, input.agent, data.draft.saveStatus === "saved" ? "已保存" : "待确认");

  draft.jobId = data.job.id;
  draft.sourceType = "url";

  const records = data.records?.length
    ? data.records.map((record) => normalizeTrainingRecord(record, input.agent, platform))
    : [createTrainingRecord({
      originalInput: `网址投喂：${input.url}`,
      draft,
      agent: input.agent,
      sourceType: "url",
      tenantId: input.tenantId ?? null,
      userId: input.userId ?? null,
      platform
    })];

  return {
    draft,
    records,
    preview: true,
    provider: draft.providerUsed ?? "url-preview",
    model: draft.model ?? selectedModelLabel,
    modelMode: "highest" as const,
    replyMarkdown: styledReplyMarkdown,
    saveSuggestion: draft.recommendation === "建议入库",
    message: data.message
  };
}

export async function checkLicenseStatus(): Promise<IngestConnectionStatus> {
  try {
    const response = await fetch("/api/license/status", { cache: "no-store", credentials: "include" });
    const payload = await response.json().catch(() => null) as ApiEnvelope<{
      active?: boolean;
      status?: string;
      license?: {
        status?: string;
      } | null;
    }> | null;

    if (!response.ok || !payload?.ok) {
      return {
        enterpriseSpace: "本地预览",
        knowledgeBase: "默认知识库",
        licenseStatus: response.status === 401 ? "本地预览" : "未激活",
        checkedAt: new Date().toISOString()
      };
    }

    const rawStatus = [
      payload.data?.status,
      payload.data?.license?.status
    ].filter(Boolean).join(" ").toLowerCase();
    const isActive = payload.data?.active === true || rawStatus.includes("active") || rawStatus.includes("已激活");

    return {
      enterpriseSpace: "已连接",
      knowledgeBase: "默认知识库",
      licenseStatus: isActive ? "已激活" : "未激活",
      checkedAt: new Date().toISOString()
    };
  } catch {
    return {
      enterpriseSpace: "本地预览",
      knowledgeBase: "默认知识库",
      licenseStatus: "本地预览",
      checkedAt: new Date().toISOString()
    };
  }
}

export async function checkGptHealthStatus(input: {
  provider?: IngestModelProvider;
  selectedModelLabel?: string;
  preferredModel?: string;
  testRequest?: boolean;
  forceTestRequest?: boolean;
} = {}): Promise<IngestGptHealthStatus> {
  const params = new URLSearchParams();
  const provider = input.provider ?? getIngestModelOptionByLabel(input.selectedModelLabel).provider;
  const selectedOption = input.selectedModelLabel
    ? getIngestModelOptionByLabel(input.selectedModelLabel)
    : getIngestModelOptionByLabel(provider);

  params.set("provider", provider);

  if (input.selectedModelLabel) {
    params.set("selectedModelLabel", input.selectedModelLabel);
  }

  if (input.preferredModel) {
    params.set("preferredModel", input.preferredModel);
  }

  if (provider === "doubao-pro") {
    params.set("testRequest", input.testRequest === true ? "true" : "false");
    if (input.forceTestRequest === true) {
      params.set("forceTestRequest", "true");
    }
  }

  const suffix = params.toString() ? `?${params.toString()}` : "";

  try {
    const response = await fetch(`/api/admin/kb/ingest/models/health${suffix}`, { cache: "no-store", credentials: "include" });
    const payload = await response.json().catch(() => null) as IngestGptHealthStatus | ApiEnvelope<IngestGptHealthStatus> | null;

    if (response.status === 401 || response.status === 403) {
      const message = response.status === 401
        ? "请重新登录后再试。"
        : "当前账号没有投喂权限，请确认卡密或账号权限。";

      return {
        ok: false,
        configured: false,
        provider,
        baseUrlConfigured: true,
        baseUrlSource: "default",
        modelConfigured: true,
        modelSource: "default",
        apiKeyConfigured: false,
        selectedModelLabel: input.selectedModelLabel ?? selectedOption.label,
        model: input.preferredModel ?? selectedOption.defaultModel,
        mode: "highest",
        message,
        diagnostics: [`auth:${response.status === 401 ? "AUTH_REQUIRED" : "NO_INGEST_ACCESS"}`],
        checkedAt: new Date().toISOString(),
        requestTested: false
      };
    }

    if (isPlainRecord(payload) && typeof payload.provider === "string") {
      return payload as IngestGptHealthStatus;
    }

    if (isPlainRecord(payload) && payload.ok === true && "data" in payload && payload.data) {
      return payload.data as IngestGptHealthStatus;
    }

    return {
      ok: false,
      configured: false,
      provider,
      baseUrlConfigured: true,
      baseUrlSource: "default",
      modelConfigured: true,
      modelSource: "default",
      apiKeyConfigured: false,
      selectedModelLabel: input.selectedModelLabel ?? selectedOption.label,
      model: input.preferredModel ?? selectedOption.defaultModel,
      mode: "highest",
      message: "模型健康检查接口暂不可用",
      diagnostics: ["请确认 /api/admin/kb/ingest/models/health 可以访问。"],
      checkedAt: new Date().toISOString(),
      requestTested: false
    };
  } catch {
    return {
      ok: false,
      configured: false,
      provider,
      baseUrlConfigured: true,
      baseUrlSource: "default",
      modelConfigured: true,
      modelSource: "default",
      apiKeyConfigured: false,
      selectedModelLabel: input.selectedModelLabel ?? selectedOption.label,
      model: input.preferredModel ?? selectedOption.defaultModel,
      mode: "highest",
      message: "模型健康检查请求失败",
      diagnostics: ["请检查 Web 服务是否启动，或稍后重新连接模型。"],
      checkedAt: new Date().toISOString(),
      requestTested: false
    };
  }
}
