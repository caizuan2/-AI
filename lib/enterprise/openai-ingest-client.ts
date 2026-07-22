import "server-only";

import { ProxyAgent } from "undici";
import { logger } from "@/lib/logger";
import {
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
import {
  routeGptOSAgent,
  type GptOSRouteResult
} from "@/lib/enterprise/gpt-os-agent-router";
import type {
  AutonomousTaskRequest,
  AutonomousTaskResult
} from "@/lib/enterprise/gpt-os-autonomous-executor";
import {
  createRecoveredResponseId,
  normalizeLLMContentResult,
  normalizeLLMResponse,
  withResilientLLMCall,
  type GptOSApiResponseType,
  type NormalizedLLMResponse
} from "@/lib/enterprise/gpt-os-api-adapter";
import {
  resolveIngestActualModel,
  sanitizeIngestPreferredModel
} from "@/lib/enterprise/ingest-model-options";

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
  gptOS: GptOSRouteResult;
  autonomousResult: AutonomousTaskResult;
  structured: GptStructuredKnowledge;
  structuredResult: GptStructuredKnowledge;
  sync: {
    platform: AdminIngestPlatform;
    syncTarget: Array<"web" | "exe" | "apk">;
  };
  sourceType: "admin_ingest";
  fallbackUsed: false;
}

const REQUEST_TIMEOUT_MS = 420_000;
const HIGH_QUALITY_REQUEST_TIMEOUT_MS = 75_000;
const COMPATIBLE_REQUEST_TIMEOUT_MS = 120_000;
const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-5.5";
const DEFAULT_MODEL_LABEL = "GPT-5.5 超高";
const WINDOWS_LOCAL_PROXY_URL = "http://127.0.0.1:7897";

type OpenAIResponsesErrorCode =
  | "OPENAI_API_KEY_MISSING"
  | "OPENAI_BASE_URL_INVALID"
  | "OPENAI_RESPONSES_REQUEST_FAILED"
  | "OPENAI_RESPONSES_PARSE_FAILED"
  | "OPENAI_RATE_LIMIT"
  | "OPENAI_TIMEOUT"
  | "OPENAI_FULL_REQUEST_FAILED"
  | "OPENAI_PRO_QUALITY_FAILED";

type OpenAIIngestHealthErrorCode =
  | "API_KEY_MISSING"
  | "MODEL_NOT_FOUND"
  | "OPENAI_TIMEOUT"
  | "OPENAI_RATE_LIMIT"
  | "OPENAI_BAD_REQUEST"
  | "OPENAI_PARSE_FAILED"
  | "UNKNOWN_OPENAI_ERROR";

export interface OpenAIIngestHealthResult {
  ok: boolean;
  provider: "openai";
  requestedModel: string;
  actualModel?: string;
  responseId?: string;
  hasOutputText: boolean;
  outputPreview?: string;
  errorCode?: OpenAIIngestHealthErrorCode;
  errorMessage?: string;
}

class OpenAIResponsesError extends Error {
  constructor(
    public readonly code: OpenAIResponsesErrorCode,
    message: string,
    public readonly details: {
      status?: number | null;
      diagnostics?: Record<string, unknown>;
      highQualityErrorCode?: string;
      compatibleErrorCode?: string;
    } = {}
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
  const preferredModel = sanitizeIngestPreferredModel(input.preferredModel);
  const model = preferredModel || resolveIngestActualModel("openai") || fixedModel || readEnv("OPENAI_PREFERRED_MODEL") || DEFAULT_MODEL;
  const modelMode = fixedModel || preferredModel ? "fixed" as const : "highest" as const;
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

function resolveHealthModel(input: {
  preferredModel?: string | null;
}) {
  const preferredModel = sanitizeIngestPreferredModel(input.preferredModel);

  return preferredModel || resolveIngestActualModel("openai") || DEFAULT_MODEL;
}

function mapHealthStatus(status: number, bodyText: string): OpenAIIngestHealthErrorCode {
  const lower = bodyText.toLowerCase();

  if (status === 401 || status === 403) {
    return "API_KEY_MISSING";
  }

  if (status === 404 || lower.includes("model_not_found") || lower.includes("does not exist") || lower.includes("model unavailable")) {
    return "MODEL_NOT_FOUND";
  }

  if (status === 400) {
    return "OPENAI_BAD_REQUEST";
  }

  if (status === 408 || lower.includes("timeout")) {
    return "OPENAI_TIMEOUT";
  }

  if (status === 429) {
    return "OPENAI_RATE_LIMIT";
  }

  return "UNKNOWN_OPENAI_ERROR";
}

function mapHealthError(error: unknown): OpenAIIngestHealthErrorCode {
  const record = error && typeof error === "object" ? error as { code?: unknown; name?: unknown; message?: unknown } : {};
  const code = typeof record.code === "string" ? record.code : "";
  const name = typeof record.name === "string" ? record.name : "";
  const message = typeof record.message === "string" ? record.message.toLowerCase() : "";

  if (code === "OPENAI_API_KEY_MISSING" || message.includes("api key")) {
    return "API_KEY_MISSING";
  }

  if (name === "AbortError" || code === "OPENAI_TIMEOUT" || message.includes("timeout") || message.includes("超时")) {
    return "OPENAI_TIMEOUT";
  }

  if (code === "OPENAI_BASE_URL_INVALID") {
    return "OPENAI_BAD_REQUEST";
  }

  if (code.includes("PARSE") || message.includes("parse") || message.includes("解析")) {
    return "OPENAI_PARSE_FAILED";
  }

  return "UNKNOWN_OPENAI_ERROR";
}

export async function checkOpenAIIngestHealth(input: {
  preferredModel?: string | null;
} = {}): Promise<OpenAIIngestHealthResult> {
  const requestedModel = resolveHealthModel(input);

  try {
    const apiKey = readOpenAIKey();
    const baseUrl = normalizeBaseUrl(readEnv("OPENAI_BASE_URL"));
    const responsesUrl = buildResponsesUrl(baseUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);

    try {
      const response = await fetchOpenAIResponses(responsesUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: requestedModel,
          instructions: "你是管理员投喂版 GPT-5.5 健康检查。只回复 OK。",
          input: "只回复 OK",
          max_output_tokens: 64,
          stream: false
        }),
        signal: controller.signal,
        cache: "no-store"
      });
      const bodyText = await response.text().catch(() => "");

      if (!response.ok) {
        const errorCode = mapHealthStatus(response.status, bodyText);

        return {
          ok: false,
          provider: "openai",
          requestedModel,
          hasOutputText: false,
          errorCode,
          errorMessage: `OpenAI Responses API health check failed: HTTP ${response.status}`
        };
      }

      let payload: unknown = null;

      try {
        payload = bodyText ? JSON.parse(bodyText) as unknown : null;
      } catch {
        return {
          ok: false,
          provider: "openai",
          requestedModel,
          hasOutputText: false,
          errorCode: "OPENAI_PARSE_FAILED",
          errorMessage: "OpenAI Responses API returned invalid JSON"
        };
      }

      try {
        const normalized = normalizeLLMContentResult(payload, {
          provider: "openai",
          requestedModel,
          fallbackModel: requestedModel
        });

        return {
          ok: true,
          provider: "openai",
          requestedModel,
          actualModel: normalized.actualModel,
          responseId: normalized.responseId,
          hasOutputText: Boolean(normalized.content),
          outputPreview: normalized.content.slice(0, 120)
        };
      } catch {
        return {
          ok: false,
          provider: "openai",
          requestedModel,
          hasOutputText: false,
          errorCode: "OPENAI_PARSE_FAILED",
          errorMessage: "OpenAI Responses API output text could not be normalized"
        };
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    const errorCode = mapHealthError(error);

    return {
      ok: false,
      provider: "openai",
      requestedModel,
      hasOutputText: false,
      errorCode,
      errorMessage: errorCode === "API_KEY_MISSING"
        ? "OPENAI_API_KEY is missing or placeholder"
        : "OpenAI ingest health check failed"
    };
  }
}

function buildGptOSRouteInput(input: OpenAIAdminIngestInput) {
  return {
    text: input.input,
    activeAgentName: input.agentName,
    category: input.category,
    attachments: input.attachments,
    recentMessages: input.recentMessages,
    autonomous: input.autonomous
  };
}

function buildUserPrompt(input: OpenAIAdminIngestInput, gptOS?: GptOSRouteResult) {
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

const COMPACT_GPT_OS_INPUT_LIMIT = 12_000;
const COMPACT_FILE_SUMMARY_LIMIT = 2_500;
const COMPACT_RECENT_MESSAGE_LIMIT = 6;
const COMPATIBLE_MAX_OUTPUT_TOKENS = 3_000;

function compactText(value: unknown, maxLength: number) {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 24)).trim()}...（已截断）`;
}

function readAttachmentText(attachment: OpenAIAdminIngestAttachment) {
  const slideTexts = (attachment.slideTexts ?? [])
    .map((slide) => typeof slide === "string" ? slide : slide.text)
    .filter((text): text is string => Boolean(text?.trim()))
    .join("\n");
  const pageSummaries = (attachment.pageSummaries ?? []).join("\n");

  return compactText(
    attachment.summary
      || attachment.extractedText
      || attachment.text
      || attachment.content
      || attachment.visibleText
      || pageSummaries
      || slideTexts
      || attachment.limitationNote
      || "仅收到文件元数据，未收到可解析正文。",
    COMPACT_FILE_SUMMARY_LIMIT
  );
}

function buildCompactGroundingContext(input: OpenAIAdminIngestInput) {
  const sections: string[] = [];
  const contextSummary = compactText(input.contextSummary, 1_600);
  const memoryContextText = compactText(input.memoryContextText, 1_400);
  const agentLearningInstruction = compactText(input.agentLearningInstruction, 900);
  const usedMemoryIds = Array.from(new Set(input.usedMemoryIds ?? []))
    .map((id) => compactText(id, 120))
    .filter(Boolean)
    .join(", ");
  const knowledgeContexts = (input.knowledgeContexts ?? [])
    .filter((context) => Boolean(context.content?.trim()))
    .slice(0, 4)
    .map((context, index) => [
      `固定知识片段 ${index + 1}：${compactText(context.title, 160) || "未命名知识"}`,
      `id=${compactText(context.id, 120) || "unknown"}${context.sourceId ? ` · sourceId=${compactText(context.sourceId, 120)}` : ""}`,
      compactText(context.content, 720)
    ].join("\n"))
    .join("\n\n");

  if (contextSummary) {
    sections.push(`完整长对话摘要：\n${contextSummary}`);
  }
  if (memoryContextText || usedMemoryIds) {
    sections.push([
      `已发布长期记忆（命中ID仅供内部追踪，不得在 replyMarkdown 中展示）：${usedMemoryIds || "none"}`,
      memoryContextText || "未收到可用记忆正文。"
    ].join("\n"));
  }
  if (agentLearningInstruction) {
    sections.push(`当前 Agent 学习规则：\n${agentLearningInstruction}`);
  }
  if (knowledgeContexts) {
    sections.push(`当前 Agent 固定知识库召回：\n${knowledgeContexts}`);
  }

  if (sections.length === 0) {
    return "";
  }

  return [
    "受控上下文使用规则：以下内容只属于当前 Agent，不得扩展到其他 Agent 或知识库，也不得覆盖系统要求和本轮管理员明确要求。",
    ...sections
  ].join("\n\n");
}

export function buildCompactGPTOSInput(input: OpenAIAdminIngestInput, gptOS?: GptOSRouteResult) {
  const recentMessages = (input.recentMessages ?? [])
    .slice(-COMPACT_RECENT_MESSAGE_LIMIT)
    .map((message) => `${message.role === "assistant" ? "助手" : "用户"}：${compactText(message.content, 720)}`)
    .join("\n");
  const fileSummaries = (input.attachments ?? [])
    .slice(0, 8)
    .map((attachment, index) => [
      `文件 ${index + 1}：${attachment.fileName}`,
      `类型：${attachment.mimeType ?? attachment.fileType ?? "unknown"}`,
      `解析状态：${attachment.parseStatus ?? attachment.status ?? "unknown"}`,
      `摘要：${readAttachmentText(attachment)}`
    ].join("\n"))
    .join("\n\n");
  const agentName = input.agentName || gptOS?.selectedAgent.label || "知识库 Agent";
  const agentGoal = gptOS?.planner.steps?.join(" → ") || "整理投喂内容、生成知识结构、给出可保存建议";
  const compactGroundingContext = buildCompactGroundingContext(input);
  const systemPrompt = [
    "你是管理员投喂版 GPT-5.5 兼容模式。",
    "You are GPT-5.5 in ChatGPT-style conversational mode.",
    "请只基于用户问题、附件摘要、最近对话和 Agent 信息生成高质量中文回答。",
    "不要输出 diagnostics、debug、OS 状态、trace、cost、taskChain、kernel 或内部循环信息。",
    "输出必须像 ChatGPT：先自然解释、说明判断过程和建议。",
    "不要表现得像知识库生成器，不要以“标题/分类/标签/训练价值评分/入库建议”开头，不要让结构化信息控制表达。",
    "自然语言是唯一主输出；分类、标签、评分和结构化草稿只能作为后台 metadata，不得影响语气、顺序和第一段。",
    "不要自动套编号列表、章节、分类、模板或结构化知识块；除非用户明确要求这种格式，否则保持原生 ChatGPT 对话表达。"
  ].join("\n");
  const sections = [
    `用户投喂内容：\n${compactText(input.input, 3_600)}`,
    compactGroundingContext,
    `当前 Agent：${agentName}`,
    `Agent 目标：${compactText(input.agentDescription || input.targetUser || agentGoal, 900)}`,
    `后台分类线索（仅 metadata，不控制主回复）：${input.category || "未分类"}`,
    fileSummaries ? `附件摘要（只保留摘要，不传原始大文件）：\n${fileSummaries}` : "附件摘要：无",
    recentMessages ? `最近对话（最多 3 轮）：\n${recentMessages}` : "最近对话：无",
    [
      "请完成：",
      "1. 先给出面向管理员的自然分析与总结，像正常 ChatGPT 回复一样开场。",
      "2. 说明你为什么这样拆、哪些内容值得沉淀、还缺什么信息。",
      "3. 如果需要入库，结构化字段只作为后台元数据理解，不要让它们主导主回复。",
      "4. 给出是否建议入库和原因。",
      "5. 不要使用技术错误提示，不要提及兼容模式，不要让结构化字段主导主回复。"
    ].join("\n")
  ].filter(Boolean);
  const rawUserPrompt = sections.join("\n\n");
  const userPrompt = compactText(rawUserPrompt, COMPACT_GPT_OS_INPUT_LIMIT);

  return {
    systemPrompt,
    userPrompt,
    requestSize: systemPrompt.length + userPrompt.length,
    attachmentCount: input.attachments?.length ?? 0,
    recentMessageCount: input.recentMessages?.length ?? 0
  };
}

function normalizeOpenAIResponseError(status: number, bodyText: string) {
  const lower = bodyText.toLowerCase();

  if (status === 401 || status === 403) {
    return new OpenAIResponsesError("OPENAI_API_KEY_MISSING", "AI服务授权暂不可用，请稍后再试。", { status });
  }

  if (status === 408 || lower.includes("timeout")) {
    return new OpenAIResponsesError("OPENAI_TIMEOUT", "AI响应较慢，请稍后再试。", { status });
  }

  if (status === 429 || lower.includes("quota") || lower.includes("rate limit")) {
    return new OpenAIResponsesError("OPENAI_RATE_LIMIT", "AI模型额度或频率暂不可用，请稍后再试。", { status });
  }

  if (status === 404 || lower.includes("model")) {
    return new OpenAIResponsesError("OPENAI_RESPONSES_REQUEST_FAILED", "AI模型暂时不稳定，请稍后再试。", { status });
  }

  return new OpenAIResponsesError("OPENAI_RESPONSES_REQUEST_FAILED", "AI暂时不稳定，请稍后再试。", { status });
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
  stream: boolean;
  maxOutputTokens?: number;
}) {
  return {
    model: input.model,
    instructions: input.systemPrompt,
    input: input.userPrompt,
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
    max_output_tokens: input.maxOutputTokens ?? 10000,
    stream: input.stream
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
  stream?: boolean;
  maxOutputTokens?: number;
  requestTimeoutMs?: number;
}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timeout = setTimeout(() => controller.abort(), input.requestTimeoutMs ?? REQUEST_TIMEOUT_MS);

  if (input.signal.aborted) {
    controller.abort();
  } else {
    input.signal.addEventListener("abort", abort, { once: true });
  }

  try {
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
        highDepth: input.highDepth,
        stream: input.stream ?? true,
        maxOutputTokens: input.maxOutputTokens
      })),
      signal: controller.signal,
      cache: "no-store"
    });
  } finally {
    clearTimeout(timeout);
    input.signal.removeEventListener("abort", abort);
  }
}

async function callResponsesApi(input: {
  responsesUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  signal: AbortSignal;
  highDepth?: boolean;
  stream?: boolean;
  maxOutputTokens?: number;
  requestTimeoutMs?: number;
  retries?: number;
  requestLabel?: string;
  compatibleModeUsed?: boolean;
  highQualityErrorCode?: string;
  highQualityErrorStatus?: number | null;
  highQualityRequestSize?: number;
  compatibleRequestSize?: number;
}) {
  let response: Response;
  let retryCount = 0;
  let responseLatency = 0;
  let circuitBreaker: "closed" | "open" = "closed";
  let retriedWithoutAdvancedParams = false;
  let streamFallbackUsed = false;
  let activeHighDepth = input.highDepth ?? true;
  const activeStream = input.stream ?? true;

  const firstCall = await withResilientLLMCall(`openai:responses:${input.requestLabel ?? "high-quality"}`, () => fetchResponsesWithBody({
      ...input,
      highDepth: activeHighDepth,
      stream: activeStream,
      maxOutputTokens: input.maxOutputTokens,
      requestTimeoutMs: input.requestTimeoutMs
    }), {
      retries: input.retries ?? 2,
      retryDelayMs: 500
    });

  response = firstCall.value;
  retryCount += firstCall.retryCount;
  responseLatency += firstCall.responseLatency;
  circuitBreaker = firstCall.circuitBreaker;

  let bodyText = "";

  if (!response.ok) {
    bodyText = await response.text();
  }

  if (!response.ok && isHighDepthParameterRejected(response.status, bodyText)) {
    retriedWithoutAdvancedParams = true;
    activeHighDepth = false;
    logger.warn("enterprise_admin_ingest.openai_high_depth_param_retry", {
      status: response.status,
      bodySnippet: bodyText.slice(0, 360)
    });
    const fallbackParamCall = await withResilientLLMCall("openai:responses:fallback-params", () => fetchResponsesWithBody({
        ...input,
        highDepth: false,
        stream: activeStream,
        maxOutputTokens: input.maxOutputTokens,
        requestTimeoutMs: input.requestTimeoutMs
      }), {
        retries: input.retries ?? 2,
        retryDelayMs: 500
      });

    response = fallbackParamCall.value;
    retryCount += fallbackParamCall.retryCount;
    responseLatency += fallbackParamCall.responseLatency;
    circuitBreaker = fallbackParamCall.circuitBreaker;
    bodyText = response.ok ? "" : await response.text();
  }

  if (!response.ok) {
    logger.warn("enterprise_admin_ingest.openai_request_failed", {
      status: response.status,
      bodySnippet: bodyText.slice(0, 480)
    });
    throw normalizeOpenAIResponseError(response.status, bodyText);
  }

  const commonDiagnostics = {
    compatibleModeUsed: input.compatibleModeUsed === true,
    retriedWithCompatibleRequest: input.compatibleModeUsed === true,
    highQualityErrorCode: input.highQualityErrorCode,
    highQualityErrorStatus: input.highQualityErrorStatus,
    highQualityRequestSize: input.highQualityRequestSize,
    compatibleRequestSize: input.compatibleRequestSize
  };

  if (activeStream && response.body) {
    try {
      return {
        ...await readResponsesStream(response, input.model, input.signal),
        retryCount,
        responseLatency,
        circuitBreaker,
        retriedWithoutAdvancedParams,
        streamFallbackUsed,
        ...commonDiagnostics
      };
    } catch (error) {
      const isParseFailure = error instanceof OpenAIResponsesError && error.code === "OPENAI_RESPONSES_PARSE_FAILED";

      if (!isParseFailure) {
        throw error;
      }

      streamFallbackUsed = true;
      logger.warn("enterprise_admin_ingest.openai_stream_parse_retry_non_stream", {
        model: input.model,
        message: error.message
      });

      const nonStreamCall = await withResilientLLMCall("openai:responses:non-stream", () => fetchResponsesWithBody({
          ...input,
          highDepth: activeHighDepth,
          stream: false,
          maxOutputTokens: input.maxOutputTokens,
          requestTimeoutMs: input.requestTimeoutMs
        }), {
          retries: input.retries ?? 2,
          retryDelayMs: 500
        });

      response = nonStreamCall.value;
      retryCount += nonStreamCall.retryCount;
      responseLatency += nonStreamCall.responseLatency;
      circuitBreaker = nonStreamCall.circuitBreaker;
      bodyText = response.ok ? "" : await response.text();

      if (!response.ok) {
        logger.warn("enterprise_admin_ingest.openai_non_stream_retry_failed", {
          status: response.status,
          bodySnippet: bodyText.slice(0, 480)
        });
        throw normalizeOpenAIResponseError(response.status, bodyText);
      }

      bodyText = await response.text();

      return {
        ...parseResponsesPayload(bodyText, input.model),
        retryCount,
        responseLatency,
        circuitBreaker,
        retriedWithoutAdvancedParams,
        streamFallbackUsed,
        ...commonDiagnostics
      };
    }
  }

  bodyText = await response.text();

  return {
    ...parseResponsesPayload(bodyText, input.model),
    retryCount,
    responseLatency,
    circuitBreaker,
    retriedWithoutAdvancedParams,
    streamFallbackUsed,
    ...commonDiagnostics
  };
}

function readStreamChunkWithAbort(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (signal.aborted) {
    return Promise.reject(new OpenAIResponsesError("OPENAI_TIMEOUT", "GPT 请求超时，请稍后重试。"));
  }

  return new Promise((resolve, reject) => {
    const abort = () => reject(new OpenAIResponsesError("OPENAI_TIMEOUT", "GPT 请求超时，请稍后重试。"));

    signal.addEventListener("abort", abort, { once: true });
    reader.read()
      .then(resolve)
      .catch(reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}

async function readResponsesStream(response: Response, fallbackModel: string, signal: AbortSignal) {
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
  let streamInterrupted = false;

  while (true) {
    let chunk: ReadableStreamReadResult<Uint8Array>;

    try {
      chunk = await readStreamChunkWithAbort(reader, signal);
    } catch (error) {
      if (error instanceof OpenAIResponsesError) {
        throw error;
      }

      streamInterrupted = true;
      logger.warn("enterprise_admin_ingest.openai_stream_recovery", {
        fallbackModel,
        partialLength: text.length,
        message: error instanceof Error ? error.message : String(error)
      });
      break;
    }

    const { done, value } = chunk;

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

  let completed: NormalizedLLMResponse | null = null;

  if (completedPayload) {
    try {
      completed = normalizeLLMResponse(completedPayload, {
        provider: "openai",
        fallbackModel
      });
    } catch {
      completed = null;
    }
  }
  const completedText = completed?.text ?? "";
  const finalText = text.trim() || completedText;
  const rawModel = completed?.model ?? model;
  const rawResponseId = completed?.responseId ?? responseId;
  const finalCreatedAt = (completed?.createdAt ?? createdAt) || new Date().toISOString();
  const finalUsage = completed?.usage ?? usage;

  if (!finalText) {
    throw new OpenAIResponsesError("OPENAI_RESPONSES_PARSE_FAILED", "OpenAI Responses API 未返回可解析文本。");
  }

  return {
    text: finalText,
    model: rawModel || fallbackModel,
    responseId: rawResponseId || createRecoveredResponseId("openai"),
    createdAt: finalCreatedAt,
    usage: finalUsage,
    rawResponseType: "responses" as GptOSApiResponseType,
    normalized: true as const,
    parserUsed: "gpt-os-api-adapter" as const,
    partial: streamInterrupted || !completedPayload || !rawResponseId || !rawModel
  };
}

function parseResponsesPayload(bodyText: string, fallbackModel: string) {
  let payload: unknown = null;

  try {
    payload = bodyText ? JSON.parse(bodyText) as unknown : null;
  } catch {
    throw new OpenAIResponsesError("OPENAI_RESPONSES_PARSE_FAILED", "OpenAI Responses API 返回解析失败。");
  }

  const normalized = normalizeLLMResponse(payload, {
    provider: "openai",
    fallbackModel,
    fallbackResponseId: createRecoveredResponseId("openai")
  });
  const text = normalized.text;
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const model = normalized.model ?? "";
  const responseId = normalized.responseId ?? "";

  if (!text) {
    throw new OpenAIResponsesError("OPENAI_RESPONSES_PARSE_FAILED", "OpenAI Responses API 未返回可解析文本。");
  }

  return {
    text,
    model: model || fallbackModel,
    responseId,
    createdAt: normalized.createdAt ?? normalizeCreatedAt(record.created_at) ?? new Date().toISOString(),
    usage: normalized.usage ?? normalizeUsage(record.usage),
    rawResponseType: normalized.rawResponseType,
    normalized: normalized.normalized,
    parserUsed: normalized.parserUsed,
    partial: normalized.partial ?? false
  };
}

function readOpenAIErrorCode(error: unknown) {
  return error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : "UNKNOWN_OPENAI_ERROR";
}

function readOpenAIErrorStatus(error: unknown) {
  return error && typeof error === "object" && typeof (error as { details?: { status?: unknown } }).details?.status === "number"
    ? (error as { details: { status: number } }).details.status
    : null;
}

function shouldRetryWithCompatibleRequest(error: unknown) {
  if (error && typeof error === "object" && (error as { name?: unknown }).name === "AbortError") {
    return true;
  }

  const code = readOpenAIErrorCode(error);

  return [
    "OPENAI_RESPONSES_REQUEST_FAILED",
    "OPENAI_RESPONSES_PARSE_FAILED",
    "OPENAI_RATE_LIMIT",
    "OPENAI_TIMEOUT",
    "UNKNOWN_OPENAI_ERROR"
  ].includes(code);
}

function buildFullRequestFailure(input: {
  highQualityError: unknown;
  compatibleError: unknown;
  highQualityRequestSize: number;
  compatibleRequestSize: number;
}) {
  const highQualityErrorCode = readOpenAIErrorCode(input.highQualityError);
  const compatibleErrorCode = readOpenAIErrorCode(input.compatibleError);
  const highQualityErrorStatus = readOpenAIErrorStatus(input.highQualityError);
  const compatibleErrorStatus = readOpenAIErrorStatus(input.compatibleError);

  return new OpenAIResponsesError(
    "OPENAI_FULL_REQUEST_FAILED",
    "AI服务暂时未完成，请稍后重试。",
    {
      status: compatibleErrorStatus ?? highQualityErrorStatus,
      highQualityErrorCode,
      compatibleErrorCode,
      diagnostics: {
        highQualityErrorCode,
        compatibleErrorCode,
        highQualityErrorStatus,
        compatibleErrorStatus,
        highQualityRequestSize: input.highQualityRequestSize,
        compatibleRequestSize: input.compatibleRequestSize,
        retriedWithCompatibleRequest: true
      }
    }
  );
}

async function callResponsesApiWithCompatibleFallback(input: {
  responsesUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  compactSystemPrompt: string;
  compactUserPrompt: string;
  signal: AbortSignal;
  highQualityRequestSize: number;
  compatibleRequestSize: number;
}) {
  try {
    return await callResponsesApi({
      responsesUrl: input.responsesUrl,
      apiKey: input.apiKey,
      model: input.model,
      systemPrompt: input.systemPrompt,
      userPrompt: input.userPrompt,
      signal: input.signal,
      highDepth: true,
      stream: false,
      maxOutputTokens: 10000,
      requestTimeoutMs: HIGH_QUALITY_REQUEST_TIMEOUT_MS,
      retries: 0,
      requestLabel: "high-quality",
      highQualityRequestSize: input.highQualityRequestSize,
      compatibleRequestSize: input.compatibleRequestSize
    });
  } catch (highQualityError) {
    if (!shouldRetryWithCompatibleRequest(highQualityError)) {
      throw highQualityError;
    }

    const highQualityErrorCode = readOpenAIErrorCode(highQualityError);
    const highQualityErrorStatus = readOpenAIErrorStatus(highQualityError);

    logger.warn("enterprise_admin_ingest.openai_compatible_request_retry", {
      model: input.model,
      highQualityErrorCode,
      highQualityErrorStatus,
      highQualityRequestSize: input.highQualityRequestSize,
      compatibleRequestSize: input.compatibleRequestSize
    });

    try {
      return await callResponsesApi({
        responsesUrl: input.responsesUrl,
        apiKey: input.apiKey,
        model: input.model,
        systemPrompt: input.compactSystemPrompt,
        userPrompt: input.compactUserPrompt,
        signal: input.signal,
        highDepth: false,
        stream: false,
        maxOutputTokens: COMPATIBLE_MAX_OUTPUT_TOKENS,
        requestTimeoutMs: COMPATIBLE_REQUEST_TIMEOUT_MS,
        retries: 1,
        requestLabel: "compatible",
        compatibleModeUsed: true,
        highQualityErrorCode,
        highQualityErrorStatus,
        highQualityRequestSize: input.highQualityRequestSize,
        compatibleRequestSize: input.compatibleRequestSize
      });
    } catch (compatibleError) {
      logger.warn("enterprise_admin_ingest.openai_full_request_failed", {
        model: input.model,
        highQualityErrorCode,
        compatibleErrorCode: readOpenAIErrorCode(compatibleError),
        highQualityErrorStatus,
        compatibleErrorStatus: readOpenAIErrorStatus(compatibleError),
        highQualityRequestSize: input.highQualityRequestSize,
        compatibleRequestSize: input.compatibleRequestSize
      });
      throw buildFullRequestFailure({
        highQualityError,
        compatibleError,
        highQualityRequestSize: input.highQualityRequestSize,
        compatibleRequestSize: input.compatibleRequestSize
      });
    }
  }
}

export async function runOpenAIAdminIngest(input: OpenAIAdminIngestInput): Promise<OpenAIAdminIngestResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const resolved = resolveResponsesConfig(input);
    const gptOS = routeGptOSAgent(buildGptOSRouteInput(input));
    const systemPrompt = buildGptIngestBrainSystemPrompt();
    const userPrompt = buildUserPrompt(input, gptOS);
    const compactInput = buildCompactGPTOSInput(input, gptOS);

    let response = await callResponsesApiWithCompatibleFallback({
      responsesUrl: resolved.responsesUrl,
      apiKey: resolved.apiKey,
      model: resolved.model,
      systemPrompt,
      userPrompt,
      compactSystemPrompt: compactInput.systemPrompt,
      compactUserPrompt: compactInput.userPrompt,
      signal: controller.signal,
      highQualityRequestSize: systemPrompt.length + userPrompt.length,
      compatibleRequestSize: compactInput.requestSize
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

    while ((!normalized || !quality.ok) && !response.compatibleModeUsed && deepenAttempts < 2) {
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
      const deepenPrompt = buildGptProRetryDeepenPrompt({
        originalUserPrompt: userPrompt,
        firstReplyMarkdown: normalized?.replyMarkdown ?? response.text,
        quality
      });

      response = await callResponsesApiWithCompatibleFallback({
        responsesUrl: resolved.responsesUrl,
        apiKey: resolved.apiKey,
        model: resolved.model,
        systemPrompt,
        userPrompt: deepenPrompt,
        compactSystemPrompt: compactInput.systemPrompt,
        compactUserPrompt: compactInput.userPrompt,
        signal: controller.signal,
        highQualityRequestSize: systemPrompt.length + deepenPrompt.length,
        compatibleRequestSize: compactInput.requestSize
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
        throw new OpenAIResponsesError("OPENAI_RESPONSES_PARSE_FAILED", "GPT-5.5 未返回可保存的 replyMarkdown。");
      }
    }

    if (!quality.ok) {
      qualitySoftAccepted = Boolean(normalized.replyMarkdown.trim());
      logger.warn("enterprise_admin_ingest.openai_quality_soft_accept", {
        requestId: input.requestId,
        model: response.model,
        responseId: response.responseId,
        chineseCharCount: quality.chineseCharCount,
        failedReasons: quality.failedReasons,
        replyLength: normalized.replyMarkdown.length
      });
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
      qualityPassed: quality.ok || qualitySoftAccepted,
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
      retriedWithCompatibleRequest: response.retriedWithCompatibleRequest,
      compatibleModeUsed: response.compatibleModeUsed
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
      suggestedQuestions: unique([
        ...normalized.suggestedQuestions,
        ...gptOS.actions.map((action) => action.label)
      ]).slice(0, 8),
      sourceFiles: (input.attachments ?? []).map((attachment) => ({
        fileName: attachment.fileName,
        mimeType: attachment.mimeType ?? attachment.fileType,
        parseStatus: attachment.parseStatus,
        limitationNote: attachment.limitationNote
      })),
      saveRecommendation: normalized.saveRecommendation,
      diagnostics: [
        "apiResilience:provider:openai",
        `apiResilience:normalized:${response.normalized ? "true" : "false"}`,
        `apiResilience:parserUsed:${response.parserUsed}`,
        `apiResilience:rawResponseType:${response.rawResponseType}`,
        `apiResilience:retryCount:${response.retryCount}`,
        `apiResilience:retriedWithoutAdvancedParams:${response.retriedWithoutAdvancedParams ? "true" : "false"}`,
        `apiResilience:retriedWithCompatibleRequest:${response.retriedWithCompatibleRequest ? "true" : "false"}`,
        `apiResilience:compatibleModeUsed:${response.compatibleModeUsed ? "true" : "false"}`,
        `apiResilience:highQualityErrorCode:${response.highQualityErrorCode ?? "none"}`,
        `apiResilience:highQualityErrorStatus:${response.highQualityErrorStatus ?? "none"}`,
        `apiResilience:highQualityRequestSize:${response.highQualityRequestSize ?? systemPrompt.length + userPrompt.length}`,
        `apiResilience:compatibleRequestSize:${response.compatibleRequestSize ?? compactInput.requestSize}`,
        `apiResilience:compactAttachments:${compactInput.attachmentCount}`,
        `apiResilience:compactRecentMessages:${compactInput.recentMessageCount}`,
        `apiResilience:fallbackUsed:false`,
        `apiResilience:qualitySoftAccepted:${qualitySoftAccepted ? "true" : "false"}`,
        `apiResilience:streamFallbackUsed:${response.streamFallbackUsed ? "true" : "false"}`,
        `apiResilience:responseLatency:${response.responseLatency}`,
        `apiResilience:circuitBreaker:${response.circuitBreaker}`,
        `apiResilience:streamRecovered:${response.partial ? "true" : "false"}`,
        `observability:traceId:${gptOS.observability.trace.traceId}`,
        `observability:requestId:${gptOS.observability.trace.requestId}`,
        `observability:latency:${gptOS.observability.latency.totalLatencyMs}`,
        `observability:slowestStage:${gptOS.observability.latency.slowestStage?.name ?? "none"}`,
        `observability:cost:${gptOS.observability.cost.totalCost}`,
        `observability:tokens:${gptOS.observability.cost.total_tokens}`,
        `observability:modelUsed:${response.model}`,
        `observability:fallbackCount:${gptOS.observability.fallback.fallbackCount}`,
        `observability:agent:${gptOS.observability.agent.selectedAgentId}`,
        `observability:toolChain:${gptOS.observability.tools.toolChain.join("|") || "none"}`,
        `gptOS:plannerIntent:${gptOS.planner.intent}`,
        `gptOS:complexity:${gptOS.planner.complexity}`,
        `gptOS:modality:${gptOS.multimodal.modality}`,
        `gptOS:modalities:text=${gptOS.multimodal.flags.text},voice=${gptOS.multimodal.flags.voice},file=${gptOS.multimodal.flags.file},image=${gptOS.multimodal.flags.image}`,
        `gptOS:persona:${gptOS.memory.personaLabel}`,
        `gptOS:agent:${gptOS.selectedAgent.id}`,
        `gptOS:loopStatus:${gptOS.reasoningLoop.loopStatus}`,
        `gptOS:loopIterations:${gptOS.reasoningLoop.iterations}`,
        `gptOS:loopConfidence:${gptOS.reasoningLoop.confidence}`,
        `gptOS:selfScore:${gptOS.reasoningLoop.selfEvaluation.totalScore}`,
        `gptOS:improvementStatus:${gptOS.reasoningLoop.improvementStatus}`,
        `gptOS:goal:${gptOS.goal.goalKey}`,
        `gptOS:agentEvolution:${gptOS.agentEvolution.performanceHint}`,
        `gptOS:actions:${gptOS.actions.map((action) => action.label).join("|")}`,
        `gptOS:autonomousStatus:${gptOS.autonomousResult.status}`,
        `gptOS:autonomousMode:${gptOS.autonomousResult.mode}`,
        `gptOS:approvalRequired:${gptOS.autonomousResult.approvalRequired ? "true" : "false"}`,
        `gptOS:blockedActions:${gptOS.autonomousResult.blockedActions.join("|")}`,
        `gptOS:taskChainStatus:${gptOS.taskChain.status}`,
        `gptOS:taskChainProgress:${Math.round(gptOS.taskChain.progress * 100)}`,
        `gptOS:taskChainCompleted:${gptOS.taskChain.completedSteps}/${gptOS.taskChain.steps.length}`,
        `gptOS:schedulerQueue:${gptOS.executionScheduler.queue.length}`,
        `gptOS:kernelLoop:${gptOS.kernel.loopState}`,
        `gptOS:kernelQueue:${gptOS.kernel.resourceUsage.queueLength}`,
        `gptOS:kernelWorkerTicks:${gptOS.kernel.backgroundWorker.ticks}`,
        `gptOS:kernelTuning:${gptOS.kernel.selfTuning.status}`,
        `gptOS:businessType:${gptOS.business.content.type}`,
        `gptOS:businessValueScore:${gptOS.business.content.valueScore}`,
        `gptOS:monetizationPotential:${gptOS.business.monetizationPotential}`,
        `gptOS:revenueReadiness:${gptOS.business.revenueReadiness}`,
        `gptOS:growthPotential:${gptOS.growth.growthPotential}`,
        `gptOS:growthLifecycle:${gptOS.growth.lifecycle.currentStage}`,
        `gptOS:growthValueAfter:${gptOS.growth.contentValueAfter}`,
        `gptOS:growthSeoScore:${gptOS.growth.amplifier.seoScore}`,
        `gptOS:growthReuseCount:${gptOS.growth.reuse.reuseCount}`,
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
      throw new OpenAIResponsesError("OPENAI_TIMEOUT", "GPT 请求超时，请稍后重试。");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
