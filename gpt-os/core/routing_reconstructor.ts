import { type AutonomousStrategyParadigm } from "./autonomous_strategy_generator";

export interface RoutingGraphNode {
  id: string;
  model: string;
  role: string;
  priority: number;
}

export interface RoutingGraphEdge {
  from: string;
  to: string;
  condition: string;
}

export interface RoutingReconstructionInput {
  paradigm: AutonomousStrategyParadigm;
  current_chain: string[];
  model_weights: Record<string, number>;
}

export interface RoutingReconstructionResult {
  routing_graph: {
    nodes: RoutingGraphNode[];
    edges: RoutingGraphEdge[];
  };
  best_path: string[];
  model_priority_shift: Record<string, number>;
  routing_graph_changed: boolean;
  replacement_mode: "proposal_only";
}

function uniqueModels(models: string[]) {
  return models.filter((model, index, chain) => model && chain.indexOf(model) === index);
}

export function reconstructRoutingGraph(input: RoutingReconstructionInput): RoutingReconstructionResult {
  const allocationModels = Object.values(input.paradigm.model_allocation_strategy);
  const bestPath = uniqueModels([...allocationModels, ...input.current_chain]);
  const nodes = bestPath.map((model, index) => ({
    id: `node_${index + 1}_${model.replace(/[^a-z0-9]+/gi, "_")}`,
    model,
    role: index === 0 ? "primary" : index === 1 ? "verifier" : "fallback",
    priority: index + 1,
  }));
  const edges = nodes.slice(0, -1).map((node, index) => ({
    from: node.id,
    to: nodes[index + 1].id,
    condition: index === 0 ? "confidence_or_grounding_below_threshold" : "provider_or_quality_guard_failed",
  }));
  const modelPriorityShift: Record<string, number> = {};

  for (let index = 0; index < bestPath.length; index += 1) {
    const model = bestPath[index];
    const currentIndex = input.current_chain.indexOf(model);
    const previousPriority = currentIndex === -1 ? bestPath.length + 1 : currentIndex + 1;

    modelPriorityShift[model] = previousPriority - (index + 1);
  }

  return {
    routing_graph: {
      nodes,
      edges,
    },
    best_path: bestPath,
    model_priority_shift: modelPriorityShift,
    routing_graph_changed: bestPath.join(">") !== input.current_chain.join(">"),
    replacement_mode: "proposal_only",
  };
}
