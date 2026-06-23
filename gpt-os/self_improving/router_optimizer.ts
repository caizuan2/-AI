export interface RouterOptimizerInput {
  model_weights?: Record<string, number>;
  fallback_chain?: string[];
  model_success_rate?: Record<string, number>;
  model_latency?: Record<string, number>;
}

export interface RouterOptimizationRecommendation {
  suggested_weight_adjustments: Record<string, number>;
  optimized_fallback_chain: string[];
  routing_strategy_suggestions: string[];
  auto_apply_router_changes: false;
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

export function optimizeRouterDesign(input: RouterOptimizerInput = {}): RouterOptimizationRecommendation {
  const modelWeights = input.model_weights ?? {
    qwen: 0.78,
    "deepseek-v4-flash": 0.76,
    "deepseek-v4-pro": 0.82,
    "glm-5.2": 0.62,
  };
  const modelSuccessRate = input.model_success_rate ?? {};
  const modelLatency = input.model_latency ?? {};
  const suggestedWeightAdjustments: Record<string, number> = {};

  for (const [model, weight] of Object.entries(modelWeights)) {
    const success = modelSuccessRate[model] ?? 0.78;
    const latency = modelLatency[model] ?? 2800;
    const latencyScore = clamp01(1 - (latency / 8000));
    const targetWeight = (weight * 0.5) + (success * 0.32) + (latencyScore * 0.18);

    suggestedWeightAdjustments[model] = roundWeight(targetWeight);
  }

  const optimizedFallbackChain = Object.keys(suggestedWeightAdjustments).sort((left, right) => {
    const diff = suggestedWeightAdjustments[right] - suggestedWeightAdjustments[left];

    return diff === 0 ? left.localeCompare(right) : diff;
  });

  return {
    suggested_weight_adjustments: suggestedWeightAdjustments,
    optimized_fallback_chain: optimizedFallbackChain.length > 0 ? optimizedFallbackChain : input.fallback_chain ?? [],
    routing_strategy_suggestions: [
      "simulate_weight_changes_before_router_apply",
      "preserve_current_safe_fallback_until_human_approval",
      "prefer_high_success_low_latency_candidates",
    ],
    auto_apply_router_changes: false,
  };
}
