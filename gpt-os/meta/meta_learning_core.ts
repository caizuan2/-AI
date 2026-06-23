import { designGptOsSystem, type GptOsSelfDesignResult } from "./self_design_engine";

export interface MetaLearningInput {
  rag_hit_rate?: number;
  fallback_rate?: number;
  answer_grounding_score?: number;
  user_satisfaction?: number;
  agent_task_rate?: number;
  memory_pressure?: number;
}

export interface MetaLearningReport {
  bottleneck_analysis: string[];
  architecture_recommendations: string[];
  new_system_designs: GptOsSelfDesignResult[];
  meta_learning_mode: "analysis_only";
}

function valueOr(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function analyzeGptOsMetaLearning(input: MetaLearningInput = {}): MetaLearningReport {
  const ragHitRate = valueOr(input.rag_hit_rate, 0.72);
  const fallbackRate = valueOr(input.fallback_rate, 0.08);
  const groundingScore = valueOr(input.answer_grounding_score, 0.74);
  const userSatisfaction = valueOr(input.user_satisfaction, 0.78);
  const bottlenecks: string[] = [];

  if (ragHitRate < 0.5) {
    bottlenecks.push("rag_hit_rate_low");
  }

  if (fallbackRate > 0.18) {
    bottlenecks.push("fallback_rate_high");
  }

  if (groundingScore < 0.6) {
    bottlenecks.push("answer_grounding_weak");
  }

  if (userSatisfaction < 0.65) {
    bottlenecks.push("user_satisfaction_low");
  }

  if (bottlenecks.length === 0) {
    bottlenecks.push("no_critical_bottleneck_detected");
  }

  return {
    bottleneck_analysis: bottlenecks,
    architecture_recommendations: [
      ragHitRate < 0.5 ? "add_adaptive_query_expansion_design" : "keep_rag_grounding_design",
      fallbackRate > 0.18 ? "review_provider_fallback_policy_design" : "keep_fallback_policy_observed",
      groundingScore < 0.6 ? "add_grounding_validator_design" : "keep_answer_grounding_monitoring",
      "preserve_human_approval_boundary",
    ],
    new_system_designs: [
      designGptOsSystem({
        current_router_version: "model_router_v6",
        rag_hit_rate: ragHitRate,
        agent_task_rate: valueOr(input.agent_task_rate, 0.12),
        memory_pressure: valueOr(input.memory_pressure, 0.36),
        feedback_quality: userSatisfaction,
      }),
    ],
    meta_learning_mode: "analysis_only",
  };
}
