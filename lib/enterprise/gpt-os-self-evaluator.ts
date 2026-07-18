export interface GptOSSelfEvaluationInput {
  plannerSteps: string[];
  finalPlan: string[];
  toolFeedback: string[];
  memoryUpdates: string[];
  confidence: number;
  loopStatus: string;
  goalProgress: number;
  approvalRequired?: boolean;
  blockedActions?: string[];
}

export interface GptOSSelfEvaluationResult {
  clarity: number;
  completeness: number;
  reasoningQuality: number;
  goalAlignment: number;
  totalScore: number;
  improvementNeeded: boolean;
  improvementStatus: "stable" | "improve" | "rethink";
  improvementHints: string[];
}

function clampScore(value: number) {
  return Math.max(1, Math.min(10, Math.round(value)));
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

export function evaluateGptOSResponsePath(input: GptOSSelfEvaluationInput): GptOSSelfEvaluationResult {
  const feedbackCount = input.toolFeedback.filter(Boolean).length;
  const planCoverage = input.finalPlan.length / Math.max(input.plannerSteps.length, 1);
  const memoryStrength = input.memoryUpdates.length >= 2 ? 1 : 0;

  const clarity = clampScore(6 + (input.loopStatus === "converged" ? 2 : 0) + (input.confidence >= 0.82 ? 1 : 0));
  const completeness = clampScore(5 + planCoverage * 2 + Math.min(feedbackCount, 2));
  const reasoningQuality = clampScore(5 + input.confidence * 3 + memoryStrength);
  const safetyGuard = input.approvalRequired || input.blockedActions?.length ? 1 : 0;
  const goalAlignment = clampScore(5 + input.goalProgress * 4 + (input.finalPlan.some((step) => /目标|交付|回答|输出/.test(step)) ? 1 : 0) + safetyGuard);
  const totalScore = Math.round(average([clarity, completeness, reasoningQuality, goalAlignment]) * 10) / 10;
  const improvementNeeded = totalScore < 8 || input.confidence < 0.8;
  const improvementHints = [
    clarity < 8 ? "增强表达清晰度，减少工程化痕迹" : "",
    completeness < 8 ? "补齐任务步骤和结论覆盖" : "",
    reasoningQuality < 8 ? "继续让工具反馈和反思结果回流推理" : "",
    goalAlignment < 8 ? "把回答重新对齐当前长期目标" : "",
    input.approvalRequired ? "保持人工审批边界，不自动保存或写入" : "",
    input.blockedActions?.length ? `危险动作已阻断：${input.blockedActions.join("、")}` : ""
  ].filter(Boolean);

  return {
    clarity,
    completeness,
    reasoningQuality,
    goalAlignment,
    totalScore,
    improvementNeeded,
    improvementStatus: totalScore < 7 ? "rethink" : improvementNeeded ? "improve" : "stable",
    improvementHints: improvementHints.length ? improvementHints : ["保持当前路径，进入最终自然回答"]
  };
}
