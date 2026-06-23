export interface StrategyEvolutionRecord {
  strategy_name: string;
  performance: number;
  success_rate: number;
  similarity_group?: string;
}

export interface StrategyEvolverInput {
  active_strategies: StrategyEvolutionRecord[];
  invented_strategy_name: string;
  invented_expected_improvement: number;
}

export interface StrategyEvolverResult {
  promoted_strategies: string[];
  deprecated_strategies: string[];
  merged_strategies: Array<{ target: string; merged: string[] }>;
  evolved_strategy_pool: string[];
  strategy_deprecated: boolean;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

export function evolveStrategyPool(input: StrategyEvolverInput): StrategyEvolverResult {
  const promotedStrategies = input.active_strategies
    .filter((strategy) => clamp01(strategy.success_rate) > 0.86 && clamp01(strategy.performance) > 0.78)
    .map((strategy) => strategy.strategy_name);
  const deprecatedStrategies = input.active_strategies
    .filter((strategy) => clamp01(strategy.performance) < 0.38)
    .map((strategy) => strategy.strategy_name);
  const groups = new Map<string, string[]>();

  for (const strategy of input.active_strategies) {
    if (!strategy.similarity_group) {
      continue;
    }

    groups.set(strategy.similarity_group, [
      ...(groups.get(strategy.similarity_group) ?? []),
      strategy.strategy_name,
    ]);
  }

  const mergedStrategies = Array.from(groups.entries())
    .filter(([, strategies]) => strategies.length > 1)
    .map(([target, strategies]) => ({
      target,
      merged: strategies,
    }));
  const evolvedStrategyPool = [
    ...input.active_strategies
      .map((strategy) => strategy.strategy_name)
      .filter((strategy) => !deprecatedStrategies.includes(strategy)),
    ...(input.invented_expected_improvement > 0.1 ? [input.invented_strategy_name] : []),
  ].filter((strategy, index, pool) => pool.indexOf(strategy) === index);

  return {
    promoted_strategies: promotedStrategies,
    deprecated_strategies: deprecatedStrategies,
    merged_strategies: mergedStrategies,
    evolved_strategy_pool: evolvedStrategyPool,
    strategy_deprecated: deprecatedStrategies.length > 0,
  };
}
