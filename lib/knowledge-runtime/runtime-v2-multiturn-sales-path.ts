import type {
  RuntimeV2DealProbability,
  RuntimeV2DealSignal,
  RuntimeV2MultiTurnSalesPath,
  RuntimeV2SalesCustomerStage,
  RuntimeV2SilenceRisk,
} from "./runtime-v2-sales-loop-types";
import type { RuntimeV2Input } from "./runtime-v2-types";

export interface RuntimeV2MultiTurnSalesPathInput {
  scope: RuntimeV2Input;
  customerStage?: RuntimeV2SalesCustomerStage | string | null;
  dealSignals?: RuntimeV2DealSignal[] | null;
  dealProbability?: RuntimeV2DealProbability | null;
  silenceRisk?: RuntimeV2SilenceRisk | null;
}

function readText(input: RuntimeV2Input) {
  return [
    input.query,
    ...(input.messages ?? []).slice(-4).map((message) => message.content),
  ].join("\n");
}

function hasSignal(signals: RuntimeV2DealSignal[] | null | undefined, key: string) {
  return Boolean(signals?.some((signal) => signal.key === key));
}

function hasAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

export function buildMultiTurnSalesPath(input: RuntimeV2MultiTurnSalesPathInput): RuntimeV2MultiTurnSalesPath {
  const text = readText(input.scope);
  const signals = input.dealSignals ?? [];
  const askingCycle = hasSignal(signals, "asking_cycle") || hasAny(text, [/33\s*循环|77\s*循环|怎么选|周期/]);
  const askingStart = hasSignal(signals, "ready_signal") || hasAny(text, [/怎么开始|怎么买|报名|现在做|下单/]);
  const askingPrice = hasSignal(signals, "asking_price") || hasAny(text, [/太贵|价格|预算|便宜|优惠/]);
  const askingEffect = hasSignal(signals, "asking_effect") || hasAny(text, [/没效果|有没有用|有效|担心/]);
  const silentRisk = input.silenceRisk?.silenceRisk === "high" || input.customerStage === "inactive";
  const baseQuestion = askingCycle
    ? "先确认客户基础信息，再判断 33/77 哪个更合适。"
    : askingStart
      ? "先确认开始前的基础信息和目标。"
      : askingPrice
        ? "先确认客户觉得贵的真实原因是预算、价值感还是担心不适合。"
        : askingEffect
          ? "先确认客户过去尝试经历和最担心的结果。"
          : "先确认客户当前最卡的一个点。";

  return {
    currentStep: silentRisk ? "降低压力，先收口承接" : "确认客户真实卡点",
    nextBestAction: input.dealProbability?.probability === "high"
      ? "收敛到开始前两个基础信息，再给下一步安排。"
      : baseQuestion,
    path: [
      {
        step: 1,
        goal: "明确真实需求",
        userAction: baseQuestion,
        ifCustomerResponds: "客户回复具体顾虑或基础情况。",
        nextReply: "先复述客户重点，再给一个轻量判断，不直接催单。",
      },
      {
        step: 2,
        goal: askingCycle ? "判断 33/77 方向" : "补足信任依据",
        userAction: askingCycle ? "根据基础信息判断更适合轻启动还是稳周期。" : "结合客户当前情况说明为什么这样安排。",
        ifCustomerResponds: "客户继续问细节或对比方案。",
        nextReply: askingCycle
          ? "说明 33 更适合轻启动，77 更适合节奏更乱或想稳一点的人。"
          : "只讲一个最相关依据，避免一次讲太多。",
      },
      {
        step: 3,
        goal: "给出可执行下一步",
        userAction: "给客户一个可以马上回复的选择题。",
        ifCustomerResponds: "客户愿意继续或问怎么开始。",
        nextReply: "收敛到开始前信息，不承诺结果，只给稳妥安排。",
      },
      {
        step: 4,
        goal: "低压力收口",
        userAction: "如果客户不回复或明确拒绝，暂停推进。",
        ifCustomerResponds: "客户沉默、拒绝或只想了解。",
        nextReply: "礼貌收口，告诉客户方便时再回复一个最在意的点即可。",
      },
    ],
    pathRisk: [
      "不要一次性抛太多资料，客户容易疲劳。",
      "不要承诺效果，只能做适配判断和执行建议。",
      "客户连续不回复时不要重复催促。",
    ],
  };
}
