import type {
  RuntimeV2DealSignal,
  RuntimeV2FollowUpStep,
  RuntimeV2SalesCustomerStage,
} from "./runtime-v2-sales-loop-types";

function hasSignal(signals: RuntimeV2DealSignal[], key: string) {
  return signals.some((signal) => signal.key === key);
}

export function buildRuntimeV2FollowupSequence(input: {
  customerStage: RuntimeV2SalesCustomerStage;
  dealSignals: RuntimeV2DealSignal[];
  nextQuestion: string;
}): RuntimeV2FollowUpStep[] {
  const { customerStage, dealSignals, nextQuestion } = input;
  const firstGoal = customerStage === "price_sensitive"
    ? "确认价格背后的真实顾虑"
    : customerStage === "effect_doubt"
      ? "确认客户担心的效果或安全点"
      : hasSignal(dealSignals, "asking_cycle")
        ? "收集周期选择所需基础信息"
        : "收敛客户最关心的一点";

  return [
    {
      step: 1,
      timing: "本轮立即",
      goal: firstGoal,
      message: nextQuestion,
      stopIf: "客户明确表示不想继续或已经拒绝。",
    },
    {
      step: 2,
      timing: "客户回复后",
      goal: "按客户顾虑补一条证据或边界",
      message: "我按您刚才说的点，先补充一个最关键的判断，再给您一个简单选择。",
      stopIf: "客户没有回复时不要连续追问。",
    },
    {
      step: 3,
      timing: "客户仍有兴趣时",
      goal: "推动一个低压力下一步动作",
      message: "如果您觉得这个方向可以，我再帮您整理一个更具体、好执行的安排。",
      stopIf: "客户只想了解不想安排时，先暂停推进。",
    },
  ];
}
