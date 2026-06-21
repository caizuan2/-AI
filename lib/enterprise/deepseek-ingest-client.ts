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
import { DEEPSEEK_PLACEHOLDER_API_KEY } from "@/lib/server-config-core";

export interface DeepSeekAdminIngestInput {
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
  requestId?: string;
}

export interface DeepSeekAdminIngestResult {
  provider: "deepseek";
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
  sync: {
    platform: AdminIngestPlatform;
    syncTarget: Array<"web" | "exe" | "apk">;
  };
  sourceType: "admin_ingest";
  fallbackUsed: false;
}

type DeepSeekIngestErrorCode =
  | "DEEPSEEK_API_KEY_MISSING"
  | "DEEPSEEK_BASE_URL_INVALID"
  | "DEEPSEEK_REQUEST_FAILED"
  | "DEEPSEEK_RESPONSE_PARSE_FAILED"
  | "DEEPSEEK_TIMEOUT"
  | "DEEPSEEK_PRO_QUALITY_FAILED";

export class DeepSeekIngestError extends Error {
  constructor(
    public readonly code: DeepSeekIngestErrorCode,
    message: string
  ) {
    super(message);
    this.name = "DeepSeekIngestError";
  }
}

const REQUEST_TIMEOUT_MS = 150_000;
const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-chat";
const DEFAULT_MODEL_LABEL = "DeepSeek-V4-Pro";

function readEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function readDeepSeekKey() {
  const apiKey = readEnv("DEEPSEEK_API_KEY");

  if (!apiKey || apiKey.includes(DEEPSEEK_PLACEHOLDER_API_KEY)) {
    throw new DeepSeekIngestError("DEEPSEEK_API_KEY_MISSING", "DeepSeek API Key 未配置");
  }

  return apiKey;
}

function normalizeBaseUrl(value: string) {
  return (value || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function buildChatCompletionsUrl(baseUrl: string) {
  try {
    return new URL(`${baseUrl.replace(/\/+$/, "")}/chat/completions`).toString();
  } catch {
    throw new DeepSeekIngestError("DEEPSEEK_BASE_URL_INVALID", "DEEPSEEK_BASE_URL 无效。");
  }
}

function resolveDeepSeekConfig(input: DeepSeekAdminIngestInput) {
  const configuredModel = readEnv("DEEPSEEK_MODEL");
  const model = configuredModel || input.preferredModel || DEFAULT_MODEL;
  const selectedModelLabel = input.selectedModelLabel || input.modelDisplayName || readEnv("DEEPSEEK_DISPLAY_NAME") || DEFAULT_MODEL_LABEL;
  const baseUrl = normalizeBaseUrl(readEnv("DEEPSEEK_BASE_URL"));

  return {
    apiKey: readDeepSeekKey(),
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

function buildUserPrompt(input: DeepSeekAdminIngestInput) {
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

function normalizeDeepSeekResponseError(status: number, bodyText: string) {
  let providerMessage = "";

  try {
    const payload = JSON.parse(bodyText) as { error?: { message?: unknown } };
    providerMessage = typeof payload.error?.message === "string" ? payload.error.message.trim() : "";
  } catch {
    providerMessage = bodyText.trim().slice(0, 260);
  }

  const suffix = providerMessage ? `（HTTP ${status}：${providerMessage.slice(0, 260)}）` : `（HTTP ${status}）`;

  if (status === 401 || status === 403) {
    return new DeepSeekIngestError("DEEPSEEK_API_KEY_MISSING", `DeepSeek API Key 未配置或无权访问当前模型。${suffix}`);
  }

  if (status === 408) {
    return new DeepSeekIngestError("DEEPSEEK_TIMEOUT", `DeepSeek 请求超时，请稍后重试。${suffix}`);
  }

  return new DeepSeekIngestError("DEEPSEEK_REQUEST_FAILED", `DeepSeek chat/completions 请求失败。${suffix}`);
}

async function callDeepSeekChatCompletions(input: {
  chatCompletionsUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  signal: AbortSignal;
}) {
  const response = await fetch(input.chatCompletionsUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: input.model,
      messages: [
        { role: "system", content: input.systemPrompt },
        { role: "user", content: input.userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 6000,
      stream: false
    }),
    signal: input.signal,
    cache: "no-store"
  });
  const bodyText = await response.text();

  if (!response.ok) {
    logger.warn("enterprise_admin_ingest.deepseek_request_failed", {
      status: response.status,
      bodySnippet: bodyText.slice(0, 480)
    });
    throw normalizeDeepSeekResponseError(response.status, bodyText);
  }

  return parseDeepSeekPayload(bodyText, input.model);
}

function parseDeepSeekPayload(bodyText: string, fallbackModel: string) {
  let payload: unknown = null;

  try {
    payload = bodyText ? JSON.parse(bodyText) as unknown : null;
  } catch {
    throw new DeepSeekIngestError("DEEPSEEK_RESPONSE_PARSE_FAILED", "DeepSeek 返回解析失败。");
  }

  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const firstChoice = choices[0] && typeof choices[0] === "object" ? choices[0] as Record<string, unknown> : {};
  const message = firstChoice.message && typeof firstChoice.message === "object" ? firstChoice.message as Record<string, unknown> : {};
  const text = typeof message.content === "string" ? message.content.trim() : "";
  const rawResponseId = typeof record.id === "string" ? record.id.trim() : "";
  const actualModel = typeof record.model === "string" && record.model.trim() ? record.model.trim() : fallbackModel;
  const createdAt = normalizeCreatedAt(record.created);
  const generatedProofId = `deepseek-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;
  const responseId = rawResponseId || generatedProofId;

  if (!text) {
    throw new DeepSeekIngestError("DEEPSEEK_RESPONSE_PARSE_FAILED", "DeepSeek 未返回可解析文本。");
  }

  return {
    text,
    model: actualModel,
    responseId,
    proofId: responseId,
    proofIdSource: rawResponseId ? "provider_response_id" as const : "generated_from_provider_payload" as const,
    createdAt,
    usage: normalizeUsage(record.usage)
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
      "DeepSeek 返回了内容，但没有提供 replyMarkdown 主回复字段",
      ...quality.failedReasons
    ]
  };
}

export async function runDeepSeekAdminIngest(input: DeepSeekAdminIngestInput): Promise<DeepSeekAdminIngestResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const resolved = resolveDeepSeekConfig(input);
    const systemPrompt = buildGptIngestBrainSystemPrompt();
    const userPrompt = buildUserPrompt(input);

    let response = await callDeepSeekChatCompletions({
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
      logger.warn("enterprise_admin_ingest.deepseek_missing_reply_quality_check", {
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
      logger.warn("enterprise_admin_ingest.deepseek_pro_quality_deepen", {
        requestId: input.requestId,
        attempt: deepenAttempts,
        model: response.model,
        responseId: response.responseId,
        chineseCharCount: quality.chineseCharCount,
        missingSignals: quality.missingSignals,
        intent: quality.intent,
        fixedTemplateRisk: quality.fixedTemplateRisk,
        failedReasons: quality.failedReasons
      });
      response = await callDeepSeekChatCompletions({
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
        logger.warn("enterprise_admin_ingest.deepseek_deepen_missing_reply", {
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
      throw new DeepSeekIngestError(
        "DEEPSEEK_PRO_QUALITY_FAILED",
        `DeepSeek 已返回，但回复未达到投喂深度：${quality.failedReasons.join("；")}`
      );
    }

    if (!normalized) {
      throw new DeepSeekIngestError("DEEPSEEK_RESPONSE_PARSE_FAILED", "DeepSeek 未返回可保存的 replyMarkdown。");
    }

    const gptProof: GptCallProof = {
      provider: "deepseek",
      endpoint: "/chat/completions",
      requestedModel: resolved.model,
      actualModel: response.model,
      responseId: response.responseId,
      proofId: response.proofId,
      proofIdSource: response.proofIdSource,
      fallback: false,
      requestTested: true,
      qualityPassed: true,
      deepenAttempts,
      createdAt: response.createdAt,
      usage: response.usage
    };

    logger.info("enterprise_admin_ingest.deepseek_success", {
      requestId: input.requestId,
      model: response.model,
      requestedModel: resolved.model,
      responseId: response.responseId,
      proofIdSource: response.proofIdSource,
      durationMs: Date.now() - startedAt,
      proQualityChineseChars: quality.chineseCharCount,
      intent: quality.intent,
      fixedTemplateRisk: quality.fixedTemplateRisk,
      outputTokens: response.usage.outputTokens,
      deepenAttempts
    });

    return {
      provider: "deepseek",
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
      suggestedQuestions: normalized.suggestedQuestions,
      sourceFiles: (input.attachments ?? []).map((attachment) => ({
        fileName: attachment.fileName,
        mimeType: attachment.mimeType ?? attachment.fileType,
        parseStatus: attachment.parseStatus,
        limitationNote: attachment.limitationNote
      })),
      saveRecommendation: normalized.saveRecommendation,
      diagnostics: [
        "provider:deepseek",
        `proofIdSource:${response.proofIdSource}`,
        `intent:${quality.intent}`,
        `fixedTemplateRisk:${quality.fixedTemplateRisk ? "true" : "false"}`,
        ...normalized.diagnostics
      ],
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
      throw new DeepSeekIngestError("DEEPSEEK_TIMEOUT", "DeepSeek 请求超时，请稍后重试。");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
