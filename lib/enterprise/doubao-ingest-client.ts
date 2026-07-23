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

export type DoubaoRequestPhase = "visible" | "continuation" | "metadata" | "health";

export type DoubaoAdminIngestProgressEvent =
  | {
      type: "queue_wait";
      phase: DoubaoRequestPhase;
      queueDepth: number;
    }
  | {
      type: "rate_limit_wait";
      phase: DoubaoRequestPhase;
      retryAfterMs: number;
      attempt: number;
    }
  | {
      type: "visible_reply";
      replyMarkdown: string;
      model: string;
      responseId: string;
      metadataPending: true;
    }
  | {
      type: "metadata_status";
      state: "pending" | "completed" | "deferred";
      failureCode?: string;
    };

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
  onProgressEvent?: (event: DoubaoAdminIngestProgressEvent) => void;
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
      retryAfterMs?: number;
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
const DEFAULT_DOUBAO_CONCURRENCY = 1;
const MAX_CONTINUATION_PREFIX_CHARS = 8_000;

type DoubaoQueueEntry = {
  id: number;
  priority: number;
  phase: DoubaoRequestPhase;
  signal: AbortSignal;
  resolve: () => void;
  reject: (error: unknown) => void;
  onProgressEvent?: (event: DoubaoAdminIngestProgressEvent) => void;
  onAbort: () => void;
};

let doubaoQueueSequence = 0;
let activeDoubaoRequests = 0;
const pendingDoubaoRequests: DoubaoQueueEntry[] = [];

function requestPhasePriority(phase: DoubaoRequestPhase) {
  if (phase === "visible") {
    return 0;
  }

  if (phase === "continuation") {
    return 1;
  }

  if (phase === "metadata") {
    return 2;
  }

  return 3;
}

function resolveDoubaoConcurrency() {
  const parsed = Number(readEnv("DOUBAO_MAX_CONCURRENCY"));

  return Number.isSafeInteger(parsed) && parsed > 0
    ? Math.min(parsed, 2)
    : DEFAULT_DOUBAO_CONCURRENCY;
}

function pumpDoubaoQueue() {
  const concurrency = resolveDoubaoConcurrency();

  while (activeDoubaoRequests < concurrency && pendingDoubaoRequests.length > 0) {
    pendingDoubaoRequests.sort((left, right) => left.priority - right.priority || left.id - right.id);
    const next = pendingDoubaoRequests.shift();

    if (!next) {
      return;
    }

    next.signal.removeEventListener("abort", next.onAbort);

    if (next.signal.aborted) {
      next.reject(new DOMException("The operation was aborted.", "AbortError"));
      continue;
    }

    activeDoubaoRequests += 1;
    next.resolve();
  }
}

async function acquireDoubaoRequestSlot(input: {
  phase: DoubaoRequestPhase;
  signal: AbortSignal;
  onProgressEvent?: (event: DoubaoAdminIngestProgressEvent) => void;
}) {
  if (input.signal.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }

  if (activeDoubaoRequests < resolveDoubaoConcurrency() && pendingDoubaoRequests.length === 0) {
    activeDoubaoRequests += 1;
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const entry: DoubaoQueueEntry = {
      id: ++doubaoQueueSequence,
      priority: requestPhasePriority(input.phase),
      phase: input.phase,
      signal: input.signal,
      resolve,
      reject,
      onProgressEvent: input.onProgressEvent,
      onAbort: () => {
        const index = pendingDoubaoRequests.findIndex((candidate) => candidate.id === entry.id);

        if (index >= 0) {
          pendingDoubaoRequests.splice(index, 1);
        }

        reject(new DOMException("The operation was aborted.", "AbortError"));
      }
    };

    pendingDoubaoRequests.push(entry);
    input.signal.addEventListener("abort", entry.onAbort, { once: true });
    input.onProgressEvent?.({
      type: "queue_wait",
      phase: input.phase,
      queueDepth: pendingDoubaoRequests.length
    });
    pumpDoubaoQueue();
  });
}

function releaseDoubaoRequestSlot() {
  activeDoubaoRequests = Math.max(0, activeDoubaoRequests - 1);
  pumpDoubaoQueue();
}

export async function runWithDoubaoRequestSlot<T>(input: {
  phase: DoubaoRequestPhase;
  signal: AbortSignal;
  onProgressEvent?: (event: DoubaoAdminIngestProgressEvent) => void;
  task: () => Promise<T>;
}) {
  await acquireDoubaoRequestSlot(input);

  try {
    if (input.signal.aborted) {
      throw input.signal.reason instanceof Error
        ? input.signal.reason
        : new DOMException("The operation was aborted.", "AbortError");
    }

    return await input.task();
  } finally {
    releaseDoubaoRequestSlot();
  }
}

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

function buildDoubaoVisibleSystemPrompt() {
  return [
    buildGptIngestBrainSystemPrompt(),
    "",
    "## Doubao 可见正文阶段（最终覆盖规则）",
    "【最高优先级固定知识库约束】正文中的专业事实、专业流程、业务结论和示例话术只能来自当前 knowledgeContexts。",
    "最近对话、历史上下文、长期记忆、训练记录和附件只用于理解用户场景、对象与表达需求，不得作为专业依据，也不得补充 knowledgeContexts 中不存在的专业内容。",
    "如果其他上下文与当前 knowledgeContexts 冲突，必须以当前 knowledgeContexts 为唯一专业依据；不得跨 Agent、跨知识库或使用通用模型知识替代。",
    "当前调用只生成用户可见正文。以上关于外层 JSON、knowledgeDraft、userClientCallPlan、diagnostics 的输出要求在本阶段全部暂停。",
    "只输出最终自然 Markdown 正文，不要输出 JSON、代码围栏、字段名、内部推理或后台元数据。",
    "必须继续完整理解以上 Agent、最近对话、长期记忆、固定知识库、附件正文和专项方向规则；其中只有当前 knowledgeContexts 可以提供专业依据，其余内容只用于理解场景和组织表达。",
    "正文必须直接来自你的最终表达，禁止为适配系统而缩写、裁剪、改写或套固定模板。"
  ].join("\n");
}

function buildDoubaoVisibleUserPrompt(input: DoubaoAdminIngestInput, gptOS?: GptOSRouteResult) {
  return [
    buildUserPrompt(input, gptOS),
    "",
    "## 本阶段唯一输出",
    "现在只回答管理员当前问题，并只输出用户可见的自然 Markdown 正文。",
    "不要输出 replyMarkdown 包装、JSON、knowledgeDraft、userClientCallPlan、suggestedQuestions 或 diagnostics。"
  ].join("\n");
}

function buildDoubaoMetadataSystemPrompt() {
  return [
    "你是小董AI投喂端的后台知识元数据整理器。",
    "本阶段不生成、重写、缩写或评价用户可见正文，只基于给定正文和原始任务提取后台结构。",
    "只返回一个合法 JSON 对象，不要使用 Markdown 代码围栏，不要包含 replyMarkdown 字段。",
    "只输出 knowledgeDraft 和 saveRecommendation 两个顶层字段。",
    "knowledgeDraft 只包含 title、summary、category、tags、standardQuestion、saveRecommendation、missingFields、trainingScore。",
    "不要输出 standardAnswer；服务端会把已完成的用户可见正文原样绑定为标准答案。",
    "不得编造正文、固定知识库或附件中不存在的事实。"
  ].join("\n");
}

function buildDoubaoMetadataUserPrompt(input: DoubaoAdminIngestInput, replyMarkdown: string) {
  return [
    "## 原始管理员任务",
    input.input,
    "",
    "## 当前 Agent",
    input.agentName || input.agentId || "当前投喂 Agent",
    "",
    "## 已完成的用户可见正文（只用于提取元数据，不得重写）",
    replyMarkdown,
    "",
    "请只输出后台 JSON 元数据。"
  ].join("\n");
}

export function readDoubaoRetryAfterMs(headers: Headers, now = Date.now()) {
  const rawValue = headers.get("retry-after")?.trim() ?? "";

  if (!rawValue) {
    return undefined;
  }

  const seconds = Number(rawValue);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1000);
  }

  const retryAt = Date.parse(rawValue);

  return Number.isFinite(retryAt)
    ? Math.max(0, retryAt - now)
    : undefined;
}

export function resolveDoubaoRetryDelayMs(input: {
  retryAfterMs?: number;
  retryAttempt: number;
  random?: () => number;
}) {
  const random = input.random ?? Math.random;
  const jitterMs = Math.floor(Math.max(0, Math.min(1, random())) * 250);

  if (typeof input.retryAfterMs === "number" && Number.isFinite(input.retryAfterMs) && input.retryAfterMs >= 0) {
    return Math.ceil(input.retryAfterMs) + jitterMs;
  }

  return Math.min(10_000, 2_000 * (2 ** Math.max(0, input.retryAttempt - 1))) + jitterMs;
}

export function classifyDoubaoResponseError(status: number, bodyText = "", options: {
  retryAfterMs?: number;
} = {}) {
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
    return new DoubaoIngestError(
      "DOUBAO_RATE_LIMITED",
      "豆包请求过于频繁（HTTP 429），请稍后重试。",
      { retryAfterMs: options.retryAfterMs }
    );
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

    if (
      accumulator.finishReason
      && accumulator.finishReason !== "stop"
      && accumulator.finishReason !== "length"
    ) {
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
      // Abort is the authoritative transport cancellation. Some mocked or
      // interrupted streams never settle their cancel promise; waiting here
      // would keep the Doubao scheduler slot occupied forever.
      void reader.cancel().catch(() => {
        // The stream can already be closed after an abort or a natural EOF.
      });
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
      const retryAfterMs = readDoubaoRetryAfterMs(response.headers);
      const classified = classifyDoubaoResponseError(response.status, bodyText, {
        retryAfterMs
      });
      logger.warn("enterprise_admin_ingest.doubao_request_failed", {
        status: response.status,
        errorCode: classified.code,
        retryAfterMs
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

function waitForDoubaoRetry(delayMs: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("The operation was aborted.", "AbortError"));
      return;
    }

    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);

    function onAbort() {
      clearTimeout(timer);
      reject(new DOMException("The operation was aborted.", "AbortError"));
    }

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function callDoubaoChatCompletions(input: {
  chatCompletionsUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  signal: AbortSignal;
  phase: DoubaoRequestPhase;
  maxTokens?: number;
  temperature?: number;
  assistantPrefix?: string;
  continuationInstruction?: string;
  retryRateLimited?: boolean;
  onProgressEvent?: (event: DoubaoAdminIngestProgressEvent) => void;
}) {
  const startedAt = Date.now();
  const messages = [
    { role: "system" as const, content: input.systemPrompt },
    { role: "user" as const, content: input.userPrompt },
    ...(input.assistantPrefix !== undefined
      ? [
          { role: "assistant" as const, content: input.assistantPrefix },
          {
            role: "user" as const,
            content: input.continuationInstruction
              || "请从上一段末尾继续，只输出尚未完成的 Markdown 正文，不要重复已经输出的内容。"
          }
        ]
      : [])
  ];
  let retryCount = 0;
  let value: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      value = await runWithDoubaoRequestSlot({
        phase: input.phase,
        signal: input.signal,
        onProgressEvent: input.onProgressEvent,
        task: () => callDoubaoStreaming({
          apiKey: input.apiKey,
          baseUrl: input.chatCompletionsUrl,
          model: input.model,
          messages,
          temperature: input.temperature ?? 0.7,
          maxTokens: input.maxTokens ?? 6000,
          signal: input.signal
        })
      });
      break;
    } catch (error) {
      const rateLimited = error instanceof DoubaoIngestError && error.code === "DOUBAO_RATE_LIMITED";

      if (
        attempt > 0
        || (rateLimited && input.retryRateLimited === false)
        || !canRetryDoubaoCall(error, input.signal)
      ) {
        throw error;
      }

      retryCount += 1;
      const retryDelayMs = rateLimited
        ? resolveDoubaoRetryDelayMs({
            retryAfterMs: error.details.retryAfterMs,
            retryAttempt: retryCount
          })
        : 500;

      if (rateLimited) {
        input.onProgressEvent?.({
          type: "rate_limit_wait",
          phase: input.phase,
          retryAfterMs: retryDelayMs,
          attempt: retryCount
        });
      }

      await waitForDoubaoRetry(retryDelayMs, input.signal);
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
  const finishReason = typeof firstChoice.finish_reason === "string" ? firstChoice.finish_reason.trim() : "";

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
    parserUsed: normalized.parserUsed,
    finishReason
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

function hasValidDoubaoMetadataPayload(payload: Record<string, unknown>) {
  const draft = payload.knowledgeDraft;

  if (!draft || typeof draft !== "object" || Array.isArray(draft)) {
    return false;
  }

  const record = draft as Record<string, unknown>;
  const hasText = (value: unknown) => typeof value === "string" && Boolean(value.trim());
  const hasTextArray = (value: unknown) => Array.isArray(value)
    && value.some((item) => hasText(item));
  const hasQuestion = hasText(record.standardQuestion) || hasTextArray(record.standardQuestions);

  return hasText(record.title)
    && hasText(record.summary)
    && hasText(record.category)
    && hasQuestion;
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

const DOUBAO_METADATA_FALLBACK_NOTE = "豆包正文已完整返回，但后台结构化元数据未完成；正文保留原样，知识草稿暂缓入库。";

function mergeDoubaoUsage(...values: OpenAIGptUsage[]): OpenAIGptUsage {
  const add = (field: keyof OpenAIGptUsage) => {
    const numbers = values
      .map((value) => value[field])
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

    return numbers.length > 0 ? numbers.reduce((total, value) => total + value, 0) : undefined;
  };

  return {
    inputTokens: add("inputTokens"),
    outputTokens: add("outputTokens"),
    totalTokens: add("totalTokens"),
    reasoningTokens: add("reasoningTokens")
  };
}

function withDoubaoMetadataFallback(
  normalized: ReturnType<typeof normalizeGptOutput>,
  replyMarkdown: string
) {
  const knowledgeDraft: GptKnowledgeDraft = {
    ...normalized.knowledgeDraft,
    standardAnswer: replyMarkdown,
    standardAnswers: [replyMarkdown],
    complianceNotes: Array.from(new Set([
      ...(normalized.knowledgeDraft.complianceNotes ?? []),
      DOUBAO_METADATA_FALLBACK_NOTE
    ])),
    missingFields: Array.from(new Set([
      ...normalized.knowledgeDraft.missingFields,
      DOUBAO_METADATA_FALLBACK_NOTE
    ])),
    trainingScore: Math.min(normalized.knowledgeDraft.trainingScore, 60),
    saveRecommendation: "暂缓入库"
  };
  const structured: GptStructuredKnowledge = {
    ...normalized.structured,
    answer: replyMarkdown,
    confidence: Math.min(normalized.structured.confidence, 60),
    saveSuggestion: false
  };

  return {
    ...normalized,
    knowledgeDraft,
    structured,
    saveRecommendation: knowledgeDraft.saveRecommendation
  };
}

function bindDoubaoVisibleReplyToMetadata(
  normalized: ReturnType<typeof normalizeGptOutput>,
  replyMarkdown: string
) {
  return {
    ...normalized,
    knowledgeDraft: {
      ...normalized.knowledgeDraft,
      standardAnswer: replyMarkdown,
      standardAnswers: [replyMarkdown]
    },
    structured: {
      ...normalized.structured,
      answer: replyMarkdown
    }
  };
}

async function runDoubaoVisiblePhase(input: {
  config: ReturnType<typeof resolveDoubaoConfig>;
  ingestInput: DoubaoAdminIngestInput;
  gptOS: GptOSRouteResult;
  signal: AbortSignal;
}) {
  const systemPrompt = buildDoubaoVisibleSystemPrompt();
  const userPrompt = buildDoubaoVisibleUserPrompt(input.ingestInput, input.gptOS);
  const responses = [];
  let replyMarkdown = "";
  let response = await callDoubaoChatCompletions({
    chatCompletionsUrl: input.config.chatCompletionsUrl,
    apiKey: input.config.apiKey,
    model: input.config.model,
    systemPrompt,
    userPrompt,
    signal: input.signal,
    phase: "visible",
    onProgressEvent: input.ingestInput.onProgressEvent,
    maxTokens: 6000
  });
  responses.push(response);
  replyMarkdown += response.text;

  for (let continuation = 0; response.finishReason === "length" && continuation < 2; continuation += 1) {
    if (!replyMarkdown.trim()) {
      break;
    }

    const nextResponse = await callDoubaoChatCompletions({
      chatCompletionsUrl: input.config.chatCompletionsUrl,
      apiKey: input.config.apiKey,
      model: input.config.model,
      systemPrompt,
      userPrompt,
      assistantPrefix: replyMarkdown.length > 12_000
        ? replyMarkdown.slice(-MAX_CONTINUATION_PREFIX_CHARS)
        : replyMarkdown,
      continuationInstruction: replyMarkdown.length > 12_000
        ? "你收到的是已生成正文的最后一段衔接内容。上一段 Markdown 因输出长度结束，请从最后一个字符之后继续，只输出缺失的正文；不要重复、不要总结、不要输出 JSON 或后台字段。"
        : "上一段 Markdown 因输出长度结束。请从最后一个字符之后继续，只输出缺失的正文；不要重复、不要总结、不要输出 JSON 或后台字段。",
      signal: input.signal,
      phase: "continuation",
      onProgressEvent: input.ingestInput.onProgressEvent,
      maxTokens: 4000
    });

    if (nextResponse.model !== response.model) {
      throw new DoubaoIngestError(
        "DOUBAO_RESPONSE_PARSE_FAILED",
        "豆包续写返回的模型标识不一致。",
        {
          receivedContent: true,
          parseStage: "model_identity",
          receivedChars: replyMarkdown.length
        }
      );
    }

    replyMarkdown += nextResponse.text;
    response = nextResponse;
    responses.push(nextResponse);
  }

  if (!replyMarkdown.trim() || response.finishReason === "length") {
    throw new DoubaoIngestError(
      "DOUBAO_RESPONSE_PARSE_FAILED",
      response.finishReason === "length"
        ? "豆包正文达到长度上限，已使用同模型续写但仍未完整结束。"
        : "豆包未返回可见正文。",
      {
        receivedContent: Boolean(replyMarkdown),
        parseStage: response.finishReason === "length" ? "finish_reason" : "reply_json",
        finishReason: response.finishReason,
        receivedChars: replyMarkdown.length
      }
    );
  }

  return {
    primary: responses[0],
    final: response,
    replyMarkdown,
    continuationCount: responses.length - 1,
    usage: mergeDoubaoUsage(...responses.map((item) => item.usage)),
    responseLatency: responses.reduce((total, item) => total + item.responseLatency, 0),
    retryCount: responses.reduce((total, item) => total + item.retryCount, 0)
  };
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
    const visiblePhase = await runDoubaoVisiblePhase({
      config: resolved,
      ingestInput: input,
      gptOS,
      signal: controller.signal
    });
    const response = visiblePhase.primary;
    const replyMarkdown = visiblePhase.replyMarkdown;
    let metadataCompleted = false;
    let metadataFailureCode = "";
    let metadataResponse: Awaited<ReturnType<typeof callDoubaoChatCompletions>> | null = null;
    let normalized = normalizeGptOutput({
      rawText: JSON.stringify({ replyMarkdown }),
      originalInput: input.input,
      fallbackCategory: input.category ?? "",
      strictReply: true
    });

    input.onProgressEvent?.({
      type: "visible_reply",
      replyMarkdown,
      model: response.model,
      responseId: response.responseId,
      metadataPending: true
    });
    input.onProgressEvent?.({
      type: "metadata_status",
      state: "pending"
    });

    try {
      metadataResponse = await callDoubaoChatCompletions({
        chatCompletionsUrl: resolved.chatCompletionsUrl,
        apiKey: resolved.apiKey,
        model: resolved.model,
        systemPrompt: buildDoubaoMetadataSystemPrompt(),
        userPrompt: buildDoubaoMetadataUserPrompt(input, replyMarkdown),
        signal: controller.signal,
        phase: "metadata",
        onProgressEvent: input.onProgressEvent,
        retryRateLimited: false,
        temperature: 0.2,
        maxTokens: 1500
      });
      if (metadataResponse.model !== response.model) {
        throw new DoubaoIngestError(
          "DOUBAO_RESPONSE_PARSE_FAILED",
          "豆包后台元数据返回的模型标识不一致。",
          { receivedContent: true, parseStage: "model_identity", receivedChars: metadataResponse.text.length }
        );
      }
      const metadataPayload = extractJsonObject(metadataResponse.text);
      if (
        !metadataPayload
        || !hasValidDoubaoMetadataPayload(metadataPayload)
        || metadataResponse.finishReason === "length"
      ) {
        throw new DoubaoIngestError(
          "DOUBAO_RESPONSE_PARSE_FAILED",
          metadataResponse.finishReason === "length"
            ? "豆包后台元数据达到长度上限，未完整返回。"
            : "豆包后台元数据缺少有效 knowledgeDraft 核心字段。",
          {
            receivedContent: Boolean(metadataResponse.text),
            parseStage: metadataResponse.finishReason === "length" ? "finish_reason" : "reply_json",
            finishReason: metadataResponse.finishReason,
            receivedChars: metadataResponse.text.length
          }
        );
      }
      normalized = normalizeGptOutput({
        rawText: JSON.stringify({
          ...metadataPayload,
          replyMarkdown
        }),
        originalInput: input.input,
        fallbackCategory: input.category ?? "",
        strictReply: true
      });
      normalized = bindDoubaoVisibleReplyToMetadata(normalized, replyMarkdown);
      metadataCompleted = true;
      input.onProgressEvent?.({
        type: "metadata_status",
        state: "completed"
      });
    } catch (error) {
      if (
        error
        && typeof error === "object"
        && (error as { name?: string }).name === "AbortError"
      ) {
        throw error;
      }

      metadataFailureCode = error instanceof DoubaoIngestError ? error.code : "DOUBAO_METADATA_FAILED";
      normalized = withDoubaoMetadataFallback(normalized, replyMarkdown);
      input.onProgressEvent?.({
        type: "metadata_status",
        state: "deferred",
        failureCode: metadataFailureCode
      });
      logger.warn("enterprise_admin_ingest.doubao_metadata_failed", {
        requestId: input.requestId,
        model: response.model,
        errorCode: metadataFailureCode,
        visibleReplyPreserved: true
      });
    }

    const knowledgeDraft = normalized.knowledgeDraft;
    const structured = normalized.structured;
    const quality = assessGptProResponseQuality(replyMarkdown, {
      userInput: input.input
    });
    const qualitySoftAccepted = Boolean(replyMarkdown.trim());
    const combinedUsage = mergeDoubaoUsage(
      visiblePhase.usage,
      ...(metadataResponse ? [metadataResponse.usage] : [])
    );
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
      usage: combinedUsage
    };

    logger.info("enterprise_admin_ingest.doubao_success", {
      requestId: input.requestId,
      model: response.model,
      requestedModel: resolved.model,
      responseId: response.responseId,
      durationMs: Date.now() - startedAt,
      outputTokens: combinedUsage.outputTokens,
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
      usage: combinedUsage,
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
        `apiResilience:retryCount:${visiblePhase.retryCount + (metadataResponse?.retryCount ?? 0)}`,
        "apiResilience:fallbackUsed:false",
        `apiResilience:responseLatency:${visiblePhase.responseLatency + (metadataResponse?.responseLatency ?? 0)}`,
        `apiResilience:circuitBreaker:${response.circuitBreaker}`,
        "doubao:replyMarkdownPassthrough:true",
        "doubao:twoPhaseOutput:true",
        `doubao:visibleContinuationCount:${visiblePhase.continuationCount}`,
        `doubao:metadataCompleted:${metadataCompleted ? "true" : "false"}`,
        `doubao:metadataFailureCode:${metadataFailureCode || "none"}`,
        `doubao:saveRequiresReview:${metadataCompleted ? "false" : "true"}`,
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
