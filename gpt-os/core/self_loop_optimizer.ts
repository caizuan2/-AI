export interface SelfLoopOptimizerInput {
  new_strategy_created: boolean;
  strategy_combined_chain: string[];
  strategy_deprecated: boolean;
  autonomy_score: number;
}

export interface SelfLoopOptimizerResult {
  feedback_loop_status: "observe" | "optimize" | "review";
  new_strategy_created: boolean;
  strategy_combined_chain: string[];
  strategy_deprecated: boolean;
  next_action: "keep_current_route" | "promote_candidate_strategy" | "review_deprecated_strategy";
}

export function optimizeSelfLoop(input: SelfLoopOptimizerInput): SelfLoopOptimizerResult {
  if (input.strategy_deprecated) {
    return {
      feedback_loop_status: "review",
      new_strategy_created: input.new_strategy_created,
      strategy_combined_chain: input.strategy_combined_chain,
      strategy_deprecated: input.strategy_deprecated,
      next_action: "review_deprecated_strategy",
    };
  }

  if (input.new_strategy_created && input.autonomy_score >= 0.62) {
    return {
      feedback_loop_status: "optimize",
      new_strategy_created: input.new_strategy_created,
      strategy_combined_chain: input.strategy_combined_chain,
      strategy_deprecated: input.strategy_deprecated,
      next_action: "promote_candidate_strategy",
    };
  }

  return {
    feedback_loop_status: "observe",
    new_strategy_created: input.new_strategy_created,
    strategy_combined_chain: input.strategy_combined_chain,
    strategy_deprecated: input.strategy_deprecated,
    next_action: "keep_current_route",
  };
}
