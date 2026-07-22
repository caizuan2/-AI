import "server-only";

import type { ModelCostMode, ModelTaskType, ModelType } from "@/lib/enterprise/gpt-os-model-router-v2";

export interface CostEngineInput {
  modelType: ModelType;
  taskType?: ModelTaskType;
  costMode?: ModelCostMode;
  inputLength?: number;
  attachmentCount?: number;
}

export interface CostEngineResult {
  modelType: ModelType;
  costLevel: "low" | "medium" | "high";
  estimatedUnits: number;
  reason: string;
}

const COST_PROFILE: Record<ModelType, {
  baseUnits: number;
  costLevel: CostEngineResult["costLevel"];
  label: string;
}> = {
  "openai": {
    baseUnits: 5,
    costLevel: "high",
    label: "OpenAI high cost"
  },
  "deepseek-pro": {
    baseUnits: 3,
    costLevel: "medium",
    label: "DeepSeek-Pro medium cost"
  },
  "doubao-pro": {
    baseUnits: 3,
    costLevel: "medium",
    label: "Doubao-Pro medium cost"
  },
  "qwen": {
    baseUnits: 2,
    costLevel: "medium",
    label: "Qwen low-medium cost"
  },
  "deepseek-flash": {
    baseUnits: 1,
    costLevel: "low",
    label: "DeepSeek-Flash lowest cost"
  },
  "kimi": {
    baseUnits: 3,
    costLevel: "medium",
    label: "Kimi doc-only cost optimized"
  }
};

export function evaluateModelCost(input: CostEngineInput): CostEngineResult {
  const profile = COST_PROFILE[input.modelType];
  const textUnits = Math.ceil((input.inputLength ?? 0) / 6000);
  const attachmentUnits = (input.attachmentCount ?? 0) * 2;
  const taskMultiplier = input.taskType === "document_ingest"
    ? 2
    : input.taskType === "batch_draft"
      ? 0.75
      : 1;
  const modeMultiplier = input.costMode === "low" ? 0.75 : input.costMode === "high" ? 1.25 : 1;
  const estimatedUnits = Math.max(1, Math.round((profile.baseUnits + textUnits + attachmentUnits) * taskMultiplier * modeMultiplier));

  return {
    modelType: input.modelType,
    costLevel: profile.costLevel,
    estimatedUnits,
    reason: [
      `model=${input.modelType}`,
      `profile=${profile.label}`,
      `task=${input.taskType ?? "general"}`,
      `costMode=${input.costMode ?? "balanced"}`,
      `attachments=${input.attachmentCount ?? 0}`
    ].join(";")
  };
}
