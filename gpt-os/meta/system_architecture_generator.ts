import { createSystemAbstraction, type GptOsSystemAbstraction } from "./system_abstraction_layer";

export interface SystemArchitectureGeneratorInput {
  current_router_version?: string;
  rag_hit_rate?: number;
  agent_task_rate?: number;
  memory_pressure?: number;
  feedback_quality?: number;
}

export interface GptOsArchitectureBlueprint {
  rag_architecture: string[];
  agent_architecture: string[];
  model_routing_architecture: string[];
  memory_architecture: string[];
  evolution_architecture: string[];
  abstraction: GptOsSystemAbstraction;
  generated_architecture: string;
  blueprint_mode: "proposal_only";
}

function clamp01(value: number | undefined, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, value));
}

export function generateSystemArchitectureBlueprint(
  input: SystemArchitectureGeneratorInput = {},
): GptOsArchitectureBlueprint {
  const ragHitRate = clamp01(input.rag_hit_rate, 0.72);
  const agentTaskRate = clamp01(input.agent_task_rate, 0.12);
  const memoryPressure = clamp01(input.memory_pressure, 0.36);
  const feedbackQuality = clamp01(input.feedback_quality, 0.68);
  const abstraction = createSystemAbstraction({
    ragEnabled: true,
    agentEnabled: agentTaskRate > 0.2,
    memoryEnabled: memoryPressure < 0.75,
    modelRouterVersion: input.current_router_version ?? "model_router_v6",
    feedbackLoopEnabled: feedbackQuality > 0.4,
  });

  return {
    rag_architecture: [
      ragHitRate < 0.45 ? "adaptive_query_expansion_stage" : "rag_grounding_stage",
      "source_confidence_scorer",
      "answer_grounding_validator",
    ],
    agent_architecture: [
      agentTaskRate > 0.2 ? "intent_task_router" : "chat_first_agent_gate",
      "tool_permission_boundary",
      "human_review_checkpoint",
    ],
    model_routing_architecture: [
      input.current_router_version ?? "model_router_v6",
      "meta_strategy_proposal_layer",
      "routing_graph_candidate_layer",
    ],
    memory_architecture: [
      memoryPressure > 0.7 ? "compressed_trace_memory" : "session_trace_memory",
      "feedback_meta_index",
      "retrieval_quality_memory",
    ],
    evolution_architecture: [
      feedbackQuality < 0.4 ? "passive_feedback_observer" : "closed_loop_feedback_analyzer",
      "repair_patch_queue_reference",
      "autonomous_decision_review_gate",
    ],
    abstraction,
    generated_architecture: "gpt_os_meta_blueprint_v7",
    blueprint_mode: "proposal_only",
  };
}
