import "server-only";

import { ProxyAgent } from "undici";
import { logger } from "@/lib/logger";
import {
  extractResponsesText,
  normalizeGptOutput,
  type GptStructuredKnowledge
} from "@/lib/enterprise/gpt-output-normalizer";
import type { AdminIngestPlatform } from "@/lib/enterprise/admin-ingest-app-config";
import { OPENAI_PLACEHOLDER_API_KEY } from "@/lib/server-config-core";
import {
  buildGptIngestBrainSystemPrompt,
  buildGptIngestBrainUserPrompt
} from "@/lib/enterprise/gpt-ingest-brain-prompt";
import type {
  GptIngestMemoryMessage,
  GptIngestMemoryRecord
} from "@/lib/enterprise/gpt-ingest-memory";
import type {
  GptKnowledgeDraft,
  GptSaveRecommendation
} from "@/lib/enterprise/gpt-knowledge-draft";
import type { GptUserClientCallPlan } from "@/lib/enterprise/gpt-user-client-call-plan";
import { assessGptProResponseQuality } from "@/lib/enterprise/gpt-pro-response-quality";
import { buildGptProRetryDeepenPrompt } from "@/lib/enterprise/gpt-pro-retry-deepen";
import type { GptCallProof, OpenAIGptUsage } from "@/lib/enterprise/gpt-call-proof";
import type { GptOutputIntent } from "@/lib/enterprise/gpt-output-intent-classifier";
import type { GptOSWorkflowExecution } from "@/lib/enterprise/gpt-os-workflow-engine";
import { isGptOSRetryableError } from "@/lib/enterprise/gpt-os-error-handler";

export interface OpenAIAdminIngestAttachment {
  fileName: string;
  fileType?: string;
  mimeType?: string;
  fileSize?: number;
  sizeBytes?: number;
  status?: string;
  parseStatus?: string;
  extractedText?: string;
  text?: string;
  content?: string;
  visibleText?: string;
  summary?: string;
  pageSummaries?: string[];
  slideTexts?: Array<{ slideIndex?: number; text?: string } | string>;
  limitationNote?: string;
}

export interface OpenAIAdminIngestInput {
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
  gptTier?: string | null;
  gptTierLabel?: string | null;
  gptVersion?: string | null;
  selectedModelLabel?: string | null;
  modelDisplayName?: string | null;
  agentDescription?: string | null;
  targetUser?: string | null;
  recentMessages?: GptIngestMemoryMessage[];
  previousKnowledgeDrafts?: Array<Partial<GptKnowledgeDraft>>;
  recentTrainingRecords?: GptIngestMemoryRecord[];
  gptOS?: GptOSWorkflowExecution | null;
  requestId?: string;
}

export interface OpenAIAdminIngestResult {
  provider: "openai";
  model: string;
  requestedModel: string;
  actualModel: string;
  responseId: string;
  createdAt: string;
  usage: OpenAIGptUsage;
  gptProof: GptCallProof;
  intent: GptOutputIntent;
  fixedTemplateRisk: boolean;
  modelDisplayName: string;
  modelMode: "highest" | "fixed";
  fallback: false;
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
  structured: GptStructuredKnowledge;
  structuredResult: GptStructuredKnowledge;
  gptOS?: GptOSWorkflowExecution | null;
  sync: {
    platform: AdminIngestPlatform;
    syncTarget: Array<"web" | "exe" | "apk">;
  };
  sourceType: "admin_ingest";
  fallbackUsed: false;
}

const REQUEST_TIMEOUT_MS = 420_000;
const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-5.5";
const DEFAULT_MODEL_LABEL = "GPT-5.5 超高";
const WINDOWS_LOCAL_PROXY_URL = "http://127.0.0.1:7897";
const OPENAI_RETRY_COUNT = 2;
const OPENAI_RETRY_DELAY_MS = 500;

type OpenAIResponsesErrorCode =
  | "OPENAI_API_KEY_MISSING"
  | "OPENAI_BASE_URL_INVALID"
  | "OPENAI_RESPONSES_REQUEST_FAILED"
  | "OPENAI_RESPONSES_PARSE_FAILED"
  | "OPENAI_TIMEOUT"
  | "OPENAI_PRO_QUALITY_FAILED";

class OpenAIResponsesError extends Error {
  constructor(
    public readonly code: OpenAIResponsesErrorCode,
    message: string
  ) {
    super(message);
    this.name = "OpenAIResponsesError";
  }
}

type OpenAIResponseShape = "responses" | "chat" | "string" | "unknown";

interface NormalizedOpenAIResponseText {
  text: string;
  rawResponseType: OpenAIResponseShape;
  normalized: true;
  parserUsed: "responses-api-normalizer";
}

function readEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function normalizeBaseUrl(value: string) {
  return (value || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function buildResponsesUrl(baseUrl: string) {
  try {
    return new URL(`${baseUrl.replace(/\/+$/, "")}/responses`).toString();
  } catch {
    throw new OpenAIResponsesError("OPENAI_BASE_URL_INVALID", "OPENAI_BASE_URL 无效。");
  }
}

function unique(values: string[]) {
  const seen = new Set<string>();

  return values.filter((value) => {
    const normalized = value.trim();

    if (!normalized || seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeCreatedAt(value: unknown) {
  const numeric = readNumber(value);

  if (numeric) {
    return new Date(numeric * 1000).toISOString();
  }

  return new Date().toISOString();
}

function normalizeUsage(value: unknown): OpenAIGptUsage {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const outputDetails = record.output_tokens_details && typeof record.output_tokens_details === "object"
    ? record.output_tokens_details as Record<string, unknown>
    : {};

  return {
    inputTokens: readNumber(record.input_tokens),
    outputTokens: readNumber(record.output_tokens),
    totalTokens: readNumber(record.total_tokens),
    reasoningTokens: readNumber(outputDetails.reasoning_tokens)
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readNestedText(value: unknown, depth = 0): string[] {
  if (depth > 5) {
    return [];
  }

  if (typeof value === "string") {
    return value.trim() ? [value.trim()] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => readNestedText(item, depth + 1));
  }

  if (!isRecord(value)) {
    return [];
  }

  const preferred = [
    value.text,
    value.output_text,
    value.content,
    value.value
  ];

  return preferred.flatMap((item) => readNestedText(item, depth + 1));
}

function readChatCompletionText(record: Record<string, unknown>) {
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const parts: string[] = [];

  for (const choice of choices) {
    if (!isRecord(choice)) {
      continue;
    }

    if (isRecord(choice.message)) {
      parts.push(...readNestedText(choice.message.content));
    }

    if (isRecord(choice.delta)) {
      parts.push(...readNestedText(choice.delta.content));
    }
  }

  return parts.join("\n").trim();
}

function normalizeOpenAIResponseWithMetadata(response: unknown): NormalizedOpenAIResponseText {
  if (typeof response === "string") {
    return {
      text: response.trim(),
      rawResponseType: "string",
      normalized: true,
      parserUsed: "responses-api-normalizer"
    };
  }

  if (!isRecord(response)) {
    throw new OpenAIResponsesError("OPENAI_RESPONSES_PARSE_FAILED", "Unsupported OpenAI response format");
  }

  const responsesText = extractResponsesText(response);

  if (responsesText) {
    return {
      text: responsesText,
      rawResponseType: "responses",
      normalized: true,
      parserUsed: "responses-api-normalizer"
    };
  }

  const chatText = readChatCompletionText(response);

  if (chatText) {
    return {
      text: chatText,
      rawResponseType: "chat",
      normalized: true,
      parserUsed: "responses-api-normalizer"
    };
  }

  throw new OpenAIResponsesError("OPENAI_RESPONSES_PARSE_FAILED", "Unsupported OpenAI response format");
}

export function normalizeOpenAIResponse(response: unknown) {
  return normalizeOpenAIResponseWithMetadata(response).text;
}

function readProxyUrls() {
  return unique([
    readEnv("OPENAI_PROXY_URL"),
    readEnv("HTTPS_PROXY"),
    readEnv("HTTP_PROXY"),
    process.platform === "win32" ? WINDOWS_LOCAL_PROXY_URL : ""
  ]);
}

function isNetworkFetchError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as { name?: unknown; message?: unknown; cause?: { code?: unknown; message?: unknown } };
  const message = `${typeof record.message === "string" ? record.message : ""} ${typeof record.cause?.message === "string" ? record.cause.message : ""}`.toLowerCase();
  const code = typeof record.cause?.code === "string" ? record.cause.code : "";

  return record.name === "TypeError" || code.startsWith("UND_ERR_") || message.includes("fetch failed") || message.includes("connect timeout");
}

async function fetchOpenAIResponses(url: string, init: RequestInit) {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (!isNetworkFetchError(error)) {
      throw error;
    }

    let lastError = error;

    for (const proxyUrl of readProxyUrls()) {
      try {
        return await fetch(url, {
          ...init,
          dispatcher: new ProxyAgent(proxyUrl)
        } as RequestInit & { dispatcher: ProxyAgent });
      } catch (proxyError) {
        lastError = proxyError;
      }
    }

    throw lastError;
  }
}

function waitForRetry(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callWithRetry<T>(fn: () => Promise<T>, retries = OPENAI_RETRY_COUNT): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries > 0 && isGptOSRetryableError(error)) {
      logger.warn("enterprise_admin_ingest.openai_retry", {
        retriesLeft: retries - 1,
        errorName: error && typeof error === "object" ? (error as { name?: unknown }).name : undefined,
        errorCode: error && typeof error === "object" ? (error as { code?: unknown }).code : undefined,
        message: error instanceof Error ? error.message : String(error)
      });
      await waitForRetry(OPENAI_RETRY_DELAY_MS);
      return callWithRetry(fn, retries - 1);
    }

    throw error;
  }
}

function readOpenAIKey() {
  const apiKey = readEnv("OPENAI_API_KEY");

  if (!apiKey || apiKey.includes(OPENAI_PLACEHOLDER_API_KEY)) {
    throw new OpenAIResponsesError("OPENAI_API_KEY_MISSING", "缺少 OPENAI_API_KEY。");
  }

  return apiKey;
}

function resolveResponsesConfig(input: OpenAIAdminIngestInput) {
  const configuredModel = readEnv("OPENAI_MODEL");
  const fixedModel = configuredModel && configuredModel.toLowerCase() !== "auto" ? configuredModel : "";
  const model = input.preferredModel || fixedModel || readEnv("OPENAI_PREFERRED_MODEL") || DEFAULT_MODEL;
  const modelMode = fixedModel && !input.preferredModel ? "fixed" as const : "highest" as const;
  const selectedModelLabel = input.selectedModelLabel || input.modelDisplayName || DEFAULT_MODEL_LABEL;
  const baseUrl = normalizeBaseUrl(readEnv("OPENAI_BASE_URL"));

  return {
    apiKey: readOpenAIKey(),
    baseUrl,
    responsesUrl: buildResponsesUrl(baseUrl),
    model,
    modelMode,
    selectedModelLabel
  };
}

function buildUserPrompt(input: OpenAIAdminIngestInput) {
  return buildGptIngestBrainUserPrompt({
    currentInput: input.input,
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
      uploadedAttachments: input.attachments,
      previousKnowledgeDrafts: input.previousKnowledgeDrafts,
      recentTrainingRecords: input.recentTrainingRecords,
      selectedModelLabel: input.selectedModelLabel || input.modelDisplayName || input.preferredModel,
      platform: input.platform,
      syncTarget: input.syncTarget
    },
    // GPT OS 只作为提示词上下文注入，模型请求参数和 Responses API 调用保持不变。
    gptOS: input.gptOS
  });
}

function normalizeOpenAIResponseError(status: number, bodyText: string) {
  const lower = bodyText.toLowerCase();
  let providerMessage = "";

  try {
    const payload = JSON.parse(bodyText) as { error?: { message?: unknown } };
    providerMessage = typeof payload.error?.message === "string" ? payload.error.message.trim() : "";
  } catch {
    providerMessage = bodyText.trim().slice(0, 260);
  }

  const suffix = providerMessage ? `（HTTP ${status}：${providerMessage.slice(0, 260)}）` : `（HTTP ${status}）`;

  if (status === 401 || status === 403) {
    return new OpenAIResponsesError("OPENAI_API_KEY_MISSING", `OpenAI API Key 未配置或无权访问当前模型。${suffix}`);
  }

  if (status === 408 || lower.includes("timeout")) {
    return new OpenAIResponsesError("OPENAI_TIMEOUT", `GPT 请求超时，请稍后重试。${suffix}`);
  }

  if (status === 404 || lower.includes("model")) {
    return new OpenAIResponsesError("OPENAI_RESPONSES_REQUEST_FAILED", `当前 GPT 模型不可用，请检查 OPENAI_MODEL 或模型权限。${suffix}`);
  }

  return new OpenAIResponsesError("OPENAI_RESPONSES_REQUEST_FAILED", `OpenAI Responses API 请求失败。${suffix}`);
}

function isHighDepthParameterRejected(status: number, bodyText: string) {
  if (status < 400 || status >= 500) {
    return false;
  }

  const lower = bodyText.toLowerCase();

  return [
    "reasoning",
    "verbosity",
    "unsupported",
    "unknown parameter",
    "unrecognized",
    "invalid parameter",
    "text.verbosity"
  ].some((signal) => lower.includes(signal));
}

function buildResponsesBody(input: {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  highDepth: boolean;
}) {
  return {
    model: input.model,
    input: `${input.systemPrompt}\n\n${input.userPrompt}`,
    ...(input.highDepth
      ? {
        reasoning: {
          effort: "high"
        },
        text: {
          verbosity: "high"
        }
      }
      : {}),
    max_output_tokens: 10000,
    stream: true
  };
}

function buildMissingReplyQuality(rawText: string, userInput: string) {
  const quality = assessGptProResponseQuality(rawText, {
    userInput
  });

  return {
    ...quality,
    ok: false,
    failedReasons: [
      "OpenAI Responses API 返回了内容，但没有提供 replyMarkdown 主回复字段",
      ...quality.failedReasons
    ]
  };
}

async function fetchResponsesWithBody(input: {
  responsesUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  signal: AbortSignal;
  highDepth: boolean;
}) {
  return await fetchOpenAIResponses(input.responsesUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(buildResponsesBody({
      model: input.model,
      systemPrompt: input.systemPrompt,
      userPrompt: input.userPrompt,
      highDepth: input.highDepth
    })),
    signal: input.signal,
    cache: "no-store"
  });
}

async function callResponsesApi(input: {
  responsesUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  signal: AbortSignal;
}) {
  return callWithRetry(async () => {
    let response = await fetchResponsesWithBody({
      ...input,
      highDepth: true
    });
    let bodyText = "";

    if (!response.ok) {
      bodyText = await response.text();
    }

    if (!response.ok && isHighDepthParameterRejected(response.status, bodyText)) {
      logger.warn("enterprise_admin_ingest.openai_high_depth_param_retry", {
        status: response.status,
        bodySnippet: bodyText.slice(0, 360)
      });
      response = await fetchResponsesWithBody({
        ...input,
        highDepth: false
      });
      bodyText = response.ok ? "" : await response.text();
    }

    if (!response.ok) {
      logger.warn("enterprise_admin_ingest.openai_request_failed", {
        status: response.status,
        bodySnippet: bodyText.slice(0, 480)
      });
      throw normalizeOpenAIResponseError(response.status, bodyText);
    }

    if (response.body) {
      return await readResponsesStream(response, input.model);
    }

    bodyText = await response.text();

    return parseResponsesPayload(bodyText, input.model);
  });
}

async function readResponsesStream(response: Response, fallbackModel: string) {
  const reader = response.body?.getReader();

  if (!reader) {
    throw new OpenAIResponsesError("OPENAI_RESPONSES_PARSE_FAILED", "OpenAI Responses API 未返回可读取的流。");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let model = "";
  let responseId = "";
  let createdAt = "";
  let usage: OpenAIGptUsage = {};
  let completedPayload: Record<string, unknown> | null = null;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split(/\n\n/);

    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const dataLines = chunk.split(/\n/g)
        .map((line) => line.trim())
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .filter(Boolean);

      for (const dataLine of dataLines) {
        if (dataLine === "[DONE]") {
          continue;
        }

        let payload: Record<string, unknown> | null = null;

        try {
          payload = JSON.parse(dataLine) as Record<string, unknown>;
        } catch {
          continue;
        }

        const delta = typeof payload.delta === "string" ? payload.delta : "";

        if (delta) {
          text += delta;
        }

        const responsePayload = payload.response && typeof payload.response === "object"
          ? payload.response as Record<string, unknown>
          : null;

        if (typeof responsePayload?.model === "string") {
          model = responsePayload.model;
        }

        if (typeof responsePayload?.id === "string") {
          responseId = responsePayload.id;
        }

        if (responsePayload && "created_at" in responsePayload) {
          createdAt = normalizeCreatedAt(responsePayload.created_at);
        }

        if (responsePayload?.usage) {
          usage = normalizeUsage(responsePayload.usage);
        }

        if (payload.type === "response.completed" && responsePayload) {
          completedPayload = responsePayload;
        }
      }
    }
  }

  let completedNormalized: NormalizedOpenAIResponseText | null = null;

  if (completedPayload) {
    try {
      completedNormalized = normalizeOpenAIResponseWithMetadata(completedPayload);
    } catch {
      completedNormalized = null;
    }
  }
  const completedText = completedNormalized?.text ?? "";
  const finalText = text.trim() || completedText;
  const rawModel = typeof completedPayload?.model === "string" ? completedPayload.model : model;
  const rawResponseId = typeof completedPayload?.id === "string" ? completedPayload.id : responseId;
  const finalCreatedAt = completedPayload && "created_at" in completedPayload ? normalizeCreatedAt(completedPayload.created_at) : createdAt || new Date().toISOString();
  const finalUsage = completedPayload?.usage ? normalizeUsage(completedPayload.usage) : usage;

  if (!finalText) {
    throw new OpenAIResponsesError("OPENAI_RESPONSES_PARSE_FAILED", "OpenAI Responses API 未返回可解析文本。");
  }

  if (!rawResponseId) {
    throw new OpenAIResponsesError("OPENAI_RESPONSES_PARSE_FAILED", "OpenAI Responses API 未返回 responseId，不能证明 GPT-5.5 调用。");
  }

  if (!rawModel) {
    throw new OpenAIResponsesError("OPENAI_RESPONSES_PARSE_FAILED", "OpenAI Responses API 未返回 actualModel，不能证明 GPT-5.5 调用。");
  }

  return {
    text: finalText,
    model: rawModel || fallbackModel,
    responseId: rawResponseId,
    createdAt: finalCreatedAt,
    usage: finalUsage,
    rawResponseType: completedNormalized?.rawResponseType ?? "responses",
    normalized: true,
    parserUsed: "responses-api-normalizer" as const
  };
}

function parseResponsesPayload(bodyText: string, fallbackModel: string) {
  let payload: unknown = null;

  try {
    payload = bodyText ? JSON.parse(bodyText) as unknown : null;
  } catch {
    throw new OpenAIResponsesError("OPENAI_RESPONSES_PARSE_FAILED", "OpenAI Responses API 返回解析失败。");
  }

  const normalizedResponse = normalizeOpenAIResponseWithMetadata(payload);
  const text = normalizedResponse.text;
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const model = typeof record.model === "string" ? record.model : "";
  const responseId = typeof record.id === "string" ? record.id : "";

  if (!text) {
    throw new OpenAIResponsesError("OPENAI_RESPONSES_PARSE_FAILED", "OpenAI Responses API 未返回可解析文本。");
  }

  if (!responseId) {
    throw new OpenAIResponsesError("OPENAI_RESPONSES_PARSE_FAILED", "OpenAI Responses API 未返回 responseId，不能证明 GPT-5.5 调用。");
  }

  if (!model) {
    throw new OpenAIResponsesError("OPENAI_RESPONSES_PARSE_FAILED", "OpenAI Responses API 未返回 actualModel，不能证明 GPT-5.5 调用。");
  }

  return {
    text,
    model: model || fallbackModel,
    responseId,
    createdAt: normalizeCreatedAt(record.created_at),
    usage: normalizeUsage(record.usage),
    rawResponseType: normalizedResponse.rawResponseType,
    normalized: normalizedResponse.normalized,
    parserUsed: normalizedResponse.parserUsed
  };
}

export async function runOpenAIAdminIngest(input: OpenAIAdminIngestInput): Promise<OpenAIAdminIngestResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const resolved = resolveResponsesConfig(input);
    const systemPrompt = buildGptIngestBrainSystemPrompt({ gptOS: input.gptOS });
    const userPrompt = buildUserPrompt(input);

    let response = await callResponsesApi({
      responsesUrl: resolved.responsesUrl,
      apiKey: resolved.apiKey,
      model: resolved.model,
      systemPrompt,
      userPrompt,
      signal: controller.signal
    });
    let normalized: ReturnType<typeof normalizeGptOutput> | null = null;
    let quality = buildMissingReplyQuality(response.text, input.input);
    let deepenAttempts = 0;

    try {
      normalized = normalizeGptOutput({
        rawText: response.text,
        originalInput: input.input,
        fallbackCategory: input.category ?? "",
        strictReply: true
      });
      quality = assessGptProResponseQuality(normalized.replyMarkdown, {
        userInput: input.input
      });
    } catch (error) {
      logger.warn("enterprise_admin_ingest.openai_missing_reply_quality_check", {
        requestId: input.requestId,
        model: response.model,
        responseId: response.responseId,
        message: error instanceof Error ? error.message : String(error),
        chineseCharCount: quality.chineseCharCount,
        missingSignals: quality.missingSignals,
        intent: quality.intent,
        fixedTemplateRisk: quality.fixedTemplateRisk
      });
    }

    while ((!normalized || !quality.ok) && deepenAttempts < 2) {
      deepenAttempts += 1;
      logger.warn("enterprise_admin_ingest.openai_pro_quality_deepen", {
        requestId: input.requestId,
        attempt: deepenAttempts,
        model: response.model,
        responseId: response.responseId,
        chineseCharCount: quality.chineseCharCount,
        customerQuestionCount: quality.customerQuestionCount,
        missingSignals: quality.missingSignals,
        forbiddenPhrases: quality.forbiddenPhrases,
        intent: quality.intent,
        fixedTemplateRisk: quality.fixedTemplateRisk,
        sectionTitles: quality.sectionTitles,
        failedReasons: quality.failedReasons
      });
      response = await callResponsesApi({
        responsesUrl: resolved.responsesUrl,
        apiKey: resolved.apiKey,
        model: resolved.model,
        systemPrompt,
        userPrompt: buildGptProRetryDeepenPrompt({
          originalUserPrompt: userPrompt,
          firstReplyMarkdown: normalized?.replyMarkdown ?? response.text,
          quality
        }),
        signal: controller.signal
      });

      try {
        normalized = normalizeGptOutput({
          rawText: response.text,
          originalInput: input.input,
          fallbackCategory: input.category ?? "",
          strictReply: true
        });
        quality = assessGptProResponseQuality(normalized.replyMarkdown, {
          userInput: input.input
        });
      } catch (error) {
        normalized = null;
        quality = buildMissingReplyQuality(response.text, input.input);
        logger.warn("enterprise_admin_ingest.openai_deepen_missing_reply", {
          requestId: input.requestId,
          attempt: deepenAttempts,
          model: response.model,
          responseId: response.responseId,
          intent: quality.intent,
          fixedTemplateRisk: quality.fixedTemplateRisk,
          message: error instanceof Error ? error.message : String(error),
          failedReasons: quality.failedReasons
        });
      }
    }

    if (!quality.ok) {
      throw new OpenAIResponsesError(
        "OPENAI_PRO_QUALITY_FAILED",
        `GPT-5.5 已返回，但回复未达到 ChatGPT Pro 投喂深度：${quality.failedReasons.join("；")}`
      );
    }

    if (!normalized) {
      throw new OpenAIResponsesError("OPENAI_RESPONSES_PARSE_FAILED", "GPT-5.5 未返回可保存的 replyMarkdown。");
    }

    if (!response.responseId) {
      throw new OpenAIResponsesError("OPENAI_RESPONSES_PARSE_FAILED", "OpenAI Responses API 未返回 responseId，不能证明 GPT-5.5 调用。");
    }

    if (!response.model.toLowerCase().includes("gpt-5.5")) {
      throw new OpenAIResponsesError("OPENAI_RESPONSES_REQUEST_FAILED", `实际返回模型不是 GPT-5.5：${response.model}`);
    }

    const gptProof: GptCallProof = {
      provider: "openai",
      endpoint: "/responses",
      requestedModel: resolved.model,
      actualModel: response.model,
      responseId: response.responseId,
      fallback: false,
      requestTested: true,
      qualityPassed: true,
      deepenAttempts,
      createdAt: response.createdAt,
      usage: response.usage
    };

    logger.info("enterprise_admin_ingest.openai_success", {
      requestId: input.requestId,
      model: response.model,
      requestedModel: resolved.model,
      responseId: response.responseId,
      modelMode: resolved.modelMode,
      durationMs: Date.now() - startedAt,
      responsesApi: true,
      proQualityChineseChars: quality.chineseCharCount,
      proQualityQuestions: quality.customerQuestionCount,
      intent: quality.intent,
      fixedTemplateRisk: quality.fixedTemplateRisk,
      outputTokens: response.usage.outputTokens,
      reasoningTokens: response.usage.reasoningTokens,
      deepenAttempts,
      rawResponseType: response.rawResponseType,
      normalized: response.normalized,
      parserUsed: response.parserUsed
    });

    return {
      provider: "openai",
      model: response.model,
      requestedModel: resolved.model,
      actualModel: response.model,
      responseId: response.responseId,
      createdAt: response.createdAt,
      usage: response.usage,
      gptProof,
      intent: quality.intent,
      fixedTemplateRisk: quality.fixedTemplateRisk,
      modelDisplayName: resolved.selectedModelLabel,
      modelMode: resolved.modelMode,
      fallback: false,
      selectedModelLabel: resolved.selectedModelLabel,
      replyMarkdown: normalized.replyMarkdown,
      knowledgeDraft: normalized.knowledgeDraft,
      userClientCallPlan: normalized.userClientCallPlan,
      suggestedQuestions: normalized.suggestedQuestions,
      sourceFiles: (input.attachments ?? []).map((attachment) => ({
        fileName: attachment.fileName,
        mimeType: attachment.mimeType ?? attachment.fileType,
        parseStatus: attachment.parseStatus,
        limitationNote: attachment.limitationNote
      })),
      saveRecommendation: normalized.saveRecommendation,
      diagnostics: [
        ...(input.gptOS ? input.gptOS.diagnostics.map((item) => `gptOS:${item}`) : []),
        `intent:${quality.intent}`,
        `fixedTemplateRisk:${quality.fixedTemplateRisk ? "true" : "false"}`,
        `rawResponseType:${response.rawResponseType}`,
        `normalized:${response.normalized ? "true" : "false"}`,
        `parserUsed:${response.parserUsed}`,
        ...normalized.diagnostics
      ],
      structured: normalized.structured,
      structuredResult: normalized.structured,
      gptOS: input.gptOS ?? null,
      sync: {
        platform: input.platform,
        syncTarget: input.syncTarget
      },
      sourceType: "admin_ingest",
      fallbackUsed: false
    };
  } catch (error) {
    if (error && typeof error === "object" && (error as { name?: string }).name === "AbortError") {
      throw new OpenAIResponsesError("OPENAI_TIMEOUT", "GPT 请求超时，请稍后重试。");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
