import { createAskRequestPayload } from "./chat-ui-state";
import {
  createFeedbackRecord,
  type KnowledgeFeedbackEventType,
  type KnowledgeFeedbackInput
} from "@/lib/enterprise/feedback/feedback-collector";
import {
  finalizeUserAnswer
} from "@/lib/ai-chat/response-finalizer";
import {
  getFinalizedRawAnswerText,
  pickSingleRawAssistantText
} from "./lib/answer-display";
import {
  buildChatModeDecisionFromCandidate,
  CHAT_MODE_CONFIGS,
  toChatModeCandidate,
  type ChatModeDecision,
  type ChatModeKey,
  type ChatModeSource
} from "./lib/intent-mode-router";
import type {
  AvatarUpdateResponse,
  AskChatRequest,
  AskChatResponse,
  ChatAttachmentDraft,
  ChatAttachmentUploadResponse,
  ChangePasswordInput,
  ChangePasswordResponse,
  ConversationsResponse,
  CurrentUserResponse,
  FinalizedAnswerView,
  HistoryResponse,
  ChatQuickActionItem
} from "./types";

export const USER_CHAT_LOGIN_URL = "/login?app=user&next=/app";

type ApiEnvelope<T> = {
  ok?: boolean;
  success?: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
  } | string;
  code?: string;
  message?: string;
};

export type AskChatStreamEvent =
  | {
      type: "thinking";
      content: string;
    }
  | {
      type: "rag_search";
      query: string;
    }
  | {
      type: "rag_chunk";
      content: string;
      chunk_rank?: number | null;
      chunk_id?: string | null;
    }
  | {
      type: "rag_score";
      score: number;
      chunk_rank?: number | null;
    }
  | {
      type: "rag_source";
      source: string;
      title?: string | null;
      file_id?: string | null;
      chunk_id?: string | null;
      item_id?: string | null;
      knowledgeBaseId?: string | null;
      agentId?: string | null;
      tenantId?: string | null;
      namespace?: string | null;
      sourceApp?: string | null;
      includeShared?: boolean | null;
      includePublished?: boolean | null;
    }
  | {
      type: "rag_done";
      hitCount?: number | null;
      topK?: number | null;
      relevance_score?: number | null;
    }
  | {
      type: "model_select";
      model: string;
    }
  | {
      type: "model_reason";
      reason: string;
    }
  | {
      type: "model_fallback";
      chain: string[];
    }
  | {
      type: "model_metrics";
      cost_score?: number | null;
      latency_score?: number | null;
      success_rate?: number | null;
      latency_ms?: number | null;
    }
  | {
      type: "token";
      content: string;
    }
  | {
      type: "final";
      content: string;
      data?: AskChatResponse;
    }
  | {
      type: "error";
      content: string;
      code?: string;
    };

export interface AskChatStreamHandlers {
  signal?: AbortSignal;
  onThinking?: (content: string) => void;
  onRagSearch?: (query: string) => void;
  onRagChunk?: (event: Extract<AskChatStreamEvent, { type: "rag_chunk" }>) => void;
  onRagScore?: (event: Extract<AskChatStreamEvent, { type: "rag_score" }>) => void;
  onRagSource?: (event: Extract<AskChatStreamEvent, { type: "rag_source" }>) => void;
  onRagDone?: (event: Extract<AskChatStreamEvent, { type: "rag_done" }>) => void;
  onModelSelect?: (model: string) => void;
  onModelReason?: (reason: string) => void;
  onModelFallback?: (chain: string[]) => void;
  onModelMetrics?: (event: Extract<AskChatStreamEvent, { type: "model_metrics" }>) => void;
  onToken?: (content: string) => void;
  onFinal?: (result: AskChatResponse) => void;
}

export interface ChatBehaviorFeedbackInput extends Omit<KnowledgeFeedbackInput, "eventType"> {
  eventType: KnowledgeFeedbackEventType;
}

export interface ChatModeClassifyInput {
  message: string;
  hasImage: boolean;
  hasAttachment: boolean;
  manualMode?: ChatModeKey | null;
  signal?: AbortSignal;
}

type ChatModeClassifyResponse = {
  mode: ChatModeKey;
  modeLabel: string;
  confidence: number;
  reason: string;
  alternatives: Array<{
    key: ChatModeKey;
    label: string;
    confidence: number;
    reason: string;
  }>;
  source: ChatModeSource;
  classifierVersion: string;
};

export interface ConversationActionResponse {
  conversationId?: string;
  conversation?: Record<string, unknown>;
  shareId?: string;
  shareUrl?: string;
  inviteUrl?: string;
  inviteLink?: string;
  groupLink?: string;
  joinUrl?: string;
  link?: string;
  url?: string;
  groupChatId?: string;
  archived?: boolean;
  deleted?: boolean;
  message?: string;
  [key: string]: unknown;
}

async function readApiPayload<T>(response: Response) {
  const rawText = await response.text().catch(() => "");
  let payload: ApiEnvelope<T> | null = null;

  if (rawText) {
    try {
      payload = JSON.parse(rawText) as ApiEnvelope<T>;
    } catch {
      payload = null;
    }
  }

  return {
    payload,
    rawText
  };
}

function getApiErrorMessage<T>(payload: ApiEnvelope<T> | null, fallback: string) {
  if (payload?.error && typeof payload.error === "object" && payload.error.message) {
    return sanitizeUserVisibleApiMessage(payload.error.message, fallback);
  }

  if (payload?.message) {
    return sanitizeUserVisibleApiMessage(payload.message, fallback);
  }

  if (typeof payload?.error === "string") {
    return sanitizeUserVisibleApiMessage(payload.error, fallback);
  }

  return sanitizeUserVisibleApiMessage(fallback, "请求失败，请稍后重试。");
}

function sanitizeUserVisibleApiMessage(message: string, fallback = "请求失败，请稍后重试。") {
  const normalized = message.trim();

  if (!normalized) {
    return fallback;
  }

  if (/^\s*<!doctype html|^\s*<html/i.test(normalized)) {
    return "服务暂时不可用，请稍后再试。";
  }

  if (/\b(FEATURE_DISABLED|UPSTREAM_UNAVAILABLE)\b/i.test(normalized)) {
    return fallback;
  }

  const cleaned = normalized
    .replace(/（endpoint:.*?）/gi, "")
    .replace(/\s*endpoint\s*[:=].*$/gim, "")
    .replace(/\s*status\s*[:=]\s*\d+.*$/gim, "")
    .replace(/\s*content-type\s*[:=].*$/gim, "")
    .replace(/\s*stack\s*[:=][\s\S]*$/i, "")
    .replace(/\b(content-type|endpoint|FEATURE_DISABLED|UPSTREAM_UNAVAILABLE|sourceApp|model_select|model_reason)\b/gi, "")
    .replace(/\bACTION_[A-Z0-9_]+\b/gi, "推荐动作")
    .replace(/\bV(?:6|7|8|9)(?:\.\d+)?\b/gi, "")
    .replace(/\bprompt\.[a-z0-9_.-]+\b/gi, "提示策略")
    .replace(/\bchunk(?:[_-]?id)?\b/gi, "知识片段")
    .replace(/\s{2,}/g, " ")
    .trim();

  return cleaned || fallback;
}

async function readApiResponse<T>(response: Response): Promise<T> {
  const { payload, rawText } = await readApiPayload<T>(response).catch(() => ({
    payload: null,
    rawText: ""
  }));

  if (!response.ok || !payload?.ok) {
    if (response.status === 401) {
      throw new Error("请先登录后再继续使用小董AI助手。");
    }

    if (response.status === 403) {
      throw new Error("当前账号没有权限访问该功能。");
    }

    throw new Error(getApiErrorMessage(payload, rawText || "请求失败，请稍后重试。"));
  }

  if (!payload.data) {
    throw new Error("接口返回数据为空。");
  }

  return payload.data;
}

function getActionApiFailureMessage<T>(
  endpoint: string,
  response: Response,
  payload: ApiEnvelope<T> | null,
  rawText: string
) {
  const contentType = response.headers.get("content-type") ?? "unknown";
  const code = payload?.code || (typeof payload?.error === "object" ? payload.error.code : undefined);
  const apiMessage = getApiErrorMessage(payload, "").trim();
  const htmlResponse = contentType.toLowerCase().includes("text/html") || /^\s*<!doctype html|^\s*<html/i.test(rawText);

  console.warn("[chat-ui] conversation action API failed", {
    endpoint,
    status: response.status,
    contentType,
    code,
    message: apiMessage || null,
    bodyPreview: rawText.slice(0, 240)
  });

  if (htmlResponse) {
    return "服务暂时不可用，请稍后再试。";
  }

  if (response.status === 401) {
    return "登录状态已失效，请重新登录后再操作。";
  }

  if (response.status === 403) {
    if (code === "FEATURE_DISABLED") {
      return "当前会话功能暂时无法使用，请稍后再试。";
    }

    return apiMessage || "当前账号没有权限执行该操作。";
  }

  if (response.status === 404) {
    return apiMessage ? `${apiMessage} 请刷新历史列表后再试。` : "当前会话不存在或不属于当前账号，请刷新历史列表后再试。";
  }

  if (response.status >= 500) {
    return apiMessage || "服务器暂时不可用，请稍后再试。";
  }

  return apiMessage || rawText || "请求失败，请稍后重试。";
}

async function readConversationActionResponse<T extends Record<string, unknown>>(
  endpoint: string,
  response: Response
): Promise<T> {
  const { payload, rawText } = await readApiPayload<T>(response).catch(() => ({
    payload: null,
    rawText: ""
  }));

  if (!response.ok || !payload?.ok) {
    throw new Error(getActionApiFailureMessage(endpoint, response, payload, rawText));
  }

  const topLevelPayload = payload as ApiEnvelope<T> & Record<string, unknown>;
  const data = payload.data ?? (topLevelPayload as T | null);

  if (!data) {
    console.warn("[chat-ui] conversation action response data is empty", {
      endpoint,
      status: response.status
    });
    throw new Error("接口返回数据为空，请稍后再试。");
  }

  return data;
}

async function requestConversationAction<T extends Record<string, unknown>>(
  endpoint: string,
  init: RequestInit
) {
  const response = await fetch(endpoint, {
    credentials: "include",
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {})
    }
  });

  return readConversationActionResponse<T>(endpoint, response);
}

export async function askChat(input: AskChatRequest) {
  return askChatStream(input);
}

function normalizeChatModeClassifyResponse(data: ChatModeClassifyResponse): ChatModeDecision {
  const modeKey = CHAT_MODE_CONFIGS[data.mode] ? data.mode : "business_problem";
  const alternatives = Array.isArray(data.alternatives)
    ? data.alternatives
      .filter((item) => CHAT_MODE_CONFIGS[item.key])
      .map((item) => toChatModeCandidate(item.key, item.confidence, item.reason))
    : [];

  return buildChatModeDecisionFromCandidate({
    candidate: toChatModeCandidate(modeKey, data.confidence, data.reason || CHAT_MODE_CONFIGS[modeKey].prompt),
    source: data.source,
    alternatives,
    classifierVersion: data.classifierVersion
  });
}

export async function classifyChatMode(input: ChatModeClassifyInput) {
  const response = await fetch("/api/user/chat-mode/classify", {
    method: "POST",
    credentials: "include",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: input.message,
      hasImage: input.hasImage,
      hasAttachment: input.hasAttachment,
      manualMode: input.manualMode ?? null
    }),
    signal: input.signal
  });
  const result = await readApiResponse<ChatModeClassifyResponse>(response);

  return normalizeChatModeClassifyResponse(result);
}

function normalizeStreamFinalEvent(event: AskChatStreamEvent): AskChatResponse | null {
  if (event.type !== "final") {
    return null;
  }

  if (event.data) {
    const dataRecord = event.data as unknown as Record<string, unknown>;
    const runtimeOutput = event.data.runtime_output && typeof event.data.runtime_output === "object" && !Array.isArray(event.data.runtime_output)
      ? event.data.runtime_output as Record<string, unknown>
      : {};
    const runtimeInput = dataRecord.runtime_input && typeof dataRecord.runtime_input === "object" && !Array.isArray(dataRecord.runtime_input)
      ? dataRecord.runtime_input as Record<string, unknown>
      : {};
    const runtimeCustomerCopy = typeof runtimeOutput.customerCopy === "string" ? runtimeOutput.customerCopy : null;
    const runtimeTraceId = typeof runtimeOutput.traceId === "string" ? runtimeOutput.traceId : null;
    const runtimeNextStep = typeof runtimeOutput.nextStep === "string" ? runtimeOutput.nextStep : null;
    const userMessage =
      typeof runtimeInput.query === "string" ? runtimeInput.query :
      typeof dataRecord.message === "string" ? dataRecord.message :
      typeof dataRecord.question === "string" ? dataRecord.question :
      undefined;
    const readAnswerField = <K extends keyof FinalizedAnswerView>(key: K): FinalizedAnswerView[K] | undefined =>
      (event.data?.finalized_answer?.[key] ?? runtimeOutput[key] ?? dataRecord[key]) as FinalizedAnswerView[K] | undefined;
    const readRawString = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : "";
    const rawAnswerBeforeFinalizer = readRawString(dataRecord.rawAnswerBeforeFinalizer)
      || readRawString(runtimeOutput.rawAnswerBeforeFinalizer);
    const rawCustomerAnswerBeforeFinalizer = readRawString(dataRecord.rawCustomerAnswerBeforeFinalizer)
      || readRawString(runtimeOutput.rawCustomerAnswerBeforeFinalizer);
    const resolveRawAnswer = (finalizedAnswer: FinalizedAnswerView) => rawAnswerBeforeFinalizer || pickSingleRawAssistantText([
      rawCustomerAnswerBeforeFinalizer,
      dataRecord.rawContent,
      dataRecord.rawText,
      dataRecord.rawAnswer,
      runtimeOutput.rawContent,
      runtimeOutput.rawText,
      runtimeOutput.rawAnswer,
      event.data?.answer,
      event.content,
      getFinalizedRawAnswerText(finalizedAnswer),
      runtimeOutput.answer
    ]);

    if (event.data.finalized_answer) {
      const finalizedAnswer: FinalizedAnswerView = {
        ...event.data.finalized_answer,
        dealSignals: (event.data.finalized_answer.dealSignals ?? runtimeOutput.dealSignals) as FinalizedAnswerView["dealSignals"],
        salesLoopPlan: (event.data.finalized_answer.salesLoopPlan ?? runtimeOutput.salesLoopPlan) as FinalizedAnswerView["salesLoopPlan"],
        nextQuestion: (event.data.finalized_answer.nextQuestion ?? runtimeOutput.nextQuestion) as FinalizedAnswerView["nextQuestion"],
        followupSequence: (event.data.finalized_answer.followupSequence ?? runtimeOutput.followupSequence) as FinalizedAnswerView["followupSequence"],
        branchReplies: (event.data.finalized_answer.branchReplies ?? runtimeOutput.branchReplies) as FinalizedAnswerView["branchReplies"],
        stopRules: (event.data.finalized_answer.stopRules ?? runtimeOutput.stopRules) as FinalizedAnswerView["stopRules"],
        stageReason: (event.data.finalized_answer.stageReason ?? runtimeOutput.stageReason) as FinalizedAnswerView["stageReason"],
        salesLoopV2: (event.data.finalized_answer.salesLoopV2 ?? runtimeOutput.salesLoopV2) as FinalizedAnswerView["salesLoopV2"],
        dealProbability: (event.data.finalized_answer.dealProbability ?? runtimeOutput.dealProbability) as FinalizedAnswerView["dealProbability"],
        silenceRisk: (event.data.finalized_answer.silenceRisk ?? runtimeOutput.silenceRisk) as FinalizedAnswerView["silenceRisk"],
        abScripts: (event.data.finalized_answer.abScripts ?? runtimeOutput.abScripts) as FinalizedAnswerView["abScripts"],
        multiTurnPath: (event.data.finalized_answer.multiTurnPath ?? runtimeOutput.multiTurnPath) as FinalizedAnswerView["multiTurnPath"],
        followupTiming: (event.data.finalized_answer.followupTiming ?? runtimeOutput.followupTiming) as FinalizedAnswerView["followupTiming"],
        stopPush: (event.data.finalized_answer.stopPush ?? runtimeOutput.stopPush) as FinalizedAnswerView["stopPush"],
        recommendedAction: (event.data.finalized_answer.recommendedAction ?? runtimeOutput.recommendedAction) as FinalizedAnswerView["recommendedAction"],
        salesLearningV3: readAnswerField("salesLearningV3"),
        customerSegment: readAnswerField("customerSegment"),
        conversionScore: readAnswerField("conversionScore"),
        bestScriptRecommendation: readAnswerField("bestScriptRecommendation"),
        nextBestActionV3: readAnswerField("nextBestActionV3"),
        learningSignals: readAnswerField("learningSignals"),
        optimizationReason: readAnswerField("optimizationReason"),
        isolationScope: readAnswerField("isolationScope"),
        salesGrowthV4: readAnswerField("salesGrowthV4"),
        scriptScoreboardV4: readAnswerField("scriptScoreboardV4"),
        segmentPlaybookV4: readAnswerField("segmentPlaybookV4"),
        optimizedRecommendationV4: readAnswerField("optimizedRecommendationV4"),
        customerPathOptimizationV4: readAnswerField("customerPathOptimizationV4"),
        growthMetricsV4: readAnswerField("growthMetricsV4"),
        growthWarningsV4: readAnswerField("growthWarningsV4"),
        salesEvolutionV5: readAnswerField("salesEvolutionV5"),
        strategyCandidates: readAnswerField("strategyCandidates"),
        promotedStrategies: readAnswerField("promotedStrategies"),
        reducedStrategies: readAnswerField("reducedStrategies"),
        retiredStrategies: readAnswerField("retiredStrategies"),
        roiSignals: readAnswerField("roiSignals"),
        conversionTrend: readAnswerField("conversionTrend"),
        evolvedPath: readAnswerField("evolvedPath"),
        autonomousRecommendation: readAnswerField("autonomousRecommendation"),
      };
      const customerCopy = event.data.customerCopy ?? runtimeCustomerCopy ?? finalizedAnswer.customerReply;
      const rawAnswer = resolveRawAnswer(finalizedAnswer);

      return {
        ...event.data,
        answer: rawAnswer || event.data.answer,
        rawContent: rawAnswer || event.data.rawContent || null,
        rawText: rawAnswer || event.data.rawText || null,
        rawAnswerBeforeFinalizer: rawAnswerBeforeFinalizer || null,
        rawCustomerAnswerBeforeFinalizer: rawCustomerAnswerBeforeFinalizer || null,
        customerCopy,
        customer_answer: customerCopy,
        finalized_answer: finalizedAnswer,
        nextStep: event.data.nextStep ?? runtimeNextStep ?? finalizedAnswer.nextAction,
        traceId: event.data.traceId ?? runtimeTraceId,
        salesLearningV3: finalizedAnswer.salesLearningV3,
        customerSegment: finalizedAnswer.customerSegment,
        conversionScore: finalizedAnswer.conversionScore,
        bestScriptRecommendation: finalizedAnswer.bestScriptRecommendation,
        nextBestActionV3: finalizedAnswer.nextBestActionV3,
        learningSignals: finalizedAnswer.learningSignals,
        optimizationReason: finalizedAnswer.optimizationReason,
        isolationScope: finalizedAnswer.isolationScope,
        salesGrowthV4: finalizedAnswer.salesGrowthV4,
        scriptScoreboardV4: finalizedAnswer.scriptScoreboardV4,
        segmentPlaybookV4: finalizedAnswer.segmentPlaybookV4,
        optimizedRecommendationV4: finalizedAnswer.optimizedRecommendationV4,
        customerPathOptimizationV4: finalizedAnswer.customerPathOptimizationV4,
        growthMetricsV4: finalizedAnswer.growthMetricsV4,
        growthWarningsV4: finalizedAnswer.growthWarningsV4,
        salesEvolutionV5: finalizedAnswer.salesEvolutionV5,
        strategyCandidates: finalizedAnswer.strategyCandidates,
        promotedStrategies: finalizedAnswer.promotedStrategies,
        reducedStrategies: finalizedAnswer.reducedStrategies,
        retiredStrategies: finalizedAnswer.retiredStrategies,
        roiSignals: finalizedAnswer.roiSignals,
        conversionTrend: finalizedAnswer.conversionTrend,
        evolvedPath: finalizedAnswer.evolvedPath,
        autonomousRecommendation: finalizedAnswer.autonomousRecommendation,
      };
    }

    const fallbackFinalizedAnswer = finalizeUserAnswer({
      rawAnswer: event.data.answer,
      customerAnswer: event.data.customerCopy ?? runtimeCustomerCopy ?? event.data.customer_answer ?? undefined,
      sources: event.data.sources,
      userMessage,
    });
    const finalizedAnswer: FinalizedAnswerView = {
      ...fallbackFinalizedAnswer,
      salesLearningV3: readAnswerField("salesLearningV3") ?? fallbackFinalizedAnswer.salesLearningV3,
      customerSegment: readAnswerField("customerSegment") ?? fallbackFinalizedAnswer.customerSegment,
      conversionScore: readAnswerField("conversionScore") ?? fallbackFinalizedAnswer.conversionScore,
      bestScriptRecommendation: readAnswerField("bestScriptRecommendation") ?? fallbackFinalizedAnswer.bestScriptRecommendation,
      nextBestActionV3: readAnswerField("nextBestActionV3") ?? fallbackFinalizedAnswer.nextBestActionV3,
      learningSignals: readAnswerField("learningSignals") ?? fallbackFinalizedAnswer.learningSignals,
      optimizationReason: readAnswerField("optimizationReason") ?? fallbackFinalizedAnswer.optimizationReason,
      isolationScope: readAnswerField("isolationScope") ?? fallbackFinalizedAnswer.isolationScope,
      salesGrowthV4: readAnswerField("salesGrowthV4") ?? fallbackFinalizedAnswer.salesGrowthV4,
      scriptScoreboardV4: readAnswerField("scriptScoreboardV4") ?? fallbackFinalizedAnswer.scriptScoreboardV4,
      segmentPlaybookV4: readAnswerField("segmentPlaybookV4") ?? fallbackFinalizedAnswer.segmentPlaybookV4,
      optimizedRecommendationV4: readAnswerField("optimizedRecommendationV4") ?? fallbackFinalizedAnswer.optimizedRecommendationV4,
      customerPathOptimizationV4: readAnswerField("customerPathOptimizationV4") ?? fallbackFinalizedAnswer.customerPathOptimizationV4,
      growthMetricsV4: readAnswerField("growthMetricsV4") ?? fallbackFinalizedAnswer.growthMetricsV4,
      growthWarningsV4: readAnswerField("growthWarningsV4") ?? fallbackFinalizedAnswer.growthWarningsV4,
      salesEvolutionV5: readAnswerField("salesEvolutionV5") ?? fallbackFinalizedAnswer.salesEvolutionV5,
      strategyCandidates: readAnswerField("strategyCandidates") ?? fallbackFinalizedAnswer.strategyCandidates,
      promotedStrategies: readAnswerField("promotedStrategies") ?? fallbackFinalizedAnswer.promotedStrategies,
      reducedStrategies: readAnswerField("reducedStrategies") ?? fallbackFinalizedAnswer.reducedStrategies,
      retiredStrategies: readAnswerField("retiredStrategies") ?? fallbackFinalizedAnswer.retiredStrategies,
      roiSignals: readAnswerField("roiSignals") ?? fallbackFinalizedAnswer.roiSignals,
      conversionTrend: readAnswerField("conversionTrend") ?? fallbackFinalizedAnswer.conversionTrend,
      evolvedPath: readAnswerField("evolvedPath") ?? fallbackFinalizedAnswer.evolvedPath,
      autonomousRecommendation: readAnswerField("autonomousRecommendation") ?? fallbackFinalizedAnswer.autonomousRecommendation,
    };
    const customerCopy = event.data.customerCopy ?? runtimeCustomerCopy ?? finalizedAnswer.customerReply;
    const rawAnswer = resolveRawAnswer(finalizedAnswer);

    return {
      ...event.data,
      answer: rawAnswer || event.data.answer,
      rawContent: rawAnswer || event.data.rawContent || null,
      rawText: rawAnswer || event.data.rawText || null,
      rawAnswerBeforeFinalizer: rawAnswerBeforeFinalizer || null,
      rawCustomerAnswerBeforeFinalizer: rawCustomerAnswerBeforeFinalizer || null,
      customerCopy,
      customer_answer: customerCopy,
      finalized_answer: finalizedAnswer,
      nextStep: event.data.nextStep ?? runtimeNextStep ?? finalizedAnswer.nextAction,
      traceId: event.data.traceId ?? runtimeTraceId,
      salesLearningV3: finalizedAnswer.salesLearningV3,
      customerSegment: finalizedAnswer.customerSegment,
      conversionScore: finalizedAnswer.conversionScore,
      bestScriptRecommendation: finalizedAnswer.bestScriptRecommendation,
      nextBestActionV3: finalizedAnswer.nextBestActionV3,
      learningSignals: finalizedAnswer.learningSignals,
      optimizationReason: finalizedAnswer.optimizationReason,
      isolationScope: finalizedAnswer.isolationScope,
      salesGrowthV4: finalizedAnswer.salesGrowthV4,
      scriptScoreboardV4: finalizedAnswer.scriptScoreboardV4,
      segmentPlaybookV4: finalizedAnswer.segmentPlaybookV4,
      optimizedRecommendationV4: finalizedAnswer.optimizedRecommendationV4,
      customerPathOptimizationV4: finalizedAnswer.customerPathOptimizationV4,
      growthMetricsV4: finalizedAnswer.growthMetricsV4,
      growthWarningsV4: finalizedAnswer.growthWarningsV4,
      salesEvolutionV5: finalizedAnswer.salesEvolutionV5,
      strategyCandidates: finalizedAnswer.strategyCandidates,
      promotedStrategies: finalizedAnswer.promotedStrategies,
      reducedStrategies: finalizedAnswer.reducedStrategies,
      retiredStrategies: finalizedAnswer.retiredStrategies,
      roiSignals: finalizedAnswer.roiSignals,
      conversionTrend: finalizedAnswer.conversionTrend,
      evolvedPath: finalizedAnswer.evolvedPath,
      autonomousRecommendation: finalizedAnswer.autonomousRecommendation,
    };
  }

  const finalizedAnswer = finalizeUserAnswer({
    rawAnswer: event.content
  });
  const rawAnswer = pickSingleRawAssistantText([
    event.content,
    getFinalizedRawAnswerText(finalizedAnswer)
  ]);

  return {
    answer: rawAnswer || event.content,
    rawContent: rawAnswer || null,
    rawText: rawAnswer || null,
    conversation_id: "",
    message_id: `stream-final-${Date.now()}`,
    mode: "fast",
    customer_answer: finalizedAnswer.customerReply,
    finalized_answer: finalizedAnswer,
    salesLearningV3: finalizedAnswer.salesLearningV3,
    customerSegment: finalizedAnswer.customerSegment,
    conversionScore: finalizedAnswer.conversionScore,
    bestScriptRecommendation: finalizedAnswer.bestScriptRecommendation,
    nextBestActionV3: finalizedAnswer.nextBestActionV3,
    learningSignals: finalizedAnswer.learningSignals,
    optimizationReason: finalizedAnswer.optimizationReason,
    isolationScope: finalizedAnswer.isolationScope,
    salesGrowthV4: finalizedAnswer.salesGrowthV4,
    scriptScoreboardV4: finalizedAnswer.scriptScoreboardV4,
    segmentPlaybookV4: finalizedAnswer.segmentPlaybookV4,
    optimizedRecommendationV4: finalizedAnswer.optimizedRecommendationV4,
    customerPathOptimizationV4: finalizedAnswer.customerPathOptimizationV4,
    growthMetricsV4: finalizedAnswer.growthMetricsV4,
    growthWarningsV4: finalizedAnswer.growthWarningsV4,
    salesEvolutionV5: finalizedAnswer.salesEvolutionV5,
    strategyCandidates: finalizedAnswer.strategyCandidates,
    promotedStrategies: finalizedAnswer.promotedStrategies,
    reducedStrategies: finalizedAnswer.reducedStrategies,
    retiredStrategies: finalizedAnswer.retiredStrategies,
    roiSignals: finalizedAnswer.roiSignals,
    conversionTrend: finalizedAnswer.conversionTrend,
    evolvedPath: finalizedAnswer.evolvedPath,
    autonomousRecommendation: finalizedAnswer.autonomousRecommendation,
    sources: [],
    confidence: "low",
    provider_status: "ok"
  };
}

function parseSseEventBlock(block: string) {
  return block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
}

async function consumeAskChatEventStream(
  response: Response,
  handlers: AskChatStreamHandlers
) {
  const reader = response.body?.getReader();

  if (!reader) {
    throw new Error("当前浏览器不支持流式读取。");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: AskChatResponse | null = null;

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? "";

    for (const block of blocks) {
      const data = parseSseEventBlock(block);

      if (!data) {
        continue;
      }

      if (data === "[DONE]") {
        return finalResult;
      }

      let event: AskChatStreamEvent;

      try {
        event = JSON.parse(data) as AskChatStreamEvent;
      } catch {
        continue;
      }

      if (event.type === "thinking") {
        handlers.onThinking?.(event.content);
        continue;
      }

      if (event.type === "rag_search") {
        handlers.onRagSearch?.(event.query);
        continue;
      }

      if (event.type === "rag_chunk") {
        handlers.onRagChunk?.(event);
        continue;
      }

      if (event.type === "rag_score") {
        handlers.onRagScore?.(event);
        continue;
      }

      if (event.type === "rag_source") {
        handlers.onRagSource?.(event);
        continue;
      }

      if (event.type === "rag_done") {
        handlers.onRagDone?.(event);
        continue;
      }

      if (event.type === "model_select") {
        handlers.onModelSelect?.(event.model);
        continue;
      }

      if (event.type === "model_reason") {
        handlers.onModelReason?.(event.reason);
        continue;
      }

      if (event.type === "model_fallback") {
        handlers.onModelFallback?.(event.chain);
        continue;
      }

      if (event.type === "model_metrics") {
        handlers.onModelMetrics?.(event);
        continue;
      }

      if (event.type === "token") {
        handlers.onToken?.(event.content);
        continue;
      }

      if (event.type === "final") {
        finalResult = normalizeStreamFinalEvent(event);

        if (finalResult) {
          handlers.onFinal?.(finalResult);
        }

        continue;
      }

      if (event.type === "error") {
        throw new Error(event.content || "AI 流式响应失败。");
      }
    }
  }

  if (buffer.trim()) {
    const data = parseSseEventBlock(buffer);

    if (data && data !== "[DONE]") {
      const event = JSON.parse(data) as AskChatStreamEvent;
      const normalized = normalizeStreamFinalEvent(event);

      if (normalized) {
        finalResult = normalized;
        handlers.onFinal?.(normalized);
      }
    }
  }

  return finalResult;
}

export async function askChatStream(input: AskChatRequest, handlers: AskChatStreamHandlers = {}) {
  const response = await fetch("/api/ai/chat/ask", {
    method: "POST",
    credentials: "include",
    headers: {
      "Accept": "text/event-stream",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      ...createAskRequestPayload(input),
      runtime_entry: "user_chat_ui"
    }),
    signal: handlers.signal
  });
  const contentType = response.headers.get("content-type") ?? "";

  if (!response.ok) {
    return readApiResponse<AskChatResponse>(response);
  }

  if (!contentType.includes("text/event-stream")) {
    const result = await readApiResponse<AskChatResponse>(response);

    handlers.onFinal?.(result);

    return result;
  }

  const result = await consumeAskChatEventStream(response, handlers);

  if (!result) {
    throw new Error("AI 流式响应未返回最终结果。");
  }

  return result;
}

export async function submitChatBehaviorFeedback(input: ChatBehaviorFeedbackInput) {
  const feedbackRecord = createFeedbackRecord(input);
  const response = await fetch("/api/feedback", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      type: feedbackRecord.converted ? "RAG_HELPFUL" : "SUGGESTION",
      content: `用户行为反馈：${feedbackRecord.eventType}`,
      metadata: {
        feedbackKind: "ai_knowledge_behavior",
        ...feedbackRecord
      }
    })
  });

  if (!response.ok) {
    return null;
  }

  return readApiResponse(response).catch(() => null);
}

export async function fetchConversations() {
  const response = await fetch("/api/ai/chat/conversations", {
    method: "GET"
  });

  return readApiResponse<ConversationsResponse>(response);
}

export async function fetchConversationHistory(conversationId: string) {
  const params = new URLSearchParams({ conversation_id: conversationId });
  const response = await fetch(`/api/ai/chat/history?${params.toString()}`, {
    method: "GET"
  });

  return readApiResponse<HistoryResponse>(response);
}

function conversationActionEndpoint(conversationId: string, suffix = "") {
  return `/api/user/conversations/${encodeURIComponent(conversationId)}${suffix}`;
}

export async function shareConversation(conversationId: string) {
  return requestConversationAction<ConversationActionResponse>(
    conversationActionEndpoint(conversationId, "/share"),
    {
      method: "POST"
    }
  );
}

export async function createConversationGroupChat(conversationId: string) {
  return requestConversationAction<ConversationActionResponse>(
    conversationActionEndpoint(conversationId, "/group-chat"),
    {
      method: "POST"
    }
  );
}

export async function resetConversationGroupChatLink(conversationId: string) {
  return requestConversationAction<ConversationActionResponse>(
    conversationActionEndpoint(conversationId, "/group-chat/reset-link"),
    {
      method: "POST"
    }
  );
}

export async function deleteConversationGroupChatLink(conversationId: string) {
  return requestConversationAction<ConversationActionResponse>(
    conversationActionEndpoint(conversationId, "/group-chat/delete-link"),
    {
      method: "DELETE"
    }
  );
}

export async function renameConversation(conversationId: string, title: string) {
  return requestConversationAction<ConversationActionResponse>(
    conversationActionEndpoint(conversationId, "/rename"),
    {
      method: "PATCH",
      body: JSON.stringify({ title })
    }
  );
}

export async function archiveConversation(conversationId: string) {
  return requestConversationAction<ConversationActionResponse>(
    conversationActionEndpoint(conversationId, "/archive"),
    {
      method: "PATCH",
      body: JSON.stringify({ archived: true })
    }
  );
}

export async function deleteConversation(conversationId: string, reason = "user_client_menu_delete") {
  return requestConversationAction<ConversationActionResponse>(
    conversationActionEndpoint(conversationId),
    {
      method: "DELETE",
      body: JSON.stringify({ reason })
    }
  );
}

function hasPersistentAttachmentUrl(attachment: ChatAttachmentDraft) {
  const candidates = [
    attachment.url,
    attachment.publicUrl,
    attachment.fileUrl,
    attachment.downloadUrl,
    attachment.src,
    attachment.path,
    attachment.storagePath
  ];

  return candidates.some((value) => (
    typeof value === "string" &&
    value.trim() &&
    !value.trim().startsWith("blob:") &&
    !value.trim().startsWith("data:")
  ));
}

function getUploadFailureMessage<T>(response: Response, payload: ApiEnvelope<T> | null, rawText: string) {
  if (response.status === 401) {
    return "未登录，请重新登录。";
  }

  if (response.status === 403) {
    return getApiErrorMessage(payload, "当前账号没有权限上传附件。");
  }

  if (response.status === 413) {
    return "单个附件不能超过 100MB。";
  }

  return getApiErrorMessage(payload, rawText || "服务器暂不可用。");
}

async function readChatAttachmentUploadResponse(response: Response) {
  const { payload, rawText } = await readApiPayload<ChatAttachmentUploadResponse>(response).catch(() => ({
    payload: null,
    rawText: ""
  }));

  if (!response.ok || !payload?.ok) {
    throw new Error(`文件上传失败：${getUploadFailureMessage(response, payload, rawText)}`);
  }

  const topLevelPayload = payload as ApiEnvelope<ChatAttachmentUploadResponse> & {
    attachment?: ChatAttachmentDraft;
  };
  const data = payload.data ?? (topLevelPayload.attachment ? { attachment: topLevelPayload.attachment } : null);

  if (!data?.attachment) {
    throw new Error("文件上传失败：接口返回数据为空。");
  }

  return data;
}

export async function uploadChatAttachment(attachment: ChatAttachmentDraft) {
  if (hasPersistentAttachmentUrl(attachment)) {
    return attachment;
  }

  if (!attachment.file) {
    return attachment;
  }

  const formData = new FormData();

  formData.set("file", attachment.file);
  formData.set("attachment", attachment.file);
  formData.set("attachments", attachment.file);

  const response = await fetch("/api/ai/chat/attachments", {
    method: "POST",
    credentials: "include",
    body: formData
  });
  const result = await readChatAttachmentUploadResponse(response);
  const uploaded = result.attachment;

  return {
    ...attachment,
    ...uploaded,
    id: attachment.id || uploaded.id,
    reference_id: uploaded.reference_id || attachment.reference_id || attachment.id,
    previewUrl: attachment.previewUrl || uploaded.previewUrl || uploaded.url || uploaded.publicUrl,
    file: attachment.file,
    metadata: {
      ...(attachment.metadata ?? {}),
      ...(uploaded.metadata ?? {}),
      ...(attachment.id ? { local_id: attachment.id } : {}),
      ...(attachment.source ? { source: attachment.source } : {})
    }
  };
}

export async function uploadChatAttachments(attachments: ChatAttachmentDraft[]) {
  const uploaded: ChatAttachmentDraft[] = [];

  for (const attachment of attachments) {
    uploaded.push(await uploadChatAttachment(attachment));
  }

  return uploaded;
}

function getRecordValue(record: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

function toOptionalNumber(value: unknown) {
  const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

  return Number.isFinite(numberValue) ? numberValue : null;
}

function normalizeQuickActionCategory(item: unknown, index: number): ChatQuickActionItem | null {
  if (!item || typeof item !== "object") {
    return null;
  }

  const record = item as Record<string, unknown>;
  const enabled = getRecordValue(record, "enabled") ?? getRecordValue(record, "isEnabled");
  const status = getRecordValue(record, "status");

  if (enabled === false || status === "disabled") {
    return null;
  }

  const rawLabel = getRecordValue(record, "label") ?? getRecordValue(record, "name") ?? getRecordValue(record, "title");
  const label = typeof rawLabel === "string" ? rawLabel.trim() : "";

  if (!label) {
    return null;
  }

  const rawPrompt = getRecordValue(record, "prompt") ?? getRecordValue(record, "description");
  const rawId = getRecordValue(record, "id") ?? getRecordValue(record, "key") ?? label;
  const sortOrder = toOptionalNumber(getRecordValue(record, "sortOrder") ?? getRecordValue(record, "order") ?? getRecordValue(record, "position"));
  const rawDescription = getRecordValue(record, "description");
  const rawIcon = getRecordValue(record, "icon");
  const rawType = getRecordValue(record, "type");
  const rawAction = getRecordValue(record, "action");
  const fastModeAction = label === "快速";

  return {
    id: `category-${String(rawId)}-${index}`,
    label,
    prompt: fastModeAction ? null : typeof rawPrompt === "string" && rawPrompt.trim() ? rawPrompt.trim() : label,
    kind: fastModeAction ? "mode" : "category",
    mode: fastModeAction ? "fast" : undefined,
    sortOrder,
    description: typeof rawDescription === "string" ? rawDescription : null,
    icon: typeof rawIcon === "string" ? rawIcon : null,
    type: typeof rawType === "string" ? rawType : null,
    action: typeof rawAction === "string" ? rawAction : null
  };
}

async function fetchCategoryEndpoint(path: string) {
  const response = await fetch(path, {
    method: "GET"
  }).catch(() => null);

  if (!response) {
    return [];
  }

  if (!response.ok) {
    return [];
  }

  const payload = await response.json().catch(() => null) as ApiEnvelope<{
    categories?: unknown[];
    quickActions?: unknown[];
  }> | null;
  const categories = Array.isArray(payload?.data?.quickActions)
    ? payload.data.quickActions
    : Array.isArray(payload?.data?.categories)
      ? payload.data.categories
      : [];

  return categories
    .map(normalizeQuickActionCategory)
    .filter((item): item is ChatQuickActionItem => Boolean(item))
    .sort((left, right) => {
      const leftOrder = left.sortOrder ?? indexFallback(left.id);
      const rightOrder = right.sortOrder ?? indexFallback(right.id);

      return leftOrder - rightOrder || left.label.localeCompare(right.label, "zh-CN");
    });
}

function indexFallback(id: string) {
  const value = Number(id.match(/-(\d+)-/)?.[1] ?? Number.MAX_SAFE_INTEGER);

  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

export async function fetchQuickActionCategories() {
  return fetchCategoryEndpoint("/api/user/quick-actions");
}

export async function fetchCurrentChatUser(options: { cacheBust?: boolean } = {}) {
  const endpoint = options.cacheBust ? `/api/auth/me?ts=${Date.now()}` : "/api/auth/me";
  const response = await fetch(endpoint, {
    method: "GET",
    credentials: "include"
  });

  return readApiResponse<CurrentUserResponse>(response);
}

export async function updateCurrentChatUserName(name: string) {
  const response = await fetch("/api/auth/me", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ name })
  });

  return readApiResponse<CurrentUserResponse>(response);
}

export async function logoutCurrentChatUser() {
  const response = await fetch("/api/auth/logout", {
    method: "POST"
  });

  return readApiResponse<{ signedOut: true }>(response);
}

export async function changeCurrentUserPassword(input: ChangePasswordInput) {
  const response = await fetch("/api/auth/change-password", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      current_password: input.currentPassword,
      new_password: input.newPassword,
      confirm_password: input.confirmPassword
    })
  });

  return readApiResponse<ChangePasswordResponse>(response);
}

export async function updateCurrentUserAvatar(file: File) {
  const formData = new FormData();

  formData.set("avatar", file);
  formData.set("file", file);

  const response = await fetch("/api/auth/avatar", {
    method: "POST",
    credentials: "include",
    body: formData
  });

  return readApiResponse<AvatarUpdateResponse>(response);
}

export async function deleteCurrentUserAvatar() {
  const response = await fetch("/api/auth/avatar", {
    method: "DELETE",
    credentials: "include"
  });

  return readApiResponse<AvatarUpdateResponse>(response);
}
