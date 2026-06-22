export interface GptOSTokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
}

export interface GptOSCostBreakdown {
  prompt_tokens: number;
  completion_tokens: number;
  reasoning_tokens: number;
  total_tokens: number;
  estimated_cost: number;
  toolCostEstimate: number;
  totalCost: number;
  model_used: string;
  provider: string;
  currency: "USD";
}

interface GptOSCostInput {
  provider?: string;
  model?: string;
  usage?: GptOSTokenUsage;
  inputText?: string;
  reasoningIterations?: number;
  toolCalls?: number;
}

const MODEL_RATES_PER_1K: Record<string, { input: number; output: number; reasoning: number }> = {
  "gpt-5.5": { input: 0.005, output: 0.015, reasoning: 0.006 },
  "kimi": { input: 0.002, output: 0.006, reasoning: 0.002 },
  "deepseek": { input: 0.0005, output: 0.0015, reasoning: 0.0006 },
  "deepseek-flash": { input: 0.0002, output: 0.0006, reasoning: 0.0002 },
  "qwen": { input: 0.0008, output: 0.002, reasoning: 0.0008 },
  "gpt-os-router": { input: 0.0002, output: 0.0004, reasoning: 0.0002 },
  "default": { input: 0.001, output: 0.003, reasoning: 0.001 }
};

function pickRate(model: string) {
  const normalized = model.toLowerCase();

  if (normalized.includes("gpt-5.5")) {
    return MODEL_RATES_PER_1K["gpt-5.5"];
  }

  if (normalized.includes("kimi") || normalized.includes("moonshot")) {
    return MODEL_RATES_PER_1K.kimi;
  }

  if (normalized.includes("flash")) {
    return MODEL_RATES_PER_1K["deepseek-flash"];
  }

  if (normalized.includes("deepseek")) {
    return MODEL_RATES_PER_1K.deepseek;
  }

  if (normalized.includes("qwen")) {
    return MODEL_RATES_PER_1K.qwen;
  }

  if (normalized.includes("gpt-os")) {
    return MODEL_RATES_PER_1K["gpt-os-router"];
  }

  return MODEL_RATES_PER_1K.default;
}

function roundCost(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function safeNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback;
}

export function estimateGptOSCost(input: GptOSCostInput): GptOSCostBreakdown {
  const model = input.model || "gpt-os-router";
  const rate = pickRate(model);
  const promptTokens = safeNumber(
    input.usage?.inputTokens,
    Math.max(16, Math.ceil((input.inputText?.length ?? 0) / 2.8))
  );
  const reasoningTokens = safeNumber(
    input.usage?.reasoningTokens,
    Math.max(32, (input.reasoningIterations ?? 1) * 72)
  );
  const completionTokens = safeNumber(
    input.usage?.outputTokens,
    Math.max(64, (input.reasoningIterations ?? 1) * 96)
  );
  const totalTokens = safeNumber(
    input.usage?.totalTokens,
    promptTokens + completionTokens + reasoningTokens
  );
  const modelCost = (promptTokens / 1000) * rate.input
    + (completionTokens / 1000) * rate.output
    + (reasoningTokens / 1000) * rate.reasoning;
  const toolCostEstimate = (input.toolCalls ?? 0) * 0.00005;
  const estimatedCost = roundCost(modelCost);

  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    reasoning_tokens: reasoningTokens,
    total_tokens: totalTokens,
    estimated_cost: estimatedCost,
    toolCostEstimate: roundCost(toolCostEstimate),
    totalCost: roundCost(estimatedCost + toolCostEstimate),
    model_used: model,
    provider: input.provider ?? "gpt-os",
    currency: "USD"
  };
}
