import { type GlobalReasoningScore } from "./global_reasoning_core";

export interface AutonomousStrategyGeneratorInput {
  historical_model_performance: Record<string, number>;
  rag_efficiency: number;
  user_feedback: number;
  cost_latency_metrics: {
    avg_latency: number;
    cost_efficiency: number;
  };
  global_reasoning: GlobalReasoningScore;
}

export interface AutonomousStrategyParadigm {
  new_paradigm_name: string;
  routing_philosophy: string;
  model_allocation_strategy: Record<string, string>;
  expected_gain: number;
  decision_mode: "proposal_only";
  new_paradigm_generated: boolean;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function roundScore(value: number) {
  return Math.round(clamp01(value) * 1000) / 1000;
}

export function generateAutonomousStrategyParadigm(
  input: AutonomousStrategyGeneratorInput,
): AutonomousStrategyParadigm {
  const ragEfficiency = clamp01(input.rag_efficiency);
  const userFeedback = clamp01(input.user_feedback);
  const costEfficiency = clamp01(input.cost_latency_metrics.cost_efficiency);
  const latencyPressure = clamp01(input.cost_latency_metrics.avg_latency / 8000);
  const reasoningScore = input.global_reasoning.global_reasoning_score;
  const expectedGain = roundScore(
    ((1 - ragEfficiency) * 0.24)
      + ((1 - userFeedback) * 0.2)
      + ((1 - costEfficiency) * 0.18)
      + (latencyPressure * 0.18)
      + ((1 - reasoningScore) * 0.2)
  );

  if (ragEfficiency < 0.35 || reasoningScore < 0.55) {
    return {
      new_paradigm_name: "autonomous_recovery_reasoning_paradigm",
      routing_philosophy: "recover weak retrieval by starting with deep reasoning, then use grounded verification before fallback",
      model_allocation_strategy: {
        primary_reasoner: "deepseek-v4-pro",
        grounding_verifier: "qwen",
        safety_fallback: "glm-5.2",
      },
      expected_gain: expectedGain,
      decision_mode: "proposal_only",
      new_paradigm_generated: true,
    };
  }

  if (costEfficiency < 0.5 || latencyPressure > 0.55) {
    return {
      new_paradigm_name: "autonomous_fast_economy_paradigm",
      routing_philosophy: "prioritize fast low-cost candidates, escalate only when confidence or quality gates fail",
      model_allocation_strategy: {
        primary_fast_path: "deepseek-v4-flash",
        grounded_answer: "qwen",
        quality_escalation: "deepseek-v4-pro",
      },
      expected_gain: expectedGain,
      decision_mode: "proposal_only",
      new_paradigm_generated: true,
    };
  }

  return {
    new_paradigm_name: "autonomous_balanced_rag_paradigm",
    routing_philosophy: "use grounded RAG-first answers, keep reasoning escalation available for ambiguity and low confidence",
    model_allocation_strategy: {
      grounded_answer: "qwen",
      speed_guard: "deepseek-v4-flash",
      reasoning_escalation: "deepseek-v4-pro",
    },
    expected_gain: expectedGain,
    decision_mode: "proposal_only",
    new_paradigm_generated: expectedGain > 0.08,
  };
}
