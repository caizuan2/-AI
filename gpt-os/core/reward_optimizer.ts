export type ModelUserFeedback = "like" | "dislike" | "neutral" | number | null | undefined;

export interface ModelEvolutionFeedback {
  model_used: string;
  latency: number;
  cost: number;
  success: boolean;
  user_feedback?: ModelUserFeedback;
  rag_score: number;
  fallback_used?: boolean;
}

export interface ModelRewardOptimizationResult {
  model_used: string;
  reward_score: number;
  latency_score: number;
  cost_score: number;
  success_score: number;
  feedback_score: number;
  rag_score: number;
  fallback_penalty: number;
  weight_delta: number;
}

export interface ModelRewardBatchResult {
  model_used: string;
  event_count: number;
  average_reward: number;
  average_latency_score: number;
  average_cost_score: number;
  average_rag_score: number;
  total_weight_delta: number;
}

export function normalizeUserFeedback(feedback: ModelUserFeedback): number {
  if (typeof feedback === "number") {
    return clamp01(feedback);
  }

  if (feedback === "like") {
    return 1;
  }

  if (feedback === "dislike") {
    return 0;
  }

  return 0.55;
}

export function optimizeModelReward(input: ModelEvolutionFeedback): ModelRewardOptimizationResult {
  const latencyScore = normalizeLatency(input.latency);
  const costScore = normalizeCost(input.cost);
  const successScore = input.success ? 1 : 0.18;
  const feedbackScore = normalizeUserFeedback(input.user_feedback);
  const ragScore = clamp01(input.rag_score);
  const fallbackPenalty = input.fallback_used ? 0.08 : 0;
  const rewardScore = clamp01(
    successScore * 0.34
      + ragScore * 0.24
      + feedbackScore * 0.2
      + latencyScore * 0.12
      + costScore * 0.1
      - fallbackPenalty,
  );

  return {
    model_used: input.model_used,
    reward_score: round(rewardScore),
    latency_score: round(latencyScore),
    cost_score: round(costScore),
    success_score: round(successScore),
    feedback_score: round(feedbackScore),
    rag_score: round(ragScore),
    fallback_penalty: round(fallbackPenalty),
    weight_delta: round((rewardScore - 0.62) * 0.12),
  };
}

export function optimizeRewardBatch(events: ModelEvolutionFeedback[] = []): ModelRewardBatchResult[] {
  const grouped = new Map<string, ModelRewardOptimizationResult[]>();

  for (const event of events) {
    if (!event.model_used) {
      continue;
    }

    const result = optimizeModelReward(event);
    const list = grouped.get(result.model_used) ?? [];
    list.push(result);
    grouped.set(result.model_used, list);
  }

  return Array.from(grouped.entries()).map(([model, results]) => ({
    model_used: model,
    event_count: results.length,
    average_reward: round(average(results.map((item) => item.reward_score), 0)),
    average_latency_score: round(average(results.map((item) => item.latency_score), 0)),
    average_cost_score: round(average(results.map((item) => item.cost_score), 0)),
    average_rag_score: round(average(results.map((item) => item.rag_score), 0)),
    total_weight_delta: round(results.reduce((sum, item) => sum + item.weight_delta, 0)),
  }));
}

function normalizeLatency(latency: number): number {
  if (!Number.isFinite(latency) || latency <= 0) {
    return 0.55;
  }

  return clamp01(1 - Math.min(latency, 8000) / 8000);
}

function normalizeCost(cost: number): number {
  if (!Number.isFinite(cost)) {
    return 0.55;
  }

  return clamp01(1 - cost);
}

function average(values: number[], fallback: number): number {
  const safeValues = values.filter((value) => Number.isFinite(value));

  if (safeValues.length === 0) {
    return fallback;
  }

  return safeValues.reduce((sum, value) => sum + value, 0) / safeValues.length;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
