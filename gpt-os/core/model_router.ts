import { runModelAbTest, type ModelAbTestCandidate, type ModelAbTestResult } from "./model_ab_test";
import { calculateAutonomyScore, type AutonomousScore } from "./autonomous_scoring";
import { generateAutonomousStrategyParadigm, type AutonomousStrategyParadigm } from "./autonomous_strategy_generator";
import { scoreGlobalReasoning, type GlobalReasoningScore } from "./global_reasoning_core";
import { buildModelChain, type ModelChainBuildResult } from "./model_chain_builder";
import { evolveModelStrategy, type ModelEvolutionResult } from "./model_evolution_engine";
import { scoreModelGlobally, type ModelGlobalScore } from "./model_global_scorer";
import { runModelLearningLoop, type ModelLearningLoopResult } from "./model_learning_loop";
import { evaluateModelLifecycle, type ModelLifecycleResult } from "./model_lifecycle_manager";
import { generateModelStrategy, type ModelStrategyGenerationResult } from "./model_strategy_generator";
import { applyRewardSignal, calculateRewardSignal, type ReinforcementFeedbackInput, type RewardSignal } from "./reinforcement_feedback";
import type { ModelEvolutionFeedback } from "./reward_optimizer";
import { reconstructRoutingGraph, type RoutingReconstructionResult } from "./routing_reconstructor";
import { runSelfEvolvingBrain, type SelfEvolvingBrainDecision } from "./self_evolving_brain";
import { optimizeSelfLoop, type SelfLoopOptimizerResult } from "./self_loop_optimizer";
import { evolveStrategyPool, type StrategyEvolverResult } from "./strategy_evolver";
import { inventModelStrategy, type StrategyInventionResult } from "./strategy_invention_engine";
import { type ModelRoutingStrategy } from "./strategy_pool";

export type GptOsIntent = "qa" | "task" | "action" | "multi-step" | "diagnostic";

export type GptOsProviderStatus = "ok" | "disabled" | "error" | "fallback_selected";

export type GptOsRouteContextType =
  | "complex_reasoning"
  | "rag_simple_query"
  | "cost_sensitive"
  | "code_generation"
  | "fallback_or_safe_mode";

export type GptOsCostMode = "balanced" | "user_low_priority" | "cost_sensitive" | "high_quality_required" | "low";

export type GptOsQualityMode = "balanced" | "high";

export type GptOsQuestionComplexity = "simple" | "normal" | "complex";

export type GptOsExecutableProvider = "deepseek" | "qwen" | "openai";

export interface ModelPerformanceRecord {
  model: string;
  success_rate: number;
  avg_latency: number;
  user_satisfaction: number;
  rag_match_score: number;
  fallback_count: number;
  cost_score: number;
}

export type ModelPerformanceStore = Record<string, ModelPerformanceRecord>;

export interface ModelRouteInput {
  intent?: GptOsIntent;
  query?: string;
  contextType?: GptOsRouteContextType;
  reasoningRequested?: boolean;
  reasoningAvailable?: boolean;
  hitCount?: number;
  topK?: number;
  relevance_score?: number;
  contextChars?: number;
  question_complexity?: GptOsQuestionComplexity;
  cost_mode?: GptOsCostMode;
  quality_mode?: GptOsQualityMode;
  history?: Partial<ModelPerformanceRecord>[];
  reinforcement_feedback?: ReinforcementFeedbackInput[];
  model_evolution_feedback?: ModelEvolutionFeedback[];
  latest_model_feedback?: ModelEvolutionFeedback | null;
  previous_degraded_models?: string[];
  ab_test_enabled?: boolean;
  requestId?: string;
}

export interface GptOsRagSignal {
  hitCount: number;
  topK: number;
  relevance_score: number;
  contextChars: number;
}

export interface ModelRouteDecision {
  model: string;
  selected_model: string;
  actualModel: string;
  provider: GptOsExecutableProvider;
  provider_fallback_chain: GptOsExecutableProvider[];
  fallback_chain: string[];
  fallback_chain_v2: string[];
  fallback_chain_v3: string[];
  fallback_chain_v4: string[];
  fallback_chain_v5: string[];
  fallback_chain_v6: string[];
  model_weights: Record<string, number>;
  model_weights_v3: Record<string, number>;
  model_weights_v4: Record<string, number>;
  model_weights_v5: Record<string, number>;
  model_weights_v6: Record<string, number>;
  reasoning:
    | "rag + cost + performance + history"
    | "rag + cost + reinforcement + ab_test + lifecycle"
    | "strategy + global_score + evolution + v3_fallback"
    | "strategy_invention + model_chain + autonomous_score + self_loop"
    | "autonomous_paradigm + routing_graph + global_reasoning + proposal_only";
  reasoning_type: GptOsRouteContextType;
  route_decision: string;
  selected_strategy: ModelRoutingStrategy;
  new_strategy_name: string;
  strategy_set: ModelRoutingStrategy[];
  strategy_generation: ModelStrategyGenerationResult;
  strategy_evolution: ModelEvolutionResult;
  strategy_invention: StrategyInventionResult;
  strategy_evolver: StrategyEvolverResult;
  model_chain: ModelChainBuildResult;
  autonomous_score: AutonomousScore;
  self_loop: SelfLoopOptimizerResult;
  autonomous_paradigm: AutonomousStrategyParadigm;
  routing_reconstruction: RoutingReconstructionResult;
  global_reasoning: GlobalReasoningScore;
  self_evolving_brain: SelfEvolvingBrainDecision;
  new_paradigm_name: string;
  routing_philosophy: string;
  model_allocation_strategy: Record<string, string>;
  new_paradigm_generated: boolean;
  routing_graph_changed: boolean;
  model_priority_shift: Record<string, number>;
  is_fully_autonomous: boolean;
  decision_mode: SelfEvolvingBrainDecision["decision_mode"];
  strategy_combined_chain: string[];
  new_strategy_created: boolean;
  strategy_deprecated: boolean;
  is_auto_evolving: boolean;
  strategy_updated: boolean;
  global_score: ModelGlobalScore;
  global_scores: Record<string, ModelGlobalScore>;
  rag_signal: GptOsRagSignal;
  question_complexity: GptOsQuestionComplexity;
  cost_mode: GptOsCostMode;
  fallbackUsed: boolean;
  provider_status: GptOsProviderStatus;
  learning_trace: {
    algorithm: "selectModelV2" | "selectModelV3" | "selectModelV4" | "selectModelV5" | "selectModelV6";
    store: "model_performance_store";
    learning_trigger: string;
    history_records: number;
  };
  reinforcement: {
    reward_signal: RewardSignal[];
    weight_update: Record<string, number>;
  };
  ab_test: ModelAbTestResult;
  lifecycle: ModelLifecycleResult;
  learning_loop: ModelLearningLoopResult;
  model_self_evolution: {
    enabled: true;
    event_count: number;
    fallback_chain_hint: string[];
    model_weight_deltas: Record<string, number>;
    best_model: string | null;
    weakest_model: string | null;
  };
  requestId?: string;
}

export const GPT_OS_DEEPSEEK_PRO_MODEL = "deepseek-v4-pro";
export const GPT_OS_DEEPSEEK_FLASH_MODEL = "deepseek-v4-flash";
export const GPT_OS_QWEN_MODEL = "qwen";
export const GPT_OS_QWEN_ACTUAL_MODEL = "qwen-plus";
export const GPT_OS_GLM_MODEL = "glm-5.2";
export const GPT_OS_KIMI_CODE_MODEL = "kimi-k2.7-code-highspeed";

export const GPT_OS_DEFAULT_MODEL = GPT_OS_DEEPSEEK_PRO_MODEL;
export const GPT_OS_REASONING_MODEL = GPT_OS_DEEPSEEK_PRO_MODEL;

export const model_performance_store: ModelPerformanceStore = {
  [GPT_OS_DEEPSEEK_PRO_MODEL]: {
    model: GPT_OS_DEEPSEEK_PRO_MODEL,
    success_rate: 0.92,
    avg_latency: 4200,
    user_satisfaction: 0.86,
    rag_match_score: 0.84,
    fallback_count: 0,
    cost_score: 0.56,
  },
  [GPT_OS_DEEPSEEK_FLASH_MODEL]: {
    model: GPT_OS_DEEPSEEK_FLASH_MODEL,
    success_rate: 0.86,
    avg_latency: 2100,
    user_satisfaction: 0.78,
    rag_match_score: 0.74,
    fallback_count: 0,
    cost_score: 0.95,
  },
  [GPT_OS_QWEN_MODEL]: {
    model: GPT_OS_QWEN_MODEL,
    success_rate: 0.88,
    avg_latency: 2600,
    user_satisfaction: 0.8,
    rag_match_score: 0.9,
    fallback_count: 0,
    cost_score: 0.86,
  },
  [GPT_OS_GLM_MODEL]: {
    model: GPT_OS_GLM_MODEL,
    success_rate: 0.82,
    avg_latency: 3200,
    user_satisfaction: 0.74,
    rag_match_score: 0.76,
    fallback_count: 1,
    cost_score: 0.7,
  },
  [GPT_OS_KIMI_CODE_MODEL]: {
    model: GPT_OS_KIMI_CODE_MODEL,
    success_rate: 0.84,
    avg_latency: 3000,
    user_satisfaction: 0.82,
    rag_match_score: 0.7,
    fallback_count: 1,
    cost_score: 0.62,
  },
};

const modelOrder = [
  GPT_OS_DEEPSEEK_PRO_MODEL,
  GPT_OS_DEEPSEEK_FLASH_MODEL,
  GPT_OS_QWEN_MODEL,
  GPT_OS_GLM_MODEL,
  GPT_OS_KIMI_CODE_MODEL,
];

const defaultProviderFallbackChain: GptOsExecutableProvider[] = ["deepseek", "qwen", "openai"];

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function roundWeight(value: number) {
  return Math.round(clamp01(value) * 1000) / 1000;
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeCostMode(value: GptOsCostMode | undefined): GptOsCostMode {
  return value ?? "balanced";
}

function inferQuestionComplexity(input: ModelRouteInput): GptOsQuestionComplexity {
  if (input.question_complexity) {
    return input.question_complexity;
  }

  const query = input.query?.trim() ?? "";

  if (
    input.reasoningRequested ||
    query.length >= 120 ||
    /分析|方案|步骤|对比|规划|拆解|复杂|风险|策略|流程|推理|复盘/.test(query)
  ) {
    return "complex";
  }

  if (query.length <= 40) {
    return "simple";
  }

  return "normal";
}

function isCodeGenerationQuery(query: string) {
  return /代码|函数|脚本|SQL|TypeScript|JavaScript|Flutter|Dart|PowerShell|Python|正则|组件|接口实现/i.test(query);
}

function inferRouteContextType(input: ModelRouteInput): GptOsRouteContextType {
  if (input.contextType) {
    return input.contextType;
  }

  const costMode = normalizeCostMode(input.cost_mode);
  const query = input.query?.trim() ?? "";
  const relevanceScore = clamp01(readNumber(input.relevance_score, 0));
  const hitCount = Math.max(0, Math.round(readNumber(input.hitCount, 0)));

  if (input.intent === "task" || input.intent === "action" || input.intent === "multi-step") {
    return "complex_reasoning";
  }

  if (isCodeGenerationQuery(query)) {
    return "code_generation";
  }

  if (costMode === "user_low_priority" || costMode === "cost_sensitive" || costMode === "low") {
    return "cost_sensitive";
  }

  if (costMode === "high_quality_required" || input.quality_mode === "high") {
    return "complex_reasoning";
  }

  if (relevanceScore > 0.7 && hitCount > 0) {
    return "rag_simple_query";
  }

  if (relevanceScore < 0.3) {
    return "complex_reasoning";
  }

  if (input.reasoningRequested || inferQuestionComplexity(input) === "complex") {
    return "complex_reasoning";
  }

  return "complex_reasoning";
}

function buildRagSignal(input: ModelRouteInput): GptOsRagSignal {
  return {
    hitCount: Math.max(0, Math.round(readNumber(input.hitCount, 0))),
    topK: Math.max(0, Math.round(readNumber(input.topK, 0))),
    relevance_score: clamp01(readNumber(input.relevance_score, 0)),
    contextChars: Math.max(0, Math.round(readNumber(input.contextChars, 0))),
  };
}

function createPerformanceStore(history: Partial<ModelPerformanceRecord>[] = []): ModelPerformanceStore {
  const store = Object.fromEntries(
    Object.entries(model_performance_store).map(([model, record]) => [model, { ...record }])
  ) as ModelPerformanceStore;

  for (const item of history) {
    if (!item.model || !store[item.model]) {
      continue;
    }

    store[item.model] = {
      ...store[item.model],
      success_rate: clamp01(readNumber(item.success_rate, store[item.model].success_rate)),
      avg_latency: Math.max(1, readNumber(item.avg_latency, store[item.model].avg_latency)),
      user_satisfaction: clamp01(readNumber(item.user_satisfaction, store[item.model].user_satisfaction)),
      rag_match_score: clamp01(readNumber(item.rag_match_score, store[item.model].rag_match_score)),
      fallback_count: Math.max(0, readNumber(item.fallback_count, store[item.model].fallback_count)),
      cost_score: clamp01(readNumber(item.cost_score, store[item.model].cost_score)),
    };
  }

  return store;
}

function calculateLatencyScore(avgLatency: number) {
  return clamp01(1 - (Math.max(0, avgLatency) / 8000));
}

function calculateFallbackPenalty(fallbackCount: number) {
  return Math.min(0.12, Math.max(0, fallbackCount) * 0.03);
}

function contextFitScore(model: string, input: ModelRouteInput, contextType: GptOsRouteContextType) {
  const costMode = normalizeCostMode(input.cost_mode);
  const qualityMode = input.quality_mode ?? "balanced";

  const byContext: Record<GptOsRouteContextType, Record<string, number>> = {
    complex_reasoning: {
      [GPT_OS_DEEPSEEK_PRO_MODEL]: 0.98,
      [GPT_OS_DEEPSEEK_FLASH_MODEL]: 0.76,
      [GPT_OS_QWEN_MODEL]: 0.72,
      [GPT_OS_GLM_MODEL]: 0.78,
      [GPT_OS_KIMI_CODE_MODEL]: 0.82,
    },
    rag_simple_query: {
      [GPT_OS_DEEPSEEK_PRO_MODEL]: 0.78,
      [GPT_OS_DEEPSEEK_FLASH_MODEL]: 0.86,
      [GPT_OS_QWEN_MODEL]: 0.98,
      [GPT_OS_GLM_MODEL]: 0.72,
      [GPT_OS_KIMI_CODE_MODEL]: 0.68,
    },
    cost_sensitive: {
      [GPT_OS_DEEPSEEK_PRO_MODEL]: 0.62,
      [GPT_OS_DEEPSEEK_FLASH_MODEL]: 0.98,
      [GPT_OS_QWEN_MODEL]: 0.92,
      [GPT_OS_GLM_MODEL]: 0.72,
      [GPT_OS_KIMI_CODE_MODEL]: 0.64,
    },
    code_generation: {
      [GPT_OS_DEEPSEEK_PRO_MODEL]: 0.84,
      [GPT_OS_DEEPSEEK_FLASH_MODEL]: 0.74,
      [GPT_OS_QWEN_MODEL]: 0.7,
      [GPT_OS_GLM_MODEL]: 0.72,
      [GPT_OS_KIMI_CODE_MODEL]: 0.98,
    },
    fallback_or_safe_mode: {
      [GPT_OS_DEEPSEEK_PRO_MODEL]: 0.74,
      [GPT_OS_DEEPSEEK_FLASH_MODEL]: 0.82,
      [GPT_OS_QWEN_MODEL]: 0.96,
      [GPT_OS_GLM_MODEL]: 0.7,
      [GPT_OS_KIMI_CODE_MODEL]: 0.62,
    },
  };

  let score = byContext[contextType][model] ?? 0.7;

  if (qualityMode === "high" || costMode === "high_quality_required") {
    score += model === GPT_OS_DEEPSEEK_PRO_MODEL ? 0.08 : -0.04;
  }

  if (costMode === "low" || costMode === "user_low_priority" || costMode === "cost_sensitive") {
    score += model === GPT_OS_DEEPSEEK_FLASH_MODEL || model === GPT_OS_QWEN_MODEL ? 0.06 : -0.04;
  }

  return clamp01(score);
}

function calculateModelScores(input: ModelRouteInput, contextType: GptOsRouteContextType): Record<string, number> {
  const store = createPerformanceStore(input.history);
  const ragSignal = buildRagSignal(input);
  const currentRagScore = ragSignal.hitCount > 0 ? ragSignal.relevance_score : 0.35;
  const scores: Record<string, number> = {};

  for (const model of modelOrder) {
    const record = store[model];
    const contextualRagQuality = clamp01(
      (record.rag_match_score * 0.45)
        + (currentRagScore * 0.25)
        + (contextFitScore(model, input, contextType) * 0.3)
    );
    const latencyScore = calculateLatencyScore(record.avg_latency);
    const baseWeight = (
      (record.success_rate * 0.4)
        + (contextualRagQuality * 0.3)
        + (latencyScore * 0.2)
        + (record.cost_score * 0.1)
    ) - calculateFallbackPenalty(record.fallback_count);

    scores[model] = roundWeight(baseWeight);
  }

  return scores;
}

function buildAbTestCandidates(
  input: ModelRouteInput,
  contextType: GptOsRouteContextType,
  modelWeights: Record<string, number>,
): ModelAbTestCandidate[] {
  const store = createPerformanceStore(input.history);
  const ragSignal = buildRagSignal(input);
  const topModels = sortModelsByWeight(modelWeights).slice(0, 3);

  return topModels.map((model) => {
    const record = store[model];
    const contextScore = contextFitScore(model, input, contextType);

    return {
      model,
      response_quality: clamp01((record.user_satisfaction * 0.35) + (record.success_rate * 0.35) + (contextScore * 0.3)),
      latency: record.avg_latency,
      user_feedback_simulation: clamp01((record.user_satisfaction * 0.7) + (record.success_rate * 0.3)),
      rag_alignment_score: clamp01((record.rag_match_score * 0.65) + (ragSignal.relevance_score * 0.35)),
    };
  });
}

function applyReinforcementUpdates(
  modelWeights: Record<string, number>,
  feedback: ReinforcementFeedbackInput[] = [],
) {
  const rewardSignal = feedback.map(calculateRewardSignal);
  const updatedWeights = { ...modelWeights };
  const weightUpdate: Record<string, number> = {};

  for (const signal of rewardSignal) {
    if (!(signal.model in updatedWeights)) {
      continue;
    }

    updatedWeights[signal.model] = roundWeight(applyRewardSignal(updatedWeights[signal.model], signal));
    weightUpdate[signal.model] = signal.net_delta;
  }

  return {
    rewardSignal,
    updatedWeights,
    weightUpdate,
  };
}

function applyAbTestNudge(
  modelWeights: Record<string, number>,
  abTest: ModelAbTestResult,
): Record<string, number> {
  const updatedWeights = { ...modelWeights };

  for (const [model, metrics] of Object.entries(abTest.metrics)) {
    if (!(model in updatedWeights)) {
      continue;
    }

    const nudge = (metrics.combined_score - 0.7) * 0.04;
    updatedWeights[model] = roundWeight(updatedWeights[model] + nudge);
  }

  return updatedWeights;
}

function calculateModelScoresV3(input: ModelRouteInput, contextType: GptOsRouteContextType) {
  const baseWeights = calculateModelScores(input, contextType);
  const reinforcement = applyReinforcementUpdates(baseWeights, input.reinforcement_feedback);
  const abTest = runModelAbTest(buildAbTestCandidates(input, contextType, reinforcement.updatedWeights));
  const modelWeightsV3 = applyAbTestNudge(reinforcement.updatedWeights, abTest);
  const lifecycle = evaluateModelLifecycle({
    model_weights: modelWeightsV3,
    previous_degraded: input.previous_degraded_models,
  });

  for (const model of lifecycle.degraded_models) {
    modelWeightsV3[model] = roundWeight((modelWeightsV3[model] ?? 0) * 0.5);
  }

  return {
    baseWeights,
    modelWeightsV3,
    reinforcement: {
      reward_signal: reinforcement.rewardSignal,
      weight_update: reinforcement.weightUpdate,
    },
    abTest,
    lifecycle: evaluateModelLifecycle({
      model_weights: modelWeightsV3,
      previous_degraded: input.previous_degraded_models,
    }),
  };
}

function buildStrategyGenerationInput(input: ModelRouteInput, contextType: GptOsRouteContextType) {
  const store = createPerformanceStore(input.history);
  const ragSignal = buildRagSignal(input);
  const records = Object.values(store);
  const avg = (values: number[], fallback: number) => {
    const safeValues = values.filter((value) => Number.isFinite(value));

    if (safeValues.length === 0) {
      return fallback;
    }

    return safeValues.reduce((sum, value) => sum + value, 0) / safeValues.length;
  };

  return {
    model_usage_history: records,
    success_rate: avg(records.map((record) => record.success_rate), 0.86),
    latency: avg(records.map((record) => record.avg_latency), 2800),
    cost: avg(records.map((record) => record.cost_score), 0.78),
    rag_alignment: ragSignal.relevance_score,
    hitCount: ragSignal.hitCount,
    relevance_score: ragSignal.relevance_score,
    cost_mode: normalizeCostMode(input.cost_mode),
    quality_mode: input.quality_mode ?? "balanced",
    question_complexity: inferQuestionComplexity(input),
    contextType,
    intent: input.intent,
  };
}

function calculateGlobalScores(input: ModelRouteInput): Record<string, ModelGlobalScore> {
  const store = createPerformanceStore(input.history);
  const ragSignal = buildRagSignal(input);
  const scores: Record<string, ModelGlobalScore> = {};

  for (const model of modelOrder) {
    const record = store[model];

    scores[model] = scoreModelGlobally({
      success_rate: record.success_rate,
      rag_match_score: record.rag_match_score,
      avg_latency: record.avg_latency,
      cost_score: record.cost_score,
      user_satisfaction: record.user_satisfaction,
      relevance_score: ragSignal.relevance_score,
    });
  }

  return scores;
}

function strategyFitScore(model: string, strategy: ModelRoutingStrategy) {
  const byStrategy: Record<ModelRoutingStrategy, Record<string, number>> = {
    high_quality_mode: {
      [GPT_OS_DEEPSEEK_PRO_MODEL]: 0.99,
      [GPT_OS_DEEPSEEK_FLASH_MODEL]: 0.74,
      [GPT_OS_QWEN_MODEL]: 0.78,
      [GPT_OS_GLM_MODEL]: 0.82,
      [GPT_OS_KIMI_CODE_MODEL]: 0.84,
    },
    low_cost_mode: {
      [GPT_OS_DEEPSEEK_PRO_MODEL]: 0.62,
      [GPT_OS_DEEPSEEK_FLASH_MODEL]: 0.99,
      [GPT_OS_QWEN_MODEL]: 0.94,
      [GPT_OS_GLM_MODEL]: 0.72,
      [GPT_OS_KIMI_CODE_MODEL]: 0.66,
    },
    balanced_mode: {
      [GPT_OS_DEEPSEEK_PRO_MODEL]: 0.84,
      [GPT_OS_DEEPSEEK_FLASH_MODEL]: 0.88,
      [GPT_OS_QWEN_MODEL]: 0.96,
      [GPT_OS_GLM_MODEL]: 0.78,
      [GPT_OS_KIMI_CODE_MODEL]: 0.76,
    },
    rag_heavy_mode: {
      [GPT_OS_DEEPSEEK_PRO_MODEL]: 0.99,
      [GPT_OS_DEEPSEEK_FLASH_MODEL]: 0.78,
      [GPT_OS_QWEN_MODEL]: 0.86,
      [GPT_OS_GLM_MODEL]: 0.76,
      [GPT_OS_KIMI_CODE_MODEL]: 0.72,
    },
    emergency_safe_mode: {
      [GPT_OS_DEEPSEEK_PRO_MODEL]: 0.72,
      [GPT_OS_DEEPSEEK_FLASH_MODEL]: 0.84,
      [GPT_OS_QWEN_MODEL]: 0.98,
      [GPT_OS_GLM_MODEL]: 0.72,
      [GPT_OS_KIMI_CODE_MODEL]: 0.6,
    },
  };

  return byStrategy[strategy][model] ?? 0.7;
}

function preferredModelForStrategy(strategy: ModelRoutingStrategy) {
  if (strategy === "low_cost_mode") {
    return GPT_OS_DEEPSEEK_FLASH_MODEL;
  }

  if (strategy === "balanced_mode") {
    return GPT_OS_QWEN_MODEL;
  }

  if (strategy === "emergency_safe_mode") {
    return GPT_OS_QWEN_MODEL;
  }

  return GPT_OS_DEEPSEEK_PRO_MODEL;
}

function applyStrategyWeights(
  modelWeightsV3: Record<string, number>,
  globalScores: Record<string, ModelGlobalScore>,
  selectedStrategy: ModelRoutingStrategy,
): Record<string, number> {
  const modelWeightsV4: Record<string, number> = {};

  for (const model of modelOrder) {
    const v3Weight = modelWeightsV3[model] ?? 0;
    const globalScore = globalScores[model]?.total_score ?? 0.6;
    const strategyScore = strategyFitScore(model, selectedStrategy);

    modelWeightsV4[model] = roundWeight(
      (v3Weight * 0.46)
        + (globalScore * 0.34)
        + (strategyScore * 0.2)
    );
  }

  return modelWeightsV4;
}

function calculateModelScoresV4(input: ModelRouteInput, contextType: GptOsRouteContextType) {
  const v3 = calculateModelScoresV3(input, contextType);
  const strategyGeneration = generateModelStrategy(buildStrategyGenerationInput(input, contextType));
  const globalScores = calculateGlobalScores(input);
  const strategyWeights = applyStrategyWeights(
    v3.modelWeightsV3,
    globalScores,
    strategyGeneration.selected_strategy,
  );
  const strategyEvolution = evolveModelStrategy({
    selected_strategy: strategyGeneration.selected_strategy,
    model_weights: strategyWeights,
    global_scores: globalScores,
    failure_count: input.reinforcement_feedback?.filter((item) => !item.success).length ?? 0,
  });
  const lifecycle = evaluateModelLifecycle({
    model_weights: strategyEvolution.improved_weights,
    previous_degraded: input.previous_degraded_models,
  });
  const modelWeightsV4 = { ...strategyEvolution.improved_weights };

  for (const model of lifecycle.degraded_models) {
    modelWeightsV4[model] = roundWeight((modelWeightsV4[model] ?? 0) * 0.55);
  }

  return {
    ...v3,
    modelWeightsV4,
    strategyGeneration,
    strategyEvolution,
    globalScores,
    lifecycle: evaluateModelLifecycle({
      model_weights: modelWeightsV4,
      previous_degraded: input.previous_degraded_models,
    }),
  };
}

function averagePerformanceValue(
  input: ModelRouteInput,
  field: keyof Pick<ModelPerformanceRecord, "success_rate" | "avg_latency" | "user_satisfaction" | "cost_score">,
  fallback: number,
) {
  const store = createPerformanceStore(input.history);
  const values = Object.values(store)
    .map((record) => record[field])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (values.length === 0) {
    return fallback;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function calculateModelScoresV5(input: ModelRouteInput, contextType: GptOsRouteContextType) {
  const v4 = calculateModelScoresV4(input, contextType);
  const ragSignal = buildRagSignal(input);
  const avgLatency = averagePerformanceValue(input, "avg_latency", 2800);
  const avgCostScore = averagePerformanceValue(input, "cost_score", 0.78);
  const reinforcementFeedback = input.reinforcement_feedback
    ?.map((item) => item.user_satisfaction)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const avgUserFeedback = reinforcementFeedback && reinforcementFeedback.length > 0
    ? reinforcementFeedback.reduce((sum, value) => sum + value, 0) / reinforcementFeedback.length
    : averagePerformanceValue(input, "user_satisfaction", 0.8);
  const costMode = normalizeCostMode(input.cost_mode);
  const effectiveCostScore = costMode === "low" || costMode === "cost_sensitive" || costMode === "user_low_priority"
    ? Math.min(avgCostScore, 0.42)
    : avgCostScore;
  const strategyInvention = inventModelStrategy({
    model_history: Object.values(createPerformanceStore(input.history)),
    rag_performance: ragSignal.relevance_score,
    user_feedback: avgUserFeedback,
    latency: avgLatency,
    cost: effectiveCostScore,
  });
  const autonomousScore = calculateAutonomyScore({
    reasoning_quality: v4.globalScores[GPT_OS_DEEPSEEK_PRO_MODEL]?.accuracy_score ?? 0.86,
    rag_alignment: ragSignal.relevance_score,
    cost_efficiency: effectiveCostScore,
    latency: avgLatency,
    user_feedback: avgUserFeedback,
  });
  const v4SelectedModel = chooseSelectedModelV4(v4.strategyGeneration.selected_strategy, v4.modelWeightsV4, v4.lifecycle);
  const fallbackChainV4 = orderModelsWithSelected(v4SelectedModel, v4.modelWeightsV4);
  const modelChain = buildModelChain({
    selected_strategy: v4.strategyGeneration.selected_strategy,
    invented_strategy_name: strategyInvention.new_strategy_name,
    model_weights: v4.modelWeightsV4,
    fallback_chain_v4: fallbackChainV4,
    rag_alignment: ragSignal.relevance_score,
    cost_efficiency: effectiveCostScore,
    quality_required: input.quality_mode === "high" || normalizeCostMode(input.cost_mode) === "high_quality_required",
  });
  const strategyEvolver = evolveStrategyPool({
    active_strategies: [
      {
        strategy_name: v4.strategyGeneration.selected_strategy,
        performance: v4.globalScores[v4SelectedModel]?.total_score ?? 0.7,
        success_rate: averagePerformanceValue(input, "success_rate", 0.86),
        similarity_group: "baseline",
      },
      {
        strategy_name: strategyInvention.new_strategy_name,
        performance: Math.max(strategyInvention.expected_improvement, autonomousScore.autonomy_score),
        success_rate: autonomousScore.autonomy_score,
        similarity_group: "invented",
      },
    ],
    invented_strategy_name: strategyInvention.new_strategy_name,
    invented_expected_improvement: strategyInvention.expected_improvement,
  });
  const modelWeightsV5 = { ...v4.modelWeightsV4 };

  for (let index = 0; index < modelChain.strategy_combined_chain.length; index += 1) {
    const model = modelChain.strategy_combined_chain[index];

    if (!(model in modelWeightsV5)) {
      continue;
    }

    const chainBoost = Math.max(0, 0.045 - (index * 0.009));
    const autonomyBoost = (autonomousScore.autonomy_score - 0.6) * 0.04;

    modelWeightsV5[model] = roundWeight(modelWeightsV5[model] + chainBoost + autonomyBoost);
  }

  for (const model of strategyEvolver.deprecated_strategies) {
    if (model in modelWeightsV5) {
      modelWeightsV5[model] = roundWeight(modelWeightsV5[model] * 0.6);
    }
  }

  const lifecycle = evaluateModelLifecycle({
    model_weights: modelWeightsV5,
    previous_degraded: input.previous_degraded_models,
  });

  for (const model of lifecycle.degraded_models) {
    modelWeightsV5[model] = roundWeight((modelWeightsV5[model] ?? 0) * 0.55);
  }

  const finalChain = [
    ...modelChain.strategy_combined_chain,
    ...sortModelsByWeight(modelWeightsV5),
  ].filter((model, index, chain) => model && chain.indexOf(model) === index);
  const selfLoop = optimizeSelfLoop({
    new_strategy_created: strategyInvention.new_strategy_created,
    strategy_combined_chain: finalChain,
    strategy_deprecated: strategyEvolver.strategy_deprecated || lifecycle.degraded_models.length > 0,
    autonomy_score: autonomousScore.autonomy_score,
  });

  return {
    ...v4,
    modelWeightsV5,
    strategyInvention,
    modelChain: {
      ...modelChain,
      strategy_combined_chain: finalChain,
    },
    strategyEvolver,
    autonomousScore,
    selfLoop,
    lifecycle: evaluateModelLifecycle({
      model_weights: modelWeightsV5,
      previous_degraded: input.previous_degraded_models,
    }),
  };
}

function calculateModelScoresV6(input: ModelRouteInput, contextType: GptOsRouteContextType) {
  const v5 = calculateModelScoresV5(input, contextType);
  const ragSignal = buildRagSignal(input);
  const avgLatency = averagePerformanceValue(input, "avg_latency", 2800);
  const avgCostScore = averagePerformanceValue(input, "cost_score", 0.78);
  const costMode = normalizeCostMode(input.cost_mode);
  const effectiveCostScore = costMode === "low" || costMode === "cost_sensitive" || costMode === "user_low_priority"
    ? Math.min(avgCostScore, 0.42)
    : avgCostScore;
  const avgSuccessRate = averagePerformanceValue(input, "success_rate", 0.86);
  const avgUserFeedback = averagePerformanceValue(input, "user_satisfaction", 0.8);
  const globalReasoning = scoreGlobalReasoning({
    reasoning_depth: contextType === "complex_reasoning" ? 0.92 : 0.74,
    system_efficiency: 1 - Math.min(0.9, avgLatency / 9000),
    adaptive_success_rate: avgSuccessRate,
    cost_performance: effectiveCostScore,
    rag_alignment: ragSignal.relevance_score,
  });
  const autonomousParadigm = generateAutonomousStrategyParadigm({
    historical_model_performance: v5.modelWeightsV5,
    rag_efficiency: ragSignal.relevance_score,
    user_feedback: avgUserFeedback,
    cost_latency_metrics: {
      avg_latency: avgLatency,
      cost_efficiency: effectiveCostScore,
    },
    global_reasoning: globalReasoning,
  });
  const routingReconstruction = reconstructRoutingGraph({
    paradigm: autonomousParadigm,
    current_chain: v5.modelChain.strategy_combined_chain,
    model_weights: v5.modelWeightsV5,
  });
  const selfEvolvingBrain = runSelfEvolvingBrain({
    paradigm: autonomousParadigm,
    routing_graph: routingReconstruction,
    global_reasoning: globalReasoning,
  });
  const modelWeightsV6 = { ...v5.modelWeightsV5 };

  for (let index = 0; index < routingReconstruction.best_path.length; index += 1) {
    const model = routingReconstruction.best_path[index];

    if (!(model in modelWeightsV6)) {
      continue;
    }

    const graphBoost = Math.max(0, 0.055 - (index * 0.01));
    const reasoningBoost = (globalReasoning.global_reasoning_score - 0.6) * 0.05;

    modelWeightsV6[model] = roundWeight(modelWeightsV6[model] + graphBoost + reasoningBoost);
  }

  return {
    ...v5,
    modelWeightsV6,
    autonomousParadigm,
    routingReconstruction,
    globalReasoning,
    selfEvolvingBrain,
  };
}

function sortModelsByWeight(modelWeights: Record<string, number>) {
  return [...modelOrder].sort((left, right) => {
    const diff = (modelWeights[right] ?? 0) - (modelWeights[left] ?? 0);

    return diff === 0 ? modelOrder.indexOf(left) - modelOrder.indexOf(right) : diff;
  });
}

function modelToProvider(model: string): GptOsExecutableProvider | null {
  if (model === GPT_OS_DEEPSEEK_PRO_MODEL || model === GPT_OS_DEEPSEEK_FLASH_MODEL) {
    return "deepseek";
  }

  if (model === GPT_OS_QWEN_MODEL) {
    return "qwen";
  }

  return null;
}

function modelToActualModel(model: string) {
  if (model === GPT_OS_QWEN_MODEL) {
    return GPT_OS_QWEN_ACTUAL_MODEL;
  }

  return model;
}

function resolveExecutableRoute(selectedModel: string, fallbackChainV2: string[]) {
  const selectedProvider = modelToProvider(selectedModel);

  if (selectedProvider) {
    return {
      actualModel: modelToActualModel(selectedModel),
      provider: selectedProvider,
      fallbackUsed: false,
      providerStatus: "ok" as GptOsProviderStatus,
    };
  }

  const fallbackModel = fallbackChainV2.find((model) => modelToProvider(model));
  const provider = modelToProvider(fallbackModel ?? GPT_OS_DEEPSEEK_PRO_MODEL) ?? "deepseek";

  return {
    actualModel: modelToActualModel(fallbackModel ?? GPT_OS_DEEPSEEK_PRO_MODEL),
    provider,
    fallbackUsed: true,
    providerStatus: "fallback_selected" as GptOsProviderStatus,
  };
}

function buildProviderFallbackChain(provider: GptOsExecutableProvider, fallbackChainV2: string[]): GptOsExecutableProvider[] {
  const providers = fallbackChainV2
    .map(modelToProvider)
    .filter((candidate): candidate is GptOsExecutableProvider => Boolean(candidate));
  const normalized = [provider, ...providers, ...defaultProviderFallbackChain]
    .filter((candidate, index, chain) => chain.indexOf(candidate) === index);

  return normalized;
}

function getLearningTrigger(input: ModelRouteInput, contextType: GptOsRouteContextType) {
  if ((input.history?.length ?? 0) > 0) {
    return "history_feedback";
  }

  if (contextType === "rag_simple_query") {
    return "rag_high_relevance";
  }

  if (contextType === "cost_sensitive") {
    return "cost_mode";
  }

  if (contextType === "code_generation") {
    return "intent_code_generation";
  }

  return "baseline_performance_store";
}

export function selectModelV2(input: ModelRouteInput = {}): string {
  const contextType = inferRouteContextType(input);
  const modelWeights = calculateModelScores(input, contextType);

  return sortModelsByWeight(modelWeights)[0] ?? GPT_OS_DEEPSEEK_PRO_MODEL;
}

export function selectModelV3(input: ModelRouteInput = {}): string {
  const contextType = inferRouteContextType(input);
  const { modelWeightsV3 } = calculateModelScoresV3(input, contextType);

  return sortModelsByWeight(modelWeightsV3)[0] ?? GPT_OS_DEEPSEEK_PRO_MODEL;
}

function orderModelsWithSelected(selectedModel: string, modelWeights: Record<string, number>) {
  return [
    selectedModel,
    ...sortModelsByWeight(modelWeights).filter((model) => model !== selectedModel),
  ];
}

function chooseSelectedModelV4(
  selectedStrategy: ModelRoutingStrategy,
  modelWeightsV4: Record<string, number>,
  lifecycle: ModelLifecycleResult,
) {
  const preferredModel = preferredModelForStrategy(selectedStrategy);

  if (!lifecycle.degraded_models.includes(preferredModel) && (modelWeightsV4[preferredModel] ?? 0) >= 0.35) {
    return preferredModel;
  }

  return sortModelsByWeight(modelWeightsV4)[0] ?? GPT_OS_DEEPSEEK_PRO_MODEL;
}

export function selectModelV4(input: ModelRouteInput = {}): string {
  const contextType = inferRouteContextType(input);
  const { modelWeightsV4, strategyGeneration, lifecycle } = calculateModelScoresV4(input, contextType);

  return chooseSelectedModelV4(strategyGeneration.selected_strategy, modelWeightsV4, lifecycle);
}

function chooseSelectedModelV5(
  modelChain: ModelChainBuildResult,
  modelWeightsV5: Record<string, number>,
  lifecycle: ModelLifecycleResult,
) {
  const firstHealthyChainModel = modelChain.strategy_combined_chain.find((model) => {
    return !lifecycle.degraded_models.includes(model) && (modelWeightsV5[model] ?? 0) >= 0.35;
  });

  return firstHealthyChainModel ?? sortModelsByWeight(modelWeightsV5)[0] ?? GPT_OS_DEEPSEEK_PRO_MODEL;
}

export function selectModelV5(input: ModelRouteInput = {}): string {
  const contextType = inferRouteContextType(input);
  const { modelWeightsV5, modelChain, lifecycle } = calculateModelScoresV5(input, contextType);

  return chooseSelectedModelV5(modelChain, modelWeightsV5, lifecycle);
}

function chooseSelectedModelV6(
  routingReconstruction: RoutingReconstructionResult,
  modelWeightsV6: Record<string, number>,
  lifecycle: ModelLifecycleResult,
) {
  const firstHealthyGraphModel = routingReconstruction.best_path.find((model) => {
    return !lifecycle.degraded_models.includes(model) && (modelWeightsV6[model] ?? 0) >= 0.35;
  });

  return firstHealthyGraphModel ?? sortModelsByWeight(modelWeightsV6)[0] ?? GPT_OS_DEEPSEEK_PRO_MODEL;
}

function buildLearningLoop(input: ModelRouteInput): ModelLearningLoopResult {
  return runModelLearningLoop({
    store: createPerformanceStore(input.history),
    feedback_events: input.model_evolution_feedback,
    request_feedback: input.latest_model_feedback ?? null,
  });
}

function applyLearningDeltas(
  modelWeights: Record<string, number>,
  modelWeightDeltas: Record<string, number>,
): Record<string, number> {
  const nextWeights: Record<string, number> = {};

  for (const model of modelOrder) {
    nextWeights[model] = roundWeight((modelWeights[model] ?? 0) + (modelWeightDeltas[model] ?? 0));
  }

  return nextWeights;
}

export function selectModelV6(input: ModelRouteInput = {}): string {
  const contextType = inferRouteContextType(input);
  const { modelWeightsV6, routingReconstruction, lifecycle } = calculateModelScoresV6(input, contextType);
  const learningLoop = buildLearningLoop(input);
  const learnedModelWeightsV6 = applyLearningDeltas(modelWeightsV6, learningLoop.model_weight_deltas);

  return chooseSelectedModelV6(routingReconstruction, learnedModelWeightsV6, lifecycle);
}

export function selectModel(input: ModelRouteInput = {}): string {
  return selectModelV6(input);
}

export function routeModel(input: ModelRouteInput = {}): ModelRouteDecision {
  const reasoningType = inferRouteContextType(input);
  const {
    baseWeights,
    modelWeightsV3,
    modelWeightsV4,
    reinforcement,
    abTest,
    lifecycle,
    strategyGeneration,
    strategyEvolution,
    globalScores,
    modelWeightsV5,
    strategyInvention,
    modelChain,
    strategyEvolver,
    autonomousScore,
    selfLoop,
    modelWeightsV6,
    autonomousParadigm,
    routingReconstruction,
    globalReasoning,
    selfEvolvingBrain,
  } = calculateModelScoresV6(input, reasoningType);
  const learningLoop = buildLearningLoop(input);
  const fallbackChainV2 = sortModelsByWeight(baseWeights);
  const fallbackChainV3 = sortModelsByWeight(modelWeightsV3);
  const v4SelectedModel = chooseSelectedModelV4(strategyGeneration.selected_strategy, modelWeightsV4, lifecycle);
  const fallbackChainV4 = orderModelsWithSelected(v4SelectedModel, modelWeightsV4);
  const selectedModel = chooseSelectedModelV5(modelChain, modelWeightsV5, lifecycle);
  const fallbackChainV5 = orderModelsWithSelected(selectedModel, modelWeightsV5);
  const learnedModelWeightsV6 = applyLearningDeltas(modelWeightsV6, learningLoop.model_weight_deltas);
  const v6SelectedModel = chooseSelectedModelV6(routingReconstruction, learnedModelWeightsV6, lifecycle);
  const fallbackChainV6 = orderModelsWithSelected(v6SelectedModel, learnedModelWeightsV6);
  const executableRoute = resolveExecutableRoute(v6SelectedModel, fallbackChainV6);

  return {
    model: v6SelectedModel,
    selected_model: v6SelectedModel,
    actualModel: executableRoute.actualModel,
    provider: executableRoute.provider,
    provider_fallback_chain: buildProviderFallbackChain(executableRoute.provider, fallbackChainV6),
    fallback_chain: fallbackChainV6,
    fallback_chain_v2: fallbackChainV2,
    fallback_chain_v3: fallbackChainV3,
    fallback_chain_v4: fallbackChainV4,
    fallback_chain_v5: fallbackChainV5,
    fallback_chain_v6: fallbackChainV6,
    model_weights: baseWeights,
    model_weights_v3: modelWeightsV3,
    model_weights_v4: modelWeightsV4,
    model_weights_v5: modelWeightsV5,
    model_weights_v6: learnedModelWeightsV6,
    reasoning: "autonomous_paradigm + routing_graph + global_reasoning + proposal_only",
    reasoning_type: reasoningType,
    route_decision: `autonomous_router_v6_${autonomousParadigm.new_paradigm_name}_${reasoningType}`,
    selected_strategy: strategyGeneration.selected_strategy,
    new_strategy_name: strategyInvention.new_strategy_name,
    strategy_set: strategyGeneration.strategy_set,
    strategy_generation: strategyGeneration,
    strategy_evolution: strategyEvolution,
    strategy_invention: strategyInvention,
    strategy_evolver: strategyEvolver,
    model_chain: modelChain,
    autonomous_score: autonomousScore,
    self_loop: selfLoop,
    autonomous_paradigm: autonomousParadigm,
    routing_reconstruction: routingReconstruction,
    global_reasoning: globalReasoning,
    self_evolving_brain: selfEvolvingBrain,
    new_paradigm_name: autonomousParadigm.new_paradigm_name,
    routing_philosophy: autonomousParadigm.routing_philosophy,
    model_allocation_strategy: autonomousParadigm.model_allocation_strategy,
    new_paradigm_generated: autonomousParadigm.new_paradigm_generated,
    routing_graph_changed: routingReconstruction.routing_graph_changed,
    model_priority_shift: routingReconstruction.model_priority_shift,
    is_fully_autonomous: selfEvolvingBrain.is_fully_autonomous,
    decision_mode: selfEvolvingBrain.decision_mode,
    strategy_combined_chain: modelChain.strategy_combined_chain,
    new_strategy_created: strategyInvention.new_strategy_created,
    strategy_deprecated: strategyEvolver.strategy_deprecated || lifecycle.degraded_models.length > 0,
    is_auto_evolving: strategyEvolution.is_auto_evolving || selfLoop.feedback_loop_status !== "observe",
    strategy_updated: strategyGeneration.strategy_updated || strategyEvolution.strategy_updated || strategyInvention.new_strategy_created,
    global_score: globalScores[v6SelectedModel] ?? globalScores[GPT_OS_DEEPSEEK_PRO_MODEL],
    global_scores: globalScores,
    rag_signal: buildRagSignal(input),
    question_complexity: inferQuestionComplexity(input),
    cost_mode: normalizeCostMode(input.cost_mode),
    fallbackUsed: executableRoute.fallbackUsed,
    provider_status: executableRoute.providerStatus,
    learning_trace: {
      algorithm: "selectModelV6",
      store: "model_performance_store",
      learning_trigger: getLearningTrigger(input, reasoningType),
      history_records: input.history?.length ?? 0,
    },
    reinforcement,
    ab_test: abTest,
    lifecycle,
    learning_loop: learningLoop,
    model_self_evolution: {
      enabled: true,
      event_count: learningLoop.analytics.event_count,
      fallback_chain_hint: learningLoop.fallback_chain_hint,
      model_weight_deltas: learningLoop.model_weight_deltas,
      best_model: learningLoop.analytics.best_model,
      weakest_model: learningLoop.analytics.weakest_model,
    },
    requestId: input.requestId,
  };
}
