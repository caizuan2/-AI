export interface ModelChainBuildInput {
  selected_strategy: string;
  invented_strategy_name: string;
  model_weights: Record<string, number>;
  fallback_chain_v4: string[];
  rag_alignment: number;
  cost_efficiency: number;
  quality_required: boolean;
}

export interface ModelChainBuildResult {
  chain_id: string;
  strategy_combined_chain: string[];
  chain_reasoning: string;
  is_dynamic: boolean;
}

function uniqueChain(models: string[]) {
  return models.filter((model, index, chain) => model && chain.indexOf(model) === index);
}

function sortByWeight(modelWeights: Record<string, number>) {
  return Object.keys(modelWeights).sort((left, right) => {
    const diff = (modelWeights[right] ?? 0) - (modelWeights[left] ?? 0);

    return diff === 0 ? left.localeCompare(right) : diff;
  });
}

export function buildModelChain(input: ModelChainBuildInput): ModelChainBuildResult {
  const weightedModels = sortByWeight(input.model_weights);
  let priorityChain: string[];
  let chainReasoning: string;

  if (input.invented_strategy_name.includes("fast_cost") || input.selected_strategy === "low_cost_mode") {
    priorityChain = ["deepseek-v4-flash", "qwen", "deepseek-v4-pro"];
    chainReasoning = "cost_and_latency_guard_chain";
  } else if (input.invented_strategy_name.includes("recovery") || input.quality_required || input.rag_alignment < 0.35) {
    priorityChain = ["deepseek-v4-pro", "qwen", "glm-5.2"];
    chainReasoning = "quality_recovery_reasoning_chain";
  } else if (input.invented_strategy_name.includes("rag_first") || input.rag_alignment > 0.72) {
    priorityChain = ["qwen", "deepseek-v4-pro", "deepseek-v4-flash"];
    chainReasoning = "rag_grounded_verifier_chain";
  } else {
    priorityChain = ["qwen", "deepseek-v4-flash", "deepseek-v4-pro"];
    chainReasoning = "balanced_autonomous_chain";
  }

  return {
    chain_id: `chain_${input.invented_strategy_name}_${chainReasoning}`,
    strategy_combined_chain: uniqueChain([...priorityChain, ...input.fallback_chain_v4, ...weightedModels]),
    chain_reasoning: chainReasoning,
    is_dynamic: true,
  };
}
