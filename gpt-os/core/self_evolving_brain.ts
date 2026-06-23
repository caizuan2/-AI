import { type AutonomousStrategyParadigm } from "./autonomous_strategy_generator";
import { type GlobalReasoningScore } from "./global_reasoning_core";
import { type RoutingReconstructionResult } from "./routing_reconstructor";

export interface SelfEvolvingBrainInput {
  paradigm: AutonomousStrategyParadigm;
  routing_graph: RoutingReconstructionResult;
  global_reasoning: GlobalReasoningScore;
}

export interface SelfEvolvingBrainDecision {
  is_fully_autonomous: boolean;
  decision_mode: "proposal_only" | "observe" | "review_required";
  proposed_routing_philosophy: string;
  proposed_decision_tree: string[];
  safe_to_apply: false;
  recommendation: "observe" | "review_new_paradigm" | "review_routing_graph";
}

export function runSelfEvolvingBrain(input: SelfEvolvingBrainInput): SelfEvolvingBrainDecision {
  if (input.routing_graph.routing_graph_changed || input.paradigm.expected_gain > 0.16) {
    return {
      is_fully_autonomous: false,
      decision_mode: "review_required",
      proposed_routing_philosophy: input.paradigm.routing_philosophy,
      proposed_decision_tree: input.routing_graph.best_path,
      safe_to_apply: false,
      recommendation: input.routing_graph.routing_graph_changed ? "review_routing_graph" : "review_new_paradigm",
    };
  }

  if (input.global_reasoning.global_reasoning_score < 0.55) {
    return {
      is_fully_autonomous: false,
      decision_mode: "proposal_only",
      proposed_routing_philosophy: input.paradigm.routing_philosophy,
      proposed_decision_tree: input.routing_graph.best_path,
      safe_to_apply: false,
      recommendation: "review_new_paradigm",
    };
  }

  return {
    is_fully_autonomous: false,
    decision_mode: "observe",
    proposed_routing_philosophy: input.paradigm.routing_philosophy,
    proposed_decision_tree: input.routing_graph.best_path,
    safe_to_apply: false,
    recommendation: "observe",
  };
}
