import { apiError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import type { RbacUser } from "@/lib/auth/rbac";
import { ValidationError } from "@/lib/errors";
import { getRequestIdFromHeaders } from "@/lib/logger";
import {
  type OpenAIAdminIngestAttachment
} from "@/lib/enterprise/openai-ingest-client";
import {
  AdminIngestModelAffinityError,
  resolveAdminIngestModelProvider,
  runAdminIngestWithSelectedModel
} from "@/lib/enterprise/ingest-model-provider";
import {
  runDoubaoMetadataRecovery,
  type DoubaoAdminIngestProgressEvent,
  type DoubaoMetadataRecoveryResult
} from "@/lib/enterprise/doubao-ingest-client";
import type { EnterpriseStructuredKnowledge } from "@/lib/enterprise/ai-ingest-service";
import {
  normalizeAdminIngestPlatform,
  type AdminIngestPlatform
} from "@/lib/enterprise/admin-ingest-platform";
import type {
  AutonomousTaskMode,
  AutonomousTaskRequest
} from "@/lib/enterprise/gpt-os-autonomous-executor";
import { normalizeGptOSFallback } from "@/lib/enterprise/gpt-os-fallback-normalizer";
import {
  enhanceGPTStyle,
  type GptOSStyleLayerResult
} from "@/lib/enterprise/gpt-os-style-layer";
import { resolveIngestModelRuntime } from "@/lib/enterprise/ingest-model-options";
import { requireAdminIngestActor } from "@/lib/enterprise/admin-ingest-auth";
import {
  hasCanonicalAdminIngestGroundingScope,
  retrieveAdminIngestGrounding,
  shouldUseStrictAdminIngestGrounding,
  type AdminIngestGroundingResult
} from "@/lib/enterprise/admin-ingest-grounding";
import {
  buildAdminIngestWechatGroundingRequest
} from "@/lib/enterprise/admin-ingest-wechat-grounding";
import type {
  AdminIngestWechatOutputMode
} from "@/lib/enterprise/admin-ingest-wechat-output-mode";
import { readAdminIngestContextRequestFields } from "@/lib/enterprise/admin-ingest-context-boundary";
import { isRetryableDoubaoStrictModelFailure } from "@/lib/enterprise/admin-ingest-request-error";
import { buildAdminIngestPublishedMemoryContext } from "@/lib/enterprise/admin-ingest-published-memory-context";
import {
  claimEnterpriseDoubaoMetadataRecovery,
  completeEnterpriseDoubaoMetadataRecovery,
  createEnterpriseIngestLog,
  failEnterpriseDoubaoMetadataRecovery,
  listEnterpriseTrainingRecords,
  normalizeEnterpriseStructuredKnowledge,
  type EnterpriseIngestActor
} from "@/lib/enterprise/ingest-logger";
import { hasDatabaseUrl } from "@/lib/server-config";
import {
  ATTACHMENT_CONTENT_MISSING_CODE,
  ATTACHMENT_EVIDENCE_MISMATCH_CODE,
  assessAdminIngestAttachmentEvidence,
  buildAttachmentContentMissingMessage,
  findUnsupportedAdminIngestAttachmentClaim
} from "@/lib/enterprise/ingest-attachment-evidence";

export const runtime = "nodejs";

type AdminIngestRequestAttachment = OpenAIAdminIngestAttachment & {
  wechatOutputMode?: AdminIngestWechatOutputMode;
};
export const dynamic = "force-dynamic";

function jsonUtf8(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

const ADMIN_INGEST_SSE_HEARTBEAT_MS = 12_000;

type SafeDoubaoFailureDetails = {
  parseStage?: string;
  finishReason?: string;
  eventCount?: number;
  receivedChars?: number;
  receivedContent?: boolean;
  timeoutStage?: string;
  abortSource?: string;
  retryAfterMs?: number;
};

function readSafeDoubaoFailureDetails(error: unknown): SafeDoubaoFailureDetails | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const rawDetails = (error as { details?: unknown }).details;

  if (!isPlainObject(rawDetails)) {
    return undefined;
  }

  const parseStages = new Set([
    "provider_payload",
    "sse_event",
    "provider_error",
    "model_identity",
    "finish_reason",
    "stream_eof",
    "reply_json"
  ]);
  const timeoutStages = new Set(["connect", "first_event", "idle", "hard"]);
  const abortSources = new Set(["client", "hard_timeout"]);
  const parseStage = readString(rawDetails.parseStage);
  const timeoutStage = readString(rawDetails.timeoutStage);
  const abortSource = readString(rawDetails.abortSource);
  const finishReason = readString(rawDetails.finishReason).slice(0, 40);
  const eventCount = Number(rawDetails.eventCount);
  const receivedChars = Number(rawDetails.receivedChars);
  const retryAfterMs = Number(rawDetails.retryAfterMs);
  const safeDetails: SafeDoubaoFailureDetails = {
    parseStage: parseStages.has(parseStage) ? parseStage : undefined,
    finishReason: finishReason || undefined,
    eventCount: Number.isSafeInteger(eventCount) && eventCount >= 0 ? eventCount : undefined,
    receivedChars: Number.isSafeInteger(receivedChars) && receivedChars >= 0 ? receivedChars : undefined,
    receivedContent: typeof rawDetails.receivedContent === "boolean" ? rawDetails.receivedContent : undefined,
    timeoutStage: timeoutStages.has(timeoutStage) ? timeoutStage : undefined,
    abortSource: abortSources.has(abortSource) ? abortSource : undefined,
    retryAfterMs: Number.isSafeInteger(retryAfterMs) && retryAfterMs >= 0 ? retryAfterMs : undefined
  };

  return Object.values(safeDetails).some((value) => value !== undefined)
    ? safeDetails
    : undefined;
}

function browserAcceptsAdminIngestSse(request: Request) {
  return request.headers.get("accept")?.toLowerCase().includes("text/event-stream") === true;
}

function encodeAdminIngestSseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function createDoubaoBrowserSseResponse(input: {
  request: Request;
  requestId: string;
  selectedModelLabel: string;
  requestedModel: string;
  producer: (
    signal: AbortSignal,
    onProgressEvent: (event: DoubaoAdminIngestProgressEvent) => void
  ) => Promise<Response>;
}) {
  const encoder = new TextEncoder();
  const providerController = new AbortController();
  const startedAt = Date.now();
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;

  const abortProvider = () => {
    if (!providerController.signal.aborted) {
      providerController.abort(input.request.signal.reason);
    }
  };
  const cleanup = () => {
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    input.request.signal.removeEventListener("abort", abortProvider);
  };
  const enqueue = (event: string, data: unknown) => {
    if (closed || !streamController) {
      return false;
    }

    try {
      streamController.enqueue(encoder.encode(encodeAdminIngestSseEvent(event, data)));
      return true;
    } catch {
      closed = true;
      cleanup();
      abortProvider();
      return false;
    }
  };
  const close = () => {
    if (closed) {
      return;
    }

    closed = true;
    cleanup();

    try {
      streamController?.close();
    } catch {
      // The browser may have cancelled the response between the final event and close.
    }
  };

  if (input.request.signal.aborted) {
    abortProvider();
  } else {
    input.request.signal.addEventListener("abort", abortProvider, { once: true });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
      enqueue("accepted", {
        type: "accepted",
        requestId: input.requestId,
        provider: "doubao-pro",
        selectedModelLabel: input.selectedModelLabel,
        requestedModel: input.requestedModel,
        fallbackUsed: false
      });
      heartbeat = setInterval(() => {
        enqueue("heartbeat", {
          type: "heartbeat",
          requestId: input.requestId,
          elapsedMs: Date.now() - startedAt
        });
      }, ADMIN_INGEST_SSE_HEARTBEAT_MS);

      const onProgressEvent = (event: DoubaoAdminIngestProgressEvent) => {
        if (providerController.signal.aborted || closed) {
          return;
        }

        if (event.type === "visible_reply") {
          enqueue("visible", {
            type: "visible",
            requestId: input.requestId,
            provider: "doubao-pro",
            actualModel: event.model,
            responseId: event.responseId,
            fallbackUsed: false,
            replyMarkdown: event.replyMarkdown,
            metadataPending: true
          });
          return;
        }

        if (event.type === "queue_wait") {
          enqueue("status", {
            type: event.type,
            requestId: input.requestId,
            phase: event.phase,
            queueDepth: event.queueDepth
          });
          return;
        }

        if (event.type === "rate_limit_wait") {
          enqueue("status", {
            type: event.type,
            requestId: input.requestId,
            phase: event.phase,
            retryAfterMs: event.retryAfterMs,
            attempt: event.attempt
          });
          return;
        }

        enqueue("status", {
          type: event.type,
          requestId: input.requestId,
          state: event.state,
          failureCode: event.failureCode
        });
      };

      void input.producer(providerController.signal, onProgressEvent).then(async (response) => {
        const payload = await response.json().catch(() => ({
          ok: false,
          success: false,
          errorCode: "ADMIN_INGEST_SELECTED_MODEL_UNAVAILABLE",
          causeCode: "DOUBAO_RESPONSE_PARSE_FAILED",
          retryable: true,
          fallback: false,
          fallbackUsed: false,
          provider: "doubao-pro",
          requestedProvider: "doubao-pro",
          selectedModelLabel: input.selectedModelLabel,
          requestedModel: input.requestedModel,
          requestId: input.requestId,
          message: `${input.selectedModelLabel} 返回无法解析，系统未切换其他模型。`
        }));

        if (providerController.signal.aborted || closed) {
          close();
          return;
        }

        enqueue(response.ok ? "final" : "error", {
          type: response.ok ? "final" : "error",
          requestId: input.requestId,
          status: response.status,
          payload
        });
        close();
      }).catch(() => {
        if (providerController.signal.aborted || closed) {
          close();
          return;
        }

        enqueue("error", {
          type: "error",
          requestId: input.requestId,
          status: 503,
          payload: {
            ok: false,
            success: false,
            errorCode: "ADMIN_INGEST_SELECTED_MODEL_UNAVAILABLE",
            causeCode: "DOUBAO_REQUEST_FAILED",
            retryable: true,
            fallback: false,
            fallbackUsed: false,
            provider: "doubao-pro",
            requestedProvider: "doubao-pro",
            selectedModelLabel: input.selectedModelLabel,
            requestedModel: input.requestedModel,
            requestId: input.requestId,
            message: `${input.selectedModelLabel} 暂时不可用，系统未切换其他模型。`
          }
        });
        close();
      });
    },
    cancel() {
      closed = true;
      cleanup();
      abortProvider();
    }
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
      "X-Admin-Ingest-Transport": "sse"
    }
  });
}

function attachmentEvidenceError(code: typeof ATTACHMENT_CONTENT_MISSING_CODE | typeof ATTACHMENT_EVIDENCE_MISMATCH_CODE, message: string) {
  return jsonUtf8({
    ok: false,
    success: false,
    fallback: false,
    fallbackUsed: false,
    errorCode: code,
    userMessage: message,
    message,
    retryable: false
  }, 422);
}

function buildAdminIngestGroundingMetadata(
  grounding: AdminIngestGroundingResult,
  strictKnowledgeMode: boolean
) {
  return {
    strictKnowledgeMode,
    applied: grounding.applied,
    failureReason: grounding.failureReason,
    scope: grounding.scope,
    retrievedChunkIds: grounding.retrievedSourceIds.chunkIds,
    retrievedKnowledgeItemIds: grounding.retrievedSourceIds.knowledgeItemIds,
    providedChunkIds: grounding.sourceIds.chunkIds,
    providedKnowledgeItemIds: grounding.sourceIds.knowledgeItemIds,
    truncated: grounding.truncated
  };
}

function strictAdminIngestGroundingError(input: {
  grounding: AdminIngestGroundingResult;
  provider: "deepseek-pro" | "doubao-pro";
  selectedModelLabel: string;
  requestedModel: string;
  requestId: string;
}) {
  const unavailable = input.grounding.failureReason === "retrieval_error";
  const invalidScope = input.grounding.failureReason === "invalid_scope";
  const causeCode = unavailable
    ? "ADMIN_INGEST_GROUNDING_UNAVAILABLE"
    : invalidScope
      ? "ADMIN_INGEST_GROUNDING_SCOPE_INVALID"
      : "ADMIN_INGEST_GROUNDING_NO_HIT";
  const providerName = input.provider === "doubao-pro" ? "豆包" : "DeepSeek";
  const message = unavailable
    ? `当前 Agent 固定知识库暂时无法检索。为避免${providerName}脱离知识库生成，本轮未调用模型。您的输入和附件已保留，请稍后重试。`
    : invalidScope
      ? `当前 Agent、固定知识库与 namespace 作用域不一致。为避免${providerName}跨库生成，本轮未调用模型。请刷新当前 Agent 后重试。`
      : `当前问题未命中当前 Agent 固定知识库。为避免${providerName}脱离知识库自由生成，本轮未调用模型。请补充问题背景或先完善当前固定知识库后重试。`;

  return jsonUtf8({
    ok: false,
    success: false,
    fallback: false,
    fallbackUsed: false,
    retryable: unavailable,
    errorCode: "ADMIN_INGEST_STRICT_KNOWLEDGE_REQUIRED",
    causeCode,
    userMessage: message,
    message,
    provider: input.provider,
    requestedProvider: input.provider,
    actualProvider: null,
    selectedModelLabel: input.selectedModelLabel,
    requestedModel: input.requestedModel,
    actualModel: null,
    requestId: input.requestId,
    knowledgeGrounding: buildAdminIngestGroundingMetadata(input.grounding, true),
    diagnostics: [
      "adminIngestGrounding:strictKnowledgeMode:true",
      "adminIngestGrounding:modelInvoked:false",
      `adminIngestGrounding:failureReason:${input.grounding.failureReason}`,
      ...input.grounding.warnings.map((warning) => `adminIngestGrounding:warning:${warning}`)
    ]
  }, unavailable ? 503 : 422);
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readRawString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function usesStrictSelectedModel(platform: AdminIngestPlatform, provider: string) {
  return platform === "web" && (provider === "deepseek-pro" || provider === "doubao-pro");
}

function readStringArray(value: unknown, limit = 10) {
  return Array.isArray(value)
    ? value.map((item) => readString(item)).filter(Boolean).slice(0, limit)
    : [];
}

function readSlideTexts(value: unknown, limit = 500) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item, index) => {
    if (typeof item === "string") {
      const text = readString(item);

      return text ? { slideIndex: index + 1, text } : null;
    }

    if (!isPlainObject(item)) {
      return null;
    }

    const text = readString(item.text) || readString(item.content);
    const slideIndex = readPositiveNumber(item.slideIndex, item.pageIndex) ?? index + 1;

    return text ? { slideIndex, text } : null;
  }).filter((item): item is { slideIndex: number; text: string } => item !== null).slice(0, limit);
}

function readPositiveNumber(...values: unknown[]) {
  for (const value of values) {
    const numberValue = typeof value === "number" ? value : Number(value);

    if (Number.isFinite(numberValue) && numberValue > 0) {
      return numberValue;
    }
  }

  return undefined;
}

function readPositiveIntegerArray(value: unknown, limit = 500) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0)))
    .sort((left, right) => left - right)
    .slice(0, limit);
}

function readBoundedPercent(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);

  return Number.isFinite(numberValue)
    ? Math.min(100, Math.max(0, numberValue))
    : undefined;
}

function isLocalDevWithoutDatabase(request: Request) {
  if (process.env.NODE_ENV === "production" || hasDatabaseUrl()) {
    return false;
  }

  const hostname = new URL(request.url).hostname;

  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function readSyncTarget(value: unknown): Array<"web" | "exe" | "apk"> {
  if (!Array.isArray(value)) {
    return ["web", "exe", "apk"];
  }

  const targets = value.filter((item): item is "web" | "exe" | "apk" => item === "web" || item === "exe" || item === "apk");

  return targets.length > 0 ? targets : ["web", "exe", "apk"];
}

function readPlatform(value: unknown): AdminIngestPlatform {
  return normalizeAdminIngestPlatform(readString(value)) ?? "web";
}

function toGptFallbackErrorCode(error: unknown) {
  const record = error && typeof error === "object" ? error as { code?: unknown; message?: unknown; name?: unknown } : {};
  const code = typeof record.code === "string" ? record.code : "";
  const message = typeof record.message === "string" ? record.message.toLowerCase() : "";
  const name = typeof record.name === "string" ? record.name : "";

  if (code === "ADMIN_INGEST_MODEL_AFFINITY_MISMATCH") {
    return "ADMIN_INGEST_MODEL_AFFINITY_MISMATCH" as const;
  }

  if (code === "DEEPSEEK_API_KEY_MISSING" || message.includes("deepseek api key") || message.includes("deepseek_api_key")) {
    return "DEEPSEEK_API_KEY_MISSING" as const;
  }

  if (code === "DOUBAO_API_KEY_MISSING" || code === "DOUBAO_API_KEY_INVALID" || message.includes("ark api key") || message.includes("doubao_api_key")) {
    return code === "DOUBAO_API_KEY_INVALID" ? "DOUBAO_API_KEY_INVALID" as const : "DOUBAO_API_KEY_MISSING" as const;
  }

  if (
    code === "DOUBAO_BASE_URL_INVALID"
    || code === "DOUBAO_RATE_LIMITED"
    || code === "DOUBAO_INFERENCE_LIMIT_PAUSED"
    || code === "DOUBAO_QUOTA_EXCEEDED"
    || code === "DOUBAO_SAFETY_REJECTED"
    || code === "DOUBAO_MODEL_UNAVAILABLE"
    || code === "DOUBAO_REQUEST_FAILED"
    || code === "DOUBAO_RESPONSE_PARSE_FAILED"
    || code === "DOUBAO_TIMEOUT"
    || code === "DOUBAO_REQUEST_CANCELLED"
  ) {
    return code;
  }

  if (code === "QWEN_API_KEY_MISSING" || message.includes("qwen api key") || message.includes("qwen_api_key")) {
    return "QWEN_API_KEY_MISSING" as const;
  }

  if (code === "KIMI_API_KEY_MISSING" || message.includes("kimi api key") || message.includes("kimi_api_key")) {
    return "KIMI_API_KEY_MISSING" as const;
  }

  if (code === "OPENAI_API_KEY_MISSING" || code === "MISSING_AI_API_KEY" || message.includes("openai api key") || message.includes("openai_api_key")) {
    return "OPENAI_API_KEY_MISSING" as const;
  }

  if (code === "OPENAI_BASE_URL_INVALID") {
    return "OPENAI_BASE_URL_INVALID" as const;
  }

  if (code === "OPENAI_RATE_LIMIT" || message.includes("quota") || message.includes("429") || message.includes("rate limit")) {
    return "OPENAI_RATE_LIMIT" as const;
  }

  if (code === "DEEPSEEK_BASE_URL_INVALID") {
    return "DEEPSEEK_BASE_URL_INVALID" as const;
  }

  if (code === "QWEN_BASE_URL_INVALID") {
    return "QWEN_BASE_URL_INVALID" as const;
  }

  if (code === "KIMI_BASE_URL_INVALID") {
    return "KIMI_BASE_URL_INVALID" as const;
  }

  if (code === "DEEPSEEK_TIMEOUT") {
    return "DEEPSEEK_TIMEOUT" as const;
  }

  if (code === "QWEN_TIMEOUT") {
    return "QWEN_TIMEOUT" as const;
  }

  if (code === "KIMI_TIMEOUT") {
    return "KIMI_TIMEOUT" as const;
  }

  if (name === "AbortError" || message.includes("timeout") || message.includes("超时")) {
    return "OPENAI_TIMEOUT" as const;
  }

  if (code === "OPENAI_RESPONSES_PARSE_FAILED") {
    return "OPENAI_RESPONSES_PARSE_FAILED" as const;
  }

  if (code === "OPENAI_FULL_REQUEST_FAILED") {
    return "OPENAI_FULL_REQUEST_FAILED" as const;
  }

  if (code === "DEEPSEEK_RESPONSE_PARSE_FAILED") {
    return "DEEPSEEK_RESPONSE_PARSE_FAILED" as const;
  }

  if (code === "QWEN_RESPONSE_PARSE_FAILED") {
    return "QWEN_RESPONSE_PARSE_FAILED" as const;
  }

  if (code === "KIMI_RESPONSE_PARSE_FAILED") {
    return "KIMI_RESPONSE_PARSE_FAILED" as const;
  }

  if (code === "OPENAI_PRO_QUALITY_FAILED") {
    return "OPENAI_PRO_QUALITY_FAILED" as const;
  }

  if (code === "DEEPSEEK_PRO_QUALITY_FAILED") {
    return "DEEPSEEK_PRO_QUALITY_FAILED" as const;
  }

  if (code === "QWEN_PRO_QUALITY_FAILED") {
    return "QWEN_PRO_QUALITY_FAILED" as const;
  }

  if (code === "KIMI_PRO_QUALITY_FAILED") {
    return "KIMI_PRO_QUALITY_FAILED" as const;
  }

  if (code === "DEEPSEEK_REQUEST_FAILED" || message.includes("deepseek")) {
    return "DEEPSEEK_REQUEST_FAILED" as const;
  }

  if (code === "QWEN_REQUEST_FAILED" || message.includes("qwen")) {
    return "QWEN_REQUEST_FAILED" as const;
  }

  if (code === "KIMI_REQUEST_FAILED" || message.includes("kimi")) {
    return "KIMI_REQUEST_FAILED" as const;
  }

  if (code === "OPENAI_RESPONSES_REQUEST_FAILED" || message.includes("model") || message.includes("模型不可用")) {
    return "OPENAI_RESPONSES_REQUEST_FAILED" as const;
  }

  return "OPENAI_RESPONSES_REQUEST_FAILED" as const;
}

function readDiagnosticValue(diagnostics: string[] | undefined, prefix: string) {
  return (diagnostics ?? []).find((item) => item.startsWith(prefix))?.slice(prefix.length) ?? "";
}

function buildModelDiagnostics(input: {
  provider: string;
  requestedProvider?: string;
  actualProvider?: string;
  displayModelLabel: string;
  requestedModel?: string;
  actualModel: string;
  routeDecision?: string;
  fallbackUsed: boolean;
  fallbackChain?: string[];
  normalizedFrom?: string | null;
}) {
  return {
    provider: input.provider,
    requestedProvider: input.requestedProvider ?? input.provider,
    actualProvider: input.actualProvider ?? input.provider,
    displayModelLabel: input.displayModelLabel,
    requestedModel: input.requestedModel ?? input.actualModel,
    actualModel: input.actualModel,
    routeDecision: input.routeDecision ?? input.provider,
    fallbackUsed: input.fallbackUsed,
    fallbackChain: input.fallbackChain ?? [],
    normalizedFrom: input.normalizedFrom ?? null
  };
}

function logGptRoute(event: {
  requestId: string;
  selectedModelLabel?: string | null;
  preferredModel?: string | null;
  provider?: string | null;
  actualModel?: string | null;
  routeDecision?: string | null;
  hasMessage?: boolean;
  attachmentCount?: number;
  fallbackUsed?: boolean;
  ok?: boolean;
  contentLength?: number;
  errorCode?: string | null;
  failureDetails?: SafeDoubaoFailureDetails;
}) {
  console.info("[admin-ingest:gpt-route]", {
    requestId: event.requestId,
    selectedModelLabel: event.selectedModelLabel ?? null,
    preferredModel: event.preferredModel ?? null,
    provider: event.provider ?? null,
    actualModel: event.actualModel ?? null,
    routeDecision: event.routeDecision ?? null,
    hasMessage: Boolean(event.hasMessage),
    attachmentCount: event.attachmentCount ?? 0,
    fallbackUsed: Boolean(event.fallbackUsed),
    ok: Boolean(event.ok),
    contentLength: event.contentLength ?? 0,
    errorCode: event.errorCode ?? null,
    failureDetails: event.failureDetails ?? null
  });
}

function readAttachments(value: unknown): AdminIngestRequestAttachment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const attachments: AdminIngestRequestAttachment[] = [];

  for (const item of value) {
    if (!isPlainObject(item)) {
      continue;
    }

    const fileName = readString(item.fileName) || readString(item.name);

    if (!fileName) {
      continue;
    }

    const fileType = readString(item.fileType) || readString(item.mimeType) || readString(item.type);
    const mimeType = readString(item.mimeType) || readString(item.fileType) || readString(item.type);

    attachments.push({
      fileName,
      fileType: fileType || undefined,
      mimeType: mimeType || undefined,
      fileSize: readPositiveNumber(item.fileSize, item.sizeBytes, item.size),
      sizeBytes: readPositiveNumber(item.sizeBytes, item.fileSize, item.size),
      status: readString(item.status) || undefined,
      parseStatus: readString(item.parseStatus) || undefined,
      extractedText: readString(item.extractedText) || undefined,
      text: readString(item.text) || undefined,
      content: readString(item.content) || undefined,
      visibleText: readString(item.visibleText) || undefined,
      summary: readString(item.summary) || undefined,
      pageSummaries: readStringArray(item.pageSummaries, 500),
      slideTexts: readSlideTexts(item.slideTexts),
      totalPages: readPositiveNumber(item.totalPages),
      processedPageStart: readPositiveNumber(item.processedPageStart),
      processedPageEnd: readPositiveNumber(item.processedPageEnd),
      nextPage: readPositiveNumber(item.nextPage),
      complete: typeof item.complete === "boolean" ? item.complete : undefined,
      successfulPages: readPositiveIntegerArray(item.successfulPages),
      failedPages: readPositiveIntegerArray(item.failedPages),
      lowConfidencePages: readPositiveIntegerArray(item.lowConfidencePages),
      coveragePercent: readBoundedPercent(item.coveragePercent),
      successRatePercent: readBoundedPercent(item.successRatePercent),
      deadlineReached: item.deadlineReached === true,
      limitationNote: readString(item.limitationNote) || undefined,
      wechatOutputMode: readString(item.wechatOutputMode) === "full_answer"
        ? "full_answer"
        : readString(item.wechatOutputMode) === "reply_script"
          ? "reply_script"
          : undefined
    });

    if (attachments.length >= 12) {
      break;
    }
  }

  return attachments;
}

function readRecentMessages(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    if (!isPlainObject(item)) {
      return null;
    }

    const role = item.role === "assistant" ? "assistant" : item.role === "user" ? "user" : null;
    const content = readString(item.content);

    if (!role || !content) {
      return null;
    }

    return {
      role,
      content,
      model: readString(item.model) || null,
      provider: readString(item.provider) || null
    };
  }).filter((item): item is { role: "user" | "assistant"; content: string; model: string | null; provider: string | null } => Boolean(item)).slice(-12);
}

function readPreviousKnowledgeDrafts(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  type PreviousDraft = {
    title?: string;
    category?: string;
    tags?: string[];
    standardQuestion?: string;
    standardAnswer?: string;
  };

  return value.map((item) => {
    if (!isPlainObject(item)) {
      return null;
    }

    const draft: PreviousDraft = {};
    const title = readString(item.title);
    const category = readString(item.category);
    const tags = Array.isArray(item.tags) ? item.tags.map((tag) => readString(tag)).filter(Boolean).slice(0, 8) : [];
    const standardQuestion = readString(item.standardQuestion);
    const standardAnswer = readString(item.standardAnswer);

    if (title) draft.title = title;
    if (category) draft.category = category;
    if (tags.length > 0) draft.tags = tags;
    if (standardQuestion) draft.standardQuestion = standardQuestion;
    if (standardAnswer) draft.standardAnswer = standardAnswer;

    return draft;
  }).filter((item): item is PreviousDraft => item !== null).slice(-3);
}

function readRecentTrainingRecords(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  type RecentRecord = {
    input?: string;
    resultTitle?: string;
    category?: string;
    saveStatus?: string;
  };

  return value.map((item) => {
    if (!isPlainObject(item)) {
      return null;
    }

    const record: RecentRecord = {};
    const input = readString(item.input);
    const resultTitle = readString(item.resultTitle);
    const category = readString(item.category);
    const saveStatus = readString(item.saveStatus);

    if (input) record.input = input;
    if (resultTitle) record.resultTitle = resultTitle;
    if (category) record.category = category;
    if (saveStatus) record.saveStatus = saveStatus;

    return record;
  }).filter((item): item is RecentRecord => item !== null).slice(0, 6);
}

function readAutonomousRequest(value: unknown): AutonomousTaskRequest | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const mode = readString(value.mode);
  const safeMode: AutonomousTaskMode | undefined = mode === "execute_safe" || mode === "needs_approval" || mode === "plan_only" ? mode : undefined;

  return {
    enabled: value.enabled === true,
    taskId: readString(value.taskId) || undefined,
    mode: safeMode
  };
}

function buildStructuredKnowledgeForTrainingLog(input: {
  rawResult: Record<string, unknown>;
  userInput: string;
  visibleReply: string;
}) {
  const directStructured = normalizeEnterpriseStructuredKnowledge(input.rawResult.structured);
  const isDoubaoResult = readString(input.rawResult.provider) === "doubao";
  const rawStructured = isPlainObject(input.rawResult.structured) ? input.rawResult.structured : {};
  const saveRecommendation = readString(input.rawResult.saveRecommendation);
  const shouldPauseSave = isDoubaoResult
    && /暂缓入库|需要补充资料/.test(saveRecommendation);
  const doubaoShouldSave = shouldPauseSave
    ? false
    : typeof rawStructured.saveSuggestion === "boolean"
      ? rawStructured.saveSuggestion
      : directStructured?.should_save ?? true;

  if (directStructured) {
    return isDoubaoResult
      ? {
          ...directStructured,
          should_save: doubaoShouldSave
        }
      : directStructured;
  }

  const draft = isPlainObject(input.rawResult.knowledgeDraft) ? input.rawResult.knowledgeDraft : {};
  const title = readString(draft.title) || readString(input.rawResult.title) || "GPT 投喂知识";
  const category = readString(draft.category) || readString(input.rawResult.category) || "AI投喂";
  const summary = readString(draft.summary) || readString(input.rawResult.summary) || input.visibleReply.slice(0, 240) || input.userInput;
  const standardQuestion = readString(draft.standardQuestion)
    || readString(input.rawResult.question)
    || `关于“${title}”，应该如何理解和使用？`;
  const standardAnswer = readString(draft.standardAnswer)
    || readString(input.rawResult.answer)
    || summary;
  const confidence = readPositiveNumber(draft.trainingScore, input.rawResult.confidence) ?? 78;

  return normalizeEnterpriseStructuredKnowledge({
    title,
    category,
    tags: Array.isArray(draft.tags) ? draft.tags : input.rawResult.tags,
    summary,
    qa_pairs: [{ q: standardQuestion, a: standardAnswer }],
    confidence,
    should_save: isDoubaoResult ? doubaoShouldSave : true,
    providerUsed: readString(input.rawResult.provider) || "unknown",
    model: readString(input.rawResult.model) || "unknown",
    fallbackUsed: input.rawResult.fallbackUsed === true
  });
}

function buildCompletedDoubaoMetadataResult(input: {
  structured: EnterpriseStructuredKnowledge;
  replyMarkdown: string;
  sourceResponseId: string;
  metadataResponseId: string | null | undefined;
  requestedModel: string;
  actualModel: string;
  selectedModelLabel: string;
  saveRecommendation: string | null | undefined;
  jobId: string;
}): DoubaoMetadataRecoveryResult {
  const firstPair = input.structured.qa_pairs[0];
  const saveRecommendation = input.saveRecommendation === "可以入库"
    || input.saveRecommendation === "暂缓入库"
    || input.saveRecommendation === "需要补充资料"
    ? input.saveRecommendation
    : input.structured.should_save
      ? "可以入库"
      : "暂缓入库";
  const structured = {
    title: input.structured.title,
    category: input.structured.category,
    summary: input.structured.summary,
    tags: input.structured.tags,
    question: firstPair.q,
    answer: input.replyMarkdown,
    confidence: input.structured.confidence,
    saveSuggestion: saveRecommendation === "可以入库",
    followUpQuestions: []
  };

  return {
    provider: "doubao",
    model: input.actualModel,
    requestedModel: input.requestedModel,
    actualModel: input.actualModel,
    selectedModelLabel: input.selectedModelLabel,
    modelMode: "highest",
    metadataResponseId: input.metadataResponseId || `metadata-recovered-${input.jobId}`,
    sourceResponseId: input.sourceResponseId,
    createdAt: new Date().toISOString(),
    usage: {},
    replyMarkdown: input.replyMarkdown,
    knowledgeDraft: {
      title: input.structured.title,
      summary: input.structured.summary,
      category: input.structured.category,
      categories: [input.structured.category],
      tags: input.structured.tags,
      standardQuestion: firstPair.q,
      standardAnswer: input.replyMarkdown,
      standardQuestions: [firstPair.q],
      standardAnswers: [input.replyMarkdown],
      scenarios: [],
      sourceMaterials: [],
      complianceNotes: [],
      saveRecommendation,
      missingFields: [],
      trainingScore: input.structured.confidence
    },
    structured,
    structuredResult: structured,
    saveRecommendation,
    diagnostics: [
      "doubao:metadataRecovery:true",
      "doubao:metadataRecoveryIdempotent:true",
      "doubao:metadataCompleted:true",
      "doubao:replyMarkdownPassthrough:true",
      "apiResilience:fallbackUsed:false"
    ],
    fallback: false,
    fallbackUsed: false
  };
}

function toEnterpriseActor(actor: RbacUser | null): EnterpriseIngestActor | null {
  if (!actor) {
    return null;
  }
  const actorWithTenant = actor as RbacUser & { tenantId?: unknown };

  return {
    id: actor.id,
    role: actor.role,
    tenantId: typeof actorWithTenant.tenantId === "string" ? actorWithTenant.tenantId : null
  };
}

function readRequest(body: unknown) {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const input = readString(body.input)
    || readString(body.content)
    || readString(body.message)
    || readString(body.text)
    || readString(body.question);

  if (!input) {
    throw new ValidationError("投喂内容不能为空。");
  }

  const contextFields = readAdminIngestContextRequestFields(body);

  return {
    operation: readString(body.operation) === "retry_doubao_metadata"
      ? "retry_doubao_metadata" as const
      : "generate" as const,
    input,
    replyMarkdown: readRawString(body.replyMarkdown),
    sourceResponseId: readString(body.sourceResponseId) || null,
    jobId: readString(body.jobId) || null,
    messageId: readString(body.messageId) || null,
    attemptId: readString(body.attemptId) || null,
    attachments: readAttachments(body.attachments),
    agentId: readString(body.agentId) || null,
    knowledgeBaseId: readString(body.knowledgeBaseId) || null,
    namespace: readString(body.namespace) || null,
    knowledgeVersion: readString(body.knowledgeVersion) || readString(body.version) || "v1",
    expertId: readString(body.expertId) || null,
    agentName: readString(body.agentName) || null,
    category: readString(body.category) || null,
    agentDescription: readString(body.agentDescription) || null,
    targetUser: readString(body.targetUser) || null,
    tenantId: readString(body.tenantId) || null,
    userId: readString(body.userId) || null,
    source: "admin_ingest" as const,
    platform: readPlatform(body.platform),
    syncTarget: readSyncTarget(body.syncTarget),
    modelProvider: readString(body.modelProvider) || null,
    modelMode: readString(body.modelMode) || "highest",
    preferredModel: readString(body.preferredModel) || null,
    gptTier: readString(body.gptTier) || null,
    gptTierLabel: readString(body.gptTierLabel) || null,
    gptVersion: readString(body.gptVersion) || null,
    selectedModelLabel: readString(body.selectedModelLabel) || null,
    modelDisplayName: readString(body.modelDisplayName) || null,
    recentMessages: readRecentMessages(body.recentMessages),
    ...contextFields,
    previousKnowledgeDrafts: readPreviousKnowledgeDrafts(body.previousKnowledgeDrafts),
    recentTrainingRecords: readRecentTrainingRecords(body.recentTrainingRecords),
    autonomous: readAutonomousRequest(body.autonomous)
  };
}

export async function POST(request: Request) {
  const requestId = getRequestIdFromHeaders(request.headers);
  let actor: RbacUser | null = null;

  try {
    actor = await requireAdminIngestActor(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "admin_kb_ingest_gpt"
    });
  } catch (error) {
    if (!isLocalDevWithoutDatabase(request)) {
      return apiError(error);
    }
  }

  let input: ReturnType<typeof readRequest>;

  try {
    input = readRequest(await request.json());
  } catch (error) {
    return apiError(error instanceof Error ? error : new ValidationError("请求体必须是合法 JSON。"));
  }

  if (input.modelMode !== "highest") {
    return apiError(new ValidationError("管理员 GPT 投喂接口仅支持 modelMode=highest。"));
  }

  if (input.operation === "retry_doubao_metadata") {
    const enterpriseActor = toEnterpriseActor(actor);
    const attemptId = input.attemptId;

    if (
      !enterpriseActor
      || !hasDatabaseUrl()
      || !input.jobId
      || !input.messageId
      || !attemptId
      || !input.sourceResponseId
      || !input.replyMarkdown.trim()
    ) {
      return apiError(new ValidationError("缺少豆包待确认任务、正文校验或恢复标识，无法重新整理知识草稿。"));
    }

    let claimedJob: Awaited<ReturnType<typeof claimEnterpriseDoubaoMetadataRecovery>> | null = null;

    try {
      claimedJob = await claimEnterpriseDoubaoMetadataRecovery(enterpriseActor, {
        jobId: input.jobId,
        attemptId,
        replyMarkdown: input.replyMarkdown,
        sourceResponseId: input.sourceResponseId
      });

      const canonicalAgentScope = hasCanonicalAdminIngestGroundingScope({
        tenantId: enterpriseActor.tenantId,
        agentId: claimedJob.agentId,
        knowledgeBaseId: claimedJob.knowledgeBaseId,
        namespace: claimedJob.namespace
      });

      if (!canonicalAgentScope) {
        throw new ValidationError("训练记录中的 Agent、固定知识库与 namespace 作用域不一致，已拒绝恢复。");
      }

      const modelRuntime = resolveIngestModelRuntime({
        provider: "doubao-pro",
        selectedModelLabel: "Doubao-Seed-2.1-pro",
        modelDisplayName: "Doubao-Seed-2.1-pro",
        preferredModel: claimedJob.actualModel
      });
      let metadataResult: DoubaoMetadataRecoveryResult;
      let completedTrainingRecord: Awaited<ReturnType<typeof completeEnterpriseDoubaoMetadataRecovery>> | null = null;

      if (claimedJob.recoveryState === "completed") {
        if (!claimedJob.structured) {
          throw new ValidationError("已完成的豆包知识草稿缺少结构化结果。");
        }

        metadataResult = buildCompletedDoubaoMetadataResult({
          structured: claimedJob.structured,
          replyMarkdown: claimedJob.replyMarkdown,
          sourceResponseId: claimedJob.visibleResponseId ?? input.sourceResponseId,
          metadataResponseId: claimedJob.metadataResponseId,
          requestedModel: claimedJob.requestedModel,
          actualModel: claimedJob.actualModel,
          selectedModelLabel: modelRuntime.displayModelLabel,
          saveRecommendation: claimedJob.saveRecommendation,
          jobId: claimedJob.jobId
        });
      } else {
        metadataResult = await runDoubaoMetadataRecovery({
          input: claimedJob.input,
          attachments: [],
          agentId: claimedJob.agentId,
          expertId: claimedJob.agentId,
          agentName: claimedJob.agentName,
          category: claimedJob.category,
          source: "admin_ingest",
          platform: input.platform,
          syncTarget: input.syncTarget,
          tenantId: enterpriseActor.tenantId,
          userId: enterpriseActor.id,
          preferredModel: claimedJob.actualModel,
          selectedModelLabel: modelRuntime.displayModelLabel,
          modelDisplayName: modelRuntime.displayModelLabel,
          replyMarkdown: claimedJob.replyMarkdown,
          sourceResponseId: claimedJob.visibleResponseId ?? input.sourceResponseId,
          requestId,
          signal: request.signal
        });

        if (
          metadataResult.replyMarkdown !== claimedJob.replyMarkdown
          || metadataResult.actualModel !== claimedJob.actualModel
        ) {
          throw new ValidationError("豆包知识草稿与原正文或原模型绑定校验失败，已拒绝恢复。");
        }

        const structuredForTrainingLog = buildStructuredKnowledgeForTrainingLog({
          rawResult: metadataResult as unknown as Record<string, unknown>,
          userInput: claimedJob.input,
          visibleReply: claimedJob.replyMarkdown
        });

        if (!structuredForTrainingLog) {
          throw new ValidationError("豆包知识草稿缺少可入库的结构化字段。");
        }

        completedTrainingRecord = await completeEnterpriseDoubaoMetadataRecovery(enterpriseActor, {
          jobId: claimedJob.jobId,
          attemptId,
          structured: structuredForTrainingLog,
          metadataResponseId: metadataResult.metadataResponseId,
          saveRecommendation: metadataResult.saveRecommendation
        });
      }

      const trainingRecords = await listEnterpriseTrainingRecords(enterpriseActor);
      const trainingRecord = completedTrainingRecord
        ?? trainingRecords.find((record) => record.jobId === claimedJob?.jobId)
        ?? null;

      return jsonUtf8({
        ok: true,
        data: {
          ...metadataResult,
          jobId: claimedJob.jobId,
          messageId: input.messageId,
          attemptId,
          metadataState: "ready",
          modelDisplayName: metadataResult.selectedModelLabel,
          trainingRecord,
          records: trainingRecords
        },
        fallback: false,
        fallbackUsed: false,
        provider: metadataResult.provider,
        requestedProvider: "doubao-pro",
        actualProvider: "doubao-pro",
        requestedModel: metadataResult.requestedModel,
        actualModel: metadataResult.actualModel,
        selectedModelLabel: metadataResult.selectedModelLabel,
        model: metadataResult.model,
        sourceResponseId: claimedJob.visibleResponseId ?? input.sourceResponseId,
        metadataResponseId: metadataResult.metadataResponseId,
        jobId: claimedJob.jobId,
        messageId: input.messageId,
        attemptId,
        metadataState: "ready",
        replyMarkdown: metadataResult.replyMarkdown,
        knowledgeDraft: metadataResult.knowledgeDraft,
        structured: metadataResult.structured,
        saveRecommendation: metadataResult.saveRecommendation,
        diagnostics: metadataResult.diagnostics,
        trainingRecord,
        records: trainingRecords,
        requestId
      });
    } catch (error) {
      const causeCode = toGptFallbackErrorCode(error);
      const isTimeout = causeCode === "DOUBAO_TIMEOUT";
      const isRateLimited = causeCode === "DOUBAO_RATE_LIMITED";
      const isInferenceLimitPaused = causeCode === "DOUBAO_INFERENCE_LIMIT_PAUSED";
      const isClientCancelled = causeCode === "DOUBAO_REQUEST_CANCELLED";
      const isMissingKey = causeCode === "DOUBAO_API_KEY_MISSING" || causeCode === "DOUBAO_API_KEY_INVALID";
      const isSafetyRejection = causeCode === "DOUBAO_SAFETY_REJECTED";
      const status = isClientCancelled
        ? 499
        : isRateLimited || isInferenceLimitPaused
          ? 429
          : isTimeout
            ? 504
            : isMissingKey
              ? 401
              : isSafetyRejection
                ? 422
                : 502;
      const retryable = isRetryableDoubaoStrictModelFailure(causeCode);
      const userMessage = isInferenceLimitPaused
        ? "豆包推理限额已达到，知识草稿暂时无法整理。正文仍已完整保留，系统未切换其他模型。"
        : isRateLimited
          ? "豆包当前请求较多，知识草稿暂时未整理完成。正文仍已完整保留，请稍后重新整理。"
          : isTimeout
            ? "豆包知识草稿整理超时。正文仍已完整保留，可以稍后重新整理。"
            : causeCode === "DOUBAO_RESPONSE_PARSE_FAILED"
              ? "豆包返回的知识草稿结构仍不完整。正文仍已完整保留，本轮未开放正式入库。"
              : "豆包知识草稿暂时未整理完成。正文仍已完整保留，系统未切换其他模型。";
      const failureDetails = readSafeDoubaoFailureDetails(error);

      if (claimedJob) {
        await failEnterpriseDoubaoMetadataRecovery(enterpriseActor, {
          jobId: claimedJob.jobId,
          attemptId,
          failureCode: causeCode,
          failureDetails
        }).catch(() => undefined);
      }

      return jsonUtf8({
        ok: false,
        success: false,
        fallback: false,
        fallbackUsed: false,
        retryable,
        errorCode: "ADMIN_INGEST_DOUBAO_METADATA_RECOVERY_FAILED",
        causeCode,
        userMessage,
        message: userMessage,
        jobId: input.jobId,
        messageId: input.messageId,
        attemptId,
        metadataState: "unavailable",
        provider: "doubao-pro",
        requestedProvider: "doubao-pro",
        actualProvider: "doubao-pro",
        selectedModelLabel: "Doubao-Seed-2.1-pro",
        requestedModel: claimedJob?.requestedModel ?? null,
        actualModel: claimedJob?.actualModel ?? null,
        requestId,
        failureDetails
      }, status);
    }
  }

  const attachmentEvidence = assessAdminIngestAttachmentEvidence(input.attachments);

  if (attachmentEvidence.blocking) {
    return attachmentEvidenceError(
      ATTACHMENT_CONTENT_MISSING_CODE,
      buildAttachmentContentMissingMessage(attachmentEvidence)
    );
  }

  const executeRequest = async (
    signal?: AbortSignal,
    onDoubaoProgressEvent?: (event: DoubaoAdminIngestProgressEvent) => void
  ) => {
  const enterpriseActor = toEnterpriseActor(actor);
  const effectiveActorId = enterpriseActor?.id ?? input.userId ?? "local-admin-ingest-dev";
  const effectiveTenantId = enterpriseActor?.tenantId ?? input.tenantId;
  const canonicalAgentScope = hasCanonicalAdminIngestGroundingScope({
    tenantId: effectiveTenantId,
    agentId: input.agentId ?? "",
    knowledgeBaseId: input.knowledgeBaseId ?? "",
    namespace: input.namespace ?? ""
  });
  let groundingModelProvider: string | null = null;

  try {
    groundingModelProvider = resolveAdminIngestModelProvider({
      modelProvider: input.modelProvider,
      selectedModelLabel: input.selectedModelLabel,
      modelDisplayName: input.modelDisplayName,
      preferredModel: input.preferredModel,
      input: input.input,
      attachments: input.attachments
    }).provider;
  } catch {
    // The existing selected-model error path below remains authoritative.
  }

  const strictDoubaoGrounding = shouldUseStrictAdminIngestGrounding({
    provider: groundingModelProvider
  });
  const wechatGroundingRequest = buildAdminIngestWechatGroundingRequest({
    input: input.input,
    attachments: input.attachments
  });
  const strictWechatGrounding = wechatGroundingRequest.strictKnowledgeMode
    && (groundingModelProvider === "deepseek-pro" || groundingModelProvider === "doubao-pro");
  const strictKnowledgeGrounding = strictDoubaoGrounding || strictWechatGrounding;
  const [grounding, publishedMemoryContext] = await Promise.all([
    retrieveAdminIngestGrounding({
      query: wechatGroundingRequest.query,
      actorUserId: effectiveActorId,
      tenantId: effectiveTenantId,
      agentId: input.agentId ?? "",
      knowledgeBaseId: input.knowledgeBaseId ?? "",
      namespace: input.namespace ?? "",
      strictKnowledgeMode: strictKnowledgeGrounding,
      recentMessages: strictDoubaoGrounding ? input.recentMessages : undefined
    }),
    buildAdminIngestPublishedMemoryContext({
      query: input.input,
      actorId: effectiveActorId,
      tenantId: effectiveTenantId,
      agentId: input.agentId ?? "",
      knowledgeBaseId: input.knowledgeBaseId ?? "",
      namespace: input.namespace
    })
  ]);
  const knowledgeContexts = grounding.applied
    ? [{
        id: grounding.sourceIds.knowledgeItemIds[0] ?? "fixed-knowledge-base",
        title: `${grounding.scope?.knowledgeBaseId ?? input.knowledgeBaseId ?? "当前 Agent"} 固定知识库`,
        content: grounding.context,
        sourceId: grounding.sourceIds.chunkIds.join(",") || null,
        score: grounding.sources.length > 0
          ? Math.max(...grounding.sources.map((source) => source.score))
          : null
      }]
    : [];

  if (strictKnowledgeGrounding && (!canonicalAgentScope || !grounding.applied)) {
    const strictProvider = groundingModelProvider === "deepseek-pro"
      ? "deepseek-pro" as const
      : "doubao-pro" as const;
    const strictRuntime = resolveIngestModelRuntime({
      provider: strictProvider,
      selectedModelLabel: input.selectedModelLabel,
      modelDisplayName: input.modelDisplayName,
      preferredModel: input.preferredModel
    });

    return strictAdminIngestGroundingError({
      grounding,
      provider: strictProvider,
      selectedModelLabel: strictRuntime.displayModelLabel,
      requestedModel: strictRuntime.actualModel,
      requestId
    });
  }

  try {
    const modelOption = resolveAdminIngestModelProvider({
      modelProvider: input.modelProvider,
      selectedModelLabel: input.selectedModelLabel,
      modelDisplayName: input.modelDisplayName,
      preferredModel: input.preferredModel,
      input: input.input,
      attachments: input.attachments
    });
    const modelRuntime = resolveIngestModelRuntime({
      provider: modelOption.provider,
      selectedModelLabel: input.selectedModelLabel,
      modelDisplayName: input.modelDisplayName,
      preferredModel: input.preferredModel
    });
    const strictModelAffinity = usesStrictSelectedModel(input.platform, modelOption.provider);
    const result = await runAdminIngestWithSelectedModel({
      input: wechatGroundingRequest.modelInput,
      attachments: input.attachments,
      agentId: input.agentId,
      expertId: input.expertId,
      agentName: input.agentName,
      category: input.category,
      agentDescription: input.agentDescription,
      targetUser: input.targetUser,
      tenantId: input.tenantId,
      userId: input.userId ?? actor?.id ?? "local-admin-ingest-dev",
      source: input.source,
      platform: input.platform,
      syncTarget: input.syncTarget,
      modelProvider: modelOption.provider,
      strictModelAffinity,
      preferredModel: modelRuntime.actualModel,
      gptTier: input.gptTier,
      gptTierLabel: input.gptTierLabel,
      gptVersion: input.gptVersion,
      selectedModelLabel: modelRuntime.displayModelLabel,
      modelDisplayName: input.modelDisplayName || modelRuntime.displayModelLabel,
      recentMessages: input.recentMessages,
      contextSummary: input.contextSummary,
      memoryContextText: publishedMemoryContext.memoryContextText,
      agentLearningInstruction: publishedMemoryContext.agentLearningInstruction,
      usedMemoryIds: publishedMemoryContext.usedMemoryIds,
      knowledgeContexts,
      previousKnowledgeDrafts: input.previousKnowledgeDrafts,
      recentTrainingRecords: input.recentTrainingRecords,
      autonomous: input.autonomous,
      requestId,
      signal,
      onProgressEvent: onDoubaoProgressEvent
        ? (event) => {
            if (
              event.type === "visible_reply"
              && findUnsupportedAdminIngestAttachmentClaim(event.replyMarkdown, attachmentEvidence)
            ) {
              return;
            }

            onDoubaoProgressEvent(event);
          }
        : undefined
    });

    const unsupportedClaim = findUnsupportedAdminIngestAttachmentClaim(
      result.replyMarkdown || "",
      attachmentEvidence
    );

    if (unsupportedClaim) {
      return attachmentEvidenceError(
        ATTACHMENT_EVIDENCE_MISMATCH_CODE,
        "当前附件只完成了部分识别，模型回答出现了超出附件证据的完整性声明。系统已停止生成知识草稿和训练记忆，请重新识别后再分析。"
      );
    }

    const rawReply = result.replyMarkdown || "";
    const preserveRawSelectedModelOutput = result.provider === "doubao" || result.provider === "deepseek";
    const stylePassThrough: GptOSStyleLayerResult = preserveRawSelectedModelOutput
      ? {
          tone: "chatgpt_natural",
          structure: "natural_markdown",
          priority: "model_output_first",
          output: rawReply,
          changed: false,
          diagnostics: [`gptStyle:provider_passthrough:${result.provider}`, "gptStyle:changed:false"],
          summary: "",
          steps: [],
          sections: []
        }
      : enhanceGPTStyle(rawReply, {
          model: modelRuntime.actualModel,
          source: "admin_ingest_gpt_route",
          mode: "api_response"
        });
    const visibleReply = stylePassThrough.output;
    const fallbackChainText = readDiagnosticValue(result.diagnostics, "modelRouter:fallbackChain:");
    const routeDecision = readDiagnosticValue(result.diagnostics, "modelRouter:routeDecision:");
    const modelDiagnostics = buildModelDiagnostics({
      provider: result.provider,
      requestedProvider: result.requestedProvider,
      actualProvider: result.actualProvider,
      displayModelLabel: result.selectedModelLabel || modelRuntime.displayModelLabel,
      requestedModel: result.requestedModel,
      actualModel: result.actualModel || modelRuntime.actualModel,
      routeDecision,
      fallbackUsed: result.fallbackUsed,
      fallbackChain: fallbackChainText ? fallbackChainText.split(">").filter(Boolean) : [],
      normalizedFrom: modelRuntime.normalizedFrom
    });
    const rawResult = {
      ...result,
      replyMarkdown: visibleReply,
      diagnostics: [
        ...result.diagnostics,
        ...stylePassThrough.diagnostics,
        `adminIngestGrounding:applied:${grounding.applied ? "true" : "false"}`,
        `adminIngestGrounding:sourceCount:${grounding.sources.length}`,
        `adminIngestGrounding:truncated:${grounding.truncated ? "true" : "false"}`,
        ...grounding.warnings.map((warning) => `adminIngestGrounding:warning:${warning}`),
        `adminIngestPublishedMemory:usedCount:${publishedMemoryContext.usedMemoryIds.length}`,
        ...publishedMemoryContext.warnings.map((warning) => `adminIngestPublishedMemory:warning:${warning}`)
      ]
    };
    const structuredForTrainingLog = buildStructuredKnowledgeForTrainingLog({
      rawResult,
      userInput: input.input,
      visibleReply
    });
    const isDoubaoTrainingResult = readString(rawResult.provider) === "doubao";
    const doubaoMetadataCompleted = isDoubaoTrainingResult
      && rawResult.diagnostics.some((diagnostic) => diagnostic === "doubao:metadataCompleted:true");
    const doubaoMetadataFailureCode = isDoubaoTrainingResult
      ? readDiagnosticValue(rawResult.diagnostics, "doubao:metadataFailureCode:")
      : null;
    const trainingLog = enterpriseActor && hasDatabaseUrl() && structuredForTrainingLog
      ? await createEnterpriseIngestLog(enterpriseActor, {
        input: input.input,
        sourceType: "chat",
        agentId: input.agentId,
        knowledgeBaseId: input.knowledgeBaseId,
        namespace: input.namespace,
        knowledgeVersion: input.knowledgeVersion,
        agentName: input.agentName,
        structured: structuredForTrainingLog,
        doubaoMetadataRecovery: isDoubaoTrainingResult
          ? {
              state: doubaoMetadataCompleted ? "completed" : "deferred",
              failureCode: doubaoMetadataFailureCode,
              replyMarkdown: visibleReply,
              visibleResponseId: rawResult.responseId,
              requestedModel: rawResult.requestedModel || modelRuntime.actualModel,
              actualModel: rawResult.actualModel || rawResult.model
            }
          : null
      })
      : null;
    const trainingRecords = enterpriseActor && hasDatabaseUrl()
      ? await listEnterpriseTrainingRecords(enterpriseActor)
      : trainingLog?.record ? [trainingLog.record] : [];

    logGptRoute({
      requestId,
      selectedModelLabel: modelRuntime.displayModelLabel,
      preferredModel: input.preferredModel,
      provider: rawResult.provider,
      actualModel: rawResult.actualModel || modelRuntime.actualModel,
      routeDecision,
      hasMessage: Boolean(input.input),
      attachmentCount: input.attachments.length,
      fallbackUsed: rawResult.fallbackUsed,
      ok: true,
      contentLength: visibleReply.length,
      errorCode: null
    });

    return jsonUtf8({
      ok: true,
      data: rawResult,
      fallback: rawResult.fallback,
      fallbackUsed: rawResult.fallbackUsed,
      provider: rawResult.provider,
      requestedProvider: rawResult.requestedProvider,
      actualProvider: rawResult.actualProvider,
      requestedModel: rawResult.requestedModel,
      actualModel: rawResult.actualModel,
      normalizedFrom: modelRuntime.normalizedFrom,
      modelDiagnostics,
      knowledgeGrounding: buildAdminIngestGroundingMetadata(
        grounding,
        strictKnowledgeGrounding
      ),
      responseId: rawResult.responseId,
      jobId: trainingLog?.job.id ?? null,
      trainingRecord: trainingLog?.record ?? null,
      records: trainingRecords,
      proofId: "proofId" in rawResult ? rawResult.proofId : rawResult.responseId,
      createdAt: rawResult.createdAt,
      usage: rawResult.usage,
      gptProof: rawResult.gptProof,
      intent: rawResult.intent,
      fixedTemplateRisk: rawResult.fixedTemplateRisk,
      qualityPassed: rawResult.gptProof.qualityPassed,
      deepenAttempts: rawResult.gptProof.deepenAttempts,
      model: rawResult.model,
      selectedModelLabel: rawResult.selectedModelLabel,
      content: visibleReply,
      answer: visibleReply,
      reply: visibleReply,
      replyMarkdown: visibleReply,
      knowledgeDraft: rawResult.knowledgeDraft,
      userClientCallPlan: rawResult.userClientCallPlan,
      suggestedQuestions: rawResult.suggestedQuestions,
      sourceFiles: rawResult.sourceFiles,
      saveRecommendation: rawResult.saveRecommendation,
      diagnostics: rawResult.diagnostics,
      gptStyle: {
        tone: stylePassThrough.tone,
        structure: stylePassThrough.structure,
        priority: stylePassThrough.priority,
        changed: stylePassThrough.changed
      },
      gptOS: rawResult.gptOS,
      autonomousResult: rawResult.autonomousResult,
      structuredResult: rawResult.structuredResult,
      structured: rawResult.structured,
      sync: rawResult.sync,
      sourceType: rawResult.sourceType
    });
  } catch (error) {
    const errorCode = toGptFallbackErrorCode(error);
    const affinityMismatch = error instanceof AdminIngestModelAffinityError ? error.details : null;
    const isTimeout = errorCode === "OPENAI_TIMEOUT" || errorCode === "DEEPSEEK_TIMEOUT" || errorCode === "DOUBAO_TIMEOUT" || errorCode === "QWEN_TIMEOUT" || errorCode === "KIMI_TIMEOUT";
    const isMissingKey = errorCode === "OPENAI_API_KEY_MISSING" || errorCode === "DEEPSEEK_API_KEY_MISSING" || errorCode === "DOUBAO_API_KEY_MISSING" || errorCode === "DOUBAO_API_KEY_INVALID" || errorCode === "QWEN_API_KEY_MISSING" || errorCode === "KIMI_API_KEY_MISSING";
    const isSafetyRejection = errorCode === "DOUBAO_SAFETY_REJECTED";
    const isClientCancelled = errorCode === "DOUBAO_REQUEST_CANCELLED";
    const isRateLimited = errorCode === "DOUBAO_RATE_LIMITED";
    const isInferenceLimitPaused = errorCode === "DOUBAO_INFERENCE_LIMIT_PAUSED";
    const status = affinityMismatch ? 502 : isClientCancelled ? 499 : isRateLimited || isInferenceLimitPaused ? 429 : isTimeout ? 504 : isMissingKey ? 401 : isSafetyRejection ? 422 : 503;
    const failureDetails = readSafeDoubaoFailureDetails(error);
    const modelOption = resolveAdminIngestModelProvider({
      modelProvider: input.modelProvider,
      selectedModelLabel: input.selectedModelLabel,
      modelDisplayName: input.modelDisplayName,
      preferredModel: input.preferredModel,
      input: input.input,
      attachments: input.attachments
    });
    const modelRuntime = resolveIngestModelRuntime({
      provider: modelOption.provider,
      selectedModelLabel: input.selectedModelLabel,
      modelDisplayName: input.modelDisplayName,
      preferredModel: input.preferredModel
    });
    const strictModelAffinity = usesStrictSelectedModel(input.platform, modelOption.provider);
    const strictFailureRetryable = modelOption.provider === "doubao-pro"
      ? !affinityMismatch && isRetryableDoubaoStrictModelFailure(errorCode)
      : !affinityMismatch && !isMissingKey && !isSafetyRejection && !isClientCancelled;
    const modelDiagnostics = buildModelDiagnostics({
      provider: modelOption.provider === "deepseek-pro" || modelOption.provider === "deepseek-flash" ? "deepseek" : modelOption.provider,
      requestedProvider: modelOption.provider,
      actualProvider: affinityMismatch?.actualProvider ?? modelOption.provider,
      displayModelLabel: modelRuntime.displayModelLabel,
      requestedModel: modelRuntime.actualModel,
      actualModel: affinityMismatch?.actualModel ?? modelRuntime.actualModel,
      routeDecision: modelOption.provider,
      fallbackUsed: !strictModelAffinity,
      fallbackChain: [],
      normalizedFrom: modelRuntime.normalizedFrom
    });

    logGptRoute({
      requestId,
      selectedModelLabel: modelRuntime.displayModelLabel,
      preferredModel: input.preferredModel,
      provider: modelDiagnostics.provider,
      actualModel: modelRuntime.actualModel,
      routeDecision: modelOption.provider,
      hasMessage: Boolean(input.input),
      attachmentCount: input.attachments.length,
      fallbackUsed: !strictModelAffinity,
      ok: false,
      contentLength: 0,
      errorCode,
      ...(failureDetails ? { failureDetails } : {})
    });

    if (strictModelAffinity) {
      const strictMessage = affinityMismatch
        ? `${modelRuntime.displayModelLabel} 返回的模型身份与当前选择不一致，系统已拒绝该结果且未切换其他模型。您的输入和附件已保留。`
        : isInferenceLimitPaused
          ? `${modelRuntime.displayModelLabel} 推理限额已达到，模型服务已暂停。系统未切换其他模型。您的输入和附件已保留。`
        : `${modelRuntime.displayModelLabel} 暂时不可用，系统未切换其他模型。您的输入和附件已保留，请稍后重试或手动切换模型。`;

      return jsonUtf8({
        ok: false,
        success: false,
        fallback: false,
        fallbackUsed: false,
        retryable: strictFailureRetryable,
        errorCode: "ADMIN_INGEST_SELECTED_MODEL_UNAVAILABLE",
        causeCode: errorCode,
        userMessage: strictMessage,
        message: strictMessage,
        provider: modelOption.provider,
        requestedProvider: modelOption.provider,
        actualProvider: affinityMismatch?.actualProvider ?? null,
        selectedModelLabel: modelRuntime.displayModelLabel,
        requestedModel: modelRuntime.actualModel,
        actualModel: affinityMismatch?.actualModel ?? null,
        requestId,
        failureDetails,
        normalizedFrom: modelRuntime.normalizedFrom,
        modelDiagnostics,
        diagnostics: [
          "modelRouter:strictModelAffinity:true",
          "modelRouter:fallbackUsed:false",
          ...(affinityMismatch ? [
            `modelRouter:expectedProvider:${affinityMismatch.expectedProvider}`,
            `modelRouter:actualProvider:${affinityMismatch.actualProvider}`,
            `modelRouter:expectedModel:${affinityMismatch.expectedModel}`,
            `modelRouter:actualModel:${affinityMismatch.actualModel}`
          ] : []),
          `modelRouter:failureCode:${errorCode}`
        ]
      }, status);
    }

    if (errorCode === "OPENAI_FULL_REQUEST_FAILED") {
      const diagnostics = error && typeof error === "object" && "details" in error
        ? (error as { details?: { diagnostics?: unknown } }).details?.diagnostics
        : undefined;
      const safeDiagnostics = diagnostics && typeof diagnostics === "object" && !Array.isArray(diagnostics)
        ? diagnostics as Record<string, unknown>
        : {};
      const userMessage = "AI服务暂时未完成，请稍后重试。";

      return jsonUtf8({
        ok: false,
        success: false,
        fallback: true,
        fallbackUsed: true,
        errorCode: "OPENAI_FULL_REQUEST_FAILED",
        userMessage,
        message: userMessage,
        provider: modelOption.provider,
        selectedModelLabel: modelRuntime.displayModelLabel,
        model: modelRuntime.actualModel,
        actualModel: modelRuntime.actualModel,
        normalizedFrom: modelRuntime.normalizedFrom,
        modelDiagnostics,
        diagnostics: {
          ...safeDiagnostics,
          errorCode: "OPENAI_FULL_REQUEST_FAILED"
        }
      }, status);
    }

    const fallback = normalizeGptOSFallback({
      error,
      provider: modelOption.provider,
      diagnostics: [
        `apiResilience:errorCode:${errorCode}`,
        `apiResilience:retryable:${isMissingKey || isSafetyRejection ? "false" : "true"}`
      ]
    });

    return jsonUtf8({
      ...fallback,
      ok: false,
      retryable: isMissingKey || isSafetyRejection ? false : fallback.retryable,
      errorCode,
      provider: modelOption.provider,
      selectedModelLabel: modelRuntime.displayModelLabel,
      model: modelRuntime.actualModel,
      actualModel: modelRuntime.actualModel,
      normalizedFrom: modelRuntime.normalizedFrom,
      modelDiagnostics
    }, status);
  }
  };

  const streamModelOption = resolveAdminIngestModelProvider({
    modelProvider: input.modelProvider,
    selectedModelLabel: input.selectedModelLabel,
    modelDisplayName: input.modelDisplayName,
    preferredModel: input.preferredModel,
    input: input.input,
    attachments: input.attachments
  });
  const streamModelRuntime = resolveIngestModelRuntime({
    provider: streamModelOption.provider,
    selectedModelLabel: input.selectedModelLabel,
    modelDisplayName: input.modelDisplayName,
    preferredModel: input.preferredModel
  });

  if (
    input.platform === "web"
    && streamModelOption.provider === "doubao-pro"
    && browserAcceptsAdminIngestSse(request)
  ) {
    return createDoubaoBrowserSseResponse({
      request,
      requestId,
      selectedModelLabel: streamModelRuntime.displayModelLabel,
      requestedModel: streamModelRuntime.actualModel,
      producer: executeRequest
    });
  }

  return executeRequest(request.signal);
}
