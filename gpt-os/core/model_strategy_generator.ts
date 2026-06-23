import { type ModelRoutingStrategy, strategy_pool } from "./strategy_pool";

export interface ModelStrategyHistoryRecord {
  model?: string;
  success_rate?: number;
  avg_latency?: number;
  user_satisfaction?: number;
  rag_match_score?: number;
  cost_score?: number;
  fallback_count?: number;
}

export interface ModelStrategyGeneratorInput {
  model_usage_history?: ModelStrategyHistoryRecord[];
  success_rate?: number;
  latency?: number;
  cost?: number;
  rag_alignment?: number;
  hitCount?: number;
  relevance_score?: number;
  cost_mode?: string;
  quality_mode?: string;
  question_complexity?: string;
  contextType?: string;
  intent?: string;
}

export interface ModelStrategyGenerationResult {
  strategy_set: ModelRoutingStrategy[];
  selected_strategy: ModelRoutingStrategy;
  confidence: number;
  reasons: string[];
  strategy_updated: boolean;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function average(values: number[], fallback: number) {
  const safeValues = values.filter((value) => Number.isFinite(value));

  if (safeValues.length === 0) {
    return fallback;
  }

  return safeValues.reduce((sum, value) => sum + value, 0) / safeValues.length;
}

export function generateModelStrategy(input: ModelStrategyGeneratorInput): ModelStrategyGenerationResult {
  const history = input.model_usage_history ?? [];
  const successRate = clamp01(input.success_rate ?? average(history.map((item) => item.success_rate ?? Number.NaN), 0.86));
  const avgLatency = input.latency ?? average(history.map((item) => item.avg_latency ?? Number.NaN), 2800);
  const costScore = clamp01(input.cost ?? average(history.map((item) => item.cost_score ?? Number.NaN), 0.78));
  const ragAlignment = clamp01(
    input.rag_alignment
      ?? input.relevance_score
      ?? average(history.map((item) => item.rag_match_score ?? Number.NaN), 0.62)
  );
  const hitCount = Math.max(0, Math.round(input.hitCount ?? 0));
  const reasons: string[] = [];
  let selectedStrategy: ModelRoutingStrategy = "balanced_mode";
  let confidence = 0.62;

  if (
    input.cost_mode === "low"
    || input.cost_mode === "cost_sensitive"
    || input.cost_mode === "user_low_priority"
    || costScore < 0.48
  ) {
    selectedStrategy = "low_cost_mode";
    confidence = 0.78;
    reasons.push("cost_pressure_detected");
  } else if (
    input.quality_mode === "high"
    || input.cost_mode === "high_quality_required"
    || input.question_complexity === "complex"
    || input.intent === "task"
    || ragAlignment < 0.3
  ) {
    selectedStrategy = "high_quality_mode";
    confidence = 0.84;
    reasons.push("quality_or_reasoning_required");
  } else if (hitCount > 0 && ragAlignment >= 0.72) {
    selectedStrategy = "rag_heavy_mode";
    confidence = 0.82;
    reasons.push("rag_alignment_high");
  } else if (successRate < 0.65 || avgLatency > 6500) {
    selectedStrategy = "high_quality_mode";
    confidence = 0.72;
    reasons.push("performance_risk_detected");
  } else {
    reasons.push("balanced_baseline");
  }

  return {
    strategy_set: strategy_pool.auto_generated_strategies,
    selected_strategy: selectedStrategy,
    confidence,
    reasons,
    strategy_updated: selectedStrategy !== "balanced_mode" || history.length > 0,
  };
}
