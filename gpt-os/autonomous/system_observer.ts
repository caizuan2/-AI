export interface SystemObserverInput {
  ragQualityScore: number;
  fallbackRate: number;
  modelStabilityScore?: number;
  agentSuccessRate?: number;
  userSatisfactionScore?: number;
}

export interface SystemObservation {
  system_health_score: number;
  stability_index: number;
  improvement_pressure: number;
  autonomy_recommendation: "only_suggest" | "observe" | "allow_controlled_execution";
  observed_metrics: {
    rag_quality_score: number;
    fallback_rate: number;
    model_stability_score: number;
    agent_success_rate: number;
    user_satisfaction_score: number;
  };
}

export function observeAutonomousSystem(input: SystemObserverInput): SystemObservation {
  const ragQualityScore = clampScore(input.ragQualityScore);
  const fallbackRate = clamp01(input.fallbackRate);
  const modelStabilityScore = clampScore(input.modelStabilityScore ?? (100 - fallbackRate * 100));
  const agentSuccessRate = clampScore(input.agentSuccessRate ?? 100);
  const userSatisfactionScore = clampScore(input.userSatisfactionScore ?? 75);
  const stabilityIndex = clampScore(
    modelStabilityScore * 0.45 +
      agentSuccessRate * 0.2 +
      userSatisfactionScore * 0.2 +
      (100 - fallbackRate * 100) * 0.15,
  );
  const systemHealthScore = clampScore(
    ragQualityScore * 0.45 +
      stabilityIndex * 0.35 +
      userSatisfactionScore * 0.2,
  );

  return {
    system_health_score: systemHealthScore,
    stability_index: stabilityIndex,
    improvement_pressure: clampScore(100 - systemHealthScore),
    autonomy_recommendation: recommendAutonomyMode(systemHealthScore),
    observed_metrics: {
      rag_quality_score: ragQualityScore,
      fallback_rate: fallbackRate,
      model_stability_score: modelStabilityScore,
      agent_success_rate: agentSuccessRate,
      user_satisfaction_score: userSatisfactionScore,
    },
  };
}

function recommendAutonomyMode(systemHealthScore: number): SystemObservation["autonomy_recommendation"] {
  if (systemHealthScore < 30) {
    return "only_suggest";
  }

  if (systemHealthScore > 80) {
    return "allow_controlled_execution";
  }

  return "observe";
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}
