export interface SystemOptimizerInput {
  performance_metrics?: Record<string, number>;
  latency?: number;
  failure_rate?: number;
  rag_quality?: number;
  model_efficiency?: number;
}

export interface SystemOptimizationPlan {
  optimization_plan: string[];
  performance_improvements: string[];
  architecture_adjustments: string[];
  risk_assessment: {
    risk_level: "low" | "medium" | "high";
    reasons: string[];
  };
  auto_execute: false;
}

function clamp01(value: number | undefined, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, value));
}

export function optimizeGptOsSystem(input: SystemOptimizerInput = {}): SystemOptimizationPlan {
  const latency = Math.max(0, input.latency ?? input.performance_metrics?.latency ?? 2800);
  const failureRate = clamp01(input.failure_rate ?? input.performance_metrics?.failure_rate, 0.08);
  const ragQuality = clamp01(input.rag_quality ?? input.performance_metrics?.rag_quality, 0.72);
  const modelEfficiency = clamp01(input.model_efficiency ?? input.performance_metrics?.model_efficiency, 0.76);
  const optimizationPlan: string[] = [];
  const performanceImprovements: string[] = [];
  const architectureAdjustments: string[] = [];
  const riskReasons: string[] = [];

  if (latency > 4500) {
    optimizationPlan.push("simulate_fast_path_routing_for_high_latency_requests");
    performanceImprovements.push("reduce_model_wait_time_with_flash_first_candidate");
    riskReasons.push("latency_above_target");
  }

  if (failureRate > 0.15) {
    optimizationPlan.push("review_provider_fallback_health_and_retry_budget");
    architectureAdjustments.push("add_provider_failure_budget_guard_design");
    riskReasons.push("failure_rate_above_safe_band");
  }

  if (ragQuality < 0.55) {
    optimizationPlan.push("propose_rag_query_expansion_and_grounding_validator");
    architectureAdjustments.push("add_rag_quality_gate_before_final_answer_design");
    riskReasons.push("rag_quality_low");
  }

  if (modelEfficiency < 0.6) {
    optimizationPlan.push("rebalance_model_router_weights_in_simulation");
    performanceImprovements.push("prefer_high_success_low_latency_model_chain");
    riskReasons.push("model_efficiency_low");
  }

  if (optimizationPlan.length === 0) {
    optimizationPlan.push("keep_current_system_observed");
    performanceImprovements.push("continue_collecting_feedback_metrics");
    architectureAdjustments.push("no_architecture_adjustment_required");
  }

  return {
    optimization_plan: optimizationPlan,
    performance_improvements: performanceImprovements,
    architecture_adjustments: architectureAdjustments,
    risk_assessment: {
      risk_level: riskReasons.length >= 3 ? "high" : riskReasons.length > 0 ? "medium" : "low",
      reasons: riskReasons.length > 0 ? riskReasons : ["no_critical_risk_detected"],
    },
    auto_execute: false,
  };
}
