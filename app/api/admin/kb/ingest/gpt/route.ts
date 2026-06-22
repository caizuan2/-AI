import { apiError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { requireKbAdmin } from "@/lib/auth/guards";
import { ValidationError } from "@/lib/errors";
import { getRequestIdFromHeaders } from "@/lib/logger";
import {
  type OpenAIAdminIngestAttachment
} from "@/lib/enterprise/openai-ingest-client";
import {
  resolveAdminIngestModelProvider,
  runAdminIngestWithSelectedModel
} from "@/lib/enterprise/ingest-model-provider";
import {
  normalizeAdminIngestPlatform,
  type AdminIngestPlatform
} from "@/lib/enterprise/admin-ingest-platform";
import type {
  AutonomousTaskMode,
  AutonomousTaskRequest
} from "@/lib/enterprise/gpt-os-autonomous-executor";
import { normalizeGptOSFallback } from "@/lib/enterprise/gpt-os-fallback-normalizer";
import { enhanceGPTStyle } from "@/lib/enterprise/gpt-os-style-layer";
import { hasDatabaseUrl } from "@/lib/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonUtf8(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(value: unknown, limit = 10) {
  return Array.isArray(value)
    ? value.map((item) => readString(item)).filter(Boolean).slice(0, limit)
    : [];
}

function readSlideTexts(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item, index) => {
    if (typeof item === "string") {
      const text = readString(item);

      return text ? { slideIndex: index + 1, text } : null;
    }

    if (!isPlainObject(item)) {
      return null;
    }

    const text = readString(item.text) || readString(item.content);
    const slideIndex = readPositiveNumber(item.slideIndex, item.pageIndex) ?? index + 1;

    return text ? { slideIndex, text } : null;
  }).filter((item): item is { slideIndex: number; text: string } => item !== null).slice(0, 20);
}

function readPositiveNumber(...values: unknown[]) {
  for (const value of values) {
    const numberValue = typeof value === "number" ? value : Number(value);

    if (Number.isFinite(numberValue) && numberValue > 0) {
      return numberValue;
    }
  }

  return undefined;
}

function isLocalDevWithoutDatabase(request: Request) {
  if (process.env.NODE_ENV === "production" || hasDatabaseUrl()) {
    return false;
  }

  const hostname = new URL(request.url).hostname;

  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function readSyncTarget(value: unknown): Array<"web" | "exe" | "apk"> {
  if (!Array.isArray(value)) {
    return ["web", "exe", "apk"];
  }

  const targets = value.filter((item): item is "web" | "exe" | "apk" => item === "web" || item === "exe" || item === "apk");

  return targets.length > 0 ? targets : ["web", "exe", "apk"];
}

function readPlatform(value: unknown): AdminIngestPlatform {
  return normalizeAdminIngestPlatform(readString(value)) ?? "web";
}

function toGptFallbackErrorCode(error: unknown) {
  const record = error && typeof error === "object" ? error as { code?: unknown; message?: unknown; name?: unknown } : {};
  const code = typeof record.code === "string" ? record.code : "";
  const message = typeof record.message === "string" ? record.message.toLowerCase() : "";
  const name = typeof record.name === "string" ? record.name : "";

  if (code === "DEEPSEEK_API_KEY_MISSING" || message.includes("deepseek api key") || message.includes("deepseek_api_key")) {
    return "DEEPSEEK_API_KEY_MISSING" as const;
  }

  if (code === "OPENAI_API_KEY_MISSING" || code === "MISSING_AI_API_KEY" || message.includes("openai api key") || message.includes("openai_api_key")) {
    return "OPENAI_API_KEY_MISSING" as const;
  }

  if (code === "OPENAI_BASE_URL_INVALID") {
    return "OPENAI_BASE_URL_INVALID" as const;
  }

  if (code === "OPENAI_RATE_LIMIT" || message.includes("quota") || message.includes("429") || message.includes("rate limit")) {
    return "OPENAI_RATE_LIMIT" as const;
  }

  if (code === "DEEPSEEK_BASE_URL_INVALID") {
    return "DEEPSEEK_BASE_URL_INVALID" as const;
  }

  if (code === "DEEPSEEK_TIMEOUT") {
    return "DEEPSEEK_TIMEOUT" as const;
  }

  if (name === "AbortError" || message.includes("timeout") || message.includes("超时")) {
    return "OPENAI_TIMEOUT" as const;
  }

  if (code === "OPENAI_RESPONSES_PARSE_FAILED") {
    return "OPENAI_RESPONSES_PARSE_FAILED" as const;
  }

  if (code === "OPENAI_FULL_REQUEST_FAILED") {
    return "OPENAI_FULL_REQUEST_FAILED" as const;
  }

  if (code === "DEEPSEEK_RESPONSE_PARSE_FAILED") {
    return "DEEPSEEK_RESPONSE_PARSE_FAILED" as const;
  }

  if (code === "OPENAI_PRO_QUALITY_FAILED") {
    return "OPENAI_PRO_QUALITY_FAILED" as const;
  }

  if (code === "DEEPSEEK_PRO_QUALITY_FAILED") {
    return "DEEPSEEK_PRO_QUALITY_FAILED" as const;
  }

  if (code === "DEEPSEEK_REQUEST_FAILED" || message.includes("deepseek")) {
    return "DEEPSEEK_REQUEST_FAILED" as const;
  }

  if (code === "OPENAI_RESPONSES_REQUEST_FAILED" || message.includes("model") || message.includes("模型不可用")) {
    return "OPENAI_RESPONSES_REQUEST_FAILED" as const;
  }

  return "OPENAI_RESPONSES_REQUEST_FAILED" as const;
}

function readAttachments(value: unknown): OpenAIAdminIngestAttachment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const attachments: OpenAIAdminIngestAttachment[] = [];

  for (const item of value) {
    if (!isPlainObject(item)) {
      continue;
    }

    const fileName = readString(item.fileName) || readString(item.name);

    if (!fileName) {
      continue;
    }

    const fileType = readString(item.fileType) || readString(item.mimeType) || readString(item.type);
    const mimeType = readString(item.mimeType) || readString(item.fileType) || readString(item.type);

    attachments.push({
      fileName,
      fileType: fileType || undefined,
      mimeType: mimeType || undefined,
      fileSize: readPositiveNumber(item.fileSize, item.sizeBytes, item.size),
      sizeBytes: readPositiveNumber(item.sizeBytes, item.fileSize, item.size),
      status: readString(item.status) || undefined,
      parseStatus: readString(item.parseStatus) || undefined,
      extractedText: readString(item.extractedText) || undefined,
      text: readString(item.text) || undefined,
      content: readString(item.content) || undefined,
      visibleText: readString(item.visibleText) || undefined,
      summary: readString(item.summary) || undefined,
      pageSummaries: readStringArray(item.pageSummaries),
      slideTexts: readSlideTexts(item.slideTexts),
      limitationNote: readString(item.limitationNote) || undefined
    });

    if (attachments.length >= 12) {
      break;
    }
  }

  return attachments;
}

function readRecentMessages(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    if (!isPlainObject(item)) {
      return null;
    }

    const role = item.role === "assistant" ? "assistant" : item.role === "user" ? "user" : null;
    const content = readString(item.content);

    if (!role || !content) {
      return null;
    }

    return {
      role,
      content,
      model: readString(item.model) || null,
      provider: readString(item.provider) || null
    };
  }).filter((item): item is { role: "user" | "assistant"; content: string; model: string | null; provider: string | null } => Boolean(item)).slice(-12);
}

function readPreviousKnowledgeDrafts(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  type PreviousDraft = {
    title?: string;
    category?: string;
    tags?: string[];
    standardQuestion?: string;
    standardAnswer?: string;
  };

  return value.map((item) => {
    if (!isPlainObject(item)) {
      return null;
    }

    const draft: PreviousDraft = {};
    const title = readString(item.title);
    const category = readString(item.category);
    const tags = Array.isArray(item.tags) ? item.tags.map((tag) => readString(tag)).filter(Boolean).slice(0, 8) : [];
    const standardQuestion = readString(item.standardQuestion);
    const standardAnswer = readString(item.standardAnswer);

    if (title) draft.title = title;
    if (category) draft.category = category;
    if (tags.length > 0) draft.tags = tags;
    if (standardQuestion) draft.standardQuestion = standardQuestion;
    if (standardAnswer) draft.standardAnswer = standardAnswer;

    return draft;
  }).filter((item): item is PreviousDraft => item !== null).slice(-3);
}

function readRecentTrainingRecords(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  type RecentRecord = {
    input?: string;
    resultTitle?: string;
    category?: string;
    saveStatus?: string;
  };

  return value.map((item) => {
    if (!isPlainObject(item)) {
      return null;
    }

    const record: RecentRecord = {};
    const input = readString(item.input);
    const resultTitle = readString(item.resultTitle);
    const category = readString(item.category);
    const saveStatus = readString(item.saveStatus);

    if (input) record.input = input;
    if (resultTitle) record.resultTitle = resultTitle;
    if (category) record.category = category;
    if (saveStatus) record.saveStatus = saveStatus;

    return record;
  }).filter((item): item is RecentRecord => item !== null).slice(0, 6);
}

function readAutonomousRequest(value: unknown): AutonomousTaskRequest | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const mode = readString(value.mode);
  const safeMode: AutonomousTaskMode | undefined = mode === "execute_safe" || mode === "needs_approval" || mode === "plan_only" ? mode : undefined;

  return {
    enabled: value.enabled === true,
    taskId: readString(value.taskId) || undefined,
    mode: safeMode
  };
}

function readRequest(body: unknown) {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const input = readString(body.input)
    || readString(body.content)
    || readString(body.message)
    || readString(body.text)
    || readString(body.question);

  if (!input) {
    throw new ValidationError("投喂内容不能为空。");
  }

  return {
    input,
    attachments: readAttachments(body.attachments),
    agentId: readString(body.agentId) || null,
    expertId: readString(body.expertId) || null,
    agentName: readString(body.agentName) || null,
    category: readString(body.category) || null,
    agentDescription: readString(body.agentDescription) || null,
    targetUser: readString(body.targetUser) || null,
    tenantId: readString(body.tenantId) || null,
    userId: readString(body.userId) || null,
    source: "admin_ingest" as const,
    platform: readPlatform(body.platform),
    syncTarget: readSyncTarget(body.syncTarget),
    modelProvider: readString(body.modelProvider) || null,
    modelMode: readString(body.modelMode) || "highest",
    preferredModel: readString(body.preferredModel) || "gpt-5.5",
    gptTier: readString(body.gptTier) || null,
    gptTierLabel: readString(body.gptTierLabel) || null,
    gptVersion: readString(body.gptVersion) || null,
    selectedModelLabel: readString(body.selectedModelLabel) || null,
    modelDisplayName: readString(body.modelDisplayName) || null,
    recentMessages: readRecentMessages(body.recentMessages),
    previousKnowledgeDrafts: readPreviousKnowledgeDrafts(body.previousKnowledgeDrafts),
    recentTrainingRecords: readRecentTrainingRecords(body.recentTrainingRecords),
    autonomous: readAutonomousRequest(body.autonomous)
  };
}

export async function POST(request: Request) {
  const requestId = getRequestIdFromHeaders(request.headers);
  let actor: Awaited<ReturnType<typeof requireKbAdmin>> | null = null;

  try {
    actor = await requireKbAdmin(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "admin_kb_ingest_gpt"
    });
  } catch (error) {
    if (!isLocalDevWithoutDatabase(request)) {
      return apiError(error);
    }
  }

  let input: ReturnType<typeof readRequest>;

  try {
    input = readRequest(await request.json());
  } catch (error) {
    return apiError(error instanceof Error ? error : new ValidationError("请求体必须是合法 JSON。"));
  }

  if (input.modelMode !== "highest") {
    return apiError(new ValidationError("管理员 GPT 投喂接口仅支持 modelMode=highest。"));
  }

  try {
    const modelOption = resolveAdminIngestModelProvider({
      modelProvider: input.modelProvider,
      selectedModelLabel: input.selectedModelLabel,
      modelDisplayName: input.modelDisplayName,
      preferredModel: input.preferredModel
    });
    const result = await runAdminIngestWithSelectedModel({
      input: input.input,
      attachments: input.attachments,
      agentId: input.agentId,
      expertId: input.expertId,
      agentName: input.agentName,
      category: input.category,
      agentDescription: input.agentDescription,
      targetUser: input.targetUser,
      tenantId: input.tenantId,
      userId: input.userId ?? actor?.id ?? "local-admin-ingest-dev",
      source: input.source,
      platform: input.platform,
      syncTarget: input.syncTarget,
      modelProvider: modelOption.provider,
      preferredModel: input.preferredModel,
      gptTier: input.gptTier,
      gptTierLabel: input.gptTierLabel,
      gptVersion: input.gptVersion,
      selectedModelLabel: input.selectedModelLabel,
      modelDisplayName: input.modelDisplayName,
      recentMessages: input.recentMessages,
      previousKnowledgeDrafts: input.previousKnowledgeDrafts,
      recentTrainingRecords: input.recentTrainingRecords,
      autonomous: input.autonomous,
      requestId
    });

    const rawReply = result.replyMarkdown;
    const stylePassThrough = enhanceGPTStyle(rawReply);
    const rawResult = {
      ...result,
      replyMarkdown: rawReply,
      diagnostics: [
        ...result.diagnostics,
        ...stylePassThrough.diagnostics,
        "gptStyle:changed:false"
      ]
    };

    return jsonUtf8({
      ok: true,
      data: rawResult,
      fallback: false,
      fallbackUsed: false,
      provider: rawResult.provider,
      requestedModel: rawResult.requestedModel,
      actualModel: rawResult.actualModel,
      responseId: rawResult.responseId,
      proofId: "proofId" in rawResult ? rawResult.proofId : rawResult.responseId,
      createdAt: rawResult.createdAt,
      usage: rawResult.usage,
      gptProof: rawResult.gptProof,
      intent: rawResult.intent,
      fixedTemplateRisk: rawResult.fixedTemplateRisk,
      qualityPassed: rawResult.gptProof.qualityPassed,
      deepenAttempts: rawResult.gptProof.deepenAttempts,
      model: rawResult.model,
      selectedModelLabel: rawResult.selectedModelLabel,
      content: rawReply,
      answer: rawReply,
      reply: rawReply,
      replyMarkdown: rawReply,
      knowledgeDraft: rawResult.knowledgeDraft,
      userClientCallPlan: rawResult.userClientCallPlan,
      suggestedQuestions: rawResult.suggestedQuestions,
      sourceFiles: rawResult.sourceFiles,
      saveRecommendation: rawResult.saveRecommendation,
      diagnostics: rawResult.diagnostics,
      gptStyle: {
        tone: stylePassThrough.tone,
        structure: stylePassThrough.structure,
        priority: stylePassThrough.priority,
        changed: false
      },
      gptOS: rawResult.gptOS,
      autonomousResult: rawResult.autonomousResult,
      structuredResult: rawResult.structuredResult,
      structured: rawResult.structured,
      sync: rawResult.sync,
      sourceType: rawResult.sourceType
    });
  } catch (error) {
    const errorCode = toGptFallbackErrorCode(error);
    const isTimeout = errorCode === "OPENAI_TIMEOUT" || errorCode === "DEEPSEEK_TIMEOUT";
    const isMissingKey = errorCode === "OPENAI_API_KEY_MISSING" || errorCode === "DEEPSEEK_API_KEY_MISSING";
    const status = isTimeout ? 504 : isMissingKey ? 401 : 503;
    const modelOption = resolveAdminIngestModelProvider({
      modelProvider: input.modelProvider,
      selectedModelLabel: input.selectedModelLabel,
      modelDisplayName: input.modelDisplayName,
      preferredModel: input.preferredModel
    });

    if (errorCode === "OPENAI_FULL_REQUEST_FAILED") {
      const diagnostics = error && typeof error === "object" && "details" in error
        ? (error as { details?: { diagnostics?: unknown } }).details?.diagnostics
        : undefined;
      const safeDiagnostics = diagnostics && typeof diagnostics === "object" && !Array.isArray(diagnostics)
        ? diagnostics as Record<string, unknown>
        : {};
      const userMessage = "AI服务暂时未完成，请稍后重试。";

      return jsonUtf8({
        ok: false,
        success: false,
        fallback: true,
        fallbackUsed: true,
        errorCode: "OPENAI_FULL_REQUEST_FAILED",
        userMessage,
        message: userMessage,
        provider: modelOption.provider,
        selectedModelLabel: input.selectedModelLabel || input.modelDisplayName || modelOption.label,
        model: input.preferredModel,
        diagnostics: {
          ...safeDiagnostics,
          errorCode: "OPENAI_FULL_REQUEST_FAILED"
        }
      }, status);
    }

    const fallback = normalizeGptOSFallback({
      error,
      provider: modelOption.provider,
      diagnostics: [
        `apiResilience:errorCode:${errorCode}`,
        `apiResilience:retryable:${isMissingKey ? "false" : "true"}`
      ]
    });

    return jsonUtf8({
      ...fallback,
      ok: false,
      errorCode,
      provider: modelOption.provider,
      selectedModelLabel: input.selectedModelLabel || input.modelDisplayName || modelOption.label,
      model: input.preferredModel
    }, status);
  }
}
