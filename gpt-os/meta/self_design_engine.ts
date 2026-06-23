import {
  generateSystemArchitectureBlueprint,
  type GptOsArchitectureBlueprint,
  type SystemArchitectureGeneratorInput,
} from "./system_architecture_generator";

export interface GptOsSelfDesignResult {
  blueprint: GptOsArchitectureBlueprint;
  new_rag_design: string[];
  new_agent_design: string[];
  new_router_design: string[];
  new_repair_design: string[];
  new_evolution_rules: string[];
  is_design_only: true;
  apply_allowed: false;
}

export function designGptOsSystem(input: SystemArchitectureGeneratorInput = {}): GptOsSelfDesignResult {
  const blueprint = generateSystemArchitectureBlueprint(input);

  return {
    blueprint,
    new_rag_design: [
      "query_intent_classifier",
      ...blueprint.rag_architecture,
      "citation_consistency_guard",
    ],
    new_agent_design: [
      "task_intent_gate",
      ...blueprint.agent_architecture,
      "manual_approval_terminal_state",
    ],
    new_router_design: [
      ...blueprint.model_routing_architecture,
      "meta_router_candidate_graph",
      "safe_fallback_preservation_rule",
    ],
    new_repair_design: [
      "low_grounding_patch_proposal",
      "pending_review_repair_queue",
      "rollback_plan_required",
    ],
    new_evolution_rules: [
      "observe_before_propose",
      "proposal_before_patch",
      "human_review_before_apply",
      "never_mutate_production_without_approval",
    ],
    is_design_only: true,
    apply_allowed: false,
  };
}
