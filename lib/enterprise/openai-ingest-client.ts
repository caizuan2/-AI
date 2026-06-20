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
  requestId?: string;
}

export interface OpenAIAdminIngestResult {
  provider: "openai";
  model: string;
  modelDisplayName: string;
  modelMode: "highest" | "fixed";
  fallback: false;
  selectedModelLabel: string;
  replyMarkdown: string;
  knowledgeDraft: GptKnowledgeDraft;
  suggestedQuestions: string[];
  saveRecommendation: GptSaveRecommendation;
  diagnostics: string[];
  structured: GptStructuredKnowledge;
  structuredResult: GptStructuredKnowledge;
  sync: {
    platform: AdminIngestPlatform;
    syncTarget: Array<"web" | "exe" | "apk">;
  };
  sourceType: "admin_ingest";
  fallbackUsed: false;
}

const REQUEST_TIMEOUT_MS = 90_000;
const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-5.5";
const DEFAULT_MODEL_LABEL = "GPT-5.5 超高";
const WINDOWS_LOCAL_PROXY_URL = "http://127.0.0.1:7897";

type OpenAIResponsesErrorCode =
  | "OPENAI_API_KEY_MISSING"
  | "OPENAI_BASE_URL_INVALID"
  | "OPENAI_RESPONSES_REQUEST_FAILED"
  | "OPENAI_RESPONSES_PARSE_FAILED"
  | "OPENAI_TIMEOUT";

class OpenAIResponsesError extends Error {
  constructor(
    public readonly code: OpenAIResponsesErrorCode,
    message: string
  ) {
    super(message);
    this.name = "OpenAIResponsesError";
  }
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
    }
  });
}

function normalizeOpenAIResponseError(status: number, bodyText: string) {
  const lower = bodyText.toLowerCase();

  if (status === 401 || status === 403) {
    return new OpenAIResponsesError("OPENAI_API_KEY_MISSING", "OpenAI API Key 未配置或无权访问当前模型。");
  }

  if (status === 408 || lower.includes("timeout")) {
    return new OpenAIResponsesError("OPENAI_TIMEOUT", "GPT 请求超时，请稍后重试。");
  }

  if (status === 404 || lower.includes("model")) {
    return new OpenAIResponsesError("OPENAI_RESPONSES_REQUEST_FAILED", "当前 GPT 模型不可用，请检查 OPENAI_MODEL 或模型权限。");
  }

  return new OpenAIResponsesError("OPENAI_RESPONSES_REQUEST_FAILED", "OpenAI Responses API 请求失败。");
}

async function callResponsesApi(input: {
  responsesUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  signal: AbortSignal;
}) {
  const response = await fetchOpenAIResponses(input.responsesUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: input.model,
      input: `${input.systemPrompt}\n\n${input.userPrompt}`,
      max_output_tokens: 3600
    }),
    signal: input.signal,
    cache: "no-store"
  });
  const bodyText = await response.text();

  if (!response.ok) {
    throw normalizeOpenAIResponseError(response.status, bodyText);
  }

  let payload: unknown = null;

  try {
    payload = bodyText ? JSON.parse(bodyText) as unknown : null;
  } catch {
    throw new OpenAIResponsesError("OPENAI_RESPONSES_PARSE_FAILED", "OpenAI Responses API 返回解析失败。");
  }

  const text = extractResponsesText(payload);

  if (!text) {
    throw new OpenAIResponsesError("OPENAI_RESPONSES_PARSE_FAILED", "OpenAI Responses API 未返回可解析文本。");
  }

  return {
    text,
    model: typeof (payload as { model?: unknown } | null)?.model === "string"
      ? (payload as { model: string }).model
      : input.model
  };
}

export async function runOpenAIAdminIngest(input: OpenAIAdminIngestInput): Promise<OpenAIAdminIngestResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const resolved = resolveResponsesConfig(input);
    const systemPrompt = buildGptIngestBrainSystemPrompt();
    const userPrompt = buildUserPrompt(input);

    const response = await callResponsesApi({
      responsesUrl: resolved.responsesUrl,
      apiKey: resolved.apiKey,
      model: resolved.model,
      systemPrompt,
      userPrompt,
      signal: controller.signal
    });
    const normalized = normalizeGptOutput({
      rawText: response.text,
      originalInput: input.input,
      fallbackCategory: input.category ?? ""
    });

    logger.info("enterprise_admin_ingest.openai_success", {
      requestId: input.requestId,
      model: response.model,
      modelMode: resolved.modelMode,
      durationMs: Date.now() - startedAt,
      responsesApi: true
    });

    return {
      provider: "openai",
      model: response.model,
      modelDisplayName: resolved.selectedModelLabel,
      modelMode: resolved.modelMode,
      fallback: false,
      selectedModelLabel: resolved.selectedModelLabel,
      replyMarkdown: normalized.replyMarkdown,
      knowledgeDraft: normalized.knowledgeDraft,
      suggestedQuestions: normalized.suggestedQuestions,
      saveRecommendation: normalized.saveRecommendation,
      diagnostics: normalized.diagnostics,
      structured: normalized.structured,
      structuredResult: normalized.structured,
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
