import type { RuntimeV2SalesLoopPlan } from "./runtime-v2-sales-loop-types";

const PUSHY_PATTERNS: Array<[RegExp, string]> = [
  [/必须(马上|立刻)?(下单|付款|成交|决定)/g, "可以先判断是否合适"],
  [/(错过|不买|不做).*后悔/g, "先按实际情况判断"],
  [/保证(?:瘦|有效|成功|成交)/g, "尽量提升成功概率"],
  [/百分百|100%/g, "更稳妥"],
];

const DEFAULT_STOP_RULES = [
  "客户明确拒绝时停止推进。",
  "客户只想了解时不连续催促。",
  "涉及效果、健康或收益时保留个体差异边界。",
];

function sanitizeText(value: string) {
  return PUSHY_PATTERNS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    value,
  ).trim();
}

function uniq(values: string[]) {
  return Array.from(new Set(values.map((value) => sanitizeText(value)).filter(Boolean)));
}

export function guardRuntimeV2SalesLoopPlan(plan: RuntimeV2SalesLoopPlan): RuntimeV2SalesLoopPlan {
  return {
    ...plan,
    nextQuestion: sanitizeText(plan.nextQuestion),
    nextCustomerMessage: sanitizeText(plan.nextCustomerMessage),
    followupSequence: plan.followupSequence.map((item) => ({
      ...item,
      goal: sanitizeText(item.goal),
      message: sanitizeText(item.message),
      stopIf: sanitizeText(item.stopIf),
    })),
    branchReplies: plan.branchReplies.map((item) => ({
      ...item,
      reply: sanitizeText(item.reply),
      nextQuestion: item.nextQuestion ? sanitizeText(item.nextQuestion) : item.nextQuestion,
    })),
    stopRules: uniq([...plan.stopRules, ...DEFAULT_STOP_RULES]).slice(0, 5),
    closingPath: {
      ...plan.closingPath,
      currentGoal: sanitizeText(plan.closingPath.currentGoal),
      decisionPath: plan.closingPath.decisionPath.map(sanitizeText),
      recommendedClose: sanitizeText(plan.closingPath.recommendedClose),
      avoidActions: uniq(plan.closingPath.avoidActions),
    },
  };
}
