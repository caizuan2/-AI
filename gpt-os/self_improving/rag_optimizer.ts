export interface RagOptimizerInput {
  low_hit_queries?: string[];
  hit_rate?: number;
  avg_relevance_score?: number;
  context_chars?: number;
  grounding_score?: number;
}

export interface RagOptimizationRecommendation {
  low_hit_query_analysis: string[];
  chunk_structure_suggestions: string[];
  embedding_strategy_suggestions: string[];
  knowledge_gap_candidates: string[];
  auto_modify_database: false;
}

function clamp01(value: number | undefined, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, value));
}

export function optimizeRagDesign(input: RagOptimizerInput = {}): RagOptimizationRecommendation {
  const lowHitQueries = input.low_hit_queries ?? [];
  const hitRate = clamp01(input.hit_rate, 0.72);
  const relevanceScore = clamp01(input.avg_relevance_score, 0.68);
  const groundingScore = clamp01(input.grounding_score, 0.7);
  const contextChars = Math.max(0, input.context_chars ?? 2400);

  return {
    low_hit_query_analysis: lowHitQueries.length > 0
      ? lowHitQueries.map((query) => `review_missing_or_weak_knowledge_for:${query}`)
      : [hitRate < 0.5 ? "low_hit_rate_requires_query_pattern_review" : "no_low_hit_query_sample_provided"],
    chunk_structure_suggestions: [
      relevanceScore < 0.55 ? "split_large_chunks_by_question_intent" : "keep_current_chunk_boundaries_observed",
      contextChars > 6000 ? "compress_context_window_before_generation" : "context_window_within_safe_band",
      groundingScore < 0.6 ? "add_answer_grounding_validator_before_response" : "grounding_score_observed",
    ],
    embedding_strategy_suggestions: [
      hitRate < 0.5 ? "simulate_query_expansion_before_embedding_search" : "keep_embedding_strategy_observed",
      relevanceScore < 0.5 ? "review_embedding_model_or_synonym_coverage" : "embedding_relevance_observed",
    ],
    knowledge_gap_candidates: lowHitQueries.length > 0 ? lowHitQueries : ["no_explicit_gap_candidate"],
    auto_modify_database: false,
  };
}
