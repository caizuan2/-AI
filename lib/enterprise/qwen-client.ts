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
  getQwenBaseUrl,
  getQwenModel,
  QWEN_PLACEHOLDER_API_KEY
} from "@/lib/server-config-core";
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

export interface QwenAdminIngestInput {
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
  previousKnowledgeDrafts?: Array<Partial<GptKnowledgeDraft>>;
  recentTrainingRecords?: GptIngestMemoryRecord[];
  autonomous?: AutonomousTaskRequest;
  requestId?: string;
}

export interface QwenAdminIngestResult {
  provider: "qwen";
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

type QwenIngestErrorCode =
  | "QWEN_API_KEY_MISSING"
  | "QWEN_BASE_URL_INVALID"
  | "QWEN_REQUEST_FAILED"
  | "QWEN_RESPONSE_PARSE_FAILED"
  | "QWEN_TIMEOUT"
  | "QWEN_PRO_QUALITY_FAILED";

export class QwenIngestError extends Error {
  constructor(
    public readonly code: QwenIngestErrorCode,
    message: string
  ) {
    super(message);
    this.name = "QwenIngestError";
  }
}

const REQUEST_TIMEOUT_MS = 150_000;
const DEFAULT_MODEL_LABEL = "Qwen Plus";

function readEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function readQwenKey() {
  const apiKey = readEnv("QWEN_API_KEY");

  if (!apiKey || apiKey.includes(QWEN_PLACEHOLDER_API_KEY)) {
    throw new QwenIngestError("QWEN_API_KEY_MISSING", "Qwen API Key 未配置");
  }

  return apiKey;
}

function normalizeBaseUrl(value: string) {
  return (value || getQwenBaseUrl()).replace(/\/+$/, "");
}

function buildChatCompletionsUrl(baseUrl: string) {
  try {
    const normalized = baseUrl.replace(/\/+$/, "");

    return normalized.endsWith("/chat/completions")
      ? new URL(normalized).toString()
      : new URL(`${normalized}/chat/completions`).toString();
  } catch {
    throw new QwenIngestError("QWEN_BASE_URL_INVALID", "QWEN_BASE_URL 无效。");
  }
}

function resolveQwenConfig(input: QwenAdminIngestInput) {
  const configuredModel = readEnv("QWEN_MODEL");
  const model = configuredModel || input.preferredModel || getQwenModel();
  const selectedModelLabel = input.selectedModelLabel || input.modelDisplayName || readEnv("QWEN_DISPLAY_NAME") || DEFAULT_MODEL_LABEL;
  const baseUrl = normalizeBaseUrl(readEnv("QWEN_BASE_URL"));

  return {
    apiKey: readQwenKey(),
    baseUrl,
    chatCompletionsUrl: buildChatCompletionsUrl(baseUrl),
    model,
    selectedModelLabel,
    modelMode: configuredModel ? "fixed" as const : "highest" as const
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

function buildGptOSRouteInput(input: QwenAdminIngestInput) {
  return {
    text: input.input,
    activeAgentName: input.agentName,
    category: input.category,
    attachments: input.attachments,
    recentMessages: input.recentMessages,
    autonomous: input.autonomous
  };
}

function buildUserPrompt(input: QwenAdminIngestInput, gptOS?: GptOSRouteResult) {
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
      uploadedAttachments: input.attachments,
      previousKnowledgeDrafts: input.previousKnowledgeDrafts,
      recentTrainingRecords: input.recentTrainingRecords,
      selectedModelLabel: input.selectedModelLabel || input.modelDisplayName || input.preferredModel,
      platform: input.platform,
      syncTarget: input.syncTarget
    }
  });
}

function normalizeQwenResponseError(status: number) {
  if (status === 401 || status === 403) {
    return new QwenIngestError("QWEN_API_KEY_MISSING", "AI服务授权暂不可用，请稍后再试。");
  }

  if (status === 408) {
    return new QwenIngestError("QWEN_TIMEOUT", "AI响应较慢，请稍后再试。");
  }

  return new QwenIngestError("QWEN_REQUEST_FAILED", "AI暂时不稳定，请稍后再试。");
}

export async function callQwen(payload: {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  messages?: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  input?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}) {
  const apiKey = payload.apiKey || readQwenKey();
  const model = payload.model || getQwenModel();
  const url = buildChatCompletionsUrl(normalizeBaseUrl(payload.baseUrl || readEnv("QWEN_BASE_URL")));
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
    logger.warn("enterprise_admin_ingest.qwen_request_failed", {
      status: response.status,
      bodySnippet: bodyText.slice(0, 480)
    });
    throw normalizeQwenResponseError(response.status);
  }

  try {
    return bodyText ? JSON.parse(bodyText) as unknown : null;
  } catch {
    throw new QwenIngestError("QWEN_RESPONSE_PARSE_FAILED", "Qwen 返回解析失败。");
  }
}

async function callQwenChatCompletions(input: {
  chatCompletionsUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  signal: AbortSignal;
}) {
  const call = await withResilientLLMCall("qwen:chat-completions", () => callQwen({
    apiKey: input.apiKey,
    baseUrl: input.chatCompletionsUrl.replace(/\/chat\/completions\/?$/, ""),
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
    ...parseQwenPayload(call.value, input.model),
    retryCount: call.retryCount,
    responseLatency: call.responseLatency,
    circuitBreaker: call.circuitBreaker
  };
}

function parseQwenPayload(payload: unknown, fallbackModel: string) {
  const normalized = normalizeLLMResponse(payload, {
    provider: "qwen",
    fallbackModel
  });
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const text = normalized.text;
  const rawResponseId = normalized.responseId ?? "";
  const actualModel = normalized.model ?? fallbackModel;
  const createdAt = normalized.createdAt ?? normalizeCreatedAt(record.created);
  const generatedProofId = `qwen-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;
  const responseId = rawResponseId || generatedProofId;

  if (!text) {
    throw new QwenIngestError("QWEN_RESPONSE_PARSE_FAILED", "Qwen 未返回可解析文本。");
  }

  return {
    text,
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
      "Qwen 返回了内容，但没有提供 replyMarkdown 主回复字段",
      ...quality.failedReasons
    ]
  };
}

export async function runQwenAdminIngest(input: QwenAdminIngestInput): Promise<QwenAdminIngestResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const resolved = resolveQwenConfig(input);
    const gptOS = routeGptOSAgent(buildGptOSRouteInput(input));
    const systemPrompt = buildGptIngestBrainSystemPrompt();
    const userPrompt = buildUserPrompt(input, gptOS);
    let response = await callQwenChatCompletions({
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
      logger.warn("enterprise_admin_ingest.qwen_missing_reply_quality_check", {
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
      response = await callQwenChatCompletions({
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
        logger.warn("enterprise_admin_ingest.qwen_deepen_missing_reply", {
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
        throw new QwenIngestError("QWEN_RESPONSE_PARSE_FAILED", "Qwen 未返回可保存的 replyMarkdown。");
      }
    }

    if (!quality.ok) {
      qualitySoftAccepted = Boolean(normalized.replyMarkdown.trim());
      logger.warn("enterprise_admin_ingest.qwen_quality_soft_accept", {
        requestId: input.requestId,
        model: response.model,
        responseId: response.responseId,
        chineseCharCount: quality.chineseCharCount,
        failedReasons: quality.failedReasons,
        replyLength: normalized.replyMarkdown.length
      });
    }

    const gptProof: GptCallProof = {
      provider: "qwen",
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

    logger.info("enterprise_admin_ingest.qwen_success", {
      requestId: input.requestId,
      model: response.model,
      requestedModel: resolved.model,
      responseId: response.responseId,
      durationMs: Date.now() - startedAt,
      proQualityChineseChars: quality.chineseCharCount,
      intent: quality.intent,
      fixedTemplateRisk: quality.fixedTemplateRisk,
      outputTokens: response.usage.outputTokens,
      deepenAttempts
    });

    return {
      provider: "qwen",
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
        "apiResilience:provider:qwen",
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
      throw new QwenIngestError("QWEN_TIMEOUT", "Qwen 请求超时，请稍后重试。");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
