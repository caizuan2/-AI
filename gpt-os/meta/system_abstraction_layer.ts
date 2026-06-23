export interface GptOsSystemAbstractionInput {
  ragEnabled?: boolean;
  agentEnabled?: boolean;
  memoryEnabled?: boolean;
  modelRouterVersion?: string;
  feedbackLoopEnabled?: boolean;
}

export interface GptOsSystemAbstraction {
  cognition_layer: string[];
  execution_layer: string[];
  memory_layer: string[];
  evolution_layer: string[];
  routing_layer: string[];
  abstraction_mode: "design_only";
}

export function createSystemAbstraction(input: GptOsSystemAbstractionInput = {}): GptOsSystemAbstraction {
  return {
    cognition_layer: [
      input.ragEnabled === false ? "rag_pipeline_disabled_reference" : "rag_grounding_pipeline",
      "answer_quality_evaluator",
      "global_reasoning_core",
    ],
    execution_layer: [
      input.agentEnabled ? "agent_runtime_reference" : "agent_runtime_disabled_reference",
      "tool_execution_contract",
      "human_approval_boundary",
    ],
    memory_layer: [
      input.memoryEnabled === false ? "ephemeral_session_context" : "session_memory_reference",
      "feedback_meta_memory",
      "trace_memory",
    ],
    evolution_layer: [
      input.feedbackLoopEnabled === false ? "passive_observation" : "knowledge_feedback_loop",
      "repair_patch_proposal",
      "autonomous_strategy_proposal",
    ],
    routing_layer: [
      input.modelRouterVersion ?? "model_router_v6",
      "routing_graph_proposal",
      "fallback_chain_safety_guard",
    ],
    abstraction_mode: "design_only",
  };
}
