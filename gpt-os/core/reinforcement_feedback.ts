export interface ReinforcementFeedbackInput {
  model_used: string;
  success: boolean;
  user_satisfaction: number;
  latency: number;
  rag_score: number;
  fallback_triggered?: boolean;
}

export interface RewardSignal {
  model: string;
  reward: number;
  penalty: number;
  net_delta: number;
  quality_signal: number;
  latency_signal: number;
  rag_signal: number;
  reason: string;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function roundDelta(value: number) {
  return Math.round(value * 1000) / 1000;
}

function latencySignal(latency: number) {
  return clamp01(1 - Math.max(0, latency) / 8000);
}

export function calculateRewardSignal(input: ReinforcementFeedbackInput): RewardSignal {
  const qualitySignal = clamp01(input.user_satisfaction);
  const latencyScore = latencySignal(input.latency);
  const ragSignal = clamp01(input.rag_score);
  const successReward = input.success ? 0.08 : 0;
  const qualityReward = qualitySignal * 0.05;
  const ragReward = ragSignal * 0.04;
  const latencyReward = latencyScore * 0.03;
  const fallbackPenalty = input.fallback_triggered ? 0.05 : 0;
  const failurePenalty = input.success ? 0 : 0.12;
  const penalty = fallbackPenalty + failurePenalty;
  const reward = successReward + qualityReward + ragReward + latencyReward;

  return {
    model: input.model_used,
    reward: roundDelta(reward),
    penalty: roundDelta(penalty),
    net_delta: roundDelta(reward - penalty),
    quality_signal: roundDelta(qualitySignal),
    latency_signal: roundDelta(latencyScore),
    rag_signal: roundDelta(ragSignal),
    reason: input.success ? "model_success_reward" : "model_failure_penalty",
  };
}

export function applyRewardSignal(currentWeight: number, signal: RewardSignal): number {
  return clamp01(currentWeight + signal.net_delta);
}
