export interface ModelGlobalScoreInput {
  success_rate: number;
  rag_match_score: number;
  avg_latency: number;
  cost_score: number;
  user_satisfaction: number;
  relevance_score?: number;
}

export interface ModelGlobalScore {
  accuracy_score: number;
  rag_alignment_score: number;
  latency_score: number;
  cost_score: number;
  user_feedback_score: number;
  total_score: number;
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

export function scoreModelGlobally(input: ModelGlobalScoreInput): ModelGlobalScore {
  const accuracyScore = clamp01(input.success_rate);
  const ragAlignmentScore = clamp01(
    (input.rag_match_score * 0.7)
      + ((input.relevance_score ?? input.rag_match_score) * 0.3)
  );
  const latencyScore = clamp01(1 - (Math.max(0, input.avg_latency) / 8000));
  const costScore = clamp01(input.cost_score);
  const userFeedbackScore = clamp01(input.user_satisfaction);
  const totalScore = (
    (accuracyScore * 0.32)
      + (ragAlignmentScore * 0.26)
      + (latencyScore * 0.18)
      + (costScore * 0.12)
      + (userFeedbackScore * 0.12)
  );

  return {
    accuracy_score: roundScore(accuracyScore),
    rag_alignment_score: roundScore(ragAlignmentScore),
    latency_score: roundScore(latencyScore),
    cost_score: roundScore(costScore),
    user_feedback_score: roundScore(userFeedbackScore),
    total_score: roundScore(totalScore),
  };
}
