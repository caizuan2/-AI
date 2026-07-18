export type ModelLifecycleStatus = "active" | "degraded";

export interface ModelLifecycleResult {
  degraded_models: string[];
  restored_models: string[];
  model_status: Record<string, ModelLifecycleStatus>;
}

export interface ModelLifecycleInput {
  model_weights: Record<string, number>;
  previous_degraded?: string[];
  degraded_threshold?: number;
  restore_threshold?: number;
}

function readThreshold(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function evaluateModelLifecycle(input: ModelLifecycleInput): ModelLifecycleResult {
  const degradedThreshold = readThreshold(input.degraded_threshold, 0.45);
  const restoreThreshold = readThreshold(input.restore_threshold, 0.58);
  const previousDegraded = new Set(input.previous_degraded ?? []);
  const degradedModels: string[] = [];
  const restoredModels: string[] = [];
  const modelStatus: Record<string, ModelLifecycleStatus> = {};

  for (const [model, weight] of Object.entries(input.model_weights)) {
    const wasDegraded = previousDegraded.has(model);
    const shouldDegrade = weight < degradedThreshold;
    const shouldRestore = wasDegraded && weight >= restoreThreshold;

    if (shouldDegrade) {
      degradedModels.push(model);
      modelStatus[model] = "degraded";
      continue;
    }

    if (shouldRestore) {
      restoredModels.push(model);
    }

    modelStatus[model] = "active";
  }

  return {
    degraded_models: degradedModels,
    restored_models: restoredModels,
    model_status: modelStatus,
  };
}
