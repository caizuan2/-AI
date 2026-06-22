export interface GptOSReplanInput {
  confidence: number;
  threshold: number;
  iteration: number;
  maxIterations: number;
  plannerSteps: string[];
  reflection: string;
  toolFeedback: string[];
  deltaImprovement: number;
  evaluation?: {
    totalScore: number;
    improvementNeeded: boolean;
    improvementHints: string[];
  };
  approvalRequired?: boolean;
  blockedActions?: string[];
}

export interface GptOSReplanDecision {
  shouldReplan: boolean;
  adjustedSteps: string[];
  reason: string;
  nextFocus: string;
  confidenceDelta: number;
}

function uniqueSteps(steps: string[]) {
  const seen = new Set<string>();

  return steps.filter((step) => {
    const normalized = step.trim();

    if (!normalized || seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  }).slice(0, 8);
}

function resolveNextFocus(input: GptOSReplanInput) {
  if (input.evaluation?.improvementNeeded) {
    return input.evaluation.improvementHints[0] ?? "根据自评结果优化推理路径";
  }

  if (input.toolFeedback.some((item) => /风险|限制|不足|无法/.test(item))) {
    return "补齐限制说明和风险边界";
  }

  if (input.confidence < 0.72) {
    return "补充上下文证据并收敛答案";
  }

  if (input.deltaImprovement < 0.04) {
    return "停止扩散，转入最终表达";
  }

  return "优化结构和可执行下一步";
}

export function replanGptOSReasoning(input: GptOSReplanInput): GptOSReplanDecision {
  const nextFocus = resolveNextFocus(input);
  const hasRoom = input.iteration < input.maxIterations;
  const blockedActions = input.blockedActions ?? [];
  const safetyStop = input.approvalRequired || blockedActions.length > 0;
  const shouldReplan = hasRoom && (
    input.iteration === 1 ||
    Boolean(input.evaluation?.improvementNeeded) ||
    (input.confidence < input.threshold && input.deltaImprovement >= 0.03)
  ) && !safetyStop;

  if (!shouldReplan) {
    return {
      shouldReplan: false,
      adjustedSteps: input.plannerSteps,
      reason: blockedActions.length > 0
        ? `dangerous action blocked: ${blockedActions.join("、")}`
        : input.approvalRequired
          ? "human approval required before continuing autonomous execution"
          : input.confidence >= input.threshold
        ? "confidence threshold reached and self-evaluation is stable"
        : "delta improvement is too small or max iteration reached",
      nextFocus,
      confidenceDelta: input.deltaImprovement
    };
  }

  return {
    shouldReplan: true,
    adjustedSteps: uniqueSteps([
      ...input.plannerSteps,
      nextFocus,
      input.evaluation?.improvementNeeded ? "按自评结果重写薄弱部分" : "",
      "复核最终回答是否自然、完整、可执行"
    ].filter(Boolean)),
    reason: `iteration ${input.iteration} reflection requested replan: ${input.reflection}`,
    nextFocus,
    confidenceDelta: input.deltaImprovement
  };
}
