import { os_core } from "@/gpt-os/core/os_core";
import { Prisma } from "@prisma/client";
import type { GptOsCostMode } from "@/gpt-os/core/model_router";
import { evaluateEvolutionHealth } from "@/gpt-os/core/evolution_engine";
import {
  BUSINESS_OUTPUT_ENFORCER_VERSION,
  buildBusinessOutputEnforcerInstruction
} from "@/lib/business-output-enforcer";
import {
  guardBusinessOutputSchema,
  type BusinessSchemaGuardResult
} from "@/lib/business-schema-guard";
import {
  buildConversionFeedbackLoop,
  buildConversionFeedbackPrompt,
  normalizeConversionFeedbackEvent
} from "@/lib/agent/conversion-feedback-loop";
import { suggestKnowledgeImprovements } from "@/gpt-os/knowledge/auto_suggester";
import { analyzeKnowledgeFeedback } from "@/gpt-os/knowledge/feedback_analyzer";
import { detectKnowledgeGap } from "@/gpt-os/knowledge/gap_detector";
import type { RagContext, RagRecentConversationTurn } from "@/lib/ai/rag-prompt";
import { cleanUserFacingRagAnswer } from "@/lib/ai/rag-output";
import {
  buildCustomerAnswerFromChunks,
  buildCustomerAnswerFromText,
  buildNoKnowledgeCustomerAnswer
} from "@/lib/ai-chat/customer-answer";
import {
  CAREER_MENTOR_POLICY_VERSION,
  CAREER_MENTOR_FAST_RETRIEVAL_TOP_K,
  CAREER_MENTOR_RETRIEVAL_TOP_K,
  buildCareerMentorBusinessContext,
  buildCareerMentorNaturalNoEvidenceAnswer,
  buildCareerMentorNaturalProviderErrorAnswer,
  buildCareerMentorNaturalProviderUnavailableAnswer,
  buildCareerMentorRetrievalQuery,
  buildCareerMentorRetrievalQueries,
  cleanCareerMentorUserAnswer,
  extractCareerMentorCustomerAnswer,
  hasCareerMentorFastAnswerEvidence,
  isCareerMentorScope,
  isCareerMentorFastAnswerEligible,
  prioritizeCareerMentorChunks,
  resolveCareerMentorTurnContext,
  type CareerMentorStage
} from "@/lib/ai-chat/career-mentor";
import type {
  CareerMentorEvidencePlanSummary
} from "@/lib/ai-chat/career-mentor-grounded-answer";
import {
  finalizeUserAnswer,
  formatFinalizedAnswerForDisplay
} from "@/lib/ai-chat/response-finalizer";
import { normalizeUserChatMarkdown } from "@/lib/ai-chat/user-chat-markdown";
import { isConversationSoftDeleted } from "@/lib/conversation-control/metadata";
import { resolveAgentKnowledgeScope } from "@/lib/enterprise/knowledge-access-scope";
import { searchRuntimeMemories } from "@/lib/enterprise/ingest-memory-runtime-search";
import type { RuntimeMemorySearchResultItem } from "@/lib/enterprise/ingest-memory-index-types";
import { processAIOutput } from "@/lib/enterprise/gpt-os-style-layer";
import { AIRuntimeOrchestrator } from "@/lib/enterprise/runtime/ai-runtime-orchestrator";
import { AppError, NotFoundError, ValidationError, toAppError } from "@/lib/errors";
import type { ChatProviderName, ModelFeedbackEvent } from "@/lib/ai/types";
import { prisma } from "@/lib/prisma";
import type { AppRole } from "@/lib/rbac/roles";
import type { UserIntent } from "@/lib/user-intent-detector";
import {
  buildRagContext,
  calculateConfidence,
  normalizeAiChatMode,
  retrieveRelevantChunks,
  sanitizeRagInput,
  type AiChatMode,
  type RagConfidence,
  type RagSearchDb,
  type RetrievedRagChunk
} from "@/lib/rag/search";
import {
  retrieveKnowledge,
  type RetrievedKnowledgeChunk,
  type RetrievalMode
} from "@/lib/rag/retriever";

export const NO_KNOWLEDGE_ANSWER = "知识库中暂无明确资料。";
export const RAG_CUSTOMER_DRAFT_ANSWER = "已根据知识库资料整理如下，可直接复制给客户。";

export interface AiChatActor {
  id: string;
  role: AppRole;
  tenantId?: string | null;
}

export interface AiChatAskInput {
  question?: unknown;
  message?: unknown;
  text?: unknown;
  mode?: unknown;
  enable_deep_thinking?: unknown;
  enable_web_search?: unknown;
  conversation_id?: unknown;
  conversationId?: unknown;
  attachments?: unknown;
  business_execution?: unknown;
  business_execution_prompt?: unknown;
  userMode?: unknown;
  modeSource?: unknown;
  modeLabel?: unknown;
  modePrompt?: unknown;
  modeConfidence?: unknown;
  modeReason?: unknown;
  modeAlternatives?: unknown;
  classifierVersion?: unknown;
  auto_sales_agent?: unknown;
  conversion_feedback?: unknown;
  selectedKnowledgeBases?: unknown;
  activeKnowledgeBase?: unknown;
  kb_id?: unknown;
  knowledgeBaseId?: unknown;
  expert_id?: unknown;
  agentId?: unknown;
  tenant_id?: unknown;
  namespace?: unknown;
}

export interface AiChatAnswerProviderInput {
  question: string;
  originalQuestion: string;
  contexts: RagContext[];
  mode: AiChatMode;
  enableDeepThinking: boolean;
  confidence: RagConfidence;
  model: string;
  actualModel: string;
  provider: ChatProviderName;
  providerFallbackChain: ChatProviderName[];
  fallbackChain: string[];
  traceId: string;
  businessExecutionContext?: string | null;
  agentId: string;
  knowledgeBaseId: string;
  namespace: string;
  recentConversation: RagRecentConversationTurn[];
  careerMentorStage?: CareerMentorStage;
}

export interface AiChatAnswerProviderResult {
  answer: string;
  providerUsed?: string;
  modelUsed?: string;
  fallbackUsed?: boolean;
  answerGroundingScore?: number;
  modelFeedbackEvent?: ModelFeedbackEvent;
  originalProviderErrorCode?: string;
  careerEvidencePlan?: CareerMentorEvidencePlanSummary;
  answerOutputMode?: "admin_ingest_reply_markdown";
}

export interface AiChatAskOptions {
  db?: AiChatDb;
  answerProvider?: (input: AiChatAnswerProviderInput) => Promise<AiChatAnswerProviderResult>;
  providerConfigured?: boolean;
}

type JsonObject = Record<string, unknown>;

type ConversationRecord = Record<string, unknown> & {
  id?: string;
  userId?: string;
  title?: string;
  type?: string;
  mode?: string;
  metadata?: unknown;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  messages?: MessageRecord[];
  _count?: {
    messages?: number;
  };
};

type ConversationPinRecord = Record<string, unknown> & {
  conversationId?: string;
  pinnedAt?: Date | string;
};

type MessageRecord = Record<string, unknown> & {
  id?: string;
  conversationId?: string;
  userId?: string | null;
  role?: string;
  content?: string;
  attachments?: unknown;
  sources?: unknown;
  metadata?: unknown;
  createdAt?: Date | string;
};

export type AiChatDb = RagSearchDb & {
  conversation: {
    findFirst(args: unknown): Promise<ConversationRecord | null>;
    findMany(args: unknown): Promise<ConversationRecord[]>;
    create(args: unknown): Promise<ConversationRecord>;
    update(args: unknown): Promise<ConversationRecord>;
  };
  message: {
    findMany?(args: unknown): Promise<MessageRecord[]>;
    create(args: unknown): Promise<MessageRecord>;
  };
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
  userConversationPin?: {
    findMany(args: unknown): Promise<ConversationPinRecord[]>;
  };
};

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_METADATA_BYTES = 4096;
const MAX_ATTACHMENT_TEXT_CONTEXT_CHARS = 3200;
const MAX_ATTACHMENT_SEARCH_HINT_CHARS = 360;
const MAX_CONVERSATION_MEMORY_TURNS = 8;
const MAX_CONVERSATION_MEMORY_CHARS_PER_TURN = 900;
const MAX_CONVERSATION_MEMORY_TOTAL_CHARS = 3600;
const CAREER_MENTOR_RUNTIME_MEMORY_TIMEOUT_MS = 1500;
const MAX_PINNED_CONVERSATIONS = 100;
const allowedAttachmentTypes = new Set(["image", "camera_photo", "gallery_photo", "file", "audio", "video"]);
const ATTACHMENT_SEARCH_KEYWORD_PATTERN = /订单号|订单|退款|退费|退货|售后|发货|物流|付款|支付|价格|费用|成分|用法|使用|效果|安全|禁忌|周期|剂量|减肥|瘦身|体重|反弹|不瘦|客户|回复|话术|沟通/gi;

function careerMentorRuntimeMemoryTimeoutResult() {
  return {
    ok: true as const,
    memoryApplied: false,
    memories: [],
    memoryTrace: [],
    usedMemoryIds: [],
    warnings: [`讲事业导师补充 Memory 检索超过 ${CAREER_MENTOR_RUNTIME_MEMORY_TIMEOUT_MS}ms，已使用固定知识库继续回答。`]
  };
}

async function withCareerMentorRuntimeMemoryBudget<T>(promise: Promise<T>) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<ReturnType<typeof careerMentorRuntimeMemoryTimeoutResult>>((resolve) => {
        timeoutId = setTimeout(
          () => resolve(careerMentorRuntimeMemoryTimeoutResult()),
          CAREER_MENTOR_RUNTIME_MEMORY_TIMEOUT_MS
        );
      })
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function defaultDb() {
  return prisma as unknown as AiChatDb;
}

function isGptOsReasoningAvailable() {
  return process.env.GPT_OS_REASONING_ENABLED === "true";
}

function needsReasoningModel(question: string) {
  return question.length >= 120 || /分析|方案|步骤|对比|规划|拆解|复杂|风险|策略|流程/.test(question);
}

function resolveCostMode(mode: AiChatMode, enableDeepThinking: boolean, confidence: RagConfidence): GptOsCostMode {
  if (enableDeepThinking) {
    return "high_quality_required";
  }

  if (mode === "fast" && confidence !== "high") {
    return "user_low_priority";
  }

  return "balanced";
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function calculateRelevanceScore(chunks: RetrievedRagChunk[]) {
  if (chunks.length === 0) {
    return 0;
  }

  return clamp01(Math.max(...chunks.map((chunk) => chunk.relevance_score)));
}

function calculateRetrievalEfficiencyScore(hitCount: number, topK: number) {
  return clamp01(topK > 0 ? hitCount / topK : 0);
}

function calculateFallbackGroundingScore(chunks: RetrievedRagChunk[], fallbackUsed: boolean) {
  if (chunks.length === 0) {
    return 0;
  }

  const average = chunks.reduce((sum, chunk) => sum + chunk.relevance_score, 0) / chunks.length;
  return clamp01(average * (fallbackUsed ? 0.45 : 0.6));
}

function toRuntimeMemoryChunk(
  item: RuntimeMemorySearchResultItem,
  index: number,
  scope: {
    knowledgeBaseId?: string | null;
    agentId?: string | null;
    namespace?: string | null;
    tenantId?: string | null;
  }
): RetrievedRagChunk {
  const score = clamp01(item.score);
  const content = trimString(item.content) || item.contentPreview;

  return {
    chunkId: `runtime-memory:${item.memoryId}`,
    fileId: null,
    knowledgeItemId: item.memoryId,
    knowledgeBaseId: item.knowledgeBaseId ?? item.kbId ?? scope.knowledgeBaseId ?? null,
    agentId: item.agentId ?? item.expertId ?? scope.agentId ?? null,
    tenantId: item.tenantId ?? scope.tenantId ?? null,
    namespace: item.namespace ?? scope.namespace ?? item.knowledgeBaseId ?? item.kbId ?? null,
    sourceApp: item.sourceApp,
    includeShared: true,
    includePublished: true,
    title: item.title || "投喂训练记忆",
    content,
    summary: item.summary ?? null,
    category: "runtime_memory",
    tags: item.matchedTokens,
    sourceType: "runtime_memory",
    sourceTitle: item.title || "投喂训练记忆",
    sourceUrl: null,
    score,
    relevance_score: score,
    qualityScore: score,
    feedbackScore: 0,
    behaviorScore: 0,
    behaviorEventCount: 0,
    behaviorReasons: item.reason ? [item.reason] : [],
    usageScore: 0,
    freshnessScore: score,
    optimizationScore: score,
    stabilityScore: score,
    confidenceWeight: score,
    trustWeight: score,
    volatilityPenalty: 0,
    stableOptimizationScore: score,
    trendScore: score,
    trendLabel: "runtime_memory",
    trendConfidence: score,
    staleRisk: 0,
    fastRising: false,
    staleHighScore: false,
    decliningTrend: false,
    evergreen: true,
    trendReason: "runtime memory hit",
    trendShadowMode: false,
    lifecycleStage: "published",
    lifecycleScore: score,
    lifecycleConfidence: score,
    lifecycleReason: "published runtime memory",
    lifecycleSuggestion: "",
    shouldBoost: true,
    shouldDecay: false,
    shouldReview: false,
    shouldArchiveCandidate: false,
    policyDecision: "allow",
    policyScore: score,
    policyRiskLevel: "low",
    policyConfidence: score,
    policySuggestion: "",
    sampleCount: 1,
    suspectedGaming: false,
    optimizationReason: "runtime memory bridge",
    optimizationSuggestion: "",
    duplicateLikely: false,
    coldKnowledge: false,
    conflictLikely: false,
    staleVersion: false,
    knowledgeVersion: null,
    lowQuality: false,
    highValue: score >= 0.5,
    matchedBy: "kb_id",
    chunk_rank: index + 1,
    createdAt: null,
  };
}

function toHybridCareerChunk(
  item: RetrievedKnowledgeChunk,
  index: number,
  scope: {
    knowledgeBaseId?: string | null;
    agentId?: string | null;
    namespace?: string | null;
    tenantId?: string | null;
  }
): RetrievedRagChunk {
  return {
    ...item,
    fileId: null,
    knowledgeBaseId: item.knowledgeBaseId ?? scope.knowledgeBaseId ?? null,
    agentId: item.agentId ?? scope.agentId ?? null,
    tenantId: scope.tenantId ?? null,
    namespace: item.namespace ?? scope.namespace ?? null,
    sourceApp: "user_app",
    includeShared: true,
    includePublished: true,
    content: item.chunkText,
    summary: item.summary || null,
    category: item.category || null,
    sourceType: item.sourceType || null,
    score: item.score,
    relevance_score: item.score,
    matchedBy: item.knowledgeBaseId ? "kb_id" : item.agentId ? "expert_id" : "namespace",
    chunk_rank: index + 1
  };
}

function mergeRuntimeMemoryChunks(runtimeChunks: RetrievedRagChunk[], dbChunks: RetrievedRagChunk[], topK: number) {
  const seen = new Set<string>();
  const merged: RetrievedRagChunk[] = [];

  for (const chunk of [...runtimeChunks, ...dbChunks]) {
    const key = chunk.chunkId || chunk.knowledgeItemId;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push({
      ...chunk,
      chunk_rank: merged.length + 1,
    });
  }

  return merged.slice(0, Math.max(1, topK));
}

function isStructuredAnswer(answer: string) {
  return /(^|\n)#{1,3}\s|\n[-*]\s|\*\*|\|/.test(answer);
}

function calculateRagQualityScore(input: {
  relevanceScore: number;
  answerGroundingScore: number;
  retrievalEfficiencyScore: number;
  fallbackUsed: boolean;
}) {
  const fallbackPenalty = input.fallbackUsed ? 0.15 : 0;
  return clamp01(
    (input.relevanceScore * 0.45)
      + (input.answerGroundingScore * 0.35)
      + (input.retrievalEfficiencyScore * 0.2)
      - fallbackPenalty
  );
}

function classifyAnswerQuality(input: {
  hitCount: number;
  relevanceScore: number;
  answerGroundingScore: number;
  fallbackUsed: boolean;
  structured: boolean;
}): "high" | "medium" | "low" {
  if (input.hitCount === 0 || input.fallbackUsed || input.relevanceScore < 0.3 || input.answerGroundingScore < 0.35) {
    return "low";
  }

  if (input.relevanceScore >= 0.6 && input.answerGroundingScore >= 0.65 && input.structured) {
    return "high";
  }

  return "medium";
}

function trimString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toIsoString(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return typeof value === "string" && value ? new Date(value).toISOString() : "";
}

function toJsonObject(value: unknown): JsonObject | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

function readQuestionInput(input: AiChatAskInput) {
  return input.question ?? input.message ?? input.text;
}

function readStringArray(value: unknown, limit = 6) {
  return Array.isArray(value)
    ? value.map(trimString).filter(Boolean).slice(0, limit)
    : [];
}

function readModeAlternatives(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => toJsonObject(item))
    .filter((item): item is JsonObject => Boolean(item))
    .map((item) => ({
      key: trimString(item.key).slice(0, 80),
      label: trimString(item.label).slice(0, 80),
      confidence: typeof item.confidence === "number"
        ? Math.max(0, Math.min(1, item.confidence))
        : null,
      reason: trimString(item.reason).slice(0, 180)
    }))
    .filter((item) => item.label || item.key)
    .slice(0, 2);
}

function readNestedJsonObject(record: JsonObject | undefined, key: string) {
  return record ? toJsonObject(record[key]) : undefined;
}

function readBusinessExecutionContext(input: AiChatAskInput) {
  const plan = toJsonObject(input.business_execution);
  const standaloneAutoSalesAgent = toJsonObject(input.auto_sales_agent);
  const rawPrompt = trimString(input.business_execution_prompt).slice(0, 2400);
  const userMode = trimString(input.userMode).slice(0, 80);
  const modeSource = trimString(input.modeSource).slice(0, 20);
  const modeLabel = trimString(input.modeLabel).slice(0, 80);
  const modePrompt = trimString(input.modePrompt).slice(0, 1000);
  const modeReason = trimString(input.modeReason).slice(0, 240);
  const modeAlternatives = readModeAlternatives(input.modeAlternatives);
  const classifierVersion = trimString(input.classifierVersion).slice(0, 80);
  const modeConfidence = typeof input.modeConfidence === "number"
    ? Math.max(0, Math.min(1, input.modeConfidence))
    : null;
  const hasUserModeContext = Boolean(userMode || modeLabel || modePrompt || modeReason);

  if (!plan && !standaloneAutoSalesAgent && !rawPrompt && !hasUserModeContext) {
    return null;
  }

  const primaryAction = readNestedJsonObject(plan, "primaryAction");
  const humanHandoff = readNestedJsonObject(plan, "humanHandoff");
  const autoSalesAgent = readNestedJsonObject(plan, "autoSalesAgent") ?? standaloneAutoSalesAgent;
  const guardrails = readStringArray(plan?.guardrails, 6);
  const executionPath = readStringArray(plan?.executionPath, 8);
  const secondaryActions = Array.isArray(plan?.secondaryActions)
    ? plan.secondaryActions
      .map((item) => toJsonObject(item))
      .filter((item): item is JsonObject => Boolean(item))
      .slice(0, 4)
    : [];
  const secondaryActionLabels = secondaryActions
    .map((action) => trimString(action.label) || trimString(action.description))
    .filter(Boolean);
  const intent = trimString(plan?.intent) || "knowledge_user";
  const conversionFeedback = normalizeConversionFeedbackEvent(
    input.conversion_feedback,
    intent as UserIntent,
    typeof autoSalesAgent?.dealProbability === "number" ? autoSalesAgent.dealProbability : 0.45
  );
  const conversionFeedbackLoop = buildConversionFeedbackLoop({
    intent: conversionFeedback.intent,
    feedback: conversionFeedback
  });
  const enrichedAutoSalesAgent: JsonObject | undefined = autoSalesAgent
    ? {
        ...autoSalesAgent,
        version: "ai-knowledge-os-v8.1",
        conversionFeedbackLoop
      }
    : undefined;
  const executionGoal = trimString(plan?.executionGoal);
  const primaryActionLabel = trimString(primaryAction?.label);
  const primaryActionDescription = trimString(primaryAction?.description);
  const primaryActionCopy = trimString(primaryAction?.copySuggestion);
  const closingScript = trimString(plan?.closingScript);
  const nextBestQuestion = trimString(plan?.nextBestQuestion);
  const handoffRequired = humanHandoff?.required === true;
  const handoffReason = trimString(humanHandoff?.reason);
  const agentState = trimString(enrichedAutoSalesAgent?.state);
  const agentLoopStage = trimString(enrichedAutoSalesAgent?.loopStage);
  const agentPrimaryObjective = trimString(enrichedAutoSalesAgent?.primaryObjective);
  const agentFollowUpStrategy = trimString(enrichedAutoSalesAgent?.followUpStrategy);
  const agentNextBestAction = trimString(enrichedAutoSalesAgent?.nextBestAction);
  const agentFollowUpQuestion = trimString(enrichedAutoSalesAgent?.followUpQuestion);
  const agentTalkingPoints = readStringArray(enrichedAutoSalesAgent?.optimizedTalkingPoints, 6);
  const agentLearningSignals = readStringArray(enrichedAutoSalesAgent?.learningSignals, 6);
  const strategyLines = [
    primaryActionLabel && primaryActionDescription
      ? `${primaryActionLabel}：${primaryActionDescription}`
      : primaryActionLabel || primaryActionDescription,
    ...executionPath,
    ...secondaryActionLabels
  ].filter(Boolean);
  const prompt = [
    "[BUSINESS CONTEXT]",
    `用户意图：${intent}`,
    hasUserModeContext ? "[USER MODE ROUTING]" : "",
    modeLabel ? `最终模式：${modeLabel}` : "",
    modeSource ? `来源：${modeSource}` : "",
    userMode ? `模式Key：${userMode}` : "",
    modeConfidence !== null ? `置信度：${Math.round(modeConfidence * 100)}%` : "",
    modeReason ? `原因：${modeReason}` : "",
    modeAlternatives.length > 0 ? `备选模式：${modeAlternatives.map((item) => `${item.label || item.key}${item.confidence !== null ? `(${Math.round(item.confidence * 100)}%)` : ""}`).join("、")}` : "",
    classifierVersion ? `分类器版本：${classifierVersion}` : "",
    modePrompt ? `模式要求：${modePrompt}` : "",
    executionGoal ? `商业目标：${executionGoal}` : "",
    "",
    "商业策略：",
    ...(strategyLines.length > 0 ? strategyLines.map((line) => `- ${line}`) : ["- 先基于知识库回答，再给出下一步行动建议。"]),
    "",
    "输出要求：",
    "- 必须先基于知识库资料回答用户问题，再结合商业策略给出可执行行动建议。",
    "- 必须包含明确下一步问题或下一步动作。",
    "- 对高意向、购买、异议或留存类用户，禁止只给纯知识回答。",
    "- 禁止编造价格、优惠、订单、支付、合同、退款、资格、收益或交付时间等未确认承诺。",
    primaryActionCopy ? `建议话术：${primaryActionCopy}` : "",
    closingScript ? `成交话术原则：${closingScript}` : "",
    nextBestQuestion ? `下一步问题：${nextBestQuestion}` : "",
    handoffRequired || handoffReason ? `人工接手：${handoffRequired ? "需要" : "视情况"}${handoffReason ? `，${handoffReason}` : ""}` : "",
    guardrails.length > 0 ? `安全边界：${guardrails.join("；")}` : "",
    agentState ? "[AUTO_SALES_AGENT_V8]" : "",
    agentState ? `Agent状态：${agentState}` : "",
    agentLoopStage ? `闭环阶段：${agentLoopStage}` : "",
    agentPrimaryObjective ? `自动成交目标：${agentPrimaryObjective}` : "",
    agentFollowUpStrategy ? `跟进策略：${agentFollowUpStrategy}` : "",
    agentTalkingPoints.length > 0 ? `话术优化点：${agentTalkingPoints.join("；")}` : "",
    agentNextBestAction ? `下一步动作：${agentNextBestAction}` : "",
    agentFollowUpQuestion ? `必须追问：${agentFollowUpQuestion}` : "",
    agentLearningSignals.length > 0 ? `闭环学习信号：${agentLearningSignals.join("；")}` : "",
    buildConversionFeedbackPrompt(conversionFeedbackLoop),
    rawPrompt ? `前端策略摘要：${rawPrompt}` : "",
    "",
    buildBusinessOutputEnforcerInstruction(intent)
  ]
    .filter((line) => line !== "")
    .join("\n")
    .slice(0, 3000);

  return {
    prompt,
    metadata: {
      ...(plan ?? {}),
      ...(hasUserModeContext ? {
        userMode,
        modeSource,
        modeLabel,
        modePrompt,
        modeReason,
        modeConfidence,
        modeAlternatives,
        classifierVersion
      } : {}),
      ...(enrichedAutoSalesAgent ? { autoSalesAgent: enrichedAutoSalesAgent } : {}),
      outputEnforcerVersion: BUSINESS_OUTPUT_ENFORCER_VERSION,
      serverPromptApplied: true
    }
  };
}

function readKnowledgeBaseItem(value: unknown) {
  const record = toJsonObject(value);

  if (!record) {
    return null;
  }

  const kbId = trimString(record.kb_id ?? record.kbId ?? record.knowledgeBaseId).slice(0, 120);
  const expertId = trimString(record.expert_id ?? record.expertId ?? record.agentId).slice(0, 120);
  const tenantId = trimString(record.tenant_id ?? record.tenantId).slice(0, 120);
  const namespace = trimString(record.namespace).slice(0, 120) || tenantId || "default";
  const title = trimString(record.title ?? record.name).slice(0, 120);

  if (!kbId || !title) {
    return null;
  }

  return {
    kb_id: kbId,
    knowledgeBaseId: kbId,
    expert_id: expertId || undefined,
    agentId: expertId || undefined,
    tenant_id: tenantId || undefined,
    namespace,
    title,
    expertName: trimString(record.expertName).slice(0, 120) || undefined,
    category: trimString(record.category).slice(0, 80) || undefined,
    active: record.active === true
  };
}

function readKnowledgeBaseSelectionContext(input: AiChatAskInput) {
  const selected = Array.isArray(input.selectedKnowledgeBases)
    ? input.selectedKnowledgeBases
      .map(readKnowledgeBaseItem)
      .filter((item): item is NonNullable<ReturnType<typeof readKnowledgeBaseItem>> => Boolean(item))
      .slice(0, 8)
    : [];
  const explicitActive = readKnowledgeBaseItem(input.activeKnowledgeBase);
  const fallbackActive = selected.find((item) => item.active) ?? selected[0] ?? null;
  const rawKbId = trimString(input.kb_id ?? input.knowledgeBaseId).slice(0, 120);
  const rawExpertId = trimString(input.expert_id ?? input.agentId).slice(0, 120);
  const rawTenantId = trimString(input.tenant_id).slice(0, 120);
  const rawNamespace = trimString(input.namespace).slice(0, 120);
  const active = explicitActive ?? fallbackActive ?? (rawKbId
    ? {
        kb_id: rawKbId,
        knowledgeBaseId: rawKbId,
        expert_id: rawExpertId || undefined,
        agentId: rawExpertId || undefined,
        tenant_id: rawTenantId || undefined,
        namespace: rawNamespace || rawTenantId || "default",
        title: "已选知识库",
        active: true
      }
    : null);

  if (!active && selected.length === 0) {
    return null;
  }

  const normalizedSelected = selected.map((item) => ({
    ...item,
    active: active ? item.kb_id === active.kb_id : item.active
  }));
  const prompt = active
    ? [
        "[KNOWLEDGE BASE SELECTION]",
        `当前知识库：${active.title}`,
        active.expertName ? `专家：${active.expertName}` : "",
        active.category ? `分类：${active.category}` : "",
        "使用要求：优先在既有 RAG 命中资料范围内结合该知识库语境回答；若没有命中，不要编造该知识库内容。"
      ].filter(Boolean).join("\n").slice(0, 600)
    : "";

  return {
    prompt,
    metadata: {
      selectedKnowledgeBases: normalizedSelected,
      activeKnowledgeBase: active,
      kb_id: active?.kb_id ?? null,
      knowledgeBaseId: active?.knowledgeBaseId ?? active?.kb_id ?? null,
      expert_id: active?.expert_id ?? null,
      agentId: active?.agentId ?? active?.expert_id ?? null,
      tenant_id: active?.tenant_id ?? null,
      namespace: active?.namespace ?? active?.tenant_id ?? null
    },
    scope: active
      ? {
          knowledgeBaseId: active.knowledgeBaseId ?? active.kb_id,
          agentId: active.agentId ?? active.expert_id ?? null,
          tenantId: active.tenant_id ?? null,
          namespace: active.namespace ?? active.tenant_id ?? null
        }
      : null
  };
}

function toBusinessSchemaGuardMetadata(result: BusinessSchemaGuardResult | null) {
  if (!result) {
    return null;
  }

  return {
    version: result.validation.version,
    valid: result.validation.valid,
    repaired: result.repaired,
    hardEnforced: result.hardEnforced,
    rewriteApplied: result.rewriteApplied,
    enforcementMode: result.enforcementMode,
    presentSections: result.validation.presentSections,
    missingSections: result.validation.missingSections,
    emptySections: result.validation.emptySections,
    requiredOrderValid: result.validation.requiredOrderValid,
    initialMissingSections: result.initialValidation.missingSections,
    initialEmptySections: result.initialValidation.emptySections,
    initialRequiredOrderValid: result.initialValidation.requiredOrderValid
  };
}

function getJsonByteLength(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
}

function cleanPersistentAttachmentUrl(value: unknown) {
  const text = trimString(value);

  if (!text || text.startsWith("blob:") || text.startsWith("data:")) {
    return null;
  }

  return text;
}

function inferConversationTitle(question: string) {
  return question.length > 40 ? `${question.slice(0, 40)}...` : question;
}

function readConversationId(input: AiChatAskInput) {
  const conversationId = trimString(input.conversation_id) || trimString(input.conversationId);

  return conversationId || null;
}

function validateAttachments(value: unknown) {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new ValidationError("attachments 必须是数组。");
  }

  if (value.length > MAX_ATTACHMENTS) {
    throw new ValidationError(`attachments 数量不能超过 ${MAX_ATTACHMENTS} 个。`);
  }

  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ValidationError(`第 ${index + 1} 个 attachment 必须是对象。`);
    }

    const record = item as Record<string, unknown>;
    const type = trimString(record.type);

    if (!allowedAttachmentTypes.has(type)) {
      throw new ValidationError("attachment 类型不被支持。");
    }

    if ("content" in record || "base64" in record || "bytes" in record || "storagePath" in record || "storage_path" in record) {
      throw new ValidationError("本轮仅支持 attachment 元数据预留，不支持直接上传或解析附件内容。");
    }

    const metadata = toJsonObject(record.metadata);

    if (metadata && getJsonByteLength(metadata) > MAX_ATTACHMENT_METADATA_BYTES) {
      throw new ValidationError(`第 ${index + 1} 个 attachment metadata 过大。`);
    }

    return {
      type,
      name: trimString(record.name) || null,
      filename: trimString(record.filename) || trimString(record.name) || null,
      mime_type: trimString(record.mime_type) || trimString(record.mimeType) || null,
      size: typeof record.size === "number" && Number.isFinite(record.size) ? Math.max(0, Math.round(record.size)) : null,
      reference_id: trimString(record.reference_id) || trimString(record.referenceId) || null,
      url: cleanPersistentAttachmentUrl(record.url),
      publicUrl: cleanPersistentAttachmentUrl(record.publicUrl),
      fileUrl: cleanPersistentAttachmentUrl(record.fileUrl),
      downloadUrl: cleanPersistentAttachmentUrl(record.downloadUrl),
      src: cleanPersistentAttachmentUrl(record.src),
      storage: trimString(record.storage) || null,
      blobKey: trimString(record.blobKey) || null,
      metadata: metadata ?? null
    };
  });
}

function readAttachmentSearchText(metadata: JsonObject | undefined) {
  if (!metadata) {
    return "";
  }

  const text = [
    metadata.ocr,
    metadata.ocrText,
    metadata.text,
    metadata.caption,
    metadata.description,
    metadata.summary
  ]
    .map((value) => trimString(value).slice(0, 160))
    .filter(Boolean)
    .join(" ");

  return [
    buildAttachmentSearchHints(text),
    text
  ].filter(Boolean).join(" ");
}

function readAttachmentOcrText(metadata: JsonObject | undefined) {
  if (!metadata) {
    return "";
  }

  return [
    metadata.ocrText,
    metadata.ocr,
    metadata.text,
    metadata.caption,
    metadata.description,
    metadata.summary
  ]
    .map((value) => trimString(value))
    .find(Boolean) ?? "";
}

function normalizeAttachmentSearchSegment(value: string) {
  return value
    .replace(/^(?:客户|用户|对方|微信截图|截图|聊天记录|他说|她说|说|问|表示|反馈|我想|我要|想要|请问|麻烦|帮我|给我)+/g, "")
    .replace(/(?:要在哪里找|在哪里找|在哪儿找|哪里找|怎么找|如何找)$/g, "")
    .trim();
}

function buildAttachmentSearchHints(text: string) {
  const hints = new Set<string>();
  const normalized = trimString(text)
    .slice(0, MAX_ATTACHMENT_SEARCH_HINT_CHARS)
    .replace(/[\u0000，。！？、；;：:\n\r\t"'“”‘’（）()【】\[\]<>《》]+/g, " ");

  for (const match of normalized.match(ATTACHMENT_SEARCH_KEYWORD_PATTERN) ?? []) {
    hints.add(match);
  }

  for (const segment of normalized.split(/\s+/)) {
    const cleaned = normalizeAttachmentSearchSegment(segment);

    if (/[\u4e00-\u9fff]/.test(cleaned) && cleaned.length >= 2 && cleaned.length <= 12) {
      hints.add(cleaned);
    }

    if (hints.size >= 12) {
      break;
    }
  }

  return Array.from(hints).slice(0, 12).join(" ");
}

function buildAttachmentTextBlocks(attachments: ReturnType<typeof validateAttachments>) {
  return attachments
    .map((attachment, index) => {
      const text = readAttachmentOcrText(attachment.metadata ?? undefined)
        .slice(0, MAX_ATTACHMENT_TEXT_CONTEXT_CHARS)
        .trim();

      if (!text) {
        return "";
      }

      const label = attachment.filename || attachment.name || `附件 ${index + 1}`;

      return [
        `附件 ${index + 1}：${label}`,
        "识别文字：",
        text
      ].join("\n");
    })
    .filter(Boolean)
    .join("\n\n")
    .slice(0, MAX_ATTACHMENT_TEXT_CONTEXT_CHARS)
    .trim();
}

function hasImageAttachment(attachments: ReturnType<typeof validateAttachments>) {
  return attachments.some((attachment) => {
    const type = attachment.type.toLowerCase();
    const mimeType = (attachment.mime_type ?? "").toLowerCase();
    const name = `${attachment.filename ?? ""} ${attachment.name ?? ""}`.toLowerCase();

    return type === "image"
      || mimeType.startsWith("image/")
      || /\.(?:png|jpe?g|webp|gif|bmp)$/i.test(name);
  });
}

function isScreenshotGuidanceQuestion(question: string, input: AiChatAskInput) {
  const hint = [
    question,
    input.userMode,
    input.modeLabel,
    input.modePrompt,
    input.modeReason
  ].map(trimString).join(" ");

  return /(?:看图|看截图|截图|图片|微信|聊天记录|客户原话|客户截图|怎么引导|如何引导|怎么回复|如何回复|回复客户|客户怎么回|客户怎么回复|怎么沟通|怎么处理|怎么说)/.test(hint)
    || /(?:wechat|screenshot|customer_screenshot)/i.test(hint);
}

function shouldRequireAttachmentOcr(
  question: string,
  input: AiChatAskInput,
  attachments: ReturnType<typeof validateAttachments>
) {
  return hasImageAttachment(attachments) && isScreenshotGuidanceQuestion(question, input);
}

function buildAttachmentOcrMissingAnswer() {
  return [
    "这张截图的文字没有识别成功，我现在不能可靠判断客户原话。",
    "",
    "请重新上传更清晰的微信截图，或者把客户消息复制到输入框里。我拿到客户原话后，再帮你提炼客户问题、引导思路和可直接发送的话术。"
  ].join("\n");
}

function buildAttachmentTextContext(attachmentTextBlocks: string) {
  const blocks = attachmentTextBlocks.trim();
  if (!blocks) {
    return null;
  }

  return [
    "[USER_IMAGE_OCR_CONTEXT]",
    "[WECHAT_SCREENSHOT_PRIMARY_CONTEXT]",
    "下面是用户上传微信截图/客户聊天截图识别出的客户原话，是本轮问题的主上下文。",
    "[WECHAT_SCREENSHOT_ROLE_RULES]",
    "永远按微信截图位置判断角色：左侧头像/白色气泡/标注为客户(左侧)的是客户；右侧头像/绿色气泡/标注为我(右侧)的是用户本人。",
    "角色绝对不能反：不要把右侧绿色气泡当成客户说的话，也不要把左侧白色气泡当成用户本人说的话。",
    "回答目标必须是客户最后一条左侧/客户(左侧)消息里的问题、顾虑或反问；右侧/我(右侧)消息只能作为对话铺垫和上下文。",
    "如果识别文字没有保留左右角色，不能强行猜角色；要说明需要更清晰截图或请用户补充客户原话。",
    "回答必须优先围绕这些原文：先提炼客户真实顾虑/问题，再给引导策略和可直接复制给客户的话术。",
    "如果用户问“看图/截图/怎么引导/怎么回复”，不要泛化讲看图方法，直接基于截图原文回答。",
    "禁止编造截图里没有出现的客户背景、产品、价格、订单、症状、时间线或场景；不确定时先说明需要继续确认。",
    "不要把本段系统说明展示给用户。",
    blocks
  ].join("\n");
}

function buildAttachmentOcrContext(attachmentTextBlocks: string): RagContext | null {
  const content = attachmentTextBlocks.trim();

  if (!content) {
    return null;
  }

  return {
    id: "attachment-ocr-context",
    title: "用户上传截图识别文字",
    content,
    summary: "用户上传截图识别文字",
    category: "attachment_ocr",
    tags: ["截图识别", "微信截图"],
    sourceType: "attachment_ocr",
    sourceId: "attachment-ocr",
    sourceTitle: "用户上传截图识别文字",
    score: 0.3,
    relevance_score: 0.3,
    chunk_rank: 1,
    similarity: 0.3
  };
}

function buildRagQueryContext(
  question: string,
  input: AiChatAskInput,
  attachments: ReturnType<typeof validateAttachments>
) {
  const userMode = trimString(input.userMode);
  const modeLabel = trimString(input.modeLabel);
  const modePrompt = trimString(input.modePrompt);
  const modeReason = trimString(input.modeReason);
  const modeParts: string[] = [];

  if (/business_problem|business|经营|业务/.test(userMode)) {
    modeParts.push("业务问题 客户问题 成交 回复 处理建议");
  }

  if (/wechat|screenshot|customer_screenshot|截图|图片/.test(userMode)) {
    modeParts.push("微信截图 客户截图 聊天记录 客户反馈");
  }

  modeParts.push(
    modeLabel,
    modePrompt,
    modeReason
  );

  const attachmentTextParts = attachments
    .map((attachment) => readAttachmentSearchText(attachment.metadata ?? undefined))
    .filter(Boolean);
  const attachmentParts = attachments.flatMap((attachment) => [
    attachment.type,
    attachment.filename,
    attachment.name,
    attachment.mime_type
  ]);

  return [
    ...attachmentTextParts,
    question,
    ...modeParts,
    ...attachmentParts
  ]
    .map((value) => trimString(value))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
}

function toSource(chunk: RetrievedRagChunk) {
  return {
    chunk_id: chunk.chunkId,
    file_id: chunk.fileId,
    item_id: chunk.knowledgeItemId,
    knowledgeBaseId: chunk.knowledgeBaseId,
    agentId: chunk.agentId,
    tenantId: chunk.tenantId,
    namespace: chunk.namespace,
    sourceApp: chunk.sourceApp,
    includeShared: chunk.includeShared,
    includePublished: chunk.includePublished,
    title: chunk.title,
    content_preview: chunk.content.length > 240 ? `${chunk.content.slice(0, 240)}...` : chunk.content,
    score: chunk.score,
    relevance_score: chunk.relevance_score,
    chunk_rank: chunk.chunk_rank,
    matchedBy: chunk.matchedBy
  };
}

async function writeAuditLog(
  db: AiChatDb,
  actor: AiChatActor,
  action: "CHAT_ASK" | "CHAT_RETRIEVE" | "CHAT_PROVIDER_NOT_CONFIGURED" | "CHAT_BLOCKED_UNSAFE_INPUT",
  targetId: string | null,
  metadata: JsonObject
) {
  await db.auditLog.create({
    data: {
      userId: actor.id,
      role: actor.role,
      action,
      targetType: "ai_chat",
      targetId,
      metadata
    }
  }).catch(() => undefined);
}

async function getOrCreateConversation(
  db: AiChatDb,
  actor: AiChatActor,
  conversationId: string | null,
  question: string,
  mode: AiChatMode
) {
  if (conversationId) {
    const existing = await db.conversation.findFirst({
      where: {
        id: conversationId,
        userId: actor.id,
        type: "CHAT"
      }
    });

    if (!existing) {
      throw new NotFoundError("会话不存在。");
    }

    return existing;
  }

  return db.conversation.create({
    data: {
      userId: actor.id,
      title: inferConversationTitle(question),
      type: "CHAT",
      mode,
      metadata: {
        createdBy: "api_ai_chat_ask"
      }
    }
  });
}

async function saveUserMessage(
  db: AiChatDb,
  actor: AiChatActor,
  conversationId: string,
  question: string,
  attachments: ReturnType<typeof validateAttachments>,
  metadata: JsonObject
) {
  return db.message.create({
    data: {
      conversationId,
      userId: actor.id,
      role: "USER",
      content: question,
      attachments,
      metadata
    }
  });
}

async function saveAssistantMessage(
  db: AiChatDb,
  actor: AiChatActor,
  conversationId: string,
  answer: string,
  sources: ReturnType<typeof toSource>[],
  customerAnswer: string,
  metadata: JsonObject
) {
  return db.message.create({
    data: {
      conversationId,
      userId: actor.id,
      role: "ASSISTANT",
      content: answer,
      sources,
      metadata: {
        ...metadata,
        customerAnswer
      }
    }
  });
}

function normalizeConversationMemoryRole(value: unknown): "user" | "assistant" | null {
  const role = trimString(value).toLowerCase();

  if (role === "user") {
    return "user";
  }

  if (role === "assistant") {
    return "assistant";
  }

  return null;
}

function readConversationMemoryContent(message: MessageRecord) {
  const metadata = toJsonObject(message.metadata) ?? {};
  const finalizedAnswer = metadata.finalizedAnswer && typeof metadata.finalizedAnswer === "object" && !Array.isArray(metadata.finalizedAnswer)
    ? metadata.finalizedAnswer
    : null;

  return readSerializedMessageContent(message, metadata, finalizedAnswer)
    .replace(/\s+/g, " ")
    .trim();
}

function toConversationMemoryTurn(message: MessageRecord): RagRecentConversationTurn | null {
  const role = normalizeConversationMemoryRole(message.role);

  if (!role) {
    return null;
  }

  const content = readConversationMemoryContent(message).slice(0, MAX_CONVERSATION_MEMORY_CHARS_PER_TURN).trim();

  if (!content) {
    return null;
  }

  return {
    role,
    content,
    createdAt: toIsoString(message.createdAt) || null
  };
}

async function loadRecentConversation(
  db: AiChatDb,
  actor: AiChatActor,
  conversationId: string
): Promise<RagRecentConversationTurn[]> {
  if (typeof db.message.findMany !== "function") {
    return [];
  }

  const messages = await db.message.findMany({
    where: {
      conversationId,
      OR: [
        { userId: actor.id },
        { userId: null }
      ]
    },
    orderBy: {
      createdAt: "desc"
    },
    take: MAX_CONVERSATION_MEMORY_TURNS * 2
  }).catch(() => []);
  const selectedNewestFirst: RagRecentConversationTurn[] = [];
  let totalChars = 0;

  for (const message of messages) {
    const turn = toConversationMemoryTurn(message);

    if (!turn) {
      continue;
    }

    const remainingChars = MAX_CONVERSATION_MEMORY_TOTAL_CHARS - totalChars;

    if (remainingChars <= 0) {
      break;
    }

    const clippedContent = turn.content.slice(0, Math.min(turn.content.length, remainingChars)).trim();

    if (!clippedContent) {
      continue;
    }

    selectedNewestFirst.push({
      ...turn,
      content: clippedContent
    });
    totalChars += clippedContent.length;

    if (selectedNewestFirst.length >= MAX_CONVERSATION_MEMORY_TURNS) {
      break;
    }
  }

  return selectedNewestFirst.reverse();
}

export async function handleAiChatAsk(
  actor: AiChatActor,
  input: AiChatAskInput,
  options: AiChatAskOptions = {}
) {
  const db = options.db ?? defaultDb();
  const question = sanitizeRagInput(readQuestionInput(input));
  const mode = normalizeAiChatMode(input.mode);
  const requestedDeepThinking = input.enable_deep_thinking === true;
  const enableWebSearch = input.enable_web_search === true;
  const attachments = validateAttachments(input.attachments);
  const businessContext = readBusinessExecutionContext(input);
  const knowledgeSelectionContext = readKnowledgeBaseSelectionContext(input);
  const selectedKnowledgeScope = knowledgeSelectionContext?.scope ?? null;
  const agentScope = resolveAgentKnowledgeScope({
    agentId: selectedKnowledgeScope?.agentId ?? trimString(input.agentId ?? input.expert_id),
    knowledgeBaseId: selectedKnowledgeScope?.knowledgeBaseId ?? trimString(input.knowledgeBaseId ?? input.kb_id),
    namespace: selectedKnowledgeScope?.namespace ?? trimString(input.namespace)
  });
  const directTenantId = trimString(input.tenant_id);
  const scopedTenantId = selectedKnowledgeScope?.tenantId ?? (directTenantId || actor.tenantId || null);
  const explicitRuntimeNamespace = (selectedKnowledgeScope?.namespace ?? trimString(input.namespace)) || undefined;
  const hasExplicitAgentScope = Boolean(
    selectedKnowledgeScope
    || trimString(input.agentId ?? input.expert_id)
    || trimString(input.knowledgeBaseId ?? input.kb_id)
    || trimString(input.namespace)
  );
  const conversationId = readConversationId(input);
  const attachmentTextBlocks = buildAttachmentTextBlocks(attachments);
  const attachmentTextContext = buildAttachmentTextContext(attachmentTextBlocks);
  const requiresAttachmentOcr = shouldRequireAttachmentOcr(question, input, attachments);
  const careerMentorEnabled = isCareerMentorScope({
    agentId: agentScope.agentId,
    knowledgeBaseId: agentScope.knowledgeBaseId,
    namespace: agentScope.namespace
  });
  const enableDeepThinking = requestedDeepThinking || careerMentorEnabled;
  let osContext = os_core.process({
    query: question,
    userId: actor.id,
    sessionId: conversationId ?? "pending",
    mode: "chat",
    chatMode: mode,
    intent: "qa",
    reasoningRequested: enableDeepThinking || needsReasoningModel(question),
    reasoningAvailable: isGptOsReasoningAvailable(),
  });

  if (careerMentorEnabled && osContext.rag.topK < CAREER_MENTOR_RETRIEVAL_TOP_K) {
    osContext = {
      ...osContext,
      rag: {
        ...osContext.rag,
        topK: CAREER_MENTOR_RETRIEVAL_TOP_K
      }
    };
  }

  if (osContext.rag.promptInjectionRisk) {
    await writeAuditLog(db, actor, "CHAT_BLOCKED_UNSAFE_INPUT", null, {
      mode,
      questionLength: question.length
    });
    throw new ValidationError("问题包含不安全指令，无法处理。");
  }

  const conversation = await getOrCreateConversation(db, actor, conversationId, question, mode);
  const normalizedConversationId = String(conversation.id);
  const recentConversation = await loadRecentConversation(db, actor, normalizedConversationId);
  const careerMentorTurnContext = careerMentorEnabled
    ? resolveCareerMentorTurnContext({
        question,
        supportingContext: attachmentTextBlocks,
        recentConversation
      })
    : null;
  const careerMentorScenarioQuestion = careerMentorTurnContext?.scenarioQuestion ?? question;
  const careerMentorSupportingContext = careerMentorTurnContext?.supportingContext ?? attachmentTextBlocks;
  const ragQueryContext = careerMentorEnabled
    ? buildCareerMentorRetrievalQuery(careerMentorScenarioQuestion, careerMentorSupportingContext)
    : buildRagQueryContext(question, input, attachments);
  const careerMentorBusinessContext = careerMentorEnabled
    ? buildCareerMentorBusinessContext(
        careerMentorScenarioQuestion,
        careerMentorSupportingContext,
        {
          continuationRequest: careerMentorTurnContext?.continuationRequested
            ? question
            : null
        }
      )
    : null;
  const effectiveBusinessContext = careerMentorEnabled ? null : businessContext;
  const businessExecutionContext = careerMentorEnabled
    ? [careerMentorBusinessContext, attachmentTextContext].filter(Boolean).join("\n\n") || null
    : [
        knowledgeSelectionContext?.prompt,
        effectiveBusinessContext?.prompt,
        attachmentTextContext
      ].filter(Boolean).join("\n\n") || null;
  await saveUserMessage(db, actor, normalizedConversationId, question, attachments, {
    mode,
    enableDeepThinking,
    enableWebSearch,
    ...agentScope,
    attachmentCount: attachments.length,
    attachmentOcrRequired: requiresAttachmentOcr,
    attachmentOcrApplied: Boolean(attachmentTextContext),
    ...(knowledgeSelectionContext
      ? {
          knowledgeSelection: knowledgeSelectionContext.metadata
        }
      : {}),
    ...(effectiveBusinessContext
      ? {
          businessExecution: effectiveBusinessContext.metadata,
          businessExecutionPrompt: businessExecutionContext
        }
      : {}),
    ...(careerMentorEnabled
      ? {
          careerMentorPolicy: {
            version: CAREER_MENTOR_POLICY_VERSION,
            outputMode: "natural_markdown_with_cards",
            applied: true,
            continuationRequested: careerMentorTurnContext?.continuationRequested ?? false,
            conversationContextApplied: careerMentorTurnContext?.conversationContextApplied ?? false,
            currentStage: careerMentorTurnContext?.currentStage ?? "unknown",
            resolvedStage: careerMentorTurnContext?.resolvedStage ?? "unknown"
          }
        }
      : {})
  });
  await writeAuditLog(db, actor, "CHAT_ASK", normalizedConversationId, {
    mode,
    questionLength: question.length,
    enableDeepThinking,
    enableWebSearch,
    ...agentScope,
    attachmentCount: attachments.length,
    attachmentOcrRequired: requiresAttachmentOcr,
    ...(knowledgeSelectionContext ? { knowledgeSelection: knowledgeSelectionContext.metadata } : {})
  });

  if (requiresAttachmentOcr && !attachmentTextContext) {
    const answer = buildAttachmentOcrMissingAnswer();
    const sources: ReturnType<typeof toSource>[] = [];
    const confidence: RagConfidence = "low";
    const providerStatus = "no_relevant_knowledge" as const;
    const assistantMessage = await saveAssistantMessage(db, actor, normalizedConversationId, answer, sources, answer, {
      mode,
      confidence,
      sourceCount: 0,
      enableDeepThinking,
      enableWebSearch,
      ...agentScope,
      attachmentCount: attachments.length,
      attachmentOcrRequired: true,
      attachmentOcrApplied: false,
      providerStatus,
      fallbackUsed: true,
      providerErrorCode: "ATTACHMENT_OCR_TEXT_MISSING",
      webSearchStatus: enableWebSearch ? "reserved_not_enabled" : "disabled"
    });

    await db.conversation.update({
      where: {
        id: normalizedConversationId
      },
      data: {
        mode,
        metadata: {
          lastMode: mode,
          lastConfidence: confidence,
          lastSourceCount: 0,
          providerErrorCode: "ATTACHMENT_OCR_TEXT_MISSING",
          attachmentOcrRequired: true,
          attachmentOcrApplied: false,
          enableDeepThinking,
          enableWebSearch
        }
      }
    }).catch(() => undefined);

    return {
      answer,
      conversation_id: normalizedConversationId,
      message_id: String(assistantMessage.id),
      mode,
      customer_answer: answer,
      finalized_answer: null,
      sources,
      confidence,
      provider_status: providerStatus,
      model: osContext.route.model,
      actualModel: osContext.route.actualModel,
      selected_model: osContext.route.selected_model,
      provider: osContext.route.provider,
      fallbackUsed: true,
      errorCode: "ATTACHMENT_OCR_TEXT_MISSING",
      trace_id: osContext.trace_id,
      latency_ms: 0,
      rag_diagnostics: {
        topK: osContext.rag.topK,
        hitCount: 0,
        contextChars: 0,
        retrieval_efficiency_score: 0
      },
      feedback_meta: {
        message_id: String(assistantMessage.id),
        trace_id: osContext.trace_id,
        model: osContext.route.model,
        actualModel: osContext.route.actualModel,
        selected_model: osContext.route.selected_model,
        provider: osContext.route.provider,
        fallbackUsed: true,
        sources
      }
    };
  }

  const topK = osContext.rag.topK;
  const careerMentorFastAnswer = careerMentorEnabled
    && isCareerMentorFastAnswerEligible(careerMentorScenarioQuestion, careerMentorSupportingContext);
  const retrievalTopK = careerMentorFastAnswer
    ? Math.min(topK, CAREER_MENTOR_FAST_RETRIEVAL_TOP_K)
    : topK;
  const dbQueryContexts = careerMentorEnabled
    ? buildCareerMentorRetrievalQueries(careerMentorScenarioQuestion, careerMentorSupportingContext)
    : [ragQueryContext];
  const dbChunksPromise = Promise.all(dbQueryContexts.map((query) => retrieveRelevantChunks(query, {
    userId: actor.id,
    tenantId: scopedTenantId,
    appType: "user_app",
    ...(hasExplicitAgentScope ? agentScope : {}),
    includeShared: true,
    includePublished: true,
    mode,
    topK: retrievalTopK,
    knowledgeScope: selectedKnowledgeScope,
    allowScopedFallback: !careerMentorEnabled,
    db
  })));
  const loadHybridCareerRetrieval = () => careerMentorEnabled && !options.db
    ? retrieveKnowledge({
        query: ragQueryContext,
        userId: actor.id,
        tenantId: scopedTenantId,
        appType: "user_app",
        ...agentScope,
        includeShared: true,
        includePublished: true,
        topK,
        minResults: 1,
        requestId: osContext.trace_id
      }).catch(() => null)
    : Promise.resolve(null);
  const eagerHybridCareerRetrievalPromise = careerMentorEnabled && !careerMentorFastAnswer
    ? loadHybridCareerRetrieval()
    : Promise.resolve(null);
  const loadRuntimeMemory = () => hasExplicitAgentScope
    ? searchRuntimeMemories({
        query: careerMentorEnabled ? ragQueryContext : question,
        knowledgeBaseId: agentScope.knowledgeBaseId,
        agentId: agentScope.agentId,
        namespace: explicitRuntimeNamespace,
        tenantId: scopedTenantId ?? undefined,
        limit: topK,
      }).catch((error) => ({
        ok: true as const,
        memoryApplied: false,
        memories: [],
        memoryTrace: [],
        usedMemoryIds: [],
        warnings: [error instanceof Error ? error.message : "runtime memory search failed"],
      }))
    : Promise.resolve({
        ok: true as const,
        memoryApplied: false,
        memories: [],
        memoryTrace: [],
        usedMemoryIds: [],
        warnings: ["缺少 agent scope，跳过 runtime memory 检索。"],
      });
  const [dbChunkGroups, eagerHybridCareerRetrieval, runtimeMemoryResult] = careerMentorEnabled
    ? await Promise.all([
        dbChunksPromise,
        eagerHybridCareerRetrievalPromise,
        withCareerMentorRuntimeMemoryBudget(loadRuntimeMemory())
      ])
    : [await dbChunksPromise, await eagerHybridCareerRetrievalPromise, await loadRuntimeMemory()] as const;
  const dbChunks = dbChunkGroups.flat();
  const runtimeMemoryChunks = runtimeMemoryResult.memories.map((item, index) => toRuntimeMemoryChunk(item, index, {
    knowledgeBaseId: agentScope.knowledgeBaseId,
    agentId: agentScope.agentId,
    namespace: explicitRuntimeNamespace ?? agentScope.namespace,
    tenantId: scopedTenantId,
  }));
  const careerMentorFastAnswerQualityGatePassed = careerMentorFastAnswer
    && hasCareerMentorFastAnswerEvidence({
      chunks: dbChunks,
      question: careerMentorScenarioQuestion,
      supportingContext: careerMentorSupportingContext
    });
  const hybridCareerRetrieval = careerMentorFastAnswer && !careerMentorFastAnswerQualityGatePassed
    ? await loadHybridCareerRetrieval()
    : eagerHybridCareerRetrieval;
  const hybridCareerChunks = (hybridCareerRetrieval?.results ?? []).map((item, index) => (
    toHybridCareerChunk(item, index, {
      knowledgeBaseId: agentScope.knowledgeBaseId,
      agentId: agentScope.agentId,
      namespace: explicitRuntimeNamespace ?? agentScope.namespace,
      tenantId: scopedTenantId
    })
  ));
  const careerRetrievalMode: RetrievalMode | "scoped_keyword" = hybridCareerRetrieval?.mode
    ?? "scoped_keyword";
  const chunks = careerMentorEnabled
    ? prioritizeCareerMentorChunks({
        chunks: [...runtimeMemoryChunks, ...hybridCareerChunks, ...dbChunks],
        question: careerMentorScenarioQuestion,
        supportingContext: careerMentorSupportingContext,
        topK
      })
    : mergeRuntimeMemoryChunks(runtimeMemoryChunks, dbChunks, topK);
  const careerKnowledgeHit = !careerMentorEnabled || chunks.length > 0;
  const attachmentOcrContext = buildAttachmentOcrContext(attachmentTextBlocks);
  const contexts = [
    ...buildRagContext(chunks),
    ...(attachmentOcrContext ? [attachmentOcrContext] : [])
  ];
  const sources = chunks.map(toSource);
  const confidence = calculateConfidence(chunks);
  const ragDiagnostics = os_core.buildRagDiagnostics(osContext, chunks, contexts);
  const relevanceScore = calculateRelevanceScore(chunks);
  osContext = os_core.routeModel(osContext, {
    query: question,
    intent: "qa",
    reasoningRequested: enableDeepThinking || needsReasoningModel(question),
    reasoningAvailable: isGptOsReasoningAvailable(),
    hitCount: ragDiagnostics.hitCount,
    topK: ragDiagnostics.rag_topK,
    relevance_score: relevanceScore,
    contextChars: ragDiagnostics.contextChars,
    cost_mode: resolveCostMode(mode, enableDeepThinking, confidence),
  });
  const runtimeOrchestrator = new AIRuntimeOrchestrator();
  const runtimeResult = runtimeOrchestrator.handleRequest(question, {
    source: "user_chat",
    runtimeEntry: "user_chat_service",
    userId: actor.id,
    platform: "web",
    category: mode,
    agentRole: actor.role,
    previousKnowledgeDrafts: chunks.map((chunk) => ({
      id: chunk.knowledgeItemId || chunk.chunkId,
      title: chunk.title,
      summary: chunk.summary ?? chunk.content,
      category: chunk.category ?? undefined,
      tags: chunk.tags,
      standardQuestion: question,
      standardAnswer: chunk.content,
      scenarios: chunk.category ? [chunk.category] : [],
      sourceMaterials: [chunk.sourceTitle, chunk.sourceUrl, "retrieval-only:user-chat"].filter(Boolean) as string[]
    }))
  });
  await writeAuditLog(db, actor, "CHAT_RETRIEVE", normalizedConversationId, {
    mode,
    topK,
    ...(careerMentorEnabled
      ? {
          careerMentorFastAnswer,
          careerMentorFastAnswerQualityGatePassed,
          supplementalHybridRetrievalSkipped: careerMentorFastAnswerQualityGatePassed,
          retrievalTopK,
          finalTopK: topK
        }
      : {}),
    sourceCount: sources.length,
    confidence,
    runtimeMemory: {
      applied: runtimeMemoryResult.memoryApplied,
      usedMemoryIds: runtimeMemoryResult.usedMemoryIds,
      warnings: runtimeMemoryResult.warnings
    }
  });

  let answer = careerMentorEnabled && !careerKnowledgeHit
    ? buildCareerMentorNaturalNoEvidenceAnswer()
    : NO_KNOWLEDGE_ANSWER;
  let customerAnswer = careerMentorEnabled && !careerKnowledgeHit
    ? ""
    : buildNoKnowledgeCustomerAnswer();
  let providerStatus: "ok" | "provider_not_configured" | "no_relevant_knowledge" | "error" = "no_relevant_knowledge";
  let providerUsed: string | undefined;
  let modelUsed: string | undefined;
  let fallbackUsed: boolean | undefined;
  let providerErrorCode: string | undefined;
  let answerGroundingScore: number | undefined;
  let modelFeedbackEvent: ModelFeedbackEvent | undefined;
  let businessSchemaGuard: BusinessSchemaGuardResult | null = null;
  let careerEvidencePlan: CareerMentorEvidencePlanSummary | undefined;
  let careerIngestReplyPassthrough = false;

  if (careerMentorEnabled || (contexts.length > 0 && careerKnowledgeHit)) {
    customerAnswer = buildCustomerAnswerFromChunks({
      question: careerMentorEnabled ? careerMentorScenarioQuestion : question,
      chunks,
      confidence,
      mode
    });

    if (options.answerProvider && (careerMentorEnabled || options.providerConfigured)) {
      try {
        const providerResult = await options.answerProvider({
          question: careerMentorEnabled ? careerMentorScenarioQuestion : question,
          originalQuestion: question,
          contexts,
          mode,
          enableDeepThinking,
          confidence,
          model: osContext.route.model,
          actualModel: osContext.route.actualModel,
          provider: osContext.route.provider,
          providerFallbackChain: osContext.route.provider_fallback_chain,
          fallbackChain: osContext.route.fallback_chain,
          traceId: osContext.trace_id,
          businessExecutionContext,
          recentConversation,
          ...(careerMentorEnabled
            ? { careerMentorStage: careerMentorTurnContext?.resolvedStage ?? "unknown" }
            : {}),
          ...agentScope
        });

        careerIngestReplyPassthrough = careerMentorEnabled
          && providerResult.answerOutputMode === "admin_ingest_reply_markdown";
        careerEvidencePlan = careerIngestReplyPassthrough
          ? undefined
          : providerResult.careerEvidencePlan;
        answer = careerIngestReplyPassthrough
          ? providerResult.answer
          : careerMentorEnabled
          ? cleanCareerMentorUserAnswer(
              normalizeUserChatMarkdown(providerResult.answer),
              {
                chunks,
                question: careerMentorScenarioQuestion,
                supportingContext: careerMentorSupportingContext,
                strictEvidencePlan: Boolean(careerEvidencePlan),
                evidencePlanAdaptiveReplies: careerEvidencePlan?.adaptiveReplies,
                evidencePlanFixedScript: careerEvidencePlan?.fixedScript,
                evidencePlanEvidenceIds: careerEvidencePlan?.evidenceIds
              }
            )
          : cleanUserFacingRagAnswer(providerResult.answer);
        customerAnswer = careerIngestReplyPassthrough
          ? ""
          : careerMentorEnabled
          ? extractCareerMentorCustomerAnswer(answer)
          : buildCustomerAnswerFromText(question, answer);
        providerStatus = "ok";
        providerUsed = providerResult.providerUsed;
        modelUsed = providerResult.modelUsed;
        fallbackUsed = providerResult.fallbackUsed;
        answerGroundingScore = providerResult.answerGroundingScore;
        modelFeedbackEvent = providerResult.modelFeedbackEvent;
        providerErrorCode = providerResult.originalProviderErrorCode;

        if (!answer) {
          throw new AppError("AI_PROVIDER_FAILED", "AI provider 返回了空回答。", 502);
        }
      } catch (error) {
        const appError = toAppError(error);
        careerIngestReplyPassthrough = false;
        answer = careerMentorEnabled
          ? buildCareerMentorNaturalProviderErrorAnswer()
          : RAG_CUSTOMER_DRAFT_ANSWER;
        customerAnswer = careerMentorEnabled ? "" : customerAnswer;
        providerStatus = "error";
        fallbackUsed = true;
        providerErrorCode = appError.code;
      }
    } else {
      answer = careerMentorEnabled
        ? buildCareerMentorNaturalProviderUnavailableAnswer()
        : RAG_CUSTOMER_DRAFT_ANSWER;
      customerAnswer = careerMentorEnabled ? "" : customerAnswer;
      providerStatus = "provider_not_configured";
      fallbackUsed = true;
      providerErrorCode = "PROVIDER_NOT_CONFIGURED";
      await writeAuditLog(db, actor, "CHAT_PROVIDER_NOT_CONFIGURED", normalizedConversationId, {
        mode,
        sourceCount: sources.length
      });
    }
  }

  const businessMetadata = effectiveBusinessContext?.metadata as JsonObject | undefined;
  const primaryAction = readNestedJsonObject(businessMetadata, "primaryAction");
  const autoSalesAgentMetadata = readNestedJsonObject(businessMetadata, "autoSalesAgent") ?? null;

  const providerMainAnswer = answer;
  const providerCustomerAnswer = customerAnswer;

  businessSchemaGuard = guardBusinessOutputSchema({
    response: answer,
    intent: trimString(businessMetadata?.intent) || "knowledge_user",
    businessStrategy: trimString(businessMetadata?.executionGoal),
    standardReply: customerAnswer || trimString(primaryAction?.copySuggestion) || trimString(businessMetadata?.closingScript),
    nextAction: trimString(businessMetadata?.nextBestQuestion)
  });

  const businessSchemaGuardMetadata = toBusinessSchemaGuardMetadata(businessSchemaGuard);
  const rawAnswerBeforeFinalizer = careerIngestReplyPassthrough
    ? providerMainAnswer
    : normalizeUserChatMarkdown(providerMainAnswer || businessSchemaGuard.response);
  const rawCustomerAnswerBeforeFinalizer = normalizeUserChatMarkdown(
    providerCustomerAnswer || businessSchemaGuard.response
  );
  const finalizedAnswer = finalizeUserAnswer({
    rawAnswer: rawAnswerBeforeFinalizer,
    customerAnswer: rawCustomerAnswerBeforeFinalizer,
    sources,
    businessContext: businessMetadata,
    agentContext: autoSalesAgentMetadata,
    userMessage: question
  });

  const finalizedDisplayAnswer = formatFinalizedAnswerForDisplay(finalizedAnswer);
  answer = careerIngestReplyPassthrough
    ? rawAnswerBeforeFinalizer
    : careerMentorEnabled && providerStatus !== "ok"
    ? rawAnswerBeforeFinalizer
    : providerStatus === "ok" && rawAnswerBeforeFinalizer
      ? rawAnswerBeforeFinalizer
      : finalizedDisplayAnswer;
  customerAnswer = finalizedAnswer.customerReply;

  const actualModel = modelUsed ?? osContext.route.actualModel;
  const visibleFallbackUsed = (fallbackUsed ?? false) || osContext.route.fallbackUsed;
  const outputControlledAnswer = careerIngestReplyPassthrough
    ? answer
    : processAIOutput(normalizeUserChatMarkdown(answer), {
        model: actualModel,
        source: "ai_chat_ask",
        mode
      }).output;
  const cleanOutputControlledAnswer = careerIngestReplyPassthrough
    ? outputControlledAnswer
    : careerMentorEnabled
      ? cleanCareerMentorUserAnswer(
          normalizeUserChatMarkdown(outputControlledAnswer),
          {
            chunks,
            question: careerMentorScenarioQuestion,
            supportingContext: careerMentorSupportingContext,
            strictEvidencePlan: Boolean(careerEvidencePlan) || providerStatus !== "ok" || !careerKnowledgeHit,
            evidencePlanAdaptiveReplies: careerEvidencePlan?.adaptiveReplies,
            evidencePlanFixedScript: careerEvidencePlan?.fixedScript,
            evidencePlanEvidenceIds: careerEvidencePlan?.evidenceIds
          }
        )
      : cleanUserFacingRagAnswer(outputControlledAnswer);

  if (cleanOutputControlledAnswer !== answer) {
    answer = cleanOutputControlledAnswer;

    if (providerStatus === "ok") {
      customerAnswer = careerMentorEnabled
        ? extractCareerMentorCustomerAnswer(answer)
        : buildCustomerAnswerFromText(question, answer);
    }
  }

  if (careerMentorEnabled) {
    customerAnswer = careerIngestReplyPassthrough
      ? ""
      : extractCareerMentorCustomerAnswer(answer);
    finalizedAnswer.customerReply = customerAnswer;
  }
  const visibleAnswerGroundingScore = answerGroundingScore ?? calculateFallbackGroundingScore(chunks, visibleFallbackUsed);
  const visibleModelFeedbackEvent: ModelFeedbackEvent = {
    model_used: modelFeedbackEvent?.model_used ?? actualModel,
    was_successful: modelFeedbackEvent?.was_successful ?? providerStatus === "ok",
    fallback_triggered: modelFeedbackEvent?.fallback_triggered ?? visibleFallbackUsed,
    response_quality: modelFeedbackEvent?.response_quality ?? visibleAnswerGroundingScore,
    latency: modelFeedbackEvent?.latency ?? 0,
  };
  const retrievalEfficiencyScore = calculateRetrievalEfficiencyScore(ragDiagnostics.hitCount, ragDiagnostics.rag_topK);
  const ragQualityScore = calculateRagQualityScore({
    relevanceScore,
    answerGroundingScore: visibleAnswerGroundingScore,
    retrievalEfficiencyScore,
    fallbackUsed: visibleFallbackUsed,
  });
  const answerQuality = classifyAnswerQuality({
    hitCount: ragDiagnostics.hitCount,
    relevanceScore,
    answerGroundingScore: visibleAnswerGroundingScore,
    fallbackUsed: visibleFallbackUsed,
    structured: isStructuredAnswer(answer),
  });
  const knowledgeFeedbackEvent = analyzeKnowledgeFeedback({
    relevanceScore,
    hitCount: ragDiagnostics.hitCount,
    answerGroundingScore: visibleAnswerGroundingScore,
    fallbackUsed: visibleFallbackUsed,
  });
  const knowledgeGapEvent = detectKnowledgeGap({
    query: question,
    relevanceScore,
    hitCount: ragDiagnostics.hitCount,
    answerGroundingScore: visibleAnswerGroundingScore,
  });
  const optimizationSuggestions = suggestKnowledgeImprovements(knowledgeGapEvent, {
    ragQualityScore,
    fallbackUsed: visibleFallbackUsed,
    answerQuality,
  });
  const evolutionReport = evaluateEvolutionHealth({
    ragQualityScore,
    relevanceScore,
    hitCount: ragDiagnostics.hitCount,
    topK: ragDiagnostics.rag_topK,
    fallbackUsed: visibleFallbackUsed,
    answerQuality,
  });
  const runtimeFinalOutput = runtimeOrchestrator.generateFinalOutput({
    query: question,
    baseResponse: answer,
    retrieval: runtimeResult.retrieval,
    decision: runtimeResult.decision,
    strategy: runtimeResult.strategy
  });
  const runtimeFeedback = runtimeOrchestrator.collectFeedbackLoop({
    query: question,
    responseText: runtimeFinalOutput.replyMarkdown,
    retrieval: runtimeResult.retrieval,
    decision: runtimeResult.decision
  });
  const aiRuntime = {
    requestId: runtimeResult.requestId,
    version: runtimeResult.version,
    retrieval: runtimeResult.retrieval,
    decision: runtimeResult.decision,
    strategy: runtimeResult.strategy,
    finalOutput: runtimeFinalOutput,
    feedback: runtimeFeedback,
    validation: runtimeResult.validation,
    diagnostics: runtimeResult.diagnostics
  };
  const osTrace = os_core.recordTrace(osContext, {
    provider_status: providerStatus,
    fallbackUsed: visibleFallbackUsed,
    actualModel,
    diagnostics: ragDiagnostics,
    metadata: {
      conversationId: normalizedConversationId,
      mode,
      sourceCount: sources.length,
      providerErrorCode: providerErrorCode ?? null,
      relevanceScore,
      answerGroundingScore: visibleAnswerGroundingScore,
      retrievalEfficiencyScore,
      ragQualityScore,
      answerQuality,
      knowledgeFeedbackEvent,
      knowledgeGapEvent,
      optimizationSuggestions,
      evolutionReport,
      businessSchemaGuard: businessSchemaGuardMetadata,
      autoSalesAgent: autoSalesAgentMetadata,
      aiRuntime,
    },
  });

  const assistantMessage = await saveAssistantMessage(db, actor, normalizedConversationId, answer, sources, customerAnswer, {
    mode,
    confidence,
    sourceCount: sources.length,
    enableDeepThinking,
    enableWebSearch,
    ...(knowledgeSelectionContext
      ? {
          knowledgeSelection: knowledgeSelectionContext.metadata
        }
      : {}),
    ...(effectiveBusinessContext
      ? {
          businessExecution: effectiveBusinessContext.metadata,
          businessExecutionPrompt: businessExecutionContext
        }
      : {}),
    ...(careerMentorEnabled
      ? {
          careerMentorGrounding: {
            scopeVerified: true,
            retrievalMode: `career_${careerRetrievalMode}_stage_gated`,
            knowledgeHitCount: chunks.length,
            stageAlignedHitCount: chunks.length,
            evidenceIds: careerEvidencePlan?.evidenceIds ?? [],
            plannerPassed: careerEvidencePlan?.plannerPassed ?? false,
            writerPassed: careerEvidencePlan?.writerPassed ?? false,
            groundingValidationPassed: careerEvidencePlan?.groundingValidationPassed ?? false,
            plannerRepairUsed: careerEvidencePlan?.plannerRepairUsed ?? false,
            outputMode: careerIngestReplyPassthrough
              ? "admin_ingest_reply_markdown"
              : "natural_markdown_with_cards",
            naturalBodyPassthrough: careerIngestReplyPassthrough
              || Boolean(careerEvidencePlan?.groundingValidationPassed),
            deepThinkingApplied: enableDeepThinking,
            staticFallbackUsed: Boolean(
              customerAnswer
              && careerEvidencePlan
              && !careerEvidencePlan.fixedScript
            )
          }
        }
      : {}),
    businessSchemaGuard: businessSchemaGuardMetadata,
    responseFinalizer: {
      version: "ai-knowledge-os-v10",
      finalized: true,
      removedInternalLabels: finalizedAnswer.debug?.removedInternalLabels ?? []
    },
    finalizedAnswer,
    rawAnswerBeforeFinalizer,
    rawCustomerAnswerBeforeFinalizer,
    webSearchStatus: enableWebSearch ? "reserved_not_enabled" : "disabled",
    providerStatus,
    providerUsed: providerUsed ?? null,
    modelUsed: modelUsed ?? null,
    fallbackUsed: visibleFallbackUsed,
    providerErrorCode: providerErrorCode ?? null,
    runtimeMemory: {
      applied: runtimeMemoryResult.memoryApplied,
      usedMemoryIds: runtimeMemoryResult.usedMemoryIds,
      trace: runtimeMemoryResult.memoryTrace,
      warnings: runtimeMemoryResult.warnings
    },
    modelFeedbackEvent: visibleModelFeedbackEvent,
    relevanceScore,
    answerGroundingScore: visibleAnswerGroundingScore,
    retrievalEfficiencyScore,
    ragQualityScore,
    answerQuality,
    knowledgeFeedbackEvent,
    knowledgeGapEvent,
    optimizationSuggestions,
    evolutionReport,
    gptOsTraceId: osTrace.trace_id,
    gptOsModel: osContext.route.model,
    gptOsActualModel: actualModel,
    gptOsProvider: osContext.route.provider,
    gptOsRouteDecision: osContext.route.route_decision,
    gptOsReasoningType: osContext.route.reasoning_type,
    gptOsCostMode: osContext.route.cost_mode,
    gptOsFallbackChain: osContext.route.fallback_chain,
    gptOsFallbackChainV2: osContext.route.fallback_chain_v2,
    gptOsFallbackChainV3: osContext.route.fallback_chain_v3,
    gptOsFallbackChainV4: osContext.route.fallback_chain_v4,
    gptOsFallbackChainV5: osContext.route.fallback_chain_v5,
    gptOsFallbackChainV6: osContext.route.fallback_chain_v6,
    gptOsModelWeights: osContext.route.model_weights,
    gptOsModelWeightsV3: osContext.route.model_weights_v3,
    gptOsModelWeightsV4: osContext.route.model_weights_v4,
    gptOsModelWeightsV5: osContext.route.model_weights_v5,
    gptOsModelWeightsV6: osContext.route.model_weights_v6,
    gptOsLearningTrace: osContext.route.learning_trace,
    gptOsReasoning: osContext.route.reasoning,
    gptOsReinforcement: osContext.route.reinforcement,
    gptOsAbTest: osContext.route.ab_test,
    gptOsLifecycle: osContext.route.lifecycle,
    gptOsSelectedStrategy: osContext.route.selected_strategy,
    gptOsStrategySet: osContext.route.strategy_set,
    gptOsStrategyGeneration: osContext.route.strategy_generation,
    gptOsStrategyEvolution: osContext.route.strategy_evolution,
    gptOsIsAutoEvolving: osContext.route.is_auto_evolving,
    gptOsStrategyUpdated: osContext.route.strategy_updated,
    gptOsGlobalScore: osContext.route.global_score,
    gptOsGlobalScores: osContext.route.global_scores,
    gptOsNewStrategyName: osContext.route.new_strategy_name,
    gptOsStrategyInvention: osContext.route.strategy_invention,
    gptOsStrategyEvolver: osContext.route.strategy_evolver,
    gptOsModelChain: osContext.route.model_chain,
    gptOsAutonomousScore: osContext.route.autonomous_score,
    gptOsSelfLoop: osContext.route.self_loop,
    gptOsStrategyCombinedChain: osContext.route.strategy_combined_chain,
    gptOsNewStrategyCreated: osContext.route.new_strategy_created,
    gptOsStrategyDeprecated: osContext.route.strategy_deprecated,
    gptOsAutonomousParadigm: osContext.route.autonomous_paradigm,
    gptOsRoutingReconstruction: osContext.route.routing_reconstruction,
    gptOsGlobalReasoning: osContext.route.global_reasoning,
    gptOsSelfEvolvingBrain: osContext.route.self_evolving_brain,
    gptOsNewParadigmName: osContext.route.new_paradigm_name,
    gptOsRoutingPhilosophy: osContext.route.routing_philosophy,
    gptOsModelAllocationStrategy: osContext.route.model_allocation_strategy,
    gptOsNewParadigmGenerated: osContext.route.new_paradigm_generated,
    gptOsRoutingGraphChanged: osContext.route.routing_graph_changed,
    gptOsModelPriorityShift: osContext.route.model_priority_shift,
    gptOsIsFullyAutonomous: osContext.route.is_fully_autonomous,
    gptOsDecisionMode: osContext.route.decision_mode,
    gptOsProviderFallbackChain: osContext.route.provider_fallback_chain,
    gptOsRagDiagnostics: ragDiagnostics,
    gptOsGrowthEnhancer: osContext.growthEnhancer,
    aiRuntime
  });
  await db.conversation.update({
    where: {
      id: normalizedConversationId
    },
    data: {
      mode,
      metadata: {
        lastMode: mode,
        lastConfidence: confidence,
        lastSourceCount: sources.length,
        providerErrorCode: providerErrorCode ?? null,
        ragQualityScore,
        answerQuality,
        knowledgeFeedbackEvent,
        knowledgeGapEvent,
        optimizationSuggestions,
        evolutionReport,
        ...(knowledgeSelectionContext ? { knowledgeSelection: knowledgeSelectionContext.metadata } : {}),
        businessSchemaGuard: businessSchemaGuardMetadata,
        responseFinalizer: {
          version: "ai-knowledge-os-v10",
          finalized: true,
          removedInternalLabels: finalizedAnswer.debug?.removedInternalLabels ?? []
        },
        finalizedAnswer,
        autoSalesAgent: autoSalesAgentMetadata,
        gptOsModel: osContext.route.model,
        gptOsActualModel: actualModel,
        gptOsProvider: osContext.route.provider,
        gptOsRouteDecision: osContext.route.route_decision,
        gptOsFallbackChain: osContext.route.fallback_chain,
        gptOsFallbackChainV2: osContext.route.fallback_chain_v2,
        gptOsFallbackChainV3: osContext.route.fallback_chain_v3,
        gptOsFallbackChainV4: osContext.route.fallback_chain_v4,
        gptOsFallbackChainV5: osContext.route.fallback_chain_v5,
        gptOsFallbackChainV6: osContext.route.fallback_chain_v6,
        gptOsModelWeights: osContext.route.model_weights,
        gptOsModelWeightsV3: osContext.route.model_weights_v3,
        gptOsModelWeightsV4: osContext.route.model_weights_v4,
        gptOsModelWeightsV5: osContext.route.model_weights_v5,
        gptOsModelWeightsV6: osContext.route.model_weights_v6,
        gptOsLearningTrace: osContext.route.learning_trace,
        gptOsReinforcement: osContext.route.reinforcement,
        gptOsAbTest: osContext.route.ab_test,
        gptOsLifecycle: osContext.route.lifecycle,
        gptOsSelectedStrategy: osContext.route.selected_strategy,
        gptOsStrategySet: osContext.route.strategy_set,
        gptOsStrategyEvolution: osContext.route.strategy_evolution,
        gptOsIsAutoEvolving: osContext.route.is_auto_evolving,
        gptOsStrategyUpdated: osContext.route.strategy_updated,
        gptOsGlobalScore: osContext.route.global_score,
        gptOsNewStrategyName: osContext.route.new_strategy_name,
        gptOsStrategyInvention: osContext.route.strategy_invention,
        gptOsStrategyEvolver: osContext.route.strategy_evolver,
        gptOsModelChain: osContext.route.model_chain,
        gptOsAutonomousScore: osContext.route.autonomous_score,
        gptOsSelfLoop: osContext.route.self_loop,
        gptOsStrategyCombinedChain: osContext.route.strategy_combined_chain,
        gptOsNewStrategyCreated: osContext.route.new_strategy_created,
        gptOsStrategyDeprecated: osContext.route.strategy_deprecated,
        gptOsAutonomousParadigm: osContext.route.autonomous_paradigm,
        gptOsRoutingReconstruction: osContext.route.routing_reconstruction,
        gptOsGlobalReasoning: osContext.route.global_reasoning,
        gptOsSelfEvolvingBrain: osContext.route.self_evolving_brain,
        gptOsNewParadigmName: osContext.route.new_paradigm_name,
        gptOsRoutingPhilosophy: osContext.route.routing_philosophy,
        gptOsModelAllocationStrategy: osContext.route.model_allocation_strategy,
        gptOsNewParadigmGenerated: osContext.route.new_paradigm_generated,
        gptOsRoutingGraphChanged: osContext.route.routing_graph_changed,
        gptOsModelPriorityShift: osContext.route.model_priority_shift,
        gptOsIsFullyAutonomous: osContext.route.is_fully_autonomous,
        gptOsDecisionMode: osContext.route.decision_mode,
        modelFeedbackEvent: visibleModelFeedbackEvent,
        enableDeepThinking,
        enableWebSearch
      }
    }
  }).catch(() => undefined);

  return {
    answer,
    conversation_id: normalizedConversationId,
    message_id: String(assistantMessage.id),
    mode,
    customer_answer: customerAnswer,
    finalized_answer: finalizedAnswer,
    sources,
    confidence,
    provider_status: providerStatus,
    career_output_mode: careerIngestReplyPassthrough
      ? "admin_ingest_reply_markdown" as const
      : null,
    model: osContext.route.model,
    actualModel,
    selected_model: osContext.route.selected_model,
    provider: osContext.route.provider,
    fallbackUsed: visibleFallbackUsed,
    fallback_chain: osContext.route.fallback_chain,
    fallback_chain_v2: osContext.route.fallback_chain_v2,
    fallback_chain_v3: osContext.route.fallback_chain_v3,
    fallback_chain_v4: osContext.route.fallback_chain_v4,
    fallback_chain_v5: osContext.route.fallback_chain_v5,
    fallback_chain_v6: osContext.route.fallback_chain_v6,
    provider_fallback_chain: osContext.route.provider_fallback_chain,
    model_weights: osContext.route.model_weights,
    model_weights_v3: osContext.route.model_weights_v3,
    model_weights_v4: osContext.route.model_weights_v4,
    model_weights_v5: osContext.route.model_weights_v5,
    model_weights_v6: osContext.route.model_weights_v6,
    reasoning: osContext.route.reasoning,
    learning_trace: osContext.route.learning_trace,
    reinforcement: osContext.route.reinforcement,
    ab_test: osContext.route.ab_test,
    lifecycle: osContext.route.lifecycle,
    selected_strategy: osContext.route.selected_strategy,
    strategy_set: osContext.route.strategy_set,
    strategy_generation: osContext.route.strategy_generation,
    strategy_evolution: osContext.route.strategy_evolution,
    is_auto_evolving: osContext.route.is_auto_evolving,
    strategy_updated: osContext.route.strategy_updated,
    global_score: osContext.route.global_score,
    global_scores: osContext.route.global_scores,
    new_strategy_name: osContext.route.new_strategy_name,
    strategy_invention: osContext.route.strategy_invention,
    strategy_evolver: osContext.route.strategy_evolver,
    model_chain: osContext.route.model_chain,
    autonomous_score: osContext.route.autonomous_score,
    self_loop: osContext.route.self_loop,
    strategy_combined_chain: osContext.route.strategy_combined_chain,
    new_strategy_created: osContext.route.new_strategy_created,
    strategy_deprecated: osContext.route.strategy_deprecated,
    autonomous_paradigm: osContext.route.autonomous_paradigm,
    routing_reconstruction: osContext.route.routing_reconstruction,
    global_reasoning: osContext.route.global_reasoning,
    self_evolving_brain: osContext.route.self_evolving_brain,
    new_paradigm_name: osContext.route.new_paradigm_name,
    routing_philosophy: osContext.route.routing_philosophy,
    model_allocation_strategy: osContext.route.model_allocation_strategy,
    new_paradigm_generated: osContext.route.new_paradigm_generated,
    routing_graph_changed: osContext.route.routing_graph_changed,
    model_priority_shift: osContext.route.model_priority_shift,
    is_fully_autonomous: osContext.route.is_fully_autonomous,
    decision_mode: osContext.route.decision_mode,
    model_feedback_event: visibleModelFeedbackEvent,
    errorCode: providerErrorCode ?? null,
    trace_id: osTrace.trace_id,
    latency_ms: osTrace.latency_ms,
    route_decision: osContext.route.route_decision,
    reasoning_type: osContext.route.reasoning_type,
    cost_mode: osContext.route.cost_mode,
    rag_signal: osContext.route.rag_signal,
    rag_diagnostics: {
      topK: ragDiagnostics.rag_topK,
      hitCount: ragDiagnostics.hitCount,
      contextChars: ragDiagnostics.contextChars,
      retrieval_efficiency_score: retrievalEfficiencyScore
    },
    relevance_score: relevanceScore,
    answer_grounding_score: visibleAnswerGroundingScore,
    answer_quality: answerQuality,
    business_schema_guard: businessSchemaGuardMetadata,
    auto_sales_agent: autoSalesAgentMetadata,
    auto_improvement: {
      knowledge_gap_event: knowledgeGapEvent,
      optimization_suggestions: optimizationSuggestions,
      evolution_report: evolutionReport,
    },
    ai_runtime: aiRuntime,
    feedback_meta: {
      message_id: String(assistantMessage.id),
      trace_id: osTrace.trace_id,
      model: osContext.route.model,
      actualModel,
      selected_model: osContext.route.selected_model,
      provider: osContext.route.provider,
      fallbackUsed: visibleFallbackUsed,
      fallback_chain: osContext.route.fallback_chain,
      fallback_chain_v2: osContext.route.fallback_chain_v2,
      fallback_chain_v3: osContext.route.fallback_chain_v3,
      fallback_chain_v4: osContext.route.fallback_chain_v4,
      fallback_chain_v5: osContext.route.fallback_chain_v5,
      fallback_chain_v6: osContext.route.fallback_chain_v6,
      model_weights: osContext.route.model_weights,
      model_weights_v3: osContext.route.model_weights_v3,
      model_weights_v4: osContext.route.model_weights_v4,
      model_weights_v5: osContext.route.model_weights_v5,
      model_weights_v6: osContext.route.model_weights_v6,
      reasoning: osContext.route.reasoning,
      learning_trace: osContext.route.learning_trace,
      reinforcement: osContext.route.reinforcement,
      ab_test: osContext.route.ab_test,
      lifecycle: osContext.route.lifecycle,
      selected_strategy: osContext.route.selected_strategy,
      strategy_set: osContext.route.strategy_set,
      strategy_generation: osContext.route.strategy_generation,
      strategy_evolution: osContext.route.strategy_evolution,
      is_auto_evolving: osContext.route.is_auto_evolving,
      strategy_updated: osContext.route.strategy_updated,
      global_score: osContext.route.global_score,
      global_scores: osContext.route.global_scores,
      new_strategy_name: osContext.route.new_strategy_name,
      strategy_invention: osContext.route.strategy_invention,
      strategy_evolver: osContext.route.strategy_evolver,
      model_chain: osContext.route.model_chain,
      autonomous_score: osContext.route.autonomous_score,
      self_loop: osContext.route.self_loop,
      strategy_combined_chain: osContext.route.strategy_combined_chain,
      new_strategy_created: osContext.route.new_strategy_created,
      strategy_deprecated: osContext.route.strategy_deprecated,
      autonomous_paradigm: osContext.route.autonomous_paradigm,
      routing_reconstruction: osContext.route.routing_reconstruction,
      global_reasoning: osContext.route.global_reasoning,
      self_evolving_brain: osContext.route.self_evolving_brain,
      new_paradigm_name: osContext.route.new_paradigm_name,
      routing_philosophy: osContext.route.routing_philosophy,
      model_allocation_strategy: osContext.route.model_allocation_strategy,
      new_paradigm_generated: osContext.route.new_paradigm_generated,
      routing_graph_changed: osContext.route.routing_graph_changed,
      model_priority_shift: osContext.route.model_priority_shift,
      is_fully_autonomous: osContext.route.is_fully_autonomous,
      decision_mode: osContext.route.decision_mode,
      model_feedback_event: visibleModelFeedbackEvent,
      sources,
      rag_quality_score: ragQualityScore,
      relevance_score: relevanceScore,
      answer_grounding_score: visibleAnswerGroundingScore,
      answer_quality: answerQuality,
      business_schema_guard: businessSchemaGuardMetadata,
      auto_sales_agent: autoSalesAgentMetadata,
      knowledge_feedback_event: knowledgeFeedbackEvent,
      knowledge_gap_event: knowledgeGapEvent,
      optimization_suggestions: optimizationSuggestions,
      evolution_report: evolutionReport
    }
  };
}

function serializeConversation(conversation: ConversationRecord, pinnedAt?: Date | string | null) {
  return {
    id: String(conversation.id),
    title: String(conversation.title ?? "新会话"),
    mode: normalizeAiChatMode(conversation.mode),
    metadata: null,
    message_count: Number(conversation._count?.messages ?? 0),
    pinned: Boolean(pinnedAt),
    pinned_at: pinnedAt ? toIsoString(pinnedAt) : null,
    created_at: toIsoString(conversation.createdAt),
    updated_at: toIsoString(conversation.updatedAt)
  };
}

function serializeConversationListItem(conversation: ConversationRecord, pinnedAt?: Date | string | null) {
  return {
    id: String(conversation.id),
    title: String(conversation.title ?? "新会话"),
    mode: normalizeAiChatMode(conversation.mode),
    metadata: null,
    message_count: Number(conversation._count?.messages ?? 0),
    pinned: Boolean(pinnedAt),
    pinned_at: pinnedAt ? toIsoString(pinnedAt) : null,
    created_at: toIsoString(conversation.createdAt),
    updated_at: toIsoString(conversation.updatedAt)
  };
}

function readSerializedText(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  const text = value.trim();

  return isLostHistoryAnswerText(text) ? "" : text;
}

const LOST_HISTORY_ANSWER_PATTERNS = [
  "这条历史消息没有保留可直接展示的最终正文",
  "这条历史消息没有保留可展示的最终正文",
  "历史消息没有保留可直接展示的最终正文"
];

function isLostHistoryAnswerText(value: string) {
  const normalized = value.replace(/\s+/g, "");

  return LOST_HISTORY_ANSWER_PATTERNS.some((pattern) =>
    normalized.includes(pattern.replace(/\s+/g, ""))
  );
}

function readNestedSerializedText(record: Record<string, unknown>, path: string[]) {
  let current: unknown = record;

  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return "";
    }

    current = (current as Record<string, unknown>)[key];
  }

  return readSerializedText(current);
}

function readFinalizedAnswerText(value: unknown) {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

  return [
    record.rawContent,
    record.rawText,
    record.text,
    record.answer,
    record.content,
    record.freeformAnswer,
    record.customerReply,
    record.keyConclusion,
  ].map(readSerializedText).find(Boolean) ?? "";
}

function readSerializedMessageContent(
  message: MessageRecord,
  metadata: Record<string, unknown>,
  finalizedAnswer: unknown,
) {
  return [
    message.content,
    metadata.rawContent,
    metadata.rawText,
    metadata.rawAnswer,
    metadata.rawAnswerBeforeFinalizer,
    metadata.rawCustomerAnswerBeforeFinalizer,
    metadata.answer,
    readNestedSerializedText(metadata, ["runtimeOutput", "replyMarkdown"]),
    readNestedSerializedText(metadata, ["runtimeOutput", "answer"]),
    readNestedSerializedText(metadata, ["runtimeOutput", "rawContent"]),
    readNestedSerializedText(metadata, ["runtimeOutput", "rawText"]),
    readNestedSerializedText(metadata, ["aiRuntime", "finalOutput", "replyMarkdown"]),
    readNestedSerializedText(metadata, ["aiRuntime", "finalOutput", "answer"]),
    readNestedSerializedText(metadata, ["aiRuntime", "finalOutput", "content"]),
    readFinalizedAnswerText(finalizedAnswer),
  ].map(readSerializedText).find(Boolean) ?? "";
}

const HISTORY_FINALIZED_ANSWER_FIELDS = [
  "title",
  "problemUnderstanding",
  "keyConclusion",
  "suggestedSteps",
  "customerReply",
  "nextAction",
  "evidenceSummary",
  "confidenceLabel",
  "salesIntent",
  "customerStage",
  "salesStrategy",
  "nextActionDetail",
  "nextQuestion",
  "stopRules",
  "stageReason",
  "recommendedAction"
] as const;

const HISTORY_MESSAGE_METADATA_FIELDS = [
  "responseId",
  "userQuery",
  "behaviorFeedbackSeed"
] as const;

function pickHistoryDisplayFields(
  source: Record<string, unknown> | null | undefined,
  fields: readonly string[]
) {
  if (!source) {
    return null;
  }

  const result: Record<string, unknown> = {};

  for (const field of fields) {
    if (source[field] !== undefined) {
      result[field] = source[field];
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

function serializeMessage(message: MessageRecord) {
  const role = String(message.role ?? "").toLowerCase();
  const metadata = toJsonObject(message.metadata) ?? {};
  const confidence = typeof metadata.confidence === "string" ? metadata.confidence : null;
  const providerStatus = typeof metadata.providerStatus === "string" ? metadata.providerStatus : null;
  const customerAnswer = typeof metadata.customerAnswer === "string" ? metadata.customerAnswer : null;
  const finalizedAnswer = metadata.finalizedAnswer && typeof metadata.finalizedAnswer === "object" && !Array.isArray(metadata.finalizedAnswer)
    ? metadata.finalizedAnswer
    : null;
  const content = readSerializedMessageContent(message, metadata, finalizedAnswer);
  const historyFinalizedAnswer = pickHistoryDisplayFields(
    toJsonObject(finalizedAnswer),
    HISTORY_FINALIZED_ANSWER_FIELDS
  );
  const historyMetadata = pickHistoryDisplayFields(metadata, HISTORY_MESSAGE_METADATA_FIELDS);

  return {
    id: String(message.id),
    role: role || "user",
    content,
    rawContent: content || null,
    rawText: content || null,
    attachments: message.attachments ?? null,
    sources: message.sources ?? null,
    customer_answer: customerAnswer,
    finalized_answer: historyFinalizedAnswer,
    provider_status: providerStatus,
    confidence,
    metadata: historyMetadata,
    created_at: toIsoString(message.createdAt)
  };
}

export async function listAiChatConversations(actor: AiChatActor, db: AiChatDb = defaultDb()) {
  const pinnedRows = db.userConversationPin?.findMany
    ? await db.userConversationPin.findMany({
      where: {
        userId: actor.id
      },
      orderBy: {
        pinnedAt: "desc"
      },
      take: MAX_PINNED_CONVERSATIONS,
      select: {
        conversationId: true,
        pinnedAt: true
      }
    })
    : [];
  const pinnedConversationIds = pinnedRows
    .map((row) => trimString(row.conversationId))
    .filter(Boolean);
  const conversationListSelect = {
    id: true,
    title: true,
    mode: true,
    createdAt: true,
    updatedAt: true,
    _count: {
      select: {
        messages: true
      }
    }
  };
  const recentConversations = await db.conversation.findMany({
    where: {
      userId: actor.id,
      type: "CHAT",
      OR: [
        {
          metadata: {
            path: ["conversationControl", "deletedAt"],
            equals: Prisma.AnyNull
          }
        },
        {
          metadata: {
            path: ["conversationControl", "deletedAt"],
            equals: ""
          }
        }
      ]
    },
    orderBy: {
      updatedAt: "desc"
    },
    take: 50,
    select: conversationListSelect
  });
  const pinnedConversations = pinnedConversationIds.length > 0
    ? await db.conversation.findMany({
      where: {
        id: {
          in: pinnedConversationIds
        },
        userId: actor.id,
        type: "CHAT",
        OR: [
          {
            metadata: {
              path: ["conversationControl", "deletedAt"],
              equals: Prisma.AnyNull
            }
          },
          {
            metadata: {
              path: ["conversationControl", "deletedAt"],
              equals: ""
            }
          }
        ]
      },
      select: conversationListSelect
    })
    : [];
  const pinnedAtByConversationId = new Map(
    pinnedRows.map((row) => [trimString(row.conversationId), row.pinnedAt] as const)
  );
  const pinnedConversationById = new Map(
    pinnedConversations.map((conversation) => [trimString(conversation.id), conversation] as const)
  );
  const serializedPinnedConversations = pinnedConversationIds
    .map((conversationId) => pinnedConversationById.get(conversationId))
    .filter((conversation): conversation is ConversationRecord => Boolean(conversation))
    .map((conversation) => serializeConversationListItem(
      conversation,
      pinnedAtByConversationId.get(trimString(conversation.id)) ?? null
    ));
  const pinnedConversationIdSet = new Set(pinnedConversationIds);

  return {
    conversations: [
      ...serializedPinnedConversations,
      ...recentConversations
      .filter((conversation) => !pinnedConversationIdSet.has(trimString(conversation.id)))
      .map((conversation) => serializeConversationListItem(conversation))
    ]
  };
}

export async function getAiChatHistory(actor: AiChatActor, conversationId: string, db: AiChatDb = defaultDb()) {
  const normalizedConversationId = trimString(conversationId);

  if (!normalizedConversationId) {
    throw new ValidationError("conversation_id 不能为空。");
  }

  const conversation = await db.conversation.findFirst({
    where: {
      id: normalizedConversationId,
      userId: actor.id,
      type: "CHAT"
    },
    include: {
      messages: {
        where: {
          OR: [
            { userId: actor.id },
            { userId: null }
          ]
        },
        orderBy: {
          createdAt: "asc"
        }
      }
    }
  });

  if (!conversation || isConversationSoftDeleted(conversation.metadata)) {
    throw new NotFoundError("会话不存在。");
  }

  const pinnedRows = db.userConversationPin?.findMany
    ? await db.userConversationPin.findMany({
      where: {
        userId: actor.id,
        conversationId: normalizedConversationId
      },
      take: 1,
      select: {
        pinnedAt: true
      }
    })
    : [];

  return {
    conversation: serializeConversation(conversation, pinnedRows[0]?.pinnedAt ?? null),
    messages: (conversation.messages ?? []).map(serializeMessage)
  };
}
