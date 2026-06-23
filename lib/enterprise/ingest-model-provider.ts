import "server-only";

import {
  runOpenAIAdminIngest,
  type OpenAIAdminIngestInput,
  type OpenAIAdminIngestResult
} from "@/lib/enterprise/openai-ingest-client";
import {
  runDeepSeekAdminIngest,
  type DeepSeekAdminIngestInput,
  type DeepSeekAdminIngestResult
} from "@/lib/enterprise/deepseek-ingest-client";
import {
  runQwenAdminIngest,
  type QwenAdminIngestInput,
  type QwenAdminIngestResult
} from "@/lib/enterprise/qwen-client";
import {
  runKimiAdminIngest,
  type KimiAdminIngestInput,
  type KimiAdminIngestResult
} from "@/lib/enterprise/kimi-client";
import {
  getIngestModelOptionByProvider,
  resolveIngestActualModel,
  type IngestModelProvider
} from "@/lib/enterprise/ingest-model-options";
import {
  buildEnterpriseFallbackChain,
  modelTypeToProvider,
  routeModel,
  type ModelType
} from "@/lib/enterprise/gpt-os-model-router-v2";
import {
  evaluateModelCost
} from "@/lib/enterprise/gpt-os-cost-engine";

export type AdminIngestModelInput = (OpenAIAdminIngestInput | DeepSeekAdminIngestInput | QwenAdminIngestInput | KimiAdminIngestInput) & {
  modelProvider?: IngestModelProvider | string | null;
  costOptimized?: boolean;
  priority?: "high_quality" | "balanced" | "low_cost";
};

export type AdminIngestModelResult = (OpenAIAdminIngestResult | DeepSeekAdminIngestResult | QwenAdminIngestResult | KimiAdminIngestResult) & {
  fallback: boolean;
  fallbackUsed: boolean;
};

export function resolveAdminIngestModelProvider(input: {
  modelProvider?: string | null;
  selectedModelLabel?: string | null;
  modelDisplayName?: string | null;
  preferredModel?: string | null;
  input?: string | null;
  attachments?: AdminIngestModelInput["attachments"];
  costOptimized?: boolean;
  chineseContent?: boolean;
  priority?: "high_quality" | "balanced" | "low_cost";
}) {
  return getIngestModelOptionByProvider(routeModel({
    input: input.input,
    selectedModelLabel: input.selectedModelLabel,
    modelDisplayName: input.modelDisplayName,
    preferredModel: input.modelProvider?.trim().toLowerCase() === "auto"
      ? input.preferredModel
      : input.modelProvider || input.preferredModel,
    attachments: input.attachments,
    costMode: input.costOptimized || input.priority === "low_cost" ? "low" : input.priority === "high_quality" ? "high" : "balanced",
    language: input.chineseContent ? "zh" : undefined
  }));
}

function isModelProvider(value: string): value is ModelType {
  return value === "openai" || value === "deepseek-pro" || value === "deepseek-flash" || value === "qwen" || value === "kimi";
}

function readErrorCode(error: unknown) {
  return error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : error instanceof Error
      ? error.name || "UNKNOWN_MODEL_ERROR"
    : "UNKNOWN_MODEL_ERROR";
}

function deriveCostMode(input: {
  costOptimized?: boolean;
  priority?: "high_quality" | "balanced" | "low_cost";
}) {
  if (input.costOptimized || input.priority === "low_cost") {
    return "low" as const;
  }

  if (input.priority === "high_quality") {
    return "high" as const;
  }

  return "balanced" as const;
}

function deriveTaskType(input: AdminIngestModelInput) {
  if ((input.attachments ?? []).length > 0) {
    return "document_ingest" as const;
  }

  if (/总结|归纳|提炼|知识点|标准问答|sop|入库/i.test(input.input ?? "")) {
    return "knowledge_summarize" as const;
  }

  if (/批量|草稿|初稿|低成本|快速/i.test(input.input ?? "")) {
    return "batch_draft" as const;
  }

  return "general" as const;
}

async function runProvider(provider: ModelType, input: AdminIngestModelInput, preserveUserSelection: boolean) {
  const option = getIngestModelOptionByProvider(provider);
  const baseInput = { ...input };
  const actualModel = resolveIngestActualModel(provider);
  const displayModelLabel = preserveUserSelection
    ? input.selectedModelLabel || input.modelDisplayName || option.label
    : option.label;
  const modelDisplayName = preserveUserSelection
    ? input.modelDisplayName || input.selectedModelLabel || option.displayName
    : option.displayName;

  delete (baseInput as { modelProvider?: unknown }).modelProvider;

  const payload = {
    ...baseInput,
    selectedModelLabel: displayModelLabel,
    modelDisplayName,
    preferredModel: actualModel
  };

  if (provider === "deepseek-pro" || provider === "deepseek-flash") {
    return runDeepSeekAdminIngest({
      ...payload
    } as DeepSeekAdminIngestInput);
  }

  if (provider === "kimi") {
    return runKimiAdminIngest({
      ...payload
    } as KimiAdminIngestInput);
  }

  if (provider === "qwen") {
    return runQwenAdminIngest({
      ...payload
    } as QwenAdminIngestInput);
  }

  return runOpenAIAdminIngest({
    ...payload
  } as OpenAIAdminIngestInput);
}

function annotateModelRouting<T extends OpenAIAdminIngestResult | DeepSeekAdminIngestResult | QwenAdminIngestResult | KimiAdminIngestResult>(result: T, input: {
  primaryProvider: ModelType;
  actualProvider: ModelType;
  fallbackChain: ModelType[];
  fallbackUsed: boolean;
  latency: number;
  failedProviders: Array<{ provider: ModelType; code: string }>;
  taskType: ReturnType<typeof deriveTaskType>;
  costMode: ReturnType<typeof deriveCostMode>;
  inputLength: number;
  attachmentCount: number;
}): AdminIngestModelResult {
  const cost = evaluateModelCost({
    modelType: input.actualProvider,
    taskType: input.taskType,
    costMode: input.costMode,
    inputLength: input.inputLength,
    attachmentCount: input.attachmentCount
  });
  const fallbackCount = input.failedProviders.length;
  const displayModelLabel = result.selectedModelLabel || result.modelDisplayName || "";
  const actualModel = result.actualModel || result.model || result.gptProof.actualModel;

  return {
    ...result,
    fallback: input.fallbackUsed,
    fallbackUsed: input.fallbackUsed,
    gptProof: {
      ...result.gptProof,
      fallback: input.fallbackUsed
    },
    diagnostics: [
      ...result.diagnostics,
      `modelRouter:primaryProvider:${input.primaryProvider}`,
      `modelRouter:actualProvider:${input.actualProvider}`,
      `modelRouter:fallbackUsed:${input.fallbackUsed ? "true" : "false"}`,
      `modelRouter:fallbackCount:${fallbackCount}`,
      `modelRouter:fallbackChain:${input.fallbackChain.join(">")}`,
      `modelRouter:failedProviders:${input.failedProviders.map((item) => `${item.provider}:${item.code}`).join("|") || "none"}`,
      `modelRouter:latency:${input.latency}`,
      `modelRouter:provider:${modelTypeToProvider(input.actualProvider)}`,
      `modelRouter:displayModelLabel:${displayModelLabel}`,
      `modelRouter:actualModel:${actualModel}`,
      `modelRouter:routeDecision:${input.primaryProvider}->${input.actualProvider}`,
      `modelRouter:cost:${cost.estimatedUnits}`,
      `modelRouter:costLevel:${cost.costLevel}`,
      `modelRouter:estimatedCostUnits:${cost.estimatedUnits}`,
      `modelRouter:costReason:${cost.reason}`
    ]
  } as AdminIngestModelResult;
}

export async function runAdminIngestWithSelectedModel(input: AdminIngestModelInput): Promise<AdminIngestModelResult> {
  const costMode = deriveCostMode(input);
  const taskType = deriveTaskType(input);
  const option = resolveAdminIngestModelProvider({
    ...input,
    input: input.input,
    attachments: input.attachments,
    costOptimized: costMode === "low",
    priority: costMode === "high" ? "high_quality" : costMode === "low" ? "low_cost" : "balanced"
  });
  const primaryProvider = isModelProvider(option.provider) ? option.provider : "openai";
  const fallbackChain = buildEnterpriseFallbackChain(primaryProvider);
  const failedProviders: Array<{ provider: ModelType; code: string }> = [];
  const startedAt = Date.now();
  let lastError: unknown = null;

  for (const provider of fallbackChain) {
    try {
      const result = await runProvider(provider, {
        ...input,
        modelProvider: provider
      }, provider === primaryProvider);

      return annotateModelRouting(result, {
        primaryProvider,
        actualProvider: provider,
        fallbackChain: fallbackChain.slice(0, fallbackChain.indexOf(provider) + 1),
        fallbackUsed: provider !== primaryProvider,
        latency: Date.now() - startedAt,
        failedProviders,
        taskType,
        costMode,
        inputLength: (input.input ?? "").length,
        attachmentCount: input.attachments?.length ?? 0
      });
    } catch (error) {
      lastError = error;
      failedProviders.push({
        provider,
        code: readErrorCode(error)
      });
    }
  }

  throw lastError;
}
