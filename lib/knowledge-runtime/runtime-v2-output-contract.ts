import { normalizeRuntimeOutput } from "./runtime-output-normalizer";
import { applyRuntimeV2ComplianceBoundary } from "./runtime-v2-compliance-boundary";
import { buildRuntimeV2MemoryAwareCustomerCopy } from "./runtime-v2-customer-copy-policy";
import { buildRuntimeV2DecisionGuide } from "./runtime-v2-decision-guide-policy";
import { buildRuntimeV2HighDensityAnswer, isWeakRuntimeV2Answer } from "./runtime-v2-high-density-answer-policy";
import { classifyRuntimeV2UserIntent } from "./runtime-v2-intent-classifier";
import { buildObjectionHandlingPlan } from "./runtime-v2-objection-handler";
import { buildRuntimeV2SalesFollowupPlan } from "./runtime-v2-sales-followup-policy";
import { classifyRuntimeV2SalesIntent } from "./runtime-v2-sales-intent-classifier";
import { buildRuntimeV2SalesLoop } from "./runtime-v2-sales-loop-output";
import { buildSalesLoopV2 } from "./runtime-v2-sales-loop-v2-output";
import { normalizeRuntimeV2Sources } from "./runtime-v2-source-policy";
import { createRuntimeV2TraceId, readRuntimeV2TraceId } from "./runtime-v2-trace";
import { buildRuntimeV3GrowthOutput } from "./runtime-v3-growth-engine";
import { buildRuntimeV4GrowthFlywheel } from "./runtime-v4-flywheel-engine";
import { buildRuntimeV5EvolutionOutput } from "./runtime-v5-output";
import type {
  RuntimeV2AgentPolicy,
  RuntimeV2Input,
  RuntimeV2Memory,
  RuntimeV2MemoryTraceItem,
  RuntimeV2Output,
  RuntimeV2Source,
} from "./runtime-v2-types";

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readConfidence(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(1, value));
  }
  return 0.72;
}

function undefinedIfNull(value: string | null | undefined): string | undefined {
  return value ?? undefined;
}

function toLegacyRuntimeInput(input: RuntimeV2Input) {
  return {
    query: input.query,
    userId: undefinedIfNull(input.userId),
    sessionId: undefinedIfNull(input.sessionId),
    conversationId: undefinedIfNull(input.conversationId),
    agentId: undefinedIfNull(input.agentId),
    expertId: undefinedIfNull(input.expertId),
    knowledgeBaseId: undefinedIfNull(input.knowledgeBaseId),
    kbId: undefinedIfNull(input.kbId),
    namespace: undefinedIfNull(input.namespace),
    tenantId: undefinedIfNull(input.tenantId),
    appType: input.appType,
    channel: "chat-ui" as const,
    platform: input.platform === "unknown" ? "web" as const : input.platform,
    messages: input.messages,
  };
}

function mergeSources(raw: unknown, normalizedSources: RuntimeV2Source[]): RuntimeV2Source[] {
  const rawRecord = readRecord(raw);
  const candidates = [
    rawRecord?.sources,
    rawRecord?.runtime_sources,
    rawRecord?.ragSources,
    rawRecord?.rag_sources,
  ];

  for (const candidate of candidates) {
    const next = normalizeRuntimeV2Sources(candidate);
    if (next.length > 0) return next;
  }

  return normalizedSources;
}

export function finalizeRuntimeV2Output(
  rawValue: unknown,
  input: RuntimeV2Input,
  extras?: {
    memories?: RuntimeV2Memory[];
    memoryTrace?: RuntimeV2MemoryTraceItem[];
    memoryWarnings?: string[];
    policies?: RuntimeV2AgentPolicy[];
    sources?: RuntimeV2Source[];
  },
): RuntimeV2Output {
  const legacy = normalizeRuntimeOutput(rawValue, toLegacyRuntimeInput(input));
  const rawRecord = readRecord(rawValue);
  const sources = mergeSources(rawValue, extras?.sources ?? normalizeRuntimeV2Sources(legacy.sources));
  const memories = extras?.memories ?? [];
  const memoryTrace = extras?.memoryTrace ?? [];
  const intentProfile = classifyRuntimeV2UserIntent(input);
  const salesProfile = classifyRuntimeV2SalesIntent(input, { sources });
  const objectionPlan = buildObjectionHandlingPlan({ scope: input, salesProfile, sources, memoryTrace });
  const followupPlan = buildRuntimeV2SalesFollowupPlan(input, salesProfile);
  const salesLoopPlan = buildRuntimeV2SalesLoop({
    scope: input,
    sources,
    memories,
    memoryTrace,
  });
  const salesLoopV2 = buildSalesLoopV2({
    scope: input,
    sources,
    memories,
    memoryTrace,
    salesIntent: salesProfile.salesIntent,
    salesLoopPlan,
  });
  const decisionGuide = buildRuntimeV2DecisionGuide(input);
  const rawAnswer = readText(rawRecord?.answer) || legacy.answer;
  const answerNeedsUpgrade =
    isWeakRuntimeV2Answer(rawAnswer) ||
    (intentProfile.requiresTable && !/\|.+\|/.test(rawAnswer)) ||
    salesProfile.salesIntent !== "general";
  const answer = salesProfile.salesIntent === "cycle_choice" && !/\|.+\|/.test(rawAnswer)
    ? decisionGuide.answer
    : answerNeedsUpgrade
      ? buildRuntimeV2HighDensityAnswer(input, { sources, memories, rawAnswer })
    : rawAnswer;
  const customerCopy = buildRuntimeV2MemoryAwareCustomerCopy(
    {
      customerCopy: rawRecord?.customerCopy ?? rawRecord?.customer_answer ?? legacy.customerCopy,
      answer,
    },
    input,
    memories,
    sources,
  );
  const nextStep =
    readText(rawRecord?.nextStep) ||
    readText(rawRecord?.next_step) ||
    readText(objectionPlan.nextAction) ||
    readText(salesLoopPlan.nextQuestion) ||
    readText(followupPlan.nextQuestion) ||
    legacy.nextStep ||
    "继续补充客户当前情况，我会给出下一步建议。";
  const traceId =
    readRuntimeV2TraceId(rawValue) ?? legacy.traceId ?? createRuntimeV2TraceId(input.conversationId);
  const safe = applyRuntimeV2ComplianceBoundary({
    answer,
    customerCopy,
    nextStep,
    nextAction: salesLoopPlan.nextCustomerMessage || followupPlan.nextQuestion || objectionPlan.nextAction,
  }, input, salesProfile);
  const salesLearningV3 = buildRuntimeV3GrowthOutput({
    scope: input,
    sources,
    memories,
    memoryTrace,
    salesLoopPlan,
    salesLoopV2,
    dealProbability: salesLoopV2.dealProbability,
    silenceRisk: salesLoopV2.silenceRisk,
    dealSignals: salesLoopPlan.dealSignals,
    abScripts: salesLoopV2.abScripts,
    complianceWarnings: safe.complianceWarnings,
    rawValue,
    responseMeta: rawValue,
  });
  const salesGrowthV4 = buildRuntimeV4GrowthFlywheel({
    scope: input,
    salesLearningV3,
    abScripts: salesLoopV2.abScripts,
    dealSignals: salesLoopPlan.dealSignals,
    multiTurnPath: salesLoopV2.multiTurnPath,
  });
  const salesEvolutionV5 = buildRuntimeV5EvolutionOutput({
    scope: input,
    salesLearningV3,
    salesGrowthV4,
    dealSignals: salesLoopPlan.dealSignals,
    silenceRisk: salesLoopV2.silenceRisk,
    currentConversionScore: salesLearningV3.conversionScore,
    sources,
    memoryTrace,
    industryHint: salesProfile.salesIntent,
  });

  return {
    ok: true,
    answer: safe.answer ?? answer,
    customerCopy: safe.customerCopy ?? customerCopy,
    explanation: readText(rawRecord?.explanation),
    sources,
    traceId,
    confidence: readConfidence(rawRecord?.confidence ?? legacy.confidence),
    nextStep: safe.nextStep ?? nextStep,
    runtimeVersion: "v2",
    memoryApplied: memories.length > 0,
    usedMemoryIds: memories.map((memory) => memory.id),
    memoryTrace,
    memoryWarnings: extras?.memoryWarnings,
    appliedAgentPolicies: (extras?.policies ?? []).map((policy) => policy.id),
    salesIntent: salesProfile.salesIntent,
    customerStage: salesLoopPlan.customerStage || salesProfile.customerStage,
    salesStrategy: salesProfile.recommendedStrategy,
    nextAction: safe.nextAction ?? salesLoopPlan.nextCustomerMessage ?? followupPlan.nextQuestion ?? objectionPlan.nextAction,
    dealSignals: salesLoopPlan.dealSignals,
    salesLoopPlan,
    nextQuestion: salesLoopPlan.nextQuestion,
    followupSequence: salesLoopPlan.followupSequence,
    branchReplies: salesLoopPlan.branchReplies,
    stopRules: salesLoopPlan.stopRules,
    stageReason: salesLoopPlan.stageReason,
    salesLoopV2,
    dealProbability: salesLoopV2.dealProbability,
    silenceRisk: salesLoopV2.silenceRisk,
    abScripts: salesLoopV2.abScripts,
    multiTurnPath: salesLoopV2.multiTurnPath,
    followupTiming: salesLoopV2.followupTiming,
    stopPush: salesLoopV2.stopPush,
    recommendedAction: salesLoopV2.recommendedAction,
    salesLearningV3,
    customerSegment: salesLearningV3.customerSegment,
    conversionScore: salesLearningV3.conversionScore,
    bestScriptRecommendation: salesLearningV3.bestScriptRecommendation,
    nextBestActionV3: salesLearningV3.nextBestAction,
    learningSignals: salesLearningV3.learningSignals,
    optimizationReason: salesLearningV3.optimizationReason,
    isolationScope: salesLearningV3.isolationScope,
    salesGrowthV4,
    scriptScoreboardV4: salesGrowthV4.scriptScoreboard,
    segmentPlaybookV4: salesGrowthV4.segmentPlaybook,
    optimizedRecommendationV4: salesGrowthV4.optimizedRecommendation,
    customerPathOptimizationV4: salesGrowthV4.customerPathOptimization,
    growthMetricsV4: salesGrowthV4.metricsSummary,
    growthWarningsV4: salesGrowthV4.warnings,
    salesEvolutionV5,
    strategyCandidates: salesEvolutionV5.strategyCandidates,
    promotedStrategies: salesEvolutionV5.promotedStrategies,
    reducedStrategies: salesEvolutionV5.reducedStrategies,
    retiredStrategies: salesEvolutionV5.retiredStrategies,
    roiSignals: salesEvolutionV5.roiSignals,
    conversionTrend: salesEvolutionV5.conversionTrend,
    evolvedPath: salesEvolutionV5.evolvedPath,
    autonomousRecommendation: salesEvolutionV5.autonomousRecommendation,
    complianceWarnings: safe.complianceWarnings,
    knowledgeBaseId: input.knowledgeBaseId,
    kbId: input.kbId,
    agentId: input.agentId,
    expertId: input.expertId,
    namespace: input.namespace,
    tenantId: input.tenantId,
    raw: rawRecord?.raw,
  };
}

export function ensureCustomerCopy(output: RuntimeV2Output): RuntimeV2Output {
  return output.customerCopy ? output : { ...output, customerCopy: output.answer };
}

export function ensureTraceId(output: RuntimeV2Output): RuntimeV2Output {
  return output.traceId ? output : { ...output, traceId: createRuntimeV2TraceId() };
}

export function ensureSources(output: RuntimeV2Output): RuntimeV2Output {
  return Array.isArray(output.sources) ? output : { ...output, sources: [] };
}

export function stripInternalMetadata(output: RuntimeV2Output): RuntimeV2Output {
  const { raw: _raw, ...safeOutput } = output;
  void _raw;
  return safeOutput;
}

export function ensureSafeCompliance(output: RuntimeV2Output): RuntimeV2Output {
  const safe = applyRuntimeV2ComplianceBoundary(output, {
    query: output.answer,
    appType: "user_app",
    channel: "chat-ui",
    platform: "web",
    outputMode: "auto",
  });

  return {
    ...output,
    answer: safe.answer ?? output.answer,
    customerCopy: safe.customerCopy ?? output.customerCopy,
    nextStep: safe.nextStep ?? output.nextStep,
    nextAction: safe.nextAction ?? output.nextAction,
    complianceWarnings: safe.complianceWarnings,
  };
}
