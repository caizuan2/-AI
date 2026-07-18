export type ModelRoutingStrategy =
  | "high_quality_mode"
  | "low_cost_mode"
  | "balanced_mode"
  | "rag_heavy_mode"
  | "emergency_safe_mode";

export interface StrategyPool {
  auto_generated_strategies: ModelRoutingStrategy[];
  fallback_strategies: ModelRoutingStrategy[];
  emergency_strategies: ModelRoutingStrategy[];
}

export const strategy_pool: StrategyPool = {
  auto_generated_strategies: [
    "high_quality_mode",
    "low_cost_mode",
    "balanced_mode",
    "rag_heavy_mode",
  ],
  fallback_strategies: ["balanced_mode", "rag_heavy_mode"],
  emergency_strategies: ["emergency_safe_mode", "low_cost_mode"],
};

export function isKnownStrategy(strategy: string): strategy is ModelRoutingStrategy {
  return [
    ...strategy_pool.auto_generated_strategies,
    ...strategy_pool.fallback_strategies,
    ...strategy_pool.emergency_strategies,
  ].includes(strategy as ModelRoutingStrategy);
}

export function normalizeStrategy(strategy: string | undefined): ModelRoutingStrategy {
  return strategy && isKnownStrategy(strategy) ? strategy : "balanced_mode";
}
