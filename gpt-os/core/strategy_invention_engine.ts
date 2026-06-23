export type StrategyRiskLevel = "low" | "medium" | "high";

export interface StrategyInventionInput {
  model_history?: Array<{
    model?: string;
    success_rate?: number;
    avg_latency?: number;
    user_satisfaction?: number;
    rag_match_score?: number;
    cost_score?: number;
  }>;
  rag_performance: number;
  user_feedback: number;
  latency: number;
  cost: number;
}

export interface StrategyInventionResult {
  new_strategy_name: string;
  strategy_logic: string;
  expected_improvement: number;
  risk_level: StrategyRiskLevel;
  new_strategy_created: boolean;
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

function roundScore(value: number) {
  return Math.round(clamp01(value) * 1000) / 1000;
}

export function inventModelStrategy(input: StrategyInventionInput): StrategyInventionResult {
  const history = input.model_history ?? [];
  const avgSuccess = average(history.map((item) => item.success_rate ?? Number.NaN), 0.86);
  const ragPerformance = clamp01(input.rag_performance);
  const userFeedback = clamp01(input.user_feedback);
  const cost = clamp01(input.cost);
  const latencyPressure = clamp01(input.latency / 8000);
  const expectedImprovement = roundScore(
    ((1 - avgSuccess) * 0.3)
      + ((1 - ragPerformance) * 0.25)
      + ((1 - userFeedback) * 0.2)
      + (latencyPressure * 0.15)
      + ((1 - cost) * 0.1)
  );

  if (ragPerformance < 0.35 && userFeedback < 0.65) {
    return {
      new_strategy_name: "invented_recovery_reasoning_chain",
      strategy_logic: "start_with_deepseek_pro_then_verify_with_qwen_and_keep_glm_as_safe_fallback",
      expected_improvement: expectedImprovement,
      risk_level: "medium",
      new_strategy_created: true,
    };
  }

  if (latencyPressure > 0.55 || cost < 0.5) {
    return {
      new_strategy_name: "invented_fast_cost_guard_chain",
      strategy_logic: "start_with_deepseek_flash_then_qwen_then_deepseek_pro_only_when_quality_gate_requires_it",
      expected_improvement: expectedImprovement,
      risk_level: "low",
      new_strategy_created: true,
    };
  }

  if (ragPerformance > 0.72 && userFeedback >= 0.72) {
    return {
      new_strategy_name: "invented_rag_first_verifier_chain",
      strategy_logic: "use_qwen_for_rag_grounded_answer_then_escalate_to_deepseek_pro_for_reasoning_gaps",
      expected_improvement: expectedImprovement,
      risk_level: "low",
      new_strategy_created: true,
    };
  }

  return {
    new_strategy_name: "invented_balanced_guard_chain",
    strategy_logic: "keep_balanced_qwen_first_route_with_deepseek_flash_speed_guard_and_deepseek_pro_quality_guard",
    expected_improvement: expectedImprovement,
    risk_level: "low",
    new_strategy_created: expectedImprovement > 0.12,
  };
}
