export interface ModelAbTestCandidate {
  model: string;
  response_quality: number;
  latency: number;
  user_feedback_simulation: number;
  rag_alignment_score: number;
}

export interface ModelAbTestResult {
  ab_test_engine: "deterministic_shadow_ab_test";
  compared_models: string[];
  winner_model: string;
  metrics: Record<string, Omit<ModelAbTestCandidate, "model"> & { combined_score: number }>;
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

function latencyScore(latency: number) {
  return clamp01(1 - Math.max(0, latency) / 8000);
}

function combinedScore(candidate: ModelAbTestCandidate) {
  return roundScore(
    candidate.response_quality * 0.35
      + latencyScore(candidate.latency) * 0.2
      + candidate.user_feedback_simulation * 0.25
      + candidate.rag_alignment_score * 0.2
  );
}

export function runModelAbTest(candidates: ModelAbTestCandidate[]): ModelAbTestResult {
  const normalizedCandidates = candidates.length > 0
    ? candidates
    : [{
        model: "deepseek-v4-pro",
        response_quality: 0.8,
        latency: 4000,
        user_feedback_simulation: 0.75,
        rag_alignment_score: 0.78,
      }];
  const metrics: ModelAbTestResult["metrics"] = {};
  let winnerModel = normalizedCandidates[0]?.model ?? "deepseek-v4-pro";
  let winnerScore = -1;

  for (const candidate of normalizedCandidates) {
    const score = combinedScore(candidate);
    metrics[candidate.model] = {
      response_quality: roundScore(candidate.response_quality),
      latency: Math.max(0, Math.round(candidate.latency)),
      user_feedback_simulation: roundScore(candidate.user_feedback_simulation),
      rag_alignment_score: roundScore(candidate.rag_alignment_score),
      combined_score: score,
    };

    if (score > winnerScore) {
      winnerModel = candidate.model;
      winnerScore = score;
    }
  }

  return {
    ab_test_engine: "deterministic_shadow_ab_test",
    compared_models: normalizedCandidates.map((candidate) => candidate.model),
    winner_model: winnerModel,
    metrics,
  };
}
