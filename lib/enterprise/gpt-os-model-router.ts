import "server-only";

import {
  buildEnterpriseFallbackChain,
  getModelTypeCostLevel,
  routeModel,
  type ModelRoutingContext,
  type ModelType
} from "@/lib/enterprise/gpt-os-model-router-v2";

/**
 * @deprecated GPT OS v2.1 uses gpt-os-model-router-v2 as the single routing source.
 * This module is a compatibility shim only. Do not add routing rules here.
 */
export type ModelProvider = "openai" | "deepseek" | "qwen";
export type ModelCostLevel = "low" | "medium" | "high";

/**
 * @deprecated Use ModelRoutingContext from gpt-os-model-router-v2.
 */
export interface ModelRouterContext {
  usage?: "general" | "batch" | "knowledge_summary" | "customer_reply" | "debug";
  priority?: "high_quality" | "balanced" | "low_cost";
  costOptimized?: boolean;
  chineseContent?: boolean;
  input?: string | null;
  selectedModelLabel?: string | null;
  modelDisplayName?: string | null;
  preferredModel?: string | null;
}

function toV2Context(context: ModelRouterContext): ModelRoutingContext {
  return {
    input: context.input,
    selectedModelLabel: context.selectedModelLabel,
    modelDisplayName: context.modelDisplayName,
    preferredModel: context.preferredModel,
    taskType: context.usage === "knowledge_summary"
      ? "knowledge_summarize"
      : context.usage === "batch"
        ? "batch_draft"
        : undefined,
    costMode: context.costOptimized || context.priority === "low_cost"
      ? "low"
      : context.priority === "high_quality"
        ? "high"
        : "balanced",
    language: context.chineseContent ? "zh" : undefined
  };
}

function toLegacyProvider(modelType: ModelType): ModelProvider {
  if (modelType === "qwen") {
    return "qwen";
  }

  if (modelType === "deepseek-pro" || modelType === "deepseek-flash") {
    return "deepseek";
  }

  return "openai";
}

/**
 * @deprecated Use routeModel from gpt-os-model-router-v2.
 */
export function selectModel(context: ModelRouterContext): ModelProvider {
  return toLegacyProvider(routeModel(toV2Context(context)));
}

/**
 * @deprecated Use buildEnterpriseFallbackChain from gpt-os-model-router-v2.
 */
export function buildModelFallbackChain(primary: ModelProvider): ModelProvider[] {
  const mappedPrimary: ModelType = primary === "deepseek" ? "deepseek-pro" : primary;

  return Array.from(new Set(buildEnterpriseFallbackChain(mappedPrimary).map(toLegacyProvider)));
}

/**
 * @deprecated Use getModelTypeCostLevel from gpt-os-model-router-v2.
 */
export function getModelCostLevel(provider: ModelProvider): ModelCostLevel {
  const mappedProvider: ModelType = provider === "deepseek" ? "deepseek-pro" : provider;

  return getModelTypeCostLevel(mappedProvider);
}
