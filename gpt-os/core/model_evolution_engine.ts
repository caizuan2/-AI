import { type ModelRoutingStrategy } from "./strategy_pool";

export interface ModelEvolutionInput {
  selected_strategy: ModelRoutingStrategy;
  model_weights: Record<string, number>;
  global_scores: Record<string, { total_score: number }>;
  failure_count?: number;
}

export interface ModelEvolutionResult {
  new_strategy: ModelRoutingStrategy;
  improved_weights: Record<string, number>;
  deprecated_models: string[];
  is_auto_evolving: boolean;
  strategy_updated: boolean;
  evolution_reason: string;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function roundWeight(value: number) {
  return Math.round(clamp01(value) * 1000) / 1000;
}

export function evolveModelStrategy(input: ModelEvolutionInput): ModelEvolutionResult {
  const improvedWeights: Record<string, number> = { ...input.model_weights };
  const deprecatedModels = Object.entries(input.model_weights)
    .filter(([model, weight]) => weight < 0.38 || (input.global_scores[model]?.total_score ?? 1) < 0.42)
    .map(([model]) => model);

  for (const model of Object.keys(improvedWeights)) {
    const globalScore = input.global_scores[model]?.total_score ?? 0.6;
    const globalNudge = (globalScore - 0.6) * 0.08;

    improvedWeights[model] = roundWeight(improvedWeights[model] + globalNudge);
  }

  if (input.selected_strategy === "high_quality_mode" || input.selected_strategy === "rag_heavy_mode") {
    improvedWeights["deepseek-v4-pro"] = roundWeight((improvedWeights["deepseek-v4-pro"] ?? 0) + 0.04);
  }

  if (input.selected_strategy === "low_cost_mode") {
    improvedWeights["deepseek-v4-flash"] = roundWeight((improvedWeights["deepseek-v4-flash"] ?? 0) + 0.05);
    improvedWeights.qwen = roundWeight((improvedWeights.qwen ?? 0) + 0.03);
  }

  if (input.selected_strategy === "balanced_mode") {
    improvedWeights.qwen = roundWeight((improvedWeights.qwen ?? 0) + 0.02);
  }

  for (const model of deprecatedModels) {
    improvedWeights[model] = roundWeight((improvedWeights[model] ?? 0) * 0.55);
  }

  return {
    new_strategy: input.selected_strategy,
    improved_weights: improvedWeights,
    deprecated_models: deprecatedModels,
    is_auto_evolving: true,
    strategy_updated: deprecatedModels.length > 0 || (input.failure_count ?? 0) > 0,
    evolution_reason: deprecatedModels.length > 0 ? "deprecate_low_score_models" : "optimize_strategy_weights",
  };
}
