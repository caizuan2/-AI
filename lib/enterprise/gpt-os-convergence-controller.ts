import type { GptOSToolResult } from "@/lib/enterprise/gpt-os-plugin-registry";

export interface GptOSToolBudget {
  maxToolCalls: number;
  maxRetries: number;
}

export interface GptOSConvergenceBudget extends GptOSToolBudget {
  maxLoopCount: number;
  minLoopCount: number;
  confidenceThreshold: number;
  minDeltaImprovement: number;
}

export interface GptOSConvergenceState {
  loopCount: number;
  toolCalls: number;
  retryCount: number;
  confidence: number;
  deltaImprovement: number;
  minLoopCount?: number;
  maxLoopCount?: number;
  maxToolCalls?: number;
  maxRetries?: number;
  confidenceThreshold?: number;
  minDeltaImprovement?: number;
}

export interface GptOSConvergenceInput {
  previousModelText?: string;
  latestModelText: string;
  routeConfidence: number;
  loopCount: number;
  toolCalls: number;
  retryCount: number;
  toolResults: GptOSToolResult[];
  budget?: Partial<GptOSConvergenceBudget>;
}

export interface GptOSConvergenceEvaluation {
  completeness: number;
  contextMatch: number;
  toolRelevance: number;
  reasoningStability: number;
  confidence: number;
  deltaImprovement: number;
  converged: boolean;
  shouldContinue: boolean;
  stopReason: string;
  costOptimized: boolean;
}

export const DEFAULT_GPT_OS_CONVERGENCE_BUDGET: GptOSConvergenceBudget = {
  maxToolCalls: 3,
  maxRetries: 2,
  maxLoopCount: 3,
  minLoopCount: 2,
  confidenceThreshold: 0.85,
  minDeltaImprovement: 0.05
};

function clampScore(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function estimateTextDelta(previousModelText: string | undefined, latestModelText: string) {
  const previous = normalizeText(previousModelText ?? "");
  const latest = normalizeText(latestModelText);

  if (!previous) {
    return latest ? 1 : 0;
  }

  if (!latest) {
    return 0;
  }

  const lengthDelta = Math.abs(latest.length - previous.length) / Math.max(latest.length, previous.length, 1);
  const previousTokens = new Set(previous.split(/\s+/).filter(Boolean));
  const latestTokens = new Set(latest.split(/\s+/).filter(Boolean));
  const shared = Array.from(latestTokens).filter((token) => previousTokens.has(token)).length;
  const overlap = shared / Math.max(latestTokens.size, previousTokens.size, 1);

  return clampScore(lengthDelta * 0.45 + (1 - overlap) * 0.55);
}

export function getGptOSConvergenceBudget(input?: Partial<GptOSConvergenceBudget>): GptOSConvergenceBudget {
  return {
    ...DEFAULT_GPT_OS_CONVERGENCE_BUDGET,
    ...input,
    maxToolCalls: Math.max(1, input?.maxToolCalls ?? DEFAULT_GPT_OS_CONVERGENCE_BUDGET.maxToolCalls),
    maxRetries: Math.max(0, input?.maxRetries ?? DEFAULT_GPT_OS_CONVERGENCE_BUDGET.maxRetries),
    maxLoopCount: Math.max(1, input?.maxLoopCount ?? DEFAULT_GPT_OS_CONVERGENCE_BUDGET.maxLoopCount),
    minLoopCount: Math.max(1, input?.minLoopCount ?? DEFAULT_GPT_OS_CONVERGENCE_BUDGET.minLoopCount),
    confidenceThreshold: clampScore(input?.confidenceThreshold ?? DEFAULT_GPT_OS_CONVERGENCE_BUDGET.confidenceThreshold),
    minDeltaImprovement: clampScore(input?.minDeltaImprovement ?? DEFAULT_GPT_OS_CONVERGENCE_BUDGET.minDeltaImprovement)
  };
}

export function evaluateGptOSConvergence(input: GptOSConvergenceInput): GptOSConvergenceEvaluation {
  const budget = getGptOSConvergenceBudget(input.budget);
  const latest = normalizeText(input.latestModelText);
  const deltaImprovement = estimateTextDelta(input.previousModelText, latest);
  const hasStructure = /[：:\n。.!?？]/.test(latest);
  const completeness = clampScore((latest.length >= 220 ? 0.72 : latest.length / 320) + (hasStructure ? 0.18 : 0));
  const contextToolCount = input.toolResults.filter((result) => result.stage === "pre-model" || result.stage === "post-model").length;
  const contextMatch = clampScore(input.routeConfidence * 0.65 + Math.min(0.25, contextToolCount * 0.12));
  const usefulTools = input.toolResults.filter((result) => result.nextAction !== "replan").length;
  const toolRelevance = input.toolResults.length
    ? clampScore(usefulTools / input.toolResults.length)
    : 0.62;
  const reasoningStability = clampScore(1 - Math.min(0.55, input.retryCount * 0.16) - Math.min(0.35, deltaImprovement * 0.32));
  const confidence = clampScore(
    completeness * 0.34 +
    contextMatch * 0.24 +
    toolRelevance * 0.2 +
    reasoningStability * 0.22
  );
  const shouldContinue = shouldContinueLoop({
    loopCount: input.loopCount,
    toolCalls: input.toolCalls,
    retryCount: input.retryCount,
    confidence,
    deltaImprovement,
    minLoopCount: budget.minLoopCount,
    maxLoopCount: budget.maxLoopCount,
    maxToolCalls: budget.maxToolCalls,
    maxRetries: budget.maxRetries,
    confidenceThreshold: budget.confidenceThreshold,
    minDeltaImprovement: budget.minDeltaImprovement
  });
  const stopReason = shouldContinue
    ? "continue"
    : getGptOSStopReason({
      loopCount: input.loopCount,
      toolCalls: input.toolCalls,
      retryCount: input.retryCount,
      confidence,
      deltaImprovement,
      minLoopCount: budget.minLoopCount,
      maxLoopCount: budget.maxLoopCount,
      maxToolCalls: budget.maxToolCalls,
      maxRetries: budget.maxRetries,
      confidenceThreshold: budget.confidenceThreshold,
      minDeltaImprovement: budget.minDeltaImprovement
    });

  return {
    completeness,
    contextMatch,
    toolRelevance,
    reasoningStability,
    confidence,
    deltaImprovement,
    converged: !shouldContinue,
    shouldContinue,
    stopReason,
    costOptimized: input.toolCalls <= budget.maxToolCalls && input.loopCount <= budget.maxLoopCount
  };
}

export function shouldContinueLoop(state: GptOSConvergenceState) {
  const budget = getGptOSConvergenceBudget({
    maxLoopCount: state.maxLoopCount,
    maxToolCalls: state.maxToolCalls,
    maxRetries: state.maxRetries,
    minLoopCount: state.minLoopCount,
    confidenceThreshold: state.confidenceThreshold,
    minDeltaImprovement: state.minDeltaImprovement
  });

  if (state.loopCount < budget.minLoopCount) return true;
  if (state.loopCount >= budget.maxLoopCount) return false;
  if (state.toolCalls >= budget.maxToolCalls) return false;
  if (state.retryCount >= budget.maxRetries) return false;
  if (state.confidence >= budget.confidenceThreshold) return false;
  if (state.deltaImprovement < budget.minDeltaImprovement) return false;

  return true;
}

export function getGptOSStopReason(state: GptOSConvergenceState) {
  const budget = getGptOSConvergenceBudget({
    maxLoopCount: state.maxLoopCount,
    maxToolCalls: state.maxToolCalls,
    maxRetries: state.maxRetries,
    minLoopCount: state.minLoopCount,
    confidenceThreshold: state.confidenceThreshold,
    minDeltaImprovement: state.minDeltaImprovement
  });

  if (state.loopCount < budget.minLoopCount) return "minimum_loop_not_reached";
  if (state.loopCount >= budget.maxLoopCount) return "max_loop_reached";
  if (state.toolCalls >= budget.maxToolCalls) return "tool_budget_reached";
  if (state.retryCount >= budget.maxRetries) return "retry_budget_reached";
  if (state.confidence >= budget.confidenceThreshold) return "confidence_threshold";
  if (state.deltaImprovement < budget.minDeltaImprovement) return "low_delta_improvement";

  return "continue";
}
