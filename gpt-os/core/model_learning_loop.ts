import { optimizeModelReward, optimizeRewardBatch, type ModelEvolutionFeedback } from "./reward_optimizer";

export interface LearningModelPerformanceRecord {
  model: string;
  success_rate: number;
  avg_latency: number;
  user_satisfaction: number;
  rag_match_score: number;
  fallback_count: number;
  cost_score: number;
}

export type LearningModelPerformanceStore = Record<string, LearningModelPerformanceRecord>;

export interface ModelLearningEvent {
  model: string;
  reward_score: number;
  weight_delta: number;
  success: boolean;
  rag_score: number;
  latency: number;
}

export interface ModelLearningAnalytics {
  event_count: number;
  average_reward: number;
  best_model: string | null;
  weakest_model: string | null;
}

export interface ModelLearningLoopInput {
  store: LearningModelPerformanceStore;
  feedback_events?: ModelEvolutionFeedback[];
  request_feedback?: ModelEvolutionFeedback | null;
  maxWeightDelta?: number;
}

export interface ModelLearningLoopResult {
  updated_store: LearningModelPerformanceStore;
  model_weight_deltas: Record<string, number>;
  fallback_chain_hint: string[];
  learning_events: ModelLearningEvent[];
  analytics: ModelLearningAnalytics;
}

export function runModelLearningLoop(input: ModelLearningLoopInput): ModelLearningLoopResult {
  const feedbackEvents = [
    ...(input.feedback_events ?? []),
    ...(input.request_feedback ? [input.request_feedback] : []),
  ];
  const updatedStore = cloneStore(input.store);
  const learningEvents = feedbackEvents
    .filter((event) => event.model_used && updatedStore[event.model_used])
    .map((event) => {
      const reward = optimizeModelReward(event);
      updatedStore[event.model_used] = updatePerformanceRecord(updatedStore[event.model_used], event, reward.reward_score);

      return {
        model: event.model_used,
        reward_score: reward.reward_score,
        weight_delta: clampDelta(reward.weight_delta, input.maxWeightDelta ?? 0.08),
        success: event.success,
        rag_score: reward.rag_score,
        latency: event.latency,
      };
    });
  const batch = optimizeRewardBatch(feedbackEvents);
  const modelWeightDeltas = buildWeightDeltas(updatedStore, batch, input.maxWeightDelta ?? 0.08);

  return {
    updated_store: updatedStore,
    model_weight_deltas: modelWeightDeltas,
    fallback_chain_hint: buildFallbackChainHint(updatedStore),
    learning_events: learningEvents,
    analytics: {
      event_count: learningEvents.length,
      average_reward: round(average(learningEvents.map((event) => event.reward_score), 0)),
      best_model: getBestModel(updatedStore),
      weakest_model: getWeakestModel(updatedStore),
    },
  };
}

function updatePerformanceRecord(
  record: LearningModelPerformanceRecord,
  feedback: ModelEvolutionFeedback,
  rewardScore: number,
): LearningModelPerformanceRecord {
  const successValue = feedback.success ? 1 : 0;

  return {
    ...record,
    success_rate: ema(record.success_rate, successValue, 0.22),
    avg_latency: ema(record.avg_latency, Math.max(0, feedback.latency), 0.18),
    user_satisfaction: ema(record.user_satisfaction, normalizeFeedback(feedback.user_feedback), 0.22),
    rag_match_score: ema(record.rag_match_score, clamp01(feedback.rag_score), 0.24),
    fallback_count: Math.max(0, record.fallback_count + (feedback.fallback_used ? 1 : -0.2)),
    cost_score: ema(record.cost_score, normalizeCost(feedback.cost), 0.16),
    model: record.model,
  };
}

function buildWeightDeltas(
  store: LearningModelPerformanceStore,
  batch: ReturnType<typeof optimizeRewardBatch>,
  maxWeightDelta: number,
): Record<string, number> {
  const deltas: Record<string, number> = {};

  for (const model of Object.keys(store)) {
    deltas[model] = 0;
  }

  for (const item of batch) {
    deltas[item.model_used] = clampDelta(item.total_weight_delta, maxWeightDelta);
  }

  return deltas;
}

function buildFallbackChainHint(store: LearningModelPerformanceStore): string[] {
  return Object.values(store)
    .sort((left, right) => modelScore(right) - modelScore(left))
    .map((record) => record.model);
}

function modelScore(record: LearningModelPerformanceRecord): number {
  const latencyScore = normalizeLatency(record.avg_latency);

  return round(
    record.success_rate * 0.34
      + record.user_satisfaction * 0.24
      + record.rag_match_score * 0.2
      + latencyScore * 0.12
      + record.cost_score * 0.1
      - Math.min(record.fallback_count, 5) * 0.015,
  );
}

function getBestModel(store: LearningModelPerformanceStore): string | null {
  return buildFallbackChainHint(store)[0] ?? null;
}

function getWeakestModel(store: LearningModelPerformanceStore): string | null {
  const chain = buildFallbackChainHint(store);
  return chain[chain.length - 1] ?? null;
}

function cloneStore(store: LearningModelPerformanceStore): LearningModelPerformanceStore {
  return Object.fromEntries(
    Object.entries(store).map(([model, record]) => [model, { ...record }]),
  );
}

function ema(current: number, next: number, alpha: number): number {
  return round(current * (1 - alpha) + next * alpha);
}

function normalizeFeedback(feedback: ModelEvolutionFeedback["user_feedback"]): number {
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

function clampDelta(value: number, maxWeightDelta: number): number {
  const max = Math.abs(maxWeightDelta);
  return round(Math.max(-max, Math.min(max, value)));
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
