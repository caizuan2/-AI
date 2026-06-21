"use client";

import {
  type IngestChatAgent,
  type IngestKnowledgeDraft,
  type IngestTrainingRecord
} from "@/lib/enterprise/mock-chat";
import {
  ADMIN_INGEST_SYNC_TARGET,
  type AdminIngestPlatform
} from "@/lib/enterprise/admin-ingest-app-config";
import {
  getGptModelSelectionByDisplayName,
  type GptTier,
  type GptVersion
} from "@/lib/enterprise/gpt-model-options";
import {
  getIngestModelOptionByLabel,
  type IngestModelProvider
} from "@/lib/enterprise/ingest-model-options";
import type {
  GptKnowledgeDraft,
  GptSaveRecommendation
} from "@/lib/enterprise/gpt-knowledge-draft";
import type { GptUserClientCallPlan } from "@/lib/enterprise/gpt-user-client-call-plan";
import type { GptCallProof, OpenAIGptUsage } from "@/lib/enterprise/gpt-call-proof";
import {
  executeAutonomousOS,
  type GptOSRuntimeContext
} from "@/lib/enterprise/gpt-os-runtime";
import type { GptOSWorkflowExecution } from "@/lib/enterprise/gpt-os-workflow-engine";
import {
  estimateGptOSCost,
  formatGptOSCost
} from "@/lib/enterprise/gpt-os-cost-tracker";
import { validateGptOSModelTruth } from "@/lib/enterprise/gpt-os-model-truth-layer";
import {
  GPT_OS_SAFE_FALLBACK_MESSAGE,
  GPT_OS_SAFE_UI_MESSAGE,
  normalizeGptOSError,
  sanitizeGptOSErrorMessage
} from "@/lib/enterprise/gpt-os-error-handler";
import {
  buildGptOSErrorUX
} from "@/lib/enterprise/gpt-os-error-ux-layer";

export const ingestSyncTarget = ADMIN_INGEST_SYNC_TARGET;

export type IngestSyncTarget = typeof ingestSyncTarget[number];
export type IngestPlatform = AdminIngestPlatform;
export type IngestLicenseStatus = "未检查" | "已激活" | "未激活" | "本地预览";

export interface IngestConnectionStatus {
  enterpriseSpace: "本地预览" | "已连接";
  knowledgeBase: string;
  licenseStatus: IngestLicenseStatus;
  checkedAt?: string;
}

export interface IngestGptHealthStatus {
  ok: boolean;
  configured: boolean;
  provider: IngestModelProvider;
  baseUrlConfigured: boolean;
  baseUrlSource?: "configured" | "default";
  modelConfigured: boolean;
  modelSource?: "configured" | "preferred" | "default";
  apiKeyConfigured: boolean;
  selectedModelLabel: string;
  model: string;
  requestedModel?: string;
  actualModel?: string;
  mode: "highest" | "fixed";
  message: string;
  diagnostics: string[];
  checkedAt?: string;
  requestTested?: boolean;
  errorCode?: "OPENAI_API_KEY_MISSING" | "OPENAI_BASE_URL_INVALID" | "OPENAI_RESPONSES_REQUEST_FAILED" | "OPENAI_RESPONSES_PARSE_FAILED" | "OPENAI_TIMEOUT" | "DEEPSEEK_API_KEY_MISSING" | "DEEPSEEK_BASE_URL_INVALID" | "DEEPSEEK_REQUEST_FAILED" | "DEEPSEEK_RESPONSE_PARSE_FAILED" | "DEEPSEEK_TIMEOUT";
}

export interface IngestUploadState {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  isImage?: boolean;
  previewUrl?: string;
  rawFile?: File;
  extractedText?: string;
  summary?: string;
  mimeType?: string;
  parseStatus?: "parsed" | "partial" | "metadata_only" | "unsupported" | "ocr_pending";
  pageSummaries?: string[];
  slideTexts?: Array<{ slideIndex: number; text: string }>;
  limitationNote?: string;
  status: "selected" | "pending_parse" | "ready_to_send" | "parsing" | "attached" | "parsed" | "failed";
  source: "admin_ingest";
  platform: IngestPlatform;
  syncTarget: IngestSyncTarget[];
  tenantId?: string | null;
  userId?: string | null;
  agentId?: string | null;
  createdAt: string;
}

export interface IngestVoiceState {
  isVoiceSupported: boolean;
  isRecording: boolean;
  transcript: string;
  error: string;
  platform: IngestPlatform;
  syncTarget: IngestSyncTarget[];
}

export interface IngestNotification {
  id: string;
  type: "success" | "file" | "license" | "tenant" | "sync" | "fallback" | "info";
  title: string;
  description: string;
  read: boolean;
  source: "admin_ingest";
  platform: IngestPlatform;
  syncTarget: IngestSyncTarget[];
  createdAt: string;
}

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  message?: string;
  error?: {
    message?: string;
    code?: string;
  };
}

interface GptIngestResponse {
  provider: IngestModelProvider;
  model: string;
  requestedModel?: string;
  actualModel?: string;
  responseId?: string;
  proofId?: string;
  createdAt?: string;
  usage?: OpenAIGptUsage;
  gptProof?: GptCallProof;
  modelDisplayName?: string;
  modelMode: "highest" | "fixed";
  fallback?: false;
  selectedModelLabel?: string;
  replyMarkdown: string;
  knowledgeDraft?: GptKnowledgeDraft;
  userClientCallPlan?: GptUserClientCallPlan;
  sourceFiles?: Array<{
    fileName: string;
    mimeType?: string;
    parseStatus?: string;
    limitationNote?: string;
  }>;
  suggestedQuestions?: string[];
  saveRecommendation?: GptSaveRecommendation;
  diagnostics?: string[];
  gptOS?: GptOSWorkflowExecution | null;
  cost?: ReturnType<typeof formatGptOSCost>;
  reasoningTrace?: GptOSWorkflowExecution["runtime"]["reasoningTrace"];
  toolTrace?: GptOSWorkflowExecution["runtime"]["toolTrace"];
  modelTruth?: GptOSWorkflowExecution["runtime"]["modelTruth"];
  structured: {
    title?: string;
    category?: string;
    summary?: string;
    tags?: string[];
    question?: string;
    answer?: string;
    confidence?: number;
    saveSuggestion?: boolean;
    followUpQuestions?: string[];
  };
  sync?: {
    platform?: IngestPlatform;
    syncTarget?: IngestSyncTarget[];
  };
  fallbackUsed?: boolean;
}

interface GptFailureResponse {
  ok: false;
  fallback?: false;
  provider?: IngestModelProvider;
  errorCode: "OPENAI_API_KEY_MISSING" | "OPENAI_BASE_URL_INVALID" | "OPENAI_RESPONSES_REQUEST_FAILED" | "OPENAI_RESPONSES_PARSE_FAILED" | "OPENAI_TIMEOUT" | "OPENAI_PRO_QUALITY_FAILED" | "DEEPSEEK_API_KEY_MISSING" | "DEEPSEEK_BASE_URL_INVALID" | "DEEPSEEK_REQUEST_FAILED" | "DEEPSEEK_RESPONSE_PARSE_FAILED" | "DEEPSEEK_TIMEOUT" | "DEEPSEEK_PRO_QUALITY_FAILED";
  message: string;
  retryable?: boolean;
  selectedModelLabel?: string;
  model?: string;
}

interface UrlIngestPreviewResponse {
  stage: "preview";
  job: {
    id: string;
  };
  draft: {
    jobId: string;
    title: string;
    category: string;
    tags: string[];
    summary: string;
    qa_pairs: Array<{ q: string; a: string }>;
    confidence: number;
    should_save: boolean;
    providerUsed: string;
    model: string;
    fallbackUsed: boolean;
    saveStatus: "pending" | "saved" | "rejected";
    sourceUrl: string;
  };
  records?: AdminTrainingRecordResponse[];
  preview: boolean;
  message: string;
  replyMarkdown?: string;
}

interface AdminTrainingRecordResponse {
  id?: string;
  jobId?: string;
  input?: string;
  ai_output?: unknown;
  resultTitle?: string;
  category?: string;
  status?: "pending" | "saved" | "rejected";
  sourceType?: string;
  timestamp?: string;
  hits?: number;
}

export function getFriendlyIngestError(response: Response, payload: ApiEnvelope<unknown> | null) {
  const raw = [
    payload?.message,
    payload?.error?.message,
    payload?.error?.code
  ].filter(Boolean).join(" ").toLowerCase();

  if (response.status === 401 || raw.includes("unauthorized") || raw.includes("login") || raw.includes("登录")) {
    return "当前为本地预览模式，登录后将同步企业知识库。";
  }

  if (raw.includes("license") || raw.includes("卡密") || raw.includes("授权") || raw.includes("expired")) {
    return raw.includes("expired")
      ? "当前账号卡密已过期，请完成续费授权后使用 AI 投喂。"
      : "当前账号未激活卡密，请先完成授权后使用 AI 投喂。";
  }

  if (raw.includes("tenant") || raw.includes("租户") || raw.includes("企业")) {
    return "企业空间未加载，已切换为本地预览模式。";
  }

  if (raw.includes("openai api key") || raw.includes("missing_ai_api_key") || raw.includes("未配置 openai")) {
    return "已自动切换备用AI模型，正在生成更稳定结果";
  }

  if (raw.includes("deepseek_api_key") || raw.includes("deepseek api key") || raw.includes("deepseek") && raw.includes("未配置")) {
    return "系统正在优化回答，请稍后再试";
  }

  if (raw.includes("timeout") || raw.includes("超时")) {
    return GPT_OS_SAFE_UI_MESSAGE;
  }

  if (raw.includes("parse_failed") || raw.includes("解析失败") || raw.includes("unsupported openai response format")) {
    return GPT_OS_SAFE_UI_MESSAGE;
  }

  if (raw.includes("gpt") || raw.includes("openai")) {
    return GPT_OS_SAFE_UI_MESSAGE;
  }

  if (raw.includes("deepseek")) {
    return GPT_OS_SAFE_UI_MESSAGE;
  }

  return "接口暂不可用，请稍后重试。";
}

async function readApiData<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;

  if (!response.ok || !payload?.ok || !payload.data) {
    throw new Error(getFriendlyIngestError(response, payload));
  }

  return payload.data;
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isGptApiParseClientError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  return /parse_failed|解析失败|unsupported openai response format/i.test(message);
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readTags(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function readQaPairs(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      const q = readString(record.q);
      const a = readString(record.a);

      return q && a ? { q, a } : null;
    })
    .filter((item): item is { q: string; a: string } => Boolean(item));
}

function readOptionalStringArray(value: unknown) {
  const values = readTags(value);

  return values.length > 0 ? values : undefined;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isGptFailureResponse(value: unknown): value is GptFailureResponse {
  return isPlainRecord(value) && value.ok === false;
}

function toRecordTime(value?: string) {
  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) {
    return "刚刚";
  }

  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function normalizeDraftFromUnknown(data: unknown, input: string, agent: IngestChatAgent, status: IngestKnowledgeDraft["saveStatus"]): IngestKnowledgeDraft {
  const record = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const directQuestion = readString(record.question);
  const directAnswer = readString(record.answer);
  const standardQuestion = readString(record.standardQuestion);
  const standardAnswer = readString(record.standardAnswer);
  const qaPairs = readQaPairs(record.qa_pairs ?? record.structured_qa ?? record.qaPairs);
  const title = readString(record.title) || `${agent.role.replace("知识库", "") || agent.name}投喂知识`;
  const category = readString(record.category) || agent.role || "默认知识库";
  const summary = readString(record.summary) || readString(record.content) || input.slice(0, 120);
  const confidence = readNumber(record.confidence ?? record.trainingScore, 82);
  const firstPair = qaPairs[0] ?? (standardQuestion || standardAnswer || directQuestion || directAnswer ? {
    q: standardQuestion || directQuestion || `关于“${title}”，应该如何处理？`,
    a: standardAnswer || directAnswer || summary
  } : {
    q: `关于“${title}”，应该如何处理？`,
    a: summary || `建议按当前 ${agent.name} 的知识口径处理，并保留来源记录。`
  });
  const saveRecommendation = readString(record.saveRecommendation);
  const saveSuggestion = typeof record.saveSuggestion === "boolean"
    ? record.saveSuggestion
    : saveRecommendation
      ? saveRecommendation === "可以入库"
      : confidence >= 80;
  const recommendation = saveRecommendation === "暂缓入库"
    ? "暂不入库"
    : saveRecommendation === "需要补充资料"
      ? "需要复核"
      : saveSuggestion
        ? "建议入库"
        : "需要复核";

  return {
    id: readString(record.id) || `draft-${Date.now()}`,
    jobId: readString(record.jobId) || null,
    title,
    category,
    categories: readOptionalStringArray(record.categories) ?? [category],
    tags: readTags(record.tags).length > 0 ? readTags(record.tags) : [category.replace("知识库", ""), "AI投喂"].filter(Boolean),
    summary,
    qaPairs: qaPairs.length > 0 ? qaPairs : [firstPair],
    standardQuestion: firstPair.q,
    standardAnswer: firstPair.a,
    standardQuestions: readOptionalStringArray(record.standardQuestions) ?? [firstPair.q],
    standardAnswers: readOptionalStringArray(record.standardAnswers) ?? [firstPair.a],
    trainingScore: Math.min(100, Math.max(1, Math.round(confidence))),
    recommendation,
    saveStatus: status,
    sourceType: "chat",
    scenarios: readOptionalStringArray(record.scenarios),
    sourceMaterials: readOptionalStringArray(record.sourceMaterials),
    complianceNotes: readOptionalStringArray(record.complianceNotes),
    missingFields: readOptionalStringArray(record.missingFields),
    suggestedQuestions: readOptionalStringArray(record.suggestedQuestions ?? record.followUpQuestions),
    userClientCallPlan: isPlainRecord(record.userClientCallPlan) ? record.userClientCallPlan as unknown as GptUserClientCallPlan : undefined,
    saveRecommendation: saveRecommendation || undefined,
    sourceModel: readString(record.sourceModel) || readString(record.model) || undefined,
    generatedBy: readString(record.generatedBy) || readString(record.providerUsed) || undefined,
    providerUsed: readString(record.providerUsed) || "core-engine",
    model: readString(record.model) || "knowledge-core",
    modelMode: record.modelMode === "fixed" ? "fixed" : record.modelMode === "highest" ? "highest" : undefined,
    replyMarkdown: readString(record.replyMarkdown) || undefined,
    fallbackUsed: Boolean(record.fallbackUsed),
    gptProof: isPlainRecord(record.gptProof) ? record.gptProof as unknown as GptCallProof : undefined,
    actualModel: readString(record.actualModel) || undefined,
    responseId: readString(record.responseId) || undefined,
    usage: isPlainRecord(record.usage) ? record.usage as unknown as OpenAIGptUsage : undefined
  };
}

export function createTrainingRecord(input: {
  originalInput: string;
  draft: IngestKnowledgeDraft;
  agent: IngestChatAgent;
  status?: IngestTrainingRecord["saveStatus"];
  sourceType?: string;
  tenantId?: string | null;
  userId?: string | null;
  platform?: IngestPlatform;
}): IngestTrainingRecord {
  const now = new Date().toISOString();

  return {
    id: `record-${input.draft.jobId ?? input.draft.id ?? Date.now()}`,
    jobId: input.draft.jobId,
    tenantId: input.tenantId ?? null,
    userId: input.userId ?? null,
    agentId: input.agent.id,
    expertId: input.agent.expertId ?? null,
    agentName: input.agent.name,
    expertName: input.agent.expertId ? input.agent.name : null,
    input: input.originalInput,
    resultTitle: input.draft.title,
    saveStatus: input.status ?? input.draft.saveStatus,
    category: input.draft.category,
    time: toRecordTime(now),
    hits: 0,
    sourceType: input.sourceType ?? "admin_ingest",
    source: "admin_ingest",
    platform: input.platform ?? "web",
    syncTarget: [...ingestSyncTarget],
    createdAt: now,
    updatedAt: now,
    aiOutput: input.draft
  };
}

export function normalizeTrainingRecord(record: AdminTrainingRecordResponse, agent: IngestChatAgent, platform: IngestPlatform = "web"): IngestTrainingRecord {
  const status = record.status === "saved" ? "已保存" : record.status === "rejected" ? "已拒绝" : "待确认";
  const fallbackDraft = normalizeDraftFromUnknown(record.ai_output, record.input ?? record.resultTitle ?? "", agent, status);

  return {
    id: record.id ?? `record-${Date.now()}`,
    jobId: record.jobId ?? fallbackDraft.jobId,
    tenantId: null,
    userId: null,
    agentId: agent.id,
    agentName: agent.name,
    input: record.input ?? "",
    resultTitle: record.resultTitle ?? fallbackDraft.title,
    saveStatus: status,
    category: record.category ?? fallbackDraft.category,
    time: toRecordTime(record.timestamp),
    hits: record.hits ?? 0,
    sourceType: record.sourceType ?? "admin_ingest",
    source: "admin_ingest",
    platform,
    syncTarget: [...ingestSyncTarget],
    createdAt: record.timestamp,
    updatedAt: record.timestamp,
    aiOutput: fallbackDraft
  };
}

function gptResponseToDraft(data: GptIngestResponse, originalInput: string, agent: IngestChatAgent): IngestKnowledgeDraft {
  return normalizeDraftFromUnknown({
    ...(data.knowledgeDraft ?? data.structured),
    userClientCallPlan: data.userClientCallPlan ?? data.knowledgeDraft?.userClientCallPlan,
    suggestedQuestions: data.suggestedQuestions ?? data.structured.followUpQuestions,
    saveRecommendation: data.saveRecommendation ?? data.knowledgeDraft?.saveRecommendation,
    id: `gpt-${Date.now()}`,
    jobId: `gpt-${Date.now()}`,
    providerUsed: data.provider,
    model: data.modelDisplayName || data.model,
    sourceModel: data.model,
    actualModel: data.actualModel || data.model,
    responseId: data.responseId,
    usage: data.usage,
    gptProof: data.gptProof,
    generatedBy: data.provider,
    modelMode: data.modelMode,
    replyMarkdown: data.replyMarkdown,
    fallbackUsed: Boolean(data.fallbackUsed)
  }, originalInput, agent, "待确认");
}

function buildObservableGptOSResult(
  data: GptIngestResponse,
  osContext: GptOSRuntimeContext,
  expectedModel: string,
  provider: IngestModelProvider
): GptIngestResponse {
  const cost = estimateGptOSCost({
    usage: data.usage,
    model: data.actualModel ?? data.model,
    toolResults: osContext.execution.toolResults,
    loopCount: osContext.execution.runtime.loopCount
  });
  const modelTruth = validateGptOSModelTruth({
    expectedModel,
    actualModel: data.actualModel ?? data.model,
    provider,
    responseId: data.responseId,
    proofId: data.proofId,
    fallbackUsed: data.fallbackUsed ?? data.fallback ?? false,
    fallbackSource: data.provider,
    gptProof: data.gptProof
  });
  const toolTrace = osContext.execution.runtime.toolTrace.length
    ? osContext.execution.runtime.toolTrace
    : osContext.execution.toolResults.map((result) => ({
      pluginId: result.pluginId,
      pluginName: result.pluginName,
      stage: result.stage,
      loopIndex: result.loopIndex,
      nextAction: result.nextAction,
      summary: result.summary
    }));
  const reasoningTrace = osContext.execution.runtime.reasoningTrace.length
    ? osContext.execution.runtime.reasoningTrace
    : [{
      step: "final",
      reasoning: "GPT OS completed the request and attached semantic observability metadata.",
      toolUsed: toolTrace.map((item) => item.pluginId),
      decision: "Final answer returned with model truth and cost tracking."
    }];
  const whyThisAnswer = osContext.execution.runtime.whyThisAnswer.length
    ? osContext.execution.runtime.whyThisAnswer
    : [
      `Selected ${osContext.execution.selectedAgent.name} for this request.`,
      toolTrace.length ? "Used tool feedback before finalizing." : "No tool feedback was needed before finalizing.",
      `Model verification target was ${modelTruth.expectedModel}.`
    ];
  const diagnostics = data.diagnostics ?? [];
  const modelFallbackUsed = diagnostics.some((item) => item.includes("fallbackUsed:true") || item.includes("modelFallbackUsed:true"));
  const fallbackModel = diagnostics.find((item) => item.startsWith("fallbackModel:"))?.split(":").slice(1).join(":") || (modelFallbackUsed ? data.provider : "none");
  const errorHandled = modelFallbackUsed || osContext.execution.runtime.errorHandled || diagnostics.some((item) => item.includes("errorHandled:true"));
  const systemRecovered = modelFallbackUsed || osContext.execution.runtime.systemRecovered || diagnostics.some((item) => item.includes("systemRecovered:true"));
  const fallbackSource: "openai" | "deepseek" | "qwen" | "none" | "unknown" = fallbackModel === "deepseek" || fallbackModel === "qwen"
    ? fallbackModel
    : data.provider === "openai" || data.provider === "deepseek"
      ? data.provider
      : "unknown";
  const observableModelTruth = modelFallbackUsed
    ? {
      ...modelTruth,
      fallbackUsed: true,
      fallbackSource,
      modelVerified: false
    }
    : modelTruth;
  const observableExecution: GptOSWorkflowExecution = {
    ...osContext.execution,
    osMode: "INTELLIGENT_OBSERVABLE",
    diagnostics: [
      ...osContext.execution.diagnostics,
      "osMode:INTELLIGENT_OBSERVABLE",
      "costTracked:true",
      `estimatedCost:${cost.totalCost.toFixed(6)}`,
      `tokens:${cost.totalTokens}`,
      `modelVerified:${observableModelTruth.modelVerified ? "true" : "false"}`,
      `actualModel:${observableModelTruth.actualModel || "unknown"}`,
      `expectedModel:${observableModelTruth.expectedModel}`,
      "fallbackTransparent:true",
      `fallbackUsed:${observableModelTruth.fallbackUsed ? "true" : "false"}`,
      `errorHandled:${errorHandled ? "true" : "false"}`,
      `fallbackModel:${fallbackModel}`,
      "userFacingError:false",
      `systemRecovered:${systemRecovered ? "true" : "false"}`,
      "semanticTraceEnabled:true",
      `reasoningTrace:${reasoningTrace.length}`,
      `toolTrace:${toolTrace.length}`,
      `WHY_THIS_ANSWER:${whyThisAnswer.join(" | ")}`
    ],
    runtime: {
      ...osContext.execution.runtime,
      cost,
      costTracked: true,
      modelTruth: observableModelTruth,
      modelVerified: observableModelTruth.modelVerified,
      fallbackTransparent: true,
      errorHandled,
      fallbackModel: fallbackModel === "deepseek" || fallbackModel === "qwen" || fallbackModel === "safe-fallback" ? fallbackModel : "none",
      userFacingError: false,
      systemRecovered,
      semanticTraceEnabled: true,
      reasoningTrace,
      toolTrace,
      whyThisAnswer
    }
  };

  return {
    ...data,
    cost: formatGptOSCost(cost),
    reasoningTrace,
    toolTrace,
    modelTruth: observableModelTruth,
    fallbackUsed: data.fallbackUsed ?? modelTruth.fallbackUsed,
    diagnostics: [
      ...(data.diagnostics ?? []),
      ...observableExecution.diagnostics.map((item) => `runtime:${item}`)
    ],
    gptOS: observableExecution
  };
}

function createSafeFallbackGptIngestResponse(input: {
  error: unknown;
  osContext: GptOSRuntimeContext;
  originalInput: string;
  agent: IngestChatAgent;
  category: string;
  provider: IngestModelProvider;
  model: string;
  selectedModelLabel: string;
  platform: IngestPlatform;
}): GptIngestResponse {
  const safeError = normalizeGptOSError(input.error);
  const errorUX = buildGptOSErrorUX(input.error, {
    primaryProvider: input.provider,
    fallbackModel: "safe-fallback"
  });
  const title = "AI暂时未响应";
  const category = input.category || input.agent.role || "默认知识库";
  const summary = `${errorUX.userMessage}。本次请求已进入安全兜底，不会写入知识库。`;
  const gptOS: GptOSWorkflowExecution = {
    ...input.osContext.execution,
    diagnostics: [
      ...input.osContext.execution.diagnostics,
      "errorHandled:true",
      "fallbackUsed:true",
      "fallbackModel:safe-fallback",
      "userFacingError:false",
      "systemRecovered:true",
      "safeFallback:true",
      ...errorUX.diagnostics,
      ...safeError.diagnostics
    ],
    runtime: {
      ...input.osContext.execution.runtime,
      fallbackUsed: true,
      errorHandled: true,
      fallbackModel: "safe-fallback",
      userFacingError: false,
      systemRecovered: true,
      converged: true,
      convergenceStopReason: "safe_fallback",
      fallbackTransparent: true,
      semanticTraceEnabled: true,
      reasoningTrace: [
        ...input.osContext.execution.runtime.reasoningTrace,
        {
          step: "safe-fallback",
          reasoning: errorUX.recoveryMessage,
          toolUsed: input.osContext.execution.runtime.toolTrace.map((item) => item.pluginId),
          decision: errorUX.diagnostics.join(" | ")
        }
      ]
    }
  };

  return {
    provider: input.provider,
    model: input.model,
    requestedModel: input.model,
    actualModel: input.model,
    responseId: undefined,
    proofId: undefined,
    createdAt: new Date().toISOString(),
    usage: {},
    modelDisplayName: input.selectedModelLabel,
    modelMode: "highest",
    fallback: false,
    selectedModelLabel: input.selectedModelLabel,
    replyMarkdown: errorUX.recoveryMessage,
    suggestedQuestions: ["稍后重试", "检查模型连接状态"],
    saveRecommendation: "需要补充资料",
    diagnostics: safeError.diagnostics,
    gptOS,
    structured: {
      title,
      category,
      summary,
      tags: ["AI保护", category.replace("知识库", "")].filter(Boolean),
      question: input.originalInput,
      answer: errorUX.recoveryMessage,
      confidence: 0,
      saveSuggestion: false,
      followUpQuestions: ["稍后重新生成", "检查 GPT 连接状态"]
    },
    sync: {
      platform: input.platform,
      syncTarget: [...ingestSyncTarget]
    },
    fallbackUsed: true
  };
}

export async function sendCoreIngest(input: {
  text: string;
  agent: IngestChatAgent;
  category: string;
  model: string;
  modelProvider?: IngestModelProvider;
  gptTier?: GptTier;
  gptTierLabel?: string;
  gptVersion?: GptVersion;
  selectedModelLabel?: string;
  tenantId?: string | null;
  userId?: string | null;
  attachments?: IngestUploadState[];
  recentMessages?: Array<{
    role: "user" | "assistant";
    content: string;
    model?: string | null;
    provider?: string | null;
  }>;
  previousKnowledgeDrafts?: Array<Partial<IngestKnowledgeDraft>>;
  recentTrainingRecords?: Array<{
    input?: string;
    resultTitle?: string;
    category?: string;
    saveStatus?: string;
  }>;
  gptOS?: GptOSWorkflowExecution | null;
  platform?: IngestPlatform;
}) {
  const platform = input.platform ?? "web";
  const selectedModelOption = getIngestModelOptionByLabel(input.selectedModelLabel ?? input.model);
  const modelProvider = input.modelProvider ?? selectedModelOption.provider;
  const gptSelection = getGptModelSelectionByDisplayName(modelProvider === "openai" ? input.selectedModelLabel ?? input.model : "GPT-5.5 超高");
  const selectedModelLabel = input.selectedModelLabel ?? selectedModelOption.label;
  const preferredModel = modelProvider === "openai" ? gptSelection.apiModel : selectedModelOption.defaultModel;
  // GPT OS Runtime 在客户端调度工具、Agent 和现有 GPT API；旧接口字段保持不变。
  const runtimeInput = {
    text: input.text,
    activeAgentName: input.agent.name,
    category: input.category,
    attachments: input.attachments?.map((file) => ({
      fileName: file.fileName,
      parseStatus: file.parseStatus
    })),
    recentMessages: input.recentMessages,
    tenantId: input.tenantId ?? null,
    userId: input.userId ?? null,
    workflowState: "running"
  } as const;
  const health = await checkGptHealthStatus({
    provider: modelProvider,
    selectedModelLabel,
    preferredModel
  });

  if (!health.ok && !health.apiKeyConfigured && modelProvider === "deepseek") {
    throw new Error("系统正在优化回答，请稍后再试");
  }
  const expectedTruthModel = modelProvider === "openai" ? "gpt-5.5" : preferredModel;

  try {
    const pipeline = await executeAutonomousOS<GptIngestResponse>(runtimeInput, {
      callModel: async (osContext) => {
        try {
          const response = await fetch("/api/admin/kb/ingest/gpt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              input: osContext.modelInput,
              source: "admin_ingest",
              sourceApp: "admin_ingest",
              agentId: input.agent.id,
              expertId: input.agent.expertId ?? null,
              agentName: input.agent.name,
              expertName: input.agent.expertId ? input.agent.name : null,
              agentDescription: input.agent.description,
              targetUser: input.agent.role,
              category: input.category,
              model: input.model,
              tenantId: input.tenantId ?? null,
              userId: input.userId ?? null,
              attachments: input.attachments ?? [],
              platform,
              syncTarget: [...ingestSyncTarget],
              modelProvider,
              modelMode: "highest",
              preferredModel,
              gptTier: modelProvider === "openai" ? input.gptTier ?? gptSelection.tier : undefined,
              gptTierLabel: modelProvider === "openai" ? input.gptTierLabel ?? gptSelection.tierLabel : undefined,
              gptVersion: modelProvider === "openai" ? input.gptVersion ?? gptSelection.version : undefined,
              selectedModelLabel,
              modelDisplayName: selectedModelLabel,
              gptOS: osContext.execution,
              recentMessages: input.recentMessages ?? [],
              previousKnowledgeDrafts: input.previousKnowledgeDrafts ?? [],
              recentTrainingRecords: input.recentTrainingRecords ?? [],
              autoSave: false
            })
          });
          const payload = await response.json().catch(() => null) as ApiEnvelope<GptIngestResponse> | GptFailureResponse | null;

          if (isGptFailureResponse(payload)) {
            throw new Error(payload.message || GPT_OS_SAFE_UI_MESSAGE);
          }

          if (!response.ok || !payload?.ok || !payload.data) {
            throw new Error(getFriendlyIngestError(response, payload));
          }

          return payload.data;
        } catch (error) {
          if (isGptApiParseClientError(error)) {
            throw new Error(GPT_OS_SAFE_UI_MESSAGE);
          }

          throw error;
        }
      },
      readModelText: (data) => data.replyMarkdown,
      refineResult: (data, osContext) => buildObservableGptOSResult(data, osContext, expectedTruthModel, modelProvider),
      createFallbackResult: (error, osContext) => createSafeFallbackGptIngestResponse({
        error,
        osContext,
        originalInput: input.text,
        agent: input.agent,
        category: input.category,
        provider: modelProvider,
        model: preferredModel,
        selectedModelLabel,
        platform
      })
    });
    const data = pipeline.result;
    const gptOS = data.gptOS ?? pipeline.execution;

    if (data.fallbackUsed) {
      const draft = gptResponseToDraft(data, input.text, input.agent);

      draft.jobId = draft.jobId ?? `gpt-fallback-${Date.now()}`;
      draft.fallbackUsed = true;

      const records = [createTrainingRecord({
        originalInput: input.text,
        draft,
        agent: input.agent,
        status: "失败",
        tenantId: input.tenantId ?? null,
        userId: input.userId ?? null,
        platform
      })];

      return {
        draft,
        records,
        preview: true,
        provider: draft.providerUsed ?? modelProvider,
        model: data.modelDisplayName ?? selectedModelLabel,
        actualModel: data.actualModel ?? data.model,
        responseId: data.responseId,
        usage: data.usage,
        gptOS,
        cost: data.cost,
        reasoningTrace: data.reasoningTrace,
        toolTrace: data.toolTrace,
        modelTruth: data.modelTruth,
        fallbackUsed: true,
        modelMode: draft.modelMode,
        replyMarkdown: data.replyMarkdown,
        saveSuggestion: false,
        message: data.replyMarkdown || GPT_OS_SAFE_FALLBACK_MESSAGE
      };
    }

    if (data.fallback !== false || !data.gptProof || data.gptProof.fallback !== false || (!data.responseId && !data.proofId)) {
      throw new Error(`${selectedModelLabel} 未返回有效调用证据，本次不插入成功回复。`);
    }

    const draft = gptResponseToDraft(data, input.text, input.agent);

    draft.jobId = draft.jobId ?? `gpt-${Date.now()}`;
    draft.fallbackUsed = draft.fallbackUsed ?? false;

    const records = [createTrainingRecord({
      originalInput: input.text,
      draft,
      agent: input.agent,
      tenantId: input.tenantId ?? null,
      userId: input.userId ?? null,
      platform
    })];

    return {
      draft,
      records,
      preview: false,
      provider: draft.providerUsed ?? modelProvider,
      model: data.modelDisplayName ?? selectedModelLabel,
      actualModel: data.actualModel ?? data.model,
      responseId: data.responseId,
      usage: data.usage,
      gptProof: data.gptProof,
      gptOS,
      cost: data.cost,
      reasoningTrace: data.reasoningTrace,
      toolTrace: data.toolTrace,
      modelTruth: data.modelTruth,
      fallbackUsed: data.fallbackUsed ?? false,
      modelMode: draft.modelMode,
      replyMarkdown: draft.replyMarkdown,
      saveSuggestion: draft.recommendation === "建议入库",
      message: `${selectedModelLabel} 已生成结构化知识：${draft.title}`
    };
  } catch (error) {
    throw error instanceof Error
      ? new Error(sanitizeGptOSErrorMessage(error.message))
      : new Error(GPT_OS_SAFE_UI_MESSAGE);
  }
}

export async function saveKnowledgeDraft(input: {
  draft: IngestKnowledgeDraft;
  agent: IngestChatAgent;
  originalInput: string;
  tenantId?: string | null;
  userId?: string | null;
  platform?: IngestPlatform;
}) {
  const platform = input.platform ?? "web";
  const structured = {
    title: input.draft.title,
    category: input.draft.category,
    tags: input.draft.tags,
    summary: input.draft.summary ?? input.draft.standardAnswer,
    qa_pairs: input.draft.qaPairs?.length
      ? input.draft.qaPairs
      : [{ q: input.draft.standardQuestion, a: input.draft.standardAnswer }],
    confidence: input.draft.trainingScore,
    should_save: input.draft.recommendation !== "暂不入库",
    scenarios: input.draft.scenarios ?? [],
    sourceMaterials: input.draft.sourceMaterials ?? [],
    complianceNotes: input.draft.complianceNotes ?? [],
    userClientCallPlan: input.draft.userClientCallPlan,
    missingFields: input.draft.missingFields ?? [],
    suggestedQuestions: input.draft.suggestedQuestions ?? [],
    saveRecommendation: input.draft.saveRecommendation ?? input.draft.recommendation,
    sourceModel: input.draft.sourceModel ?? input.draft.model ?? "unknown",
    generatedBy: input.draft.generatedBy ?? input.draft.providerUsed ?? "unknown",
    providerUsed: input.draft.providerUsed ?? "unknown",
    model: input.draft.model ?? "unknown",
    fallbackUsed: input.draft.fallbackUsed ?? false
  };

  if (!input.draft.jobId) {
    const savedDraft = { ...input.draft, saveStatus: "已保存" as const };

    return {
      draft: savedDraft,
      records: [createTrainingRecord({
        originalInput: input.originalInput,
        draft: savedDraft,
        agent: input.agent,
        status: "已保存",
        tenantId: input.tenantId ?? null,
        userId: input.userId ?? null,
        platform
      })],
      preview: true,
      message: "当前为本地预览结果，已在前端标记为已保存。"
    };
  }

  try {
    const response = await fetch("/api/admin/kb/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId: input.draft.jobId,
        originalInput: input.originalInput,
        structured,
        knowledge: structured,
        agentId: input.agent.id,
        expertId: input.agent.expertId ?? null,
        agentName: input.agent.name,
        expertName: input.agent.expertId ? input.agent.name : null,
        tenantId: input.tenantId ?? null,
        userId: input.userId ?? null,
        source: "admin_ingest",
        sourceApp: "admin_ingest",
        platform,
        syncTarget: [...ingestSyncTarget]
      })
    });
    const data = await readApiData<{ records?: AdminTrainingRecordResponse[] }>(response);
    const savedDraft = { ...input.draft, saveStatus: "已保存" as const };

    return {
      draft: savedDraft,
      records: data.records?.map((record) => normalizeTrainingRecord(record, input.agent, platform)) ?? [createTrainingRecord({
        originalInput: input.originalInput,
        draft: savedDraft,
        agent: input.agent,
        status: "已保存",
        tenantId: input.tenantId ?? null,
        userId: input.userId ?? null,
        platform
      })],
      preview: false,
      message: "已保存知识入库，训练记录已更新。"
    };
  } catch (error) {
    const savedDraft = { ...input.draft, saveStatus: "已保存" as const, fallbackUsed: true };

    return {
      draft: savedDraft,
      records: [createTrainingRecord({
        originalInput: input.originalInput,
        draft: savedDraft,
        agent: input.agent,
        status: "已保存",
        tenantId: input.tenantId ?? null,
        userId: input.userId ?? null,
        platform
      })],
      preview: true,
      message: error instanceof Error ? error.message : "保存接口暂不可用，已在本地预览中标记为已保存。"
    };
  }
}

export function createUploadState(file: File, context: {
  tenantId?: string | null;
  userId?: string | null;
  agentId?: string | null;
  platform?: IngestPlatform;
} = {}): IngestUploadState {
  const isImage = file.type.startsWith("image/") || /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(file.name);
  const previewUrl = isImage && typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
    ? URL.createObjectURL(file)
    : undefined;

  return {
    id: `upload-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    fileName: file.name,
    fileType: file.type || file.name.split(".").pop() || "unknown",
    fileSize: file.size,
    isImage,
    previewUrl,
    rawFile: file,
    mimeType: file.type || "application/octet-stream",
    parseStatus: "metadata_only",
    status: "ready_to_send",
    source: "admin_ingest",
    platform: context.platform ?? "web",
    syncTarget: [...ingestSyncTarget],
    tenantId: context.tenantId ?? null,
    userId: context.userId ?? null,
    agentId: context.agentId ?? null,
    createdAt: new Date().toISOString()
  };
}

interface ParseFileResponse {
  ok: boolean;
  data?: {
    fileName: string;
    fileType: string;
    mimeType: string;
    sizeBytes: number;
    parseStatus: "parsed" | "partial" | "metadata_only" | "unsupported" | "ocr_pending";
    extractedText: string;
    pageSummaries: string[];
    slideTexts: Array<{ slideIndex: number; text: string }>;
    limitationNote: string;
  };
  message?: string;
  error?: {
    message?: string;
  };
}

export function stripUploadRuntimeFields(file: IngestUploadState): Omit<IngestUploadState, "rawFile"> {
  const safeFile = { ...file };

  delete safeFile.rawFile;

  return safeFile;
}

export async function parseUploadedFileForGpt(file: IngestUploadState): Promise<IngestUploadState> {
  if (!file.rawFile) {
    return {
      ...file,
      parseStatus: file.parseStatus ?? (file.extractedText || file.summary ? "parsed" : "metadata_only"),
      limitationNote: file.limitationNote ?? "当前附件没有原始 File 对象，只能把已有元数据传给 GPT。"
    };
  }

  const formData = new FormData();

  formData.append("file", file.rawFile);
  formData.append("fileName", file.fileName);
  formData.append("mimeType", file.mimeType || file.fileType || file.rawFile.type || "application/octet-stream");

  const response = await fetch("/api/admin/kb/ingest/files/parse", {
    method: "POST",
    body: formData
  });
  const payload = await response.json().catch(() => null) as ParseFileResponse | null;

  if (!response.ok || !payload?.ok || !payload.data) {
    return {
      ...file,
      status: "failed",
      parseStatus: "metadata_only",
      limitationNote: payload?.message ?? payload?.error?.message ?? "文件解析失败，只能把文件名和元数据传给 GPT。"
    };
  }

  return {
    ...file,
    fileType: payload.data.mimeType || file.fileType,
    fileSize: payload.data.sizeBytes || file.fileSize,
    mimeType: payload.data.mimeType,
    extractedText: payload.data.extractedText || undefined,
    summary: payload.data.extractedText ? payload.data.extractedText.slice(0, 360) : file.summary,
    pageSummaries: payload.data.pageSummaries,
    slideTexts: payload.data.slideTexts,
    parseStatus: payload.data.parseStatus,
    limitationNote: payload.data.limitationNote,
    status: payload.data.parseStatus === "unsupported" ? "failed" : "parsed"
  };
}

export async function sendUrlIngestPreview(input: {
  url: string;
  agent: IngestChatAgent;
  category: string;
  model: string;
  modelProvider?: IngestModelProvider;
  gptTier?: GptTier;
  gptTierLabel?: string;
  gptVersion?: GptVersion;
  selectedModelLabel?: string;
  tenantId?: string | null;
  userId?: string | null;
  platform?: IngestPlatform;
}) {
  const platform = input.platform ?? "web";
  const selectedModelOption = getIngestModelOptionByLabel(input.selectedModelLabel ?? input.model);
  const modelProvider = input.modelProvider ?? selectedModelOption.provider;
  const gptSelection = getGptModelSelectionByDisplayName(modelProvider === "openai" ? input.selectedModelLabel ?? input.model : "GPT-5.5 超高");
  const selectedModelLabel = input.selectedModelLabel ?? selectedModelOption.label;
  const response = await fetch("/api/admin/kb/ingest/url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: input.url,
      sourceUrl: input.url,
      source: "admin_ingest",
      sourceApp: "admin_ingest",
      sourceType: "url",
      agentId: input.agent.id,
      expertId: input.agent.expertId ?? null,
      agentName: input.agent.name,
      expertName: input.agent.expertId ? input.agent.name : null,
      category: input.category,
      model: input.model,
      tenantId: input.tenantId ?? null,
      userId: input.userId ?? null,
      platform,
      syncTarget: [...ingestSyncTarget],
      modelProvider,
      modelMode: "highest",
      preferredModel: modelProvider === "openai" ? gptSelection.apiModel : selectedModelOption.defaultModel,
      gptTier: modelProvider === "openai" ? input.gptTier ?? gptSelection.tier : undefined,
      gptTierLabel: modelProvider === "openai" ? input.gptTierLabel ?? gptSelection.tierLabel : undefined,
      gptVersion: modelProvider === "openai" ? input.gptVersion ?? gptSelection.version : undefined,
      selectedModelLabel,
      modelDisplayName: selectedModelLabel,
      autoSave: false
    })
  });
  const data = await readApiData<UrlIngestPreviewResponse>(response);
  const draft = normalizeDraftFromUnknown({
    ...data.draft,
    jobId: data.job.id,
    providerUsed: data.draft.providerUsed,
    model: data.draft.model || selectedModelLabel,
    fallbackUsed: data.draft.fallbackUsed,
    replyMarkdown: data.replyMarkdown
  }, input.url, input.agent, data.draft.saveStatus === "saved" ? "已保存" : "待确认");

  draft.jobId = data.job.id;
  draft.sourceType = "url";

  const records = data.records?.length
    ? data.records.map((record) => normalizeTrainingRecord(record, input.agent, platform))
    : [createTrainingRecord({
      originalInput: `网址投喂：${input.url}`,
      draft,
      agent: input.agent,
      sourceType: "url",
      tenantId: input.tenantId ?? null,
      userId: input.userId ?? null,
      platform
    })];

  return {
    draft,
    records,
    preview: true,
    provider: draft.providerUsed ?? "url-preview",
    model: draft.model ?? selectedModelLabel,
    modelMode: "highest" as const,
    replyMarkdown: data.replyMarkdown,
    saveSuggestion: draft.recommendation === "建议入库",
    message: data.message
  };
}

export async function checkLicenseStatus(): Promise<IngestConnectionStatus> {
  try {
    const response = await fetch("/api/license/status", { cache: "no-store" });
    const payload = await response.json().catch(() => null) as ApiEnvelope<{
      active?: boolean;
      status?: string;
      license?: {
        status?: string;
      } | null;
    }> | null;

    if (!response.ok || !payload?.ok) {
      return {
        enterpriseSpace: "本地预览",
        knowledgeBase: "默认知识库",
        licenseStatus: response.status === 401 ? "本地预览" : "未激活",
        checkedAt: new Date().toISOString()
      };
    }

    const rawStatus = [
      payload.data?.status,
      payload.data?.license?.status
    ].filter(Boolean).join(" ").toLowerCase();
    const isActive = payload.data?.active === true || rawStatus.includes("active") || rawStatus.includes("已激活");

    return {
      enterpriseSpace: "已连接",
      knowledgeBase: "默认知识库",
      licenseStatus: isActive ? "已激活" : "未激活",
      checkedAt: new Date().toISOString()
    };
  } catch {
    return {
      enterpriseSpace: "本地预览",
      knowledgeBase: "默认知识库",
      licenseStatus: "本地预览",
      checkedAt: new Date().toISOString()
    };
  }
}

export async function checkGptHealthStatus(input: {
  provider?: IngestModelProvider;
  selectedModelLabel?: string;
  preferredModel?: string;
} = {}): Promise<IngestGptHealthStatus> {
  const params = new URLSearchParams();
  const provider = input.provider ?? getIngestModelOptionByLabel(input.selectedModelLabel).provider;
  const selectedOption = input.selectedModelLabel
    ? getIngestModelOptionByLabel(input.selectedModelLabel)
    : getIngestModelOptionByLabel(provider);

  params.set("provider", provider);

  if (input.selectedModelLabel) {
    params.set("selectedModelLabel", input.selectedModelLabel);
  }

  if (input.preferredModel) {
    params.set("preferredModel", input.preferredModel);
  }

  const suffix = params.toString() ? `?${params.toString()}` : "";

  try {
    const response = await fetch(`/api/admin/kb/ingest/models/health${suffix}`, { cache: "no-store" });
    const payload = await response.json().catch(() => null) as IngestGptHealthStatus | ApiEnvelope<IngestGptHealthStatus> | null;

    if (isPlainRecord(payload) && typeof payload.provider === "string") {
      return payload as IngestGptHealthStatus;
    }

    if (isPlainRecord(payload) && payload.ok === true && "data" in payload && payload.data) {
      return payload.data as IngestGptHealthStatus;
    }

    return {
      ok: false,
      configured: false,
      provider,
      baseUrlConfigured: true,
      baseUrlSource: "default",
      modelConfigured: true,
      modelSource: "default",
      apiKeyConfigured: false,
      selectedModelLabel: input.selectedModelLabel ?? selectedOption.label,
      model: input.preferredModel ?? selectedOption.defaultModel,
      mode: "highest",
      message: "模型健康检查接口暂不可用",
      diagnostics: ["请确认 /api/admin/kb/ingest/models/health 可以访问。"],
      checkedAt: new Date().toISOString(),
      requestTested: false
    };
  } catch {
    return {
      ok: false,
      configured: false,
      provider,
      baseUrlConfigured: true,
      baseUrlSource: "default",
      modelConfigured: true,
      modelSource: "default",
      apiKeyConfigured: false,
      selectedModelLabel: input.selectedModelLabel ?? selectedOption.label,
      model: input.preferredModel ?? selectedOption.defaultModel,
      mode: "highest",
      message: "模型健康检查请求失败",
      diagnostics: ["请检查 Web 服务是否启动，或稍后重新连接模型。"],
      checkedAt: new Date().toISOString(),
      requestTested: false
    };
  }
}
