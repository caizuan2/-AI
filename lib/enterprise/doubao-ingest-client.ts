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
  normalizeLLMResponse,
  withResilientLLMCall
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
  | "DOUBAO_TIMEOUT";

export class DoubaoIngestError extends Error {
  constructor(
    public readonly code: DoubaoIngestErrorCode,
    message: string
  ) {
    super(message);
    this.name = "DoubaoIngestError";
  }
}

const DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
const DEFAULT_MODEL_LABEL = "Doubao-Seed-2.1-pro";
const REQUEST_TIMEOUT_MS = 150_000;

function readEnv(name: string) {
  return process.env[name]?.trim() ?? "";
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
    throw new DoubaoIngestError("DOUBAO_RESPONSE_PARSE_FAILED", "豆包返回解析失败。");
  }
}

async function callDoubaoChatCompletions(input: {
  chatCompletionsUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  signal: AbortSignal;
}) {
  const call = await withResilientLLMCall("doubao:chat-completions", () => callDoubao({
    apiKey: input.apiKey,
    baseUrl: input.chatCompletionsUrl,
    model: input.model,
    messages: [
      { role: "system", content: input.systemPrompt },
      { role: "user", content: input.userPrompt }
    ],
    temperature: 0.7,
    maxTokens: 6000,
    signal: input.signal
  }), {
    retries: 2,
    retryDelayMs: 500
  });

  return {
    ...parseDoubaoPayload(call.value, input.model),
    retryCount: call.retryCount,
    responseLatency: call.responseLatency,
    circuitBreaker: call.circuitBreaker
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
  const actualModel = normalized.model ?? fallbackModel;
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

export function extractDoubaoReplyMarkdown(text: string) {
  const parsed = extractJsonObject(text);
  const replyMarkdown = parsed?.replyMarkdown;

  if (typeof replyMarkdown !== "string" || !replyMarkdown.trim()) {
    throw new DoubaoIngestError("DOUBAO_RESPONSE_PARSE_FAILED", "豆包未返回可保存的 replyMarkdown。");
  }

  return replyMarkdown;
}

export async function runDoubaoAdminIngest(input: DoubaoAdminIngestInput): Promise<DoubaoAdminIngestResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
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
    const replyMarkdown = extractDoubaoReplyMarkdown(response.text);
    const structuredPayload = extractJsonObject(response.text) ?? {};
    const normalized = normalizeGptOutput({
      rawText: JSON.stringify({
        ...structuredPayload,
        replyMarkdown: "豆包已返回原始 Markdown 正文。"
      }),
      originalInput: input.input,
      fallbackCategory: input.category ?? "",
      strictReply: true
    });
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
      knowledgeDraft: normalized.knowledgeDraft,
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
      saveRecommendation: normalized.saveRecommendation,
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
      throw new DoubaoIngestError("DOUBAO_TIMEOUT", "豆包请求超时，请稍后重试。");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
