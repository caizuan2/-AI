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
import { buildGptProRetryDeepenPrompt } from "@/lib/enterprise/gpt-pro-retry-deepen";
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
  resolveIngestActualModel,
  sanitizeIngestPreferredModel
} from "@/lib/enterprise/ingest-model-options";

export interface KimiAdminIngestInput {
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

export interface KimiAdminIngestResult {
  provider: "kimi";
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

type KimiIngestErrorCode =
  | "KIMI_API_KEY_MISSING"
  | "KIMI_BASE_URL_INVALID"
  | "KIMI_REQUEST_FAILED"
  | "KIMI_RESPONSE_PARSE_FAILED"
  | "KIMI_TIMEOUT"
  | "KIMI_PRO_QUALITY_FAILED";

export class KimiIngestError extends Error {
  constructor(
    public readonly code: KimiIngestErrorCode,
    message: string
  ) {
    super(message);
    this.name = "KimiIngestError";
  }
}

const REQUEST_TIMEOUT_MS = 180_000;
const DEFAULT_BASE_URL = "https://api.moonshot.cn/v1";
const DEFAULT_MODEL = "kimi-k2.7-code-highspeed";
const DEFAULT_MODEL_LABEL = "Kimi-K2.7-Code-HighSpeed";
const KIMI_PLACEHOLDER_API_KEY = "sk-your-kimi-api-key";
const KIMI_FIXED_TEMPERATURE = 1;

function readEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function readKimiKey() {
  const apiKey = readEnv("KIMI_API_KEY");

  if (!apiKey || apiKey.includes(KIMI_PLACEHOLDER_API_KEY)) {
    throw new KimiIngestError("KIMI_API_KEY_MISSING", "Kimi API Key 未配置");
  }

  return apiKey;
}

function normalizeBaseUrl(value: string) {
  return (value || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function buildChatCompletionsUrl(baseUrl: string) {
  try {
    const normalized = baseUrl.replace(/\/+$/, "");

    return normalized.endsWith("/chat/completions")
      ? new URL(normalized).toString()
      : new URL(`${normalized}/chat/completions`).toString();
  } catch {
    throw new KimiIngestError("KIMI_BASE_URL_INVALID", "KIMI_BASE_URL 无效。");
  }
}

function resolveKimiConfig(input: KimiAdminIngestInput) {
  const configuredModel = readEnv("KIMI_MODEL");
  const preferredModel = sanitizeIngestPreferredModel(input.preferredModel);
  const model = preferredModel || resolveIngestActualModel("kimi") || DEFAULT_MODEL;
  const selectedModelLabel = input.selectedModelLabel || input.modelDisplayName || readEnv("KIMI_DISPLAY_NAME") || DEFAULT_MODEL_LABEL;
  const baseUrl = normalizeBaseUrl(readEnv("KIMI_BASE_URL"));

  return {
    apiKey: readKimiKey(),
    baseUrl,
    chatCompletionsUrl: buildChatCompletionsUrl(baseUrl),
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

  if (numeric) {
    return new Date(numeric * 1000).toISOString();
  }

  return new Date().toISOString();
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

function buildGptOSRouteInput(input: KimiAdminIngestInput) {
  return {
    text: input.input,
    activeAgentName: input.agentName,
    category: input.category,
    attachments: input.attachments,
    recentMessages: input.recentMessages,
    autonomous: input.autonomous
  };
}

function buildUserPrompt(input: KimiAdminIngestInput, gptOS?: GptOSRouteResult) {
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

function normalizeKimiResponseError(status: number) {
  if (status === 401 || status === 403) {
    return new KimiIngestError("KIMI_API_KEY_MISSING", "AI服务授权暂不可用，请稍后再试。");
  }

  if (status === 408) {
    return new KimiIngestError("KIMI_TIMEOUT", "AI响应较慢，请稍后再试。");
  }

  return new KimiIngestError("KIMI_REQUEST_FAILED", "AI暂时不稳定，请稍后再试。");
}

function resolveKimiTemperature() {
  return KIMI_FIXED_TEMPERATURE;
}

export async function callKimi(payload: {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  messages?: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  input?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}) {
  const apiKey = payload.apiKey || readKimiKey();
  const model = sanitizeIngestPreferredModel(payload.model) || resolveIngestActualModel("kimi") || DEFAULT_MODEL;
  const url = buildChatCompletionsUrl(normalizeBaseUrl(payload.baseUrl || readEnv("KIMI_BASE_URL")));
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
      temperature: resolveKimiTemperature(),
      max_tokens: payload.maxTokens ?? 8000,
      stream: false
    }),
    signal: payload.signal,
    cache: "no-store"
  });
  const bodyText = await response.text();

  if (!response.ok) {
    logger.warn("enterprise_admin_ingest.kimi_request_failed", {
      status: response.status,
      bodySnippet: bodyText.slice(0, 480)
    });
    throw normalizeKimiResponseError(response.status);
  }

  try {
    return bodyText ? JSON.parse(bodyText) as unknown : null;
  } catch {
    throw new KimiIngestError("KIMI_RESPONSE_PARSE_FAILED", "Kimi 返回解析失败。");
  }
}

async function callKimiChatCompletions(input: {
  chatCompletionsUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  signal: AbortSignal;
}) {
  const call = await withResilientLLMCall("kimi:chat-completions", () => callKimi({
    apiKey: input.apiKey,
    baseUrl: input.chatCompletionsUrl.replace(/\/chat\/completions\/?$/, ""),
    model: input.model,
    messages: [
      { role: "system", content: input.systemPrompt },
      { role: "user", content: input.userPrompt }
    ],
    temperature: resolveKimiTemperature(),
    maxTokens: 8000,
    signal: input.signal
  }), {
    retries: 2,
    retryDelayMs: 500
  });

  return {
    ...parseKimiPayload(call.value, input.model),
    retryCount: call.retryCount,
    responseLatency: call.responseLatency,
    circuitBreaker: call.circuitBreaker
  };
}

function parseKimiPayload(payload: unknown, fallbackModel: string) {
  const normalized = normalizeLLMResponse(payload, {
    provider: "kimi",
    fallbackModel
  });
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const rawResponseId = normalized.responseId ?? "";
  const actualModel = normalized.model ?? fallbackModel;
  const createdAt = normalized.createdAt ?? normalizeCreatedAt(record.created);
  const generatedProofId = `kimi-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;
  const responseId = rawResponseId || generatedProofId;

  return {
    text: normalized.text,
    model: actualModel,
    responseId,
    proofId: responseId,
    proofIdSource: rawResponseId ? "provider_response_id" as const : "generated_from_provider_payload" as const,
    createdAt,
    usage: normalized.usage ?? normalizeUsage(record.usage),
    rawResponseType: normalized.rawResponseType,
    normalized: normalized.normalized,
    parserUsed: normalized.parserUsed
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
      "Kimi 返回了内容，但没有提供 replyMarkdown 主回复字段",
      ...quality.failedReasons
    ]
  };
}

export async function runKimiAdminIngest(input: KimiAdminIngestInput): Promise<KimiAdminIngestResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const resolved = resolveKimiConfig(input);
    const gptOS = routeGptOSAgent(buildGptOSRouteInput(input));
    const systemPrompt = buildGptIngestBrainSystemPrompt();
    const userPrompt = buildUserPrompt(input, gptOS);
    let response = await callKimiChatCompletions({
      chatCompletionsUrl: resolved.chatCompletionsUrl,
      apiKey: resolved.apiKey,
      model: resolved.model,
      systemPrompt,
      userPrompt,
      signal: controller.signal
    });
    let normalized: ReturnType<typeof normalizeGptOutput> | null = null;
    let quality = buildMissingReplyQuality(response.text, input.input);
    let deepenAttempts = 0;
    let qualitySoftAccepted = false;

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
      logger.warn("enterprise_admin_ingest.kimi_missing_reply_quality_check", {
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
      response = await callKimiChatCompletions({
        chatCompletionsUrl: resolved.chatCompletionsUrl,
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
        logger.warn("enterprise_admin_ingest.kimi_deepen_missing_reply", {
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

    if (!normalized) {
      try {
        normalized = normalizeGptOutput({
          rawText: response.text,
          originalInput: input.input,
          fallbackCategory: input.category ?? "",
          strictReply: false
        });
        quality = assessGptProResponseQuality(normalized.replyMarkdown, {
          userInput: input.input
        });
      } catch {
        throw new KimiIngestError("KIMI_RESPONSE_PARSE_FAILED", "Kimi 未返回可保存的 replyMarkdown。");
      }
    }

    if (!quality.ok) {
      qualitySoftAccepted = Boolean(normalized.replyMarkdown.trim());
    }

    const gptProof: GptCallProof = {
      provider: "kimi",
      endpoint: "/chat/completions",
      requestedModel: resolved.model,
      actualModel: response.model,
      responseId: response.responseId,
      proofId: response.proofId,
      proofIdSource: response.proofIdSource,
      fallback: false,
      requestTested: true,
      qualityPassed: quality.ok || qualitySoftAccepted,
      deepenAttempts,
      createdAt: response.createdAt,
      usage: response.usage
    };

    logger.info("enterprise_admin_ingest.kimi_success", {
      requestId: input.requestId,
      model: response.model,
      requestedModel: resolved.model,
      responseId: response.responseId,
      durationMs: Date.now() - startedAt,
      outputTokens: response.usage.outputTokens,
      deepenAttempts
    });

    return {
      provider: "kimi",
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
      replyMarkdown: normalized.replyMarkdown,
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
        "apiResilience:provider:kimi",
        `apiResilience:normalized:${response.normalized ? "true" : "false"}`,
        `apiResilience:parserUsed:${response.parserUsed}`,
        `apiResilience:rawResponseType:${response.rawResponseType}`,
        `apiResilience:retryCount:${response.retryCount}`,
        `apiResilience:fallbackUsed:false`,
        `apiResilience:responseLatency:${response.responseLatency}`,
        `apiResilience:circuitBreaker:${response.circuitBreaker}`,
        `observability:traceId:${gptOS.observability.trace.traceId}`,
        `observability:requestId:${gptOS.observability.trace.requestId}`,
        `observability:modelUsed:${response.model}`,
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
      throw new KimiIngestError("KIMI_TIMEOUT", "Kimi 请求超时，请稍后重试。");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
