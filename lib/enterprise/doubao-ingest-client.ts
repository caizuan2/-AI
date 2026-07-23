import "server-only";

import { logger } from "@/lib/logger";
import {
  normalizeGptOutput,
  type GptStructuredKnowledge
} from "@/lib/enterprise/gpt-output-normalizer";
import {
  buildGptIngestBrainSystemPrompt,
  buildGptIngestBrainUserPrompt
} from "@/lib/enterprise/gpt-ingest-brain-prompt";
import type {
  GptIngestKnowledgeContext,
  GptIngestMemoryMessage,
  GptIngestMemoryRecord
} from "@/lib/enterprise/gpt-ingest-memory";
import type {
  GptKnowledgeDraft,
  GptSaveRecommendation
} from "@/lib/enterprise/gpt-knowledge-draft";
import type { GptUserClientCallPlan } from "@/lib/enterprise/gpt-user-client-call-plan";
import { assessGptProResponseQuality } from "@/lib/enterprise/gpt-pro-response-quality";
import type { GptCallProof, OpenAIGptUsage } from "@/lib/enterprise/gpt-call-proof";
import type { GptOutputIntent } from "@/lib/enterprise/gpt-output-intent-classifier";
import type { AdminIngestPlatform } from "@/lib/enterprise/admin-ingest-platform";
import type { OpenAIAdminIngestAttachment } from "@/lib/enterprise/openai-ingest-client";
import {
  routeGptOSAgent,
  type GptOSRouteResult
} from "@/lib/enterprise/gpt-os-agent-router";
import type {
  AutonomousTaskRequest,
  AutonomousTaskResult
} from "@/lib/enterprise/gpt-os-autonomous-executor";
import {
  normalizeLLMResponse
} from "@/lib/enterprise/gpt-os-api-adapter";
import {
  DOUBAO_PRO_MODEL_ID,
  resolveIngestActualModel,
  sanitizeIngestPreferredModel
} from "@/lib/enterprise/ingest-model-options";

export interface DoubaoAdminIngestInput {
  input: string;
  attachments?: OpenAIAdminIngestAttachment[];
  agentId?: string | null;
  expertId?: string | null;
  agentName?: string | null;
  category?: string | null;
  source: "admin_ingest";
  platform: AdminIngestPlatform;
  syncTarget: Array<"web" | "exe" | "apk">;
  tenantId?: string | null;
  userId?: string | null;
  preferredModel?: string | null;
  selectedModelLabel?: string | null;
  modelDisplayName?: string | null;
  agentDescription?: string | null;
  targetUser?: string | null;
  recentMessages?: GptIngestMemoryMessage[];
  contextSummary?: string | null;
  memoryContextText?: string | null;
  agentLearningInstruction?: string | null;
  usedMemoryIds?: string[];
  knowledgeContexts?: GptIngestKnowledgeContext[];
  previousKnowledgeDrafts?: Array<Partial<GptKnowledgeDraft>>;
  recentTrainingRecords?: GptIngestMemoryRecord[];
  autonomous?: AutonomousTaskRequest;
  requestId?: string;
  signal?: AbortSignal;
}

export interface DoubaoAdminIngestResult {
  provider: "doubao";
  model: string;
  requestedModel: string;
  actualModel: string;
  responseId: string;
  proofId: string;
  createdAt: string;
  usage: OpenAIGptUsage;
  gptProof: GptCallProof;
  intent: GptOutputIntent;
  fixedTemplateRisk: boolean;
  modelDisplayName: string;
  modelMode: "highest" | "fixed";
  fallback: boolean;
  selectedModelLabel: string;
  replyMarkdown: string;
  knowledgeDraft: GptKnowledgeDraft;
  userClientCallPlan: GptUserClientCallPlan;
  suggestedQuestions: string[];
  sourceFiles: Array<{
    fileName: string;
    mimeType?: string;
    parseStatus?: string;
    limitationNote?: string;
  }>;
  saveRecommendation: GptSaveRecommendation;
  diagnostics: string[];
  gptOS: GptOSRouteResult;
  autonomousResult: AutonomousTaskResult;
  structured: GptStructuredKnowledge;
  structuredResult: GptStructuredKnowledge;
  sync: {
    platform: AdminIngestPlatform;
    syncTarget: Array<"web" | "exe" | "apk">;
  };
  sourceType: "admin_ingest";
  fallbackUsed: boolean;
}

export type DoubaoIngestErrorCode =
  | "DOUBAO_API_KEY_MISSING"
  | "DOUBAO_API_KEY_INVALID"
  | "DOUBAO_BASE_URL_INVALID"
  | "DOUBAO_RATE_LIMITED"
  | "DOUBAO_QUOTA_EXCEEDED"
  | "DOUBAO_SAFETY_REJECTED"
  | "DOUBAO_MODEL_UNAVAILABLE"
  | "DOUBAO_REQUEST_FAILED"
  | "DOUBAO_RESPONSE_PARSE_FAILED"
  | "DOUBAO_TIMEOUT"
  | "DOUBAO_REQUEST_CANCELLED";

export type DoubaoParseStage =
  | "provider_payload"
  | "sse_event"
  | "provider_error"
  | "model_identity"
  | "finish_reason"
  | "stream_eof"
  | "reply_json";

export class DoubaoIngestError extends Error {
  constructor(
    public readonly code: DoubaoIngestErrorCode,
    message: string,
    public readonly details: {
      receivedContent?: boolean;
      timeoutStage?: "connect" | "first_event" | "idle" | "hard";
      abortSource?: "client" | "hard_timeout";
      parseStage?: DoubaoParseStage;
      finishReason?: string;
      eventCount?: number;
      receivedChars?: number;
    } = {}
  ) {
    super(message);
    this.name = "DoubaoIngestError";
  }
}

const DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
const DEFAULT_MODEL_LABEL = "Doubao-Seed-2.1-pro";
const DEFAULT_CONNECT_TIMEOUT_MS = 30_000;
const DEFAULT_FIRST_EVENT_TIMEOUT_MS = 90_000;
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 60_000;
const DEFAULT_HARD_TIMEOUT_MS = 270_000;

function readEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function readTimeoutMs(name: string, fallback: number, maximum = fallback) {
  const parsed = Number(readEnv(name));

  return Number.isFinite(parsed) && parsed >= 10
    ? Math.min(parsed, maximum)
    : fallback;
}

function resolveDoubaoStreamTimeouts() {
  return {
    connectMs: readTimeoutMs("DOUBAO_CONNECT_TIMEOUT_MS", DEFAULT_CONNECT_TIMEOUT_MS),
    firstEventMs: readTimeoutMs("DOUBAO_FIRST_EVENT_TIMEOUT_MS", DEFAULT_FIRST_EVENT_TIMEOUT_MS),
    idleMs: readTimeoutMs("DOUBAO_STREAM_IDLE_TIMEOUT_MS", DEFAULT_STREAM_IDLE_TIMEOUT_MS),
    hardMs: readTimeoutMs("DOUBAO_HARD_TIMEOUT_MS", DEFAULT_HARD_TIMEOUT_MS)
  };
}

function readArkApiKey() {
  const apiKey = readEnv("ARK_API_KEY") || readEnv("DOUBAO_API_KEY");

  if (!apiKey || /^(your|replace|changeme)/i.test(apiKey) || apiKey.includes("ARK_API_KEY")) {
    throw new DoubaoIngestError("DOUBAO_API_KEY_MISSING", "豆包 Ark API Key 未配置");
  }

  return apiKey;
}

function normalizeBaseUrl(value: string) {
  return (value || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export function buildDoubaoChatCompletionsUrl(baseUrl: string) {
  try {
    const normalized = normalizeBaseUrl(baseUrl);

    return normalized.endsWith("/chat/completions")
      ? new URL(normalized).toString()
      : new URL(`${normalized}/chat/completions`).toString();
  } catch {
    throw new DoubaoIngestError("DOUBAO_BASE_URL_INVALID", "DOUBAO_BASE_URL 无效。");
  }
}

function resolveDoubaoConfig(input: DoubaoAdminIngestInput) {
  const configuredModel = readEnv("DOUBAO_PRO_MODEL") || readEnv("DOUBAO_MODEL");
  const preferredModel = sanitizeIngestPreferredModel(input.preferredModel);
  const model = preferredModel || resolveIngestActualModel("doubao-pro") || DOUBAO_PRO_MODEL_ID;
  const selectedModelLabel = input.selectedModelLabel
    || input.modelDisplayName
    || readEnv("DOUBAO_DISPLAY_NAME")
    || DEFAULT_MODEL_LABEL;
  const baseUrl = normalizeBaseUrl(readEnv("DOUBAO_BASE_URL"));

  return {
    apiKey: readArkApiKey(),
    chatCompletionsUrl: buildDoubaoChatCompletionsUrl(baseUrl),
    model,
    selectedModelLabel,
    modelMode: configuredModel || preferredModel ? "fixed" as const : "highest" as const
  };
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeCreatedAt(value: unknown) {
  const numeric = readNumber(value);

  return numeric ? new Date(numeric * 1000).toISOString() : new Date().toISOString();
}

function normalizeUsage(value: unknown): OpenAIGptUsage {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const completionDetails = record.completion_tokens_details && typeof record.completion_tokens_details === "object"
    ? record.completion_tokens_details as Record<string, unknown>
    : {};

  return {
    inputTokens: readNumber(record.prompt_tokens),
    outputTokens: readNumber(record.completion_tokens),
    totalTokens: readNumber(record.total_tokens),
    reasoningTokens: readNumber(completionDetails.reasoning_tokens)
  };
}

function buildGptOSRouteInput(input: DoubaoAdminIngestInput) {
  return {
    text: input.input,
    activeAgentName: input.agentName,
    category: input.category,
    attachments: input.attachments,
    recentMessages: input.recentMessages,
    autonomous: input.autonomous
  };
}

function buildUserPrompt(input: DoubaoAdminIngestInput, gptOS?: GptOSRouteResult) {
  return buildGptIngestBrainUserPrompt({
    currentInput: input.input,
    gptOS,
    memory: {
      currentInput: input.input,
      currentAgent: {
        agentId: input.agentId,
        expertId: input.expertId,
        agentName: input.agentName,
        category: input.category,
        description: input.agentDescription,
        targetUser: input.targetUser
      },
      recentMessages: input.recentMessages,
      contextSummary: input.contextSummary,
      memoryContextText: input.memoryContextText,
      agentLearningInstruction: input.agentLearningInstruction,
      usedMemoryIds: input.usedMemoryIds,
      knowledgeContexts: input.knowledgeContexts,
      uploadedAttachments: input.attachments,
      previousKnowledgeDrafts: input.previousKnowledgeDrafts,
      recentTrainingRecords: input.recentTrainingRecords,
      selectedModelLabel: input.selectedModelLabel || input.modelDisplayName || input.preferredModel,
      platform: input.platform,
      syncTarget: input.syncTarget
    }
  });
}

export function classifyDoubaoResponseError(status: number, bodyText = "") {
  const body = bodyText.toLowerCase();

  if (status === 401 || status === 403) {
    return new DoubaoIngestError("DOUBAO_API_KEY_INVALID", "豆包 Ark API Key 无效或无权访问当前模型。");
  }

  if (status === 408 || status === 504) {
    return new DoubaoIngestError("DOUBAO_TIMEOUT", `豆包请求超时（HTTP ${status}）。`);
  }

  if (status === 429 && /(quota|insufficient|balance|余额|额度)/i.test(body)) {
    return new DoubaoIngestError("DOUBAO_QUOTA_EXCEEDED", "豆包 Ark 账号额度不足（HTTP 429）。");
  }

  if (status === 429) {
    return new DoubaoIngestError("DOUBAO_RATE_LIMITED", "豆包请求过于频繁（HTTP 429），请稍后重试。");
  }

  if ((status === 400 || status === 422) && /(safety|content.?policy|sensitive|moderation|违规|敏感|安全策略)/i.test(body)) {
    return new DoubaoIngestError("DOUBAO_SAFETY_REJECTED", "豆包安全策略拒绝了本次内容请求。");
  }

  if (status === 404 || /(model.?not.?found|invalid.?model|模型不存在|模型不可用)/i.test(body)) {
    return new DoubaoIngestError("DOUBAO_MODEL_UNAVAILABLE", `豆包模型不可用（HTTP ${status}）。`);
  }

  return new DoubaoIngestError("DOUBAO_REQUEST_FAILED", `豆包请求失败（HTTP ${status}）。`);
}

export async function callDoubao(payload: {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  messages?: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  input?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}) {
  const apiKey = payload.apiKey || readArkApiKey();
  const model = sanitizeIngestPreferredModel(payload.model) || resolveIngestActualModel("doubao-pro");
  const url = buildDoubaoChatCompletionsUrl(payload.baseUrl || readEnv("DOUBAO_BASE_URL") || DEFAULT_BASE_URL);
  const messages = payload.messages?.length
    ? payload.messages
    : [{ role: "user" as const, content: payload.input || "ping" }];
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: payload.temperature ?? 0.7,
      max_tokens: payload.maxTokens ?? 6000,
      stream: false
    }),
    signal: payload.signal,
    cache: "no-store"
  });
  const bodyText = await response.text();

  if (!response.ok) {
    const classified = classifyDoubaoResponseError(response.status, bodyText);
    logger.warn("enterprise_admin_ingest.doubao_request_failed", {
      status: response.status,
      errorCode: classified.code
    });
    throw classified;
  }

  try {
    return bodyText ? JSON.parse(bodyText) as unknown : null;
  } catch {
    throw new DoubaoIngestError(
      "DOUBAO_RESPONSE_PARSE_FAILED",
      "豆包返回解析失败。",
      { parseStage: "provider_payload", receivedContent: Boolean(bodyText), receivedChars: bodyText.length }
    );
  }
}

type DoubaoStreamAccumulator = {
  responseId: string;
  model: string;
  created?: number;
  content: string;
  usage?: unknown;
  receivedEvent: boolean;
  eventCount: number;
  finishReason?: string;
  done: boolean;
};

function makeDoubaoTimeoutError(
  stage: "connect" | "first_event" | "idle" | "hard",
  receivedContent: boolean
) {
  const labels = {
    connect: "连接",
    first_event: "首次响应",
    idle: "流式响应",
    hard: "完整生成"
  } as const;

  return new DoubaoIngestError(
    "DOUBAO_TIMEOUT",
    `豆包${labels[stage]}超时，请稍后重试。`,
    { receivedContent, timeoutStage: stage }
  );
}

function parseDoubaoSseEvent(block: string, accumulator: DoubaoStreamAccumulator) {
  const dataLines = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""));

  if (dataLines.length === 0) {
    return;
  }

  const data = dataLines.join("\n");

  if (data === "[DONE]") {
    accumulator.receivedEvent = true;
    accumulator.eventCount += 1;
    accumulator.done = true;
    return;
  }

  let event: Record<string, unknown>;

  try {
    const parsed = JSON.parse(data) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid SSE payload");
    }

    event = parsed as Record<string, unknown>;
  } catch {
    throw new DoubaoIngestError(
      "DOUBAO_RESPONSE_PARSE_FAILED",
      "豆包流式返回解析失败。",
      {
        receivedContent: accumulator.content.length > 0,
        parseStage: "sse_event",
        eventCount: accumulator.eventCount,
        receivedChars: accumulator.content.length
      }
    );
  }

  if (event.error) {
    throw new DoubaoIngestError(
      "DOUBAO_REQUEST_FAILED",
      "豆包流式请求返回错误。",
      {
        receivedContent: accumulator.content.length > 0,
        parseStage: "provider_error",
        eventCount: accumulator.eventCount,
        receivedChars: accumulator.content.length
      }
    );
  }

  accumulator.receivedEvent = true;
  accumulator.eventCount += 1;
  accumulator.responseId ||= typeof event.id === "string" ? event.id : "";
  const eventModel = typeof event.model === "string" ? event.model.trim() : "";

  if (eventModel) {
    if (accumulator.model && accumulator.model !== eventModel) {
      throw new DoubaoIngestError(
        "DOUBAO_RESPONSE_PARSE_FAILED",
        "豆包流式返回的模型标识不一致。",
        {
          receivedContent: accumulator.content.length > 0,
          parseStage: "model_identity",
          eventCount: accumulator.eventCount,
          receivedChars: accumulator.content.length
        }
      );
    }

    accumulator.model = eventModel;
  }
  accumulator.created ??= readNumber(event.created);
  accumulator.usage = event.usage ?? accumulator.usage;

  const choices = Array.isArray(event.choices) ? event.choices : [];
  const firstChoice = choices[0] && typeof choices[0] === "object"
    ? choices[0] as Record<string, unknown>
    : {};
  const delta = firstChoice.delta && typeof firstChoice.delta === "object"
    ? firstChoice.delta as Record<string, unknown>
    : {};
  const finishReason = typeof firstChoice.finish_reason === "string"
    ? firstChoice.finish_reason.trim()
    : "";

  if (finishReason) {
    accumulator.finishReason = finishReason;
  }

  if (typeof delta.content === "string") {
    accumulator.content += delta.content;
  }
}

function readWithTimeout<T>(input: {
  promise: Promise<T>;
  timeoutMs: number;
  onTimeout: () => void;
  timeoutError: DoubaoIngestError;
}) {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      input.onTimeout();
      reject(input.timeoutError);
    }, input.timeoutMs);

    input.promise.then((value) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolve(value);
    }, (error: unknown) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function collectDoubaoSseCompletion(input: {
  response: Response;
  controller: AbortController;
  firstEventTimeoutMs: number;
  idleTimeoutMs: number;
}) {
  const reader = input.response.body?.getReader();

  if (!reader) {
    throw new DoubaoIngestError(
      "DOUBAO_RESPONSE_PARSE_FAILED",
      "豆包流式返回缺少响应正文。",
      { parseStage: "provider_payload", receivedContent: false, eventCount: 0, receivedChars: 0 }
    );
  }

  const accumulator: DoubaoStreamAccumulator = {
    responseId: "",
    model: "",
    content: "",
    receivedEvent: false,
    eventCount: 0,
    done: false
  };
  const decoder = new TextDecoder();
  let buffer = "";
  const phaseStartedAt = Date.now();
  let lastEventAt = phaseStartedAt;

  try {
    while (!accumulator.done) {
      const timeoutStage = accumulator.receivedEvent ? "idle" as const : "first_event" as const;
      const timeoutMs = accumulator.receivedEvent ? input.idleTimeoutMs : input.firstEventTimeoutMs;
      const timeoutStartedAt = accumulator.receivedEvent ? lastEventAt : phaseStartedAt;
      const remainingTimeoutMs = timeoutMs - (Date.now() - timeoutStartedAt);

      if (remainingTimeoutMs <= 0) {
        input.controller.abort();
        throw makeDoubaoTimeoutError(timeoutStage, accumulator.content.length > 0);
      }

      const chunk = await readWithTimeout({
        promise: reader.read(),
        timeoutMs: remainingTimeoutMs,
        onTimeout: () => input.controller.abort(),
        timeoutError: makeDoubaoTimeoutError(timeoutStage, accumulator.content.length > 0)
      });

      if (chunk.done) {
        buffer += decoder.decode();
        break;
      }

      buffer += decoder.decode(chunk.value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? "";
      const eventCountBeforeParse = accumulator.eventCount;

      for (const block of blocks) {
        parseDoubaoSseEvent(block, accumulator);
        if (accumulator.done) {
          break;
        }
      }

      if (accumulator.eventCount > eventCountBeforeParse) {
        lastEventAt = Date.now();
      }
    }

    if (!accumulator.done && buffer.trim()) {
      const eventCountBeforeParse = accumulator.eventCount;
      parseDoubaoSseEvent(buffer, accumulator);

      if (accumulator.eventCount > eventCountBeforeParse) {
        lastEventAt = Date.now();
      }
    }

    if (accumulator.finishReason && accumulator.finishReason !== "stop") {
      throw new DoubaoIngestError(
        "DOUBAO_RESPONSE_PARSE_FAILED",
        `豆包流式返回未完整结束（finish_reason=${accumulator.finishReason}）。`,
        {
          receivedContent: accumulator.content.length > 0,
          parseStage: "finish_reason",
          finishReason: accumulator.finishReason,
          eventCount: accumulator.eventCount,
          receivedChars: accumulator.content.length
        }
      );
    }

    if (!accumulator.done && accumulator.finishReason !== "stop") {
      throw new DoubaoIngestError(
        "DOUBAO_RESPONSE_PARSE_FAILED",
        "豆包流式返回提前结束，未保存不完整正文。",
        {
          receivedContent: accumulator.content.length > 0,
          parseStage: "stream_eof",
          finishReason: accumulator.finishReason,
          eventCount: accumulator.eventCount,
          receivedChars: accumulator.content.length
        }
      );
    }

    if (!accumulator.model) {
      throw new DoubaoIngestError(
        "DOUBAO_RESPONSE_PARSE_FAILED",
        "豆包返回缺少实际模型标识。",
        {
          receivedContent: accumulator.content.length > 0,
          parseStage: "model_identity",
          finishReason: accumulator.finishReason,
          eventCount: accumulator.eventCount,
          receivedChars: accumulator.content.length
        }
      );
    }
  } catch (error) {
    if (
      error instanceof DoubaoIngestError
      || (error && typeof error === "object" && (error as { name?: string }).name === "AbortError")
    ) {
      throw error;
    }

    throw new DoubaoIngestError(
      "DOUBAO_REQUEST_FAILED",
      "豆包流式连接中断，请重新尝试。",
      {
        receivedContent: accumulator.content.length > 0,
        parseStage: "stream_eof",
        finishReason: accumulator.finishReason,
        eventCount: accumulator.eventCount,
        receivedChars: accumulator.content.length
      }
    );
  } finally {
    try {
      await reader.cancel();
    } catch {
      // The stream can already be closed after an abort or a natural EOF.
    }

    try {
      reader.releaseLock();
    } catch {
      // The lock can already be released by the runtime.
    }
  }

  return {
    id: accumulator.responseId,
    model: accumulator.model,
    created: accumulator.created,
    choices: [{
      finish_reason: accumulator.finishReason ?? (accumulator.done ? "stop" : null),
      message: {
        role: "assistant",
        content: accumulator.content
      }
    }],
    usage: accumulator.usage
  };
}

async function callDoubaoStreaming(payload: {
  apiKey: string;
  baseUrl: string;
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature: number;
  maxTokens: number;
  signal: AbortSignal;
}) {
  const timeouts = resolveDoubaoStreamTimeouts();
  const controller = new AbortController();
  const forwardAbort = () => controller.abort();

  if (payload.signal.aborted) {
    controller.abort();
  } else {
    payload.signal.addEventListener("abort", forwardAbort, { once: true });
  }

  try {
    const response = await readWithTimeout({
      promise: fetch(payload.baseUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${payload.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: payload.model,
          messages: payload.messages,
          temperature: payload.temperature,
          max_tokens: payload.maxTokens,
          stream: true,
          stream_options: { include_usage: true }
        }),
        signal: controller.signal,
        cache: "no-store"
      }),
      timeoutMs: timeouts.connectMs,
      onTimeout: () => controller.abort(),
      timeoutError: makeDoubaoTimeoutError("connect", false)
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      const classified = classifyDoubaoResponseError(response.status, bodyText);
      logger.warn("enterprise_admin_ingest.doubao_request_failed", {
        status: response.status,
        errorCode: classified.code
      });
      throw classified;
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

    if (!contentType.includes("text/event-stream")) {
      const bodyText = await response.text();

      try {
        return bodyText ? JSON.parse(bodyText) as unknown : null;
      } catch {
        throw new DoubaoIngestError(
          "DOUBAO_RESPONSE_PARSE_FAILED",
          "豆包返回解析失败。",
          {
            receivedContent: Boolean(bodyText),
            parseStage: "provider_payload",
            receivedChars: bodyText.length
          }
        );
      }
    }

    return collectDoubaoSseCompletion({
      response,
      controller,
      firstEventTimeoutMs: timeouts.firstEventMs,
      idleTimeoutMs: timeouts.idleMs
    });
  } finally {
    payload.signal.removeEventListener("abort", forwardAbort);
  }
}

function canRetryDoubaoCall(error: unknown, signal: AbortSignal) {
  if (signal.aborted) {
    return false;
  }

  if (!(error instanceof DoubaoIngestError)) {
    return true;
  }

  if (error.details.receivedContent) {
    return false;
  }

  if (error.code === "DOUBAO_TIMEOUT") {
    return !error.details.timeoutStage
      || error.details.timeoutStage === "connect"
      || error.details.timeoutStage === "first_event"
      || error.details.timeoutStage === "idle";
  }

  return error.code === "DOUBAO_RATE_LIMITED"
    || error.code === "DOUBAO_REQUEST_FAILED";
}

async function callDoubaoChatCompletions(input: {
  chatCompletionsUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  signal: AbortSignal;
}) {
  const startedAt = Date.now();
  const messages = [
    { role: "system" as const, content: input.systemPrompt },
    { role: "user" as const, content: input.userPrompt }
  ];
  let retryCount = 0;
  let value: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      value = await callDoubaoStreaming({
        apiKey: input.apiKey,
        baseUrl: input.chatCompletionsUrl,
        model: input.model,
        messages,
        temperature: 0.7,
        maxTokens: 6000,
        signal: input.signal
      });
      break;
    } catch (error) {
      if (attempt > 0 || !canRetryDoubaoCall(error, input.signal)) {
        throw error;
      }

      retryCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  if (value === undefined) {
    throw new DoubaoIngestError("DOUBAO_REQUEST_FAILED", "豆包请求未返回结果。");
  }

  return {
    ...parseDoubaoPayload(value, input.model),
    retryCount,
    responseLatency: Date.now() - startedAt,
    circuitBreaker: "not_used" as const
  };
}

function parseDoubaoPayload(payload: unknown, fallbackModel: string) {
  const normalized = normalizeLLMResponse(payload, {
    provider: "doubao",
    fallbackModel
  });
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const firstChoice = choices[0] && typeof choices[0] === "object" ? choices[0] as Record<string, unknown> : {};
  const message = firstChoice.message && typeof firstChoice.message === "object" ? firstChoice.message as Record<string, unknown> : {};
  const rawChatText = typeof message.content === "string" ? message.content : "";
  const rawResponseId = normalized.responseId ?? "";
  const actualModel = typeof record.model === "string" ? record.model.trim() : "";

  if (!actualModel) {
    throw new DoubaoIngestError(
      "DOUBAO_RESPONSE_PARSE_FAILED",
      "豆包返回缺少实际模型标识。",
      {
        receivedContent: Boolean(rawChatText),
        parseStage: "model_identity",
        receivedChars: rawChatText.length
      }
    );
  }
  const generatedProofId = `doubao-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;
  const responseId = rawResponseId || generatedProofId;

  return {
    text: rawChatText.trim() ? rawChatText : normalized.text,
    model: actualModel,
    responseId,
    proofId: responseId,
    proofIdSource: rawResponseId ? "provider_response_id" as const : "generated_from_provider_payload" as const,
    createdAt: normalized.createdAt ?? normalizeCreatedAt(record.created),
    usage: normalized.usage ?? normalizeUsage(record.usage),
    rawResponseType: normalized.rawResponseType,
    normalized: normalized.normalized,
    parserUsed: normalized.parserUsed
  };
}

function extractJsonObject(text: string) {
  const fenced = text.trim().match(/^```(?:json)?\s*([\s\S]*)```\s*$/i);
  const candidate = fenced?.[1]
    || (() => {
      const firstBrace = text.indexOf("{");
      const lastBrace = text.lastIndexOf("}");

      return firstBrace >= 0 && lastBrace > firstBrace ? text.slice(firstBrace, lastBrace + 1) : text;
    })();

  try {
    const parsed = JSON.parse(candidate.trim()) as unknown;

    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function extractClosedJsonStringField(text: string, fieldName: string) {
  const fieldPattern = new RegExp(`"${fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s*:\\s*"`, "g");
  const match = fieldPattern.exec(text);

  if (!match) {
    return null;
  }

  const openingQuoteIndex = fieldPattern.lastIndex - 1;

  for (let index = openingQuoteIndex + 1; index < text.length; index += 1) {
    if (text[index] !== '"') {
      continue;
    }

    let backslashCount = 0;

    for (let cursor = index - 1; cursor > openingQuoteIndex && text[cursor] === "\\"; cursor -= 1) {
      backslashCount += 1;
    }

    if (backslashCount % 2 === 1) {
      continue;
    }

    try {
      const parsed = JSON.parse(text.slice(openingQuoteIndex, index + 1)) as unknown;

      return typeof parsed === "string" ? parsed : null;
    } catch {
      return null;
    }
  }

  return null;
}

function extractDoubaoReply(text: string) {
  const parsed = extractJsonObject(text);
  const replyMarkdown = parsed?.replyMarkdown;

  if (typeof replyMarkdown === "string" && replyMarkdown.trim()) {
    return {
      replyMarkdown,
      recoveredFromPartialJson: false
    };
  }

  const recoveredReplyMarkdown = extractClosedJsonStringField(text, "replyMarkdown");

  if (typeof recoveredReplyMarkdown === "string" && recoveredReplyMarkdown.trim()) {
    return {
      replyMarkdown: recoveredReplyMarkdown,
      recoveredFromPartialJson: true
    };
  }

  const trimmed = text.trim();
  const looksLikeBrokenJson = trimmed.startsWith("{")
    || /^```(?:json)?\s*\{/i.test(trimmed);

  if (trimmed && !parsed && !looksLikeBrokenJson) {
    return {
      replyMarkdown: text,
      recoveredFromPartialJson: false
    };
  }

  throw new DoubaoIngestError(
    "DOUBAO_RESPONSE_PARSE_FAILED",
    "豆包未返回可保存的 replyMarkdown。",
    {
      receivedContent: Boolean(text),
      parseStage: "reply_json",
      receivedChars: text.length
    }
  );
}

export function extractDoubaoReplyMarkdown(text: string) {
  return extractDoubaoReply(text).replyMarkdown;
}

export async function runDoubaoAdminIngest(input: DoubaoAdminIngestInput): Promise<DoubaoAdminIngestResult> {
  const { hardMs } = resolveDoubaoStreamTimeouts();
  const controller = new AbortController();
  let hardTimeoutReached = false;
  let clientAbortReached = input.signal?.aborted === true;
  const forwardClientAbort = () => {
    clientAbortReached = true;
    controller.abort(input.signal?.reason);
  };

  if (clientAbortReached) {
    controller.abort(input.signal?.reason);
  } else {
    input.signal?.addEventListener("abort", forwardClientAbort, { once: true });
  }

  const timeout = setTimeout(() => {
    hardTimeoutReached = true;
    controller.abort();
  }, hardMs);
  const startedAt = Date.now();

  try {
    const resolved = resolveDoubaoConfig(input);
    const gptOS = routeGptOSAgent(buildGptOSRouteInput(input));
    const response = await callDoubaoChatCompletions({
      chatCompletionsUrl: resolved.chatCompletionsUrl,
      apiKey: resolved.apiKey,
      model: resolved.model,
      systemPrompt: buildGptIngestBrainSystemPrompt(),
      userPrompt: buildUserPrompt(input, gptOS),
      signal: controller.signal
    });
    const extractedReply = extractDoubaoReply(response.text);
    const replyMarkdown = extractedReply.replyMarkdown;
    const structuredPayload = extractJsonObject(response.text) ?? {};
    const normalized = normalizeGptOutput({
      rawText: JSON.stringify({
        ...structuredPayload,
        replyMarkdown
      }),
      originalInput: input.input,
      fallbackCategory: input.category ?? "",
      strictReply: true
    });
    const partialStructuredPayloadNote = "豆包正文已完整返回，但结构化元数据未完整结束，请重新生成或人工复核后再入库。";
    const knowledgeDraft = extractedReply.recoveredFromPartialJson
      ? {
          ...normalized.knowledgeDraft,
          standardAnswer: replyMarkdown,
          standardAnswers: [replyMarkdown],
          complianceNotes: Array.from(new Set([
            ...(normalized.knowledgeDraft.complianceNotes ?? []),
            partialStructuredPayloadNote
          ])),
          missingFields: Array.from(new Set([
            ...normalized.knowledgeDraft.missingFields,
            partialStructuredPayloadNote
          ])),
          trainingScore: Math.min(normalized.knowledgeDraft.trainingScore, 60),
          saveRecommendation: "暂缓入库" as const
        }
      : normalized.knowledgeDraft;
    const structured = extractedReply.recoveredFromPartialJson
      ? {
          ...normalized.structured,
          answer: replyMarkdown,
          confidence: Math.min(normalized.structured.confidence, 60),
          saveSuggestion: false
        }
      : normalized.structured;
    const quality = assessGptProResponseQuality(replyMarkdown, {
      userInput: input.input
    });
    const qualitySoftAccepted = Boolean(replyMarkdown.trim());
    const gptProof: GptCallProof = {
      provider: "doubao",
      endpoint: "/chat/completions",
      requestedModel: resolved.model,
      actualModel: response.model,
      responseId: response.responseId,
      proofId: response.proofId,
      proofIdSource: response.proofIdSource,
      fallback: false,
      requestTested: true,
      qualityPassed: quality.ok || qualitySoftAccepted,
      deepenAttempts: 0,
      createdAt: response.createdAt,
      usage: response.usage
    };

    logger.info("enterprise_admin_ingest.doubao_success", {
      requestId: input.requestId,
      model: response.model,
      requestedModel: resolved.model,
      responseId: response.responseId,
      durationMs: Date.now() - startedAt,
      outputTokens: response.usage.outputTokens,
      replyLength: replyMarkdown.length
    });

    return {
      provider: "doubao",
      model: response.model,
      requestedModel: resolved.model,
      actualModel: response.model,
      responseId: response.responseId,
      proofId: response.proofId,
      createdAt: response.createdAt,
      usage: response.usage,
      gptProof,
      intent: quality.intent,
      fixedTemplateRisk: quality.fixedTemplateRisk,
      modelDisplayName: resolved.selectedModelLabel,
      modelMode: resolved.modelMode,
      fallback: false,
      selectedModelLabel: resolved.selectedModelLabel,
      replyMarkdown,
      knowledgeDraft,
      userClientCallPlan: normalized.userClientCallPlan,
      suggestedQuestions: Array.from(new Set([
        ...normalized.suggestedQuestions,
        ...gptOS.actions.map((action) => action.label)
      ])).slice(0, 8),
      sourceFiles: (input.attachments ?? []).map((attachment) => ({
        fileName: attachment.fileName,
        mimeType: attachment.mimeType ?? attachment.fileType,
        parseStatus: attachment.parseStatus,
        limitationNote: attachment.limitationNote
      })),
      saveRecommendation: knowledgeDraft.saveRecommendation,
      diagnostics: [
        "apiResilience:provider:doubao",
        `apiResilience:normalized:${response.normalized ? "true" : "false"}`,
        `apiResilience:parserUsed:${response.parserUsed}`,
        `apiResilience:rawResponseType:${response.rawResponseType}`,
        `apiResilience:retryCount:${response.retryCount}`,
        "apiResilience:fallbackUsed:false",
        `apiResilience:responseLatency:${response.responseLatency}`,
        `apiResilience:circuitBreaker:${response.circuitBreaker}`,
        "doubao:replyMarkdownPassthrough:true",
        `doubao:partialStructuredPayloadRecovered:${extractedReply.recoveredFromPartialJson ? "true" : "false"}`,
        `doubao:saveRequiresReview:${extractedReply.recoveredFromPartialJson ? "true" : "false"}`,
        `observability:traceId:${gptOS.observability.trace.traceId}`,
        `observability:requestId:${gptOS.observability.trace.requestId}`,
        `observability:modelUsed:${response.model}`,
        `observability:agent:${gptOS.observability.agent.selectedAgentId}`,
        `gptOS:plannerIntent:${gptOS.planner.intent}`,
        `gptOS:complexity:${gptOS.planner.complexity}`,
        `gptOS:persona:${gptOS.memory.personaLabel}`,
        `gptOS:agent:${gptOS.selectedAgent.id}`,
        `intent:${quality.intent}`,
        `fixedTemplateRisk:${quality.fixedTemplateRisk ? "true" : "false"}`,
        ...normalized.diagnostics
      ],
      gptOS,
      autonomousResult: gptOS.autonomousResult,
      structured,
      structuredResult: structured,
      sync: {
        platform: input.platform,
        syncTarget: input.syncTarget
      },
      sourceType: "admin_ingest",
      fallbackUsed: false
    };
  } catch (error) {
    if (error && typeof error === "object" && (error as { name?: string }).name === "AbortError") {
      if (clientAbortReached && !hardTimeoutReached) {
        throw new DoubaoIngestError(
          "DOUBAO_REQUEST_CANCELLED",
          "豆包请求已由当前浏览器连接取消。",
          { receivedContent: false, abortSource: "client" }
        );
      }

      const timeoutError = makeDoubaoTimeoutError(hardTimeoutReached ? "hard" : "idle", false);

      throw new DoubaoIngestError(timeoutError.code, timeoutError.message, {
        ...timeoutError.details,
        abortSource: "hard_timeout"
      });
    }

    throw error;
  } finally {
    clearTimeout(timeout);
    input.signal?.removeEventListener("abort", forwardClientAbort);
  }
}
