import type { OpenAIGptUsage } from "@/lib/enterprise/gpt-call-proof";
import type { GptOSToolResult } from "@/lib/enterprise/gpt-os-plugin-registry";

export interface GptOSCostBreakdown {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  modelCost: number;
  reasoningCost: number;
  toolCalls: number;
  toolExecutionTime: number;
  toolCostEstimate: number;
  totalCost: number;
  currency: "USD";
  estimated: true;
}

export interface GptOSCostInput {
  usage?: OpenAIGptUsage | null;
  model?: string | null;
  toolResults?: GptOSToolResult[];
  loopCount?: number;
}

const DEFAULT_TOOL_COST = 0.00002;
const DEFAULT_TOOL_TIME_MS = 12;

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function estimateModelUnitCost(model?: string | null) {
  const normalized = (model ?? "").toLowerCase();

  if (normalized.includes("gpt-5.5")) return 0.000003;
  if (normalized.includes("deepseek")) return 0.0000007;
  if (normalized.includes("qwen")) return 0.0000008;

  return 0.0000015;
}

export function estimateGptOSCost(input: GptOSCostInput = {}): GptOSCostBreakdown {
  const usage = input.usage ?? {};
  const inputTokens = readNumber(usage.inputTokens);
  const outputTokens = readNumber(usage.outputTokens);
  const reasoningTokens = readNumber(usage.reasoningTokens);
  const totalTokens = readNumber(usage.totalTokens) || inputTokens + outputTokens;
  const unitCost = estimateModelUnitCost(input.model);
  const modelCost = totalTokens * unitCost;
  const reasoningCost = reasoningTokens * unitCost * 0.35;
  const toolCalls = input.toolResults?.length ?? 0;
  const loopMultiplier = Math.max(1, input.loopCount ?? 1);
  const toolExecutionTime = toolCalls * DEFAULT_TOOL_TIME_MS * loopMultiplier;
  const toolCostEstimate = toolCalls * DEFAULT_TOOL_COST;

  return {
    inputTokens,
    outputTokens,
    reasoningTokens,
    totalTokens,
    modelCost,
    reasoningCost,
    toolCalls,
    toolExecutionTime,
    toolCostEstimate,
    totalCost: modelCost + reasoningCost + toolCostEstimate,
    currency: "USD",
    estimated: true
  };
}

export function formatGptOSCost(cost: GptOSCostBreakdown) {
  return {
    total: Number(cost.totalCost.toFixed(6)),
    tokens: cost.totalTokens,
    toolCalls: cost.toolCalls,
    reasoningTokens: cost.reasoningTokens,
    estimated: cost.estimated
  };
}
