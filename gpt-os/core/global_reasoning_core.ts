export interface GlobalReasoningCoreInput {
  reasoning_depth: number;
  system_efficiency: number;
  adaptive_success_rate: number;
  cost_performance: number;
  rag_alignment: number;
}

export interface GlobalReasoningScore {
  reasoning_depth_score: number;
  system_efficiency_score: number;
  adaptive_success_rate: number;
  cost_performance_index: number;
  rag_alignment_score: number;
  global_reasoning_score: number;
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

export function scoreGlobalReasoning(input: GlobalReasoningCoreInput): GlobalReasoningScore {
  const reasoningDepthScore = clamp01(input.reasoning_depth);
  const systemEfficiencyScore = clamp01(input.system_efficiency);
  const adaptiveSuccessRate = clamp01(input.adaptive_success_rate);
  const costPerformanceIndex = clamp01(input.cost_performance);
  const ragAlignmentScore = clamp01(input.rag_alignment);
  const globalReasoningScore = (
    (reasoningDepthScore * 0.28)
      + (systemEfficiencyScore * 0.22)
      + (adaptiveSuccessRate * 0.22)
      + (costPerformanceIndex * 0.14)
      + (ragAlignmentScore * 0.14)
  );

  return {
    reasoning_depth_score: roundScore(reasoningDepthScore),
    system_efficiency_score: roundScore(systemEfficiencyScore),
    adaptive_success_rate: roundScore(adaptiveSuccessRate),
    cost_performance_index: roundScore(costPerformanceIndex),
    rag_alignment_score: roundScore(ragAlignmentScore),
    global_reasoning_score: roundScore(globalReasoningScore),
  };
}
