import { toAppError } from "@/lib/errors";
import {
  finalizeUserAnswer,
  formatFinalizedAnswerForDisplay,
  type FinalizedAnswer
} from "@/lib/ai-chat/response-finalizer";
import { isCareerMentorScope } from "@/lib/ai-chat/career-mentor";
import { normalizeUserChatMarkdown } from "@/lib/ai-chat/user-chat-markdown";
import { routeUserChatToRuntimeV2 } from "@/lib/knowledge-runtime/runtime-v2-router";

export type AiChatStreamEvent =
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
      data: StreamableAiChatResult;
    }
  | {
      type: "error";
      content: string;
      code: string;
    };

export interface StreamableAiChatResult {
  answer: string;
  conversation_id: string;
  message_id: string;
  mode: string;
  customerCopy?: string | null;
  customer_answer?: string | null;
  finalized_answer?: unknown;
  nextStep?: string | null;
  traceId?: string | null;
  sources?: unknown[] | null;
  runtime_sources?: unknown[] | null;
  runtime_output?: unknown;
  runtime_input?: unknown;
  runtimeVersion?: string | null;
  memoryApplied?: boolean | null;
  usedMemoryIds?: string[] | null;
  memoryTrace?: unknown[] | null;
  memoryWarnings?: string[] | null;
  appliedAgentPolicies?: string[] | null;
  confidence?: string | null;
  provider_status?: string | null;
  answer_output_mode?: "admin_ingest_reply_markdown" | null;
  career_output_mode?: "admin_ingest_reply_markdown" | null;
  [key: string]: unknown;
}

type UnknownRecord = Record<string, unknown>;

interface AiChatSseWriter {
  enqueue: (chunk: string) => void;
}

interface CreateAiChatSseResponseInput {
  signal?: AbortSignal;
  producer: (helpers: {
    emit: (event: AiChatStreamEvent) => Promise<void>;
    streamResult: (result: StreamableAiChatResult) => Promise<void>;
    signal?: AbortSignal;
  }) => Promise<void>;
}

const SSE_HEARTBEAT_INTERVAL_MS = 12_000;
const CAREER_MENTOR_STREAM_CHUNK_SIZE = 24;

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function waitForTokenFrame(signal?: AbortSignal) {
  if (signal?.aborted) {
    return Promise.reject(new DOMException("The operation was aborted.", "AbortError"));
  }

  return new Promise<void>((resolve, reject) => {
    const timeout = windowlessSetTimeout(resolve, 10);

    signal?.addEventListener("abort", () => {
      clearTimeout(timeout);
      reject(new DOMException("The operation was aborted.", "AbortError"));
    }, { once: true });
  });
}

function windowlessSetTimeout(callback: () => void, timeout: number) {
  return setTimeout(callback, timeout);
}

export function splitTextIntoStreamTokens(content: string) {
  return Array.from(content);
}

function splitTextIntoStreamChunks(content: string, chunkSize: number) {
  const characters = splitTextIntoStreamTokens(content);
  const normalizedChunkSize = Math.max(1, Math.floor(chunkSize));

  if (normalizedChunkSize === 1) {
    return characters;
  }

  const chunks: string[] = [];

  for (let index = 0; index < characters.length; index += normalizedChunkSize) {
    chunks.push(characters.slice(index, index + normalizedChunkSize).join(""));
  }

  return chunks;
}

export async function streamTextTokens(
  content: string,
  emit: (event: AiChatStreamEvent) => Promise<void>,
  signal?: AbortSignal,
  chunkSize = 1
) {
  for (const token of splitTextIntoStreamChunks(content, chunkSize)) {
    if (signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }

    await emit({
      type: "token",
      content: token
    });
    await waitForTokenFrame(signal);
  }
}

export async function streamAiChatResult(
  result: StreamableAiChatResult,
  emit: (event: AiChatStreamEvent) => Promise<void>,
  signal?: AbortSignal
) {
  const finalResult = await ensureFinalizedStreamResult(result);
  const runtimeInput = isRecord(finalResult.runtime_input) ? finalResult.runtime_input : {};
  const streamChunkSize = isAdminIngestReplyPassthrough(finalResult) || isCareerMentorScope({
    agentId: readString(runtimeInput.agentId) || readString(finalResult.agentId),
    expertId: readString(runtimeInput.expertId) || readString(finalResult.expert_id),
    knowledgeBaseId: readString(runtimeInput.knowledgeBaseId) || readString(finalResult.knowledgeBaseId),
    kbId: readString(runtimeInput.kbId) || readString(finalResult.kb_id),
    namespace: readString(runtimeInput.namespace) || readString(finalResult.namespace)
  })
    ? CAREER_MENTOR_STREAM_CHUNK_SIZE
    : 1;

  await emit({
    type: "thinking",
    content: "知识库检索完成，正在生成最终答案..."
  });
  await emitRagVisualization(finalResult, emit);
  await emitModelVisualization(finalResult, emit);
  await streamTextTokens(finalResult.answer ?? "", emit, signal, streamChunkSize);
  await emit({
    type: "final",
    content: finalResult.answer ?? "",
    data: finalResult
  });
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readFirstRawString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return "";
}

function isAdminIngestReplyPassthrough(result: StreamableAiChatResult) {
  return result.answer_output_mode === "admin_ingest_reply_markdown"
    || result.career_output_mode === "admin_ingest_reply_markdown";
}

function readRuntimePlatform(value: unknown): "web" | "exe" | "apk" {
  return value === "exe" || value === "apk" ? value : "web";
}

function readRuntimeOutputMode(
  value: unknown,
): "auto" | "analysis" | "explain" | "faq" | "sop" | "customer_reply" | "sales_closing" | "sales_followup" {
  if (
    value === "analysis" ||
    value === "explain" ||
    value === "faq" ||
    value === "sop" ||
    value === "customer_reply" ||
    value === "sales_closing" ||
    value === "sales_followup"
  ) {
    return value;
  }
  return "auto";
}

function readNumber(value: unknown) {
  const numericValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

  return Number.isFinite(numericValue) ? numericValue : null;
}

function clamp01(value: number | null | undefined) {
  if (!Number.isFinite(value ?? Number.NaN)) {
    return null;
  }

  return Math.max(0, Math.min(1, value as number));
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(readString).filter(Boolean)
    : [];
}

function readResultRecord(result: StreamableAiChatResult, key: string) {
  const value = result[key];

  return isRecord(value) ? value : {};
}

function getSourceRecords(result: StreamableAiChatResult) {
  return Array.isArray(result.sources)
    ? result.sources.filter(isRecord)
    : [];
}

function getFinalizerSources(result: StreamableAiChatResult) {
  return getSourceRecords(result).map((source) => ({
    title: readString(source.title) || readString(source.file_name) || readString(source.source) || null,
    score: readNumber(source.relevance_score) ?? readNumber(source.score),
    snippet: readString(source.snippet) || readString(source.content_preview) || readString(source.contentPreview) || null,
    safeSnippet: readString(source.safeSnippet) || null,
    contentPreview: readString(source.contentPreview) || readString(source.content_preview) || null,
    sourceApp: readString(source.sourceApp) || readString(source.source_app) || null,
    knowledgeBaseId: readString(source.knowledgeBaseId) || readString(source.knowledge_base_id) || readString(source.kb_id) || null,
    kbId: readString(source.kbId) || readString(source.kb_id) || readString(source.knowledgeBaseId) || null,
    agentId: readString(source.agentId) || readString(source.agent_id) || readString(source.expert_id) || null,
    expertId: readString(source.expertId) || readString(source.expert_id) || readString(source.agentId) || null,
    namespace: readString(source.namespace) || null,
    tenantId: readString(source.tenantId) || readString(source.tenant_id) || null,
  }));
}

function getFinalizedAnswer(value: unknown): FinalizedAnswer | null {
  return isRecord(value) &&
    typeof value.problemUnderstanding === "string" &&
    typeof value.keyConclusion === "string" &&
    Array.isArray(value.suggestedSteps) &&
    typeof value.customerReply === "string" &&
    typeof value.nextAction === "string"
    ? value as FinalizedAnswer
    : null;
}

async function ensureFinalizedStreamResult(result: StreamableAiChatResult): Promise<StreamableAiChatResult> {
  const runtimeInput = isRecord(result.runtime_input) ? result.runtime_input : {};
  const careerMentorGroundedScope = isCareerMentorScope({
    agentId: readString(runtimeInput.agentId) || readString(result.agentId),
    expertId: readString(runtimeInput.expertId) || readString(result.expert_id),
    knowledgeBaseId: readString(runtimeInput.knowledgeBaseId) || readString(result.knowledgeBaseId),
    kbId: readString(runtimeInput.kbId) || readString(result.kb_id),
    namespace: readString(runtimeInput.namespace) || readString(result.namespace)
  });
  const userMessage =
    readString(runtimeInput.query) ||
    readString(result.message) ||
    readString(result.question);
  const ingestReplyPassthrough = isAdminIngestReplyPassthrough(result);
  const rawPreservedMainAnswer = ingestReplyPassthrough
    ? readFirstRawString(
        result.rawAnswerBeforeFinalizer,
        result.rawContent,
        result.rawText,
        result.rawAnswer,
        result.answer
      )
    : readString(result.rawAnswerBeforeFinalizer)
      || readString(result.rawContent)
      || readString(result.rawText)
      || readString(result.rawAnswer)
      || readString(result.answer);
  const preservedMainAnswer = ingestReplyPassthrough
    ? rawPreservedMainAnswer
    : normalizeUserChatMarkdown(rawPreservedMainAnswer);
  const finalizedAnswer = getFinalizedAnswer(result.finalized_answer) ?? finalizeUserAnswer({
    rawAnswer: preservedMainAnswer || result.answer,
    customerAnswer: result.customer_answer ?? undefined,
    sources: getFinalizerSources(result),
    userMessage,
  });
  const protectedCareerCustomerReply = careerMentorGroundedScope || ingestReplyPassthrough
    ? typeof result.customer_answer === "string"
      ? result.customer_answer
      : ingestReplyPassthrough
        ? ""
        : finalizedAnswer.customerReply
    : null;
  const streamFinalizedAnswer: FinalizedAnswer = careerMentorGroundedScope || ingestReplyPassthrough
    ? {
        ...finalizedAnswer,
        customerReply: protectedCareerCustomerReply ?? ""
      }
    : finalizedAnswer;
  const metadata = isRecord(result.metadata) ? result.metadata : {};
  const debug = isRecord(metadata.debug) ? metadata.debug : {};
  const normalizedResult = {
    ...result,
    answer: preservedMainAnswer || formatFinalizedAnswerForDisplay(streamFinalizedAnswer),
    rawAnswerBeforeFinalizer: preservedMainAnswer || null,
    rawContent: preservedMainAnswer || null,
    rawText: preservedMainAnswer || null,
    customer_answer: streamFinalizedAnswer.customerReply,
    finalized_answer: streamFinalizedAnswer
  };

  if (ingestReplyPassthrough) {
    return {
      ...normalizedResult,
      answer: preservedMainAnswer,
      rawAnswerBeforeFinalizer: preservedMainAnswer,
      rawContent: preservedMainAnswer,
      rawText: preservedMainAnswer,
      customerCopy: protectedCareerCustomerReply ?? "",
      customer_answer: protectedCareerCustomerReply ?? "",
      finalized_answer: streamFinalizedAnswer,
      nextStep: result.nextStep ?? null,
      metadata: {
        ...metadata,
        answerOutputMode: "admin_ingest_reply_markdown",
        naturalBodyPassthrough: true,
        rawAnswerBeforeFinalizer: preservedMainAnswer,
        rawContent: preservedMainAnswer,
        rawText: preservedMainAnswer,
        rawAnswer: preservedMainAnswer,
        customerCopy: protectedCareerCustomerReply ?? "",
        debug: {
          ...debug,
          rawInternalAnswerHidden: true,
          internalPanelsAvailable: true
        }
      }
    };
  }

  const runtimeOutput = await routeUserChatToRuntimeV2(normalizedResult, {
    query: readString(runtimeInput.query) || readString(result.message) || readString(result.question) || result.answer,
    userId: readString(runtimeInput.userId) || readString(result.userId),
    conversationId: result.conversation_id,
    agentId: readString(runtimeInput.agentId) || readString(result.agentId) || readString(result.expert_id),
    expertId: readString(runtimeInput.expertId) || readString(result.expert_id) || readString(result.agentId),
    knowledgeBaseId: readString(runtimeInput.knowledgeBaseId) || readString(result.knowledgeBaseId) || readString(result.kb_id),
    kbId: readString(runtimeInput.kbId) || readString(result.kb_id) || readString(result.knowledgeBaseId),
    namespace: readString(runtimeInput.namespace) || readString(result.namespace),
    tenantId: readString(runtimeInput.tenantId) || readString(result.tenantId) || readString(result.tenant_id),
    appType: "user_app",
    channel: "chat-ui",
    platform: readRuntimePlatform(runtimeInput.platform),
    outputMode: readRuntimeOutputMode(runtimeInput.outputMode)
  });
  const runtimeEnrichedFinalizedAnswer: FinalizedAnswer = {
    ...streamFinalizedAnswer,
    freeformAnswer: runtimeOutput.answer || streamFinalizedAnswer.freeformAnswer,
    customerReply: runtimeOutput.customerCopy || streamFinalizedAnswer.customerReply,
    nextAction: runtimeOutput.nextStep || streamFinalizedAnswer.nextAction,
    salesIntent: runtimeOutput.salesIntent,
    customerStage: runtimeOutput.customerStage,
    salesStrategy: runtimeOutput.salesStrategy,
    nextActionDetail: runtimeOutput.nextAction,
    dealSignals: runtimeOutput.dealSignals,
    salesLoopPlan: runtimeOutput.salesLoopPlan,
    nextQuestion: runtimeOutput.nextQuestion,
    followupSequence: runtimeOutput.followupSequence,
    branchReplies: runtimeOutput.branchReplies,
    stopRules: runtimeOutput.stopRules,
    stageReason: runtimeOutput.stageReason ?? runtimeOutput.salesLoopPlan?.stageReason,
    salesLoopV2: runtimeOutput.salesLoopV2,
    dealProbability: runtimeOutput.dealProbability,
    silenceRisk: runtimeOutput.silenceRisk,
    abScripts: runtimeOutput.abScripts,
    multiTurnPath: runtimeOutput.multiTurnPath,
    followupTiming: runtimeOutput.followupTiming,
    stopPush: runtimeOutput.stopPush,
    recommendedAction: runtimeOutput.recommendedAction,
    salesLearningV3: runtimeOutput.salesLearningV3,
    customerSegment: runtimeOutput.customerSegment,
    conversionScore: runtimeOutput.conversionScore,
    bestScriptRecommendation: runtimeOutput.bestScriptRecommendation,
    nextBestActionV3: runtimeOutput.nextBestActionV3,
    learningSignals: runtimeOutput.learningSignals,
    optimizationReason: runtimeOutput.optimizationReason,
    isolationScope: runtimeOutput.isolationScope,
    salesGrowthV4: runtimeOutput.salesGrowthV4,
    scriptScoreboardV4: runtimeOutput.scriptScoreboardV4,
    segmentPlaybookV4: runtimeOutput.segmentPlaybookV4,
    optimizedRecommendationV4: runtimeOutput.optimizedRecommendationV4,
    customerPathOptimizationV4: runtimeOutput.customerPathOptimizationV4,
    growthMetricsV4: runtimeOutput.growthMetricsV4,
    growthWarningsV4: runtimeOutput.growthWarningsV4,
    salesEvolutionV5: runtimeOutput.salesEvolutionV5,
    strategyCandidates: runtimeOutput.strategyCandidates,
    promotedStrategies: runtimeOutput.promotedStrategies,
    reducedStrategies: runtimeOutput.reducedStrategies,
    retiredStrategies: runtimeOutput.retiredStrategies,
    roiSignals: runtimeOutput.roiSignals,
    conversionTrend: runtimeOutput.conversionTrend,
    evolvedPath: runtimeOutput.evolvedPath,
    autonomousRecommendation: runtimeOutput.autonomousRecommendation,
    complianceWarnings: runtimeOutput.complianceWarnings,
  };
  const runtimeFinalizedAnswer = careerMentorGroundedScope
    ? streamFinalizedAnswer
    : runtimeEnrichedFinalizedAnswer;
  const visibleCustomerCopy = careerMentorGroundedScope
    ? streamFinalizedAnswer.customerReply
    : runtimeOutput.customerCopy;
  const visibleNextStep = careerMentorGroundedScope
    ? streamFinalizedAnswer.nextAction
    : runtimeOutput.nextStep ?? streamFinalizedAnswer.nextAction;

  return {
    ...normalizedResult,
    answer: preservedMainAnswer || formatFinalizedAnswerForDisplay(runtimeFinalizedAnswer),
    rawAnswerBeforeFinalizer: preservedMainAnswer || null,
    rawContent: preservedMainAnswer || null,
    rawText: preservedMainAnswer || null,
    customerCopy: visibleCustomerCopy,
    customer_answer: visibleCustomerCopy,
    finalized_answer: runtimeFinalizedAnswer,
    nextStep: visibleNextStep,
    traceId: runtimeOutput.traceId,
    runtimeVersion: runtimeOutput.runtimeVersion,
    runtime_sources: runtimeOutput.sources,
    runtime_output: runtimeOutput,
    memoryApplied: runtimeOutput.memoryApplied,
    usedMemoryIds: runtimeOutput.usedMemoryIds,
    memoryTrace: runtimeOutput.memoryTrace,
    memoryWarnings: runtimeOutput.memoryWarnings,
    appliedAgentPolicies: runtimeOutput.appliedAgentPolicies,
    salesLearningV3: runtimeOutput.salesLearningV3,
    customerSegment: runtimeOutput.customerSegment,
    conversionScore: runtimeOutput.conversionScore,
    bestScriptRecommendation: runtimeOutput.bestScriptRecommendation,
    nextBestActionV3: runtimeOutput.nextBestActionV3,
    learningSignals: runtimeOutput.learningSignals,
    optimizationReason: runtimeOutput.optimizationReason,
    isolationScope: runtimeOutput.isolationScope,
    salesGrowthV4: runtimeOutput.salesGrowthV4,
    scriptScoreboardV4: runtimeOutput.scriptScoreboardV4,
    segmentPlaybookV4: runtimeOutput.segmentPlaybookV4,
    optimizedRecommendationV4: runtimeOutput.optimizedRecommendationV4,
    customerPathOptimizationV4: runtimeOutput.customerPathOptimizationV4,
    growthMetricsV4: runtimeOutput.growthMetricsV4,
    growthWarningsV4: runtimeOutput.growthWarningsV4,
    salesEvolutionV5: runtimeOutput.salesEvolutionV5,
    strategyCandidates: runtimeOutput.strategyCandidates,
    promotedStrategies: runtimeOutput.promotedStrategies,
    reducedStrategies: runtimeOutput.reducedStrategies,
    retiredStrategies: runtimeOutput.retiredStrategies,
    roiSignals: runtimeOutput.roiSignals,
    conversionTrend: runtimeOutput.conversionTrend,
    evolvedPath: runtimeOutput.evolvedPath,
    autonomousRecommendation: runtimeOutput.autonomousRecommendation,
    metadata: {
      ...metadata,
      rawAnswerBeforeFinalizer: preservedMainAnswer || null,
      rawCustomerAnswerBeforeFinalizer: readString(result.rawCustomerAnswerBeforeFinalizer) || null,
      rawContent: preservedMainAnswer || null,
      rawText: preservedMainAnswer || null,
      rawAnswer: preservedMainAnswer || null,
      customerCopy: visibleCustomerCopy,
      traceId: runtimeOutput.traceId,
      nextStep: visibleNextStep,
      runtimeVersion: runtimeOutput.runtimeVersion,
      memoryApplied: runtimeOutput.memoryApplied,
      usedMemoryIds: runtimeOutput.usedMemoryIds,
      memoryTrace: runtimeOutput.memoryTrace,
      memoryWarnings: runtimeOutput.memoryWarnings,
      appliedAgentPolicies: runtimeOutput.appliedAgentPolicies,
      salesLearningV3: runtimeOutput.salesLearningV3,
      customerSegment: runtimeOutput.customerSegment,
      conversionScore: runtimeOutput.conversionScore,
      bestScriptRecommendation: runtimeOutput.bestScriptRecommendation,
      nextBestActionV3: runtimeOutput.nextBestActionV3,
      learningSignals: runtimeOutput.learningSignals,
      optimizationReason: runtimeOutput.optimizationReason,
      isolationScope: runtimeOutput.isolationScope,
      salesGrowthV4: runtimeOutput.salesGrowthV4,
      scriptScoreboardV4: runtimeOutput.scriptScoreboardV4,
      segmentPlaybookV4: runtimeOutput.segmentPlaybookV4,
      optimizedRecommendationV4: runtimeOutput.optimizedRecommendationV4,
      customerPathOptimizationV4: runtimeOutput.customerPathOptimizationV4,
      growthMetricsV4: runtimeOutput.growthMetricsV4,
      growthWarningsV4: runtimeOutput.growthWarningsV4,
      salesEvolutionV5: runtimeOutput.salesEvolutionV5,
      strategyCandidates: runtimeOutput.strategyCandidates,
      promotedStrategies: runtimeOutput.promotedStrategies,
      reducedStrategies: runtimeOutput.reducedStrategies,
      retiredStrategies: runtimeOutput.retiredStrategies,
      roiSignals: runtimeOutput.roiSignals,
      conversionTrend: runtimeOutput.conversionTrend,
      evolvedPath: runtimeOutput.evolvedPath,
      autonomousRecommendation: runtimeOutput.autonomousRecommendation,
      runtimeOutput,
      debug: {
        ...debug,
        rawInternalAnswerHidden: true,
        internalPanelsAvailable: true
      }
    }
  };
}

async function emitRagVisualization(
  result: StreamableAiChatResult,
  emit: (event: AiChatStreamEvent) => Promise<void>
) {
  const sources = getSourceRecords(result);
  const diagnostics = readResultRecord(result, "rag_diagnostics");
  const relevanceScore = clamp01(readNumber(result.relevance_score));

  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    const title = readString(source.title) || "知识片段";
    const chunkId = readString(source.chunk_id);
    const itemId = readString(source.item_id);
    const fileId = readString(source.file_id);
    const knowledgeBaseId = readString(source.knowledgeBaseId);
    const agentId = readString(source.agentId);
    const tenantId = readString(source.tenantId);
    const namespace = readString(source.namespace);
    const sourceApp = readString(source.sourceApp);
    const chunkRank = readNumber(source.chunk_rank) ?? index + 1;
    const score = clamp01(readNumber(source.relevance_score) ?? readNumber(source.score));

    await emit({
      type: "rag_chunk",
      content: title,
      chunk_rank: chunkRank,
      chunk_id: chunkId || null
    });

    if (score !== null) {
      await emit({
        type: "rag_score",
        score,
        chunk_rank: chunkRank
      });
    }

    await emit({
      type: "rag_source",
      source: fileId || chunkId || title,
      title,
      file_id: fileId || null,
      chunk_id: chunkId || null,
      item_id: itemId || null,
      knowledgeBaseId: knowledgeBaseId || null,
      agentId: agentId || null,
      tenantId: tenantId || null,
      namespace: namespace || null,
      sourceApp: sourceApp || null,
      includeShared: typeof source.includeShared === "boolean" ? source.includeShared : null,
      includePublished: typeof source.includePublished === "boolean" ? source.includePublished : null
    });
  }

  await emit({
    type: "rag_done",
    hitCount: readNumber(diagnostics.hitCount) ?? sources.length,
    topK: readNumber(diagnostics.topK),
    relevance_score: relevanceScore
  });
}

function resolveCostScore(result: StreamableAiChatResult) {
  const costMode = readString(result.cost_mode);

  if (costMode === "user_low_priority") {
    return 0.9;
  }

  if (costMode === "high_quality_required") {
    return 0.45;
  }

  return 0.65;
}

function resolveLatencyScore(latencyMs: number | null) {
  if (latencyMs === null) {
    return null;
  }

  if (latencyMs <= 800) {
    return 0.95;
  }

  if (latencyMs <= 1800) {
    return 0.72;
  }

  if (latencyMs <= 3500) {
    return 0.48;
  }

  return 0.26;
}

async function emitModelVisualization(
  result: StreamableAiChatResult,
  emit: (event: AiChatStreamEvent) => Promise<void>
) {
  const selectedModel = readString(result.selected_model) || readString(result.actualModel) || readString(result.model) || "unknown";
  const fallbackChain = (
    readStringArray(result.fallback_chain_v6).length > 0 ? readStringArray(result.fallback_chain_v6)
      : readStringArray(result.fallback_chain_v5).length > 0 ? readStringArray(result.fallback_chain_v5)
        : readStringArray(result.fallback_chain_v4).length > 0 ? readStringArray(result.fallback_chain_v4)
          : readStringArray(result.fallback_chain_v3).length > 0 ? readStringArray(result.fallback_chain_v3)
            : readStringArray(result.fallback_chain_v2).length > 0 ? readStringArray(result.fallback_chain_v2)
              : readStringArray(result.fallback_chain)
  );
  const diagnostics = readResultRecord(result, "rag_diagnostics");
  const hitCount = readNumber(diagnostics.hitCount);
  const relevanceScore = readNumber(result.relevance_score);
  const costMode = readString(result.cost_mode);
  const routeDecision = readString(result.route_decision);
  const latencyMs = readNumber(result.latency_ms);
  const feedbackEvent = readResultRecord(result, "model_feedback_event");
  const successRate = typeof feedbackEvent.was_successful === "boolean"
    ? feedbackEvent.was_successful ? 1 : 0
    : null;

  await emit({
    type: "model_select",
    model: selectedModel
  });
  await emit({
    type: "model_reason",
    reason: routeDecision || [
      hitCount && hitCount > 0 ? "RAG 已命中知识" : "RAG 命中较少",
      relevanceScore !== null && relevanceScore >= 0.7 ? "高相关度" : "需要增强推理",
      costMode || "balanced"
    ].filter(Boolean).join(" + ")
  });
  await emit({
    type: "model_fallback",
    chain: fallbackChain
  });
  await emit({
    type: "model_metrics",
    cost_score: resolveCostScore(result),
    latency_score: resolveLatencyScore(latencyMs),
    success_rate: successRate,
    latency_ms: latencyMs
  });
}

export function createAiChatSseResponse(input: CreateAiChatSseResponseInput) {
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      const writer: AiChatSseWriter = {
        enqueue(chunk) {
          if (closed || input.signal?.aborted) {
            return;
          }

          controller.enqueue(encoder.encode(chunk));
        }
      };

      const emit = async (event: AiChatStreamEvent) => {
        writer.enqueue(`data: ${JSON.stringify(event)}\n\n`);
      };

      const finish = () => {
        if (closed) {
          return;
        }

        closed = true;
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
        controller.close();
      };

      // Keep mobile WebViews and reverse proxies from treating a long model call as an idle SSE connection.
      // A comment frame is deliberately invisible to the chat event parser and cannot alter answer content.
      heartbeat = setInterval(() => {
        writer.enqueue(`: heartbeat ${Date.now()}\n\n`);
      }, SSE_HEARTBEAT_INTERVAL_MS);

      input.signal?.addEventListener("abort", finish, { once: true });

      void (async () => {
        try {
          await input.producer({
            emit,
            streamResult: (result) => streamAiChatResult(result, emit, input.signal),
            signal: input.signal
          });

          if (!closed && !input.signal?.aborted) {
            writer.enqueue("data: [DONE]\n\n");
          }
        } catch (error) {
          if (!isAbortError(error) && !closed && !input.signal?.aborted) {
            const appError = toAppError(error);

            writer.enqueue(`data: ${JSON.stringify({
              type: "error",
              content: appError.message,
              code: appError.code
            } satisfies AiChatStreamEvent)}\n\n`);
            writer.enqueue("data: [DONE]\n\n");
          }
        } finally {
          finish();
        }
      })();
    }
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    }
  });
}
