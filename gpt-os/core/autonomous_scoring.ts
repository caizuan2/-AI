export interface AutonomousScoringInput {
  reasoning_quality: number;
  rag_alignment: number;
  cost_efficiency: number;
  latency: number;
  user_feedback: number;
}

export interface AutonomousScore {
  reasoning_quality: number;
  rag_alignment: number;
  cost_efficiency: number;
  latency_score: number;
  user_feedback: number;
  autonomy_score: number;
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

export function calculateAutonomyScore(input: AutonomousScoringInput): AutonomousScore {
  const reasoningQuality = clamp01(input.reasoning_quality);
  const ragAlignment = clamp01(input.rag_alignment);
  const costEfficiency = clamp01(input.cost_efficiency);
  const latencyScore = clamp01(1 - (Math.max(0, input.latency) / 8000));
  const userFeedback = clamp01(input.user_feedback);
  const autonomyScore = (
    (reasoningQuality * 0.28)
      + (ragAlignment * 0.28)
      + (costEfficiency * 0.16)
      + (latencyScore * 0.14)
      + (userFeedback * 0.14)
  );

  return {
    reasoning_quality: roundScore(reasoningQuality),
    rag_alignment: roundScore(ragAlignment),
    cost_efficiency: roundScore(costEfficiency),
    latency_score: roundScore(latencyScore),
    user_feedback: roundScore(userFeedback),
    autonomy_score: roundScore(autonomyScore),
  };
}
