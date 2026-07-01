import type { RuntimeV2DealSignal, RuntimeV2SilenceRisk } from "./runtime-v2-sales-loop-types";
import type { RuntimeV3CustomerSegment } from "./runtime-v3-sales-learning-types";
import type { RuntimeV5EvolvedPath } from "./runtime-v5-strategy-types";

function textFrom(signals?: RuntimeV2DealSignal[] | null, segment?: string | null) {
  return [segment, ...(signals ?? []).flatMap((signal) => [signal.key, signal.label, signal.evidence])].filter(Boolean).join(" ").toLowerCase();
}

export function evolveCustomerPath(input: {
  customerSegment?: RuntimeV3CustomerSegment | string | null;
  dealSignals?: RuntimeV2DealSignal[] | null;
  silenceRisk?: RuntimeV2SilenceRisk | null;
}): RuntimeV5EvolvedPath {
  const haystack = textFrom(input.dealSignals, input.customerSegment);

  if (input.silenceRisk?.silenceRisk === "high" || /沉默|不回复|silent/.test(haystack)) {
    return {
      recommendedPath: "低压力提醒 → 给客户选择权 → 温和收口",
      whyThisPath: "客户存在沉默风险，继续催促会降低信任。",
      nextStep: "发一条轻提醒，允许客户暂时不决定。",
      stopCondition: "客户明确拒绝、要求停止或连续多次无回应。",
    };
  }

  if (/33|77|周期|cycle|选择/.test(haystack)) {
    return {
      recommendedPath: "确认基础信息 → 33/77 判断 → 给出适配建议",
      whyThisPath: "周期选择需要先看目标、基础和执行强度。",
      nextStep: "先问客户当前目标、基础情况和能坚持的节奏。",
      stopCondition: "客户要求绝对保证结果时，先回到边界说明。",
    };
  }

  if (/贵|价格|预算|price|cost/.test(haystack)) {
    return {
      recommendedPath: "价值解释 → 适合度判断 → 轻量决策",
      whyThisPath: "价格顾虑不能直接用降价处理，先要让客户理解适配价值。",
      nextStep: "先解释价值组成，再问客户最担心的是价格还是效果。",
      stopCondition: "客户只比较最低价且拒绝了解价值。",
    };
  }

  if (/效果|怀疑|担心|doubt|考虑/.test(haystack)) {
    return {
      recommendedPath: "真实预期 → 执行条件 → 复盘机制",
      whyThisPath: "效果怀疑需要降低承诺、明确执行条件。",
      nextStep: "先确认客户想改善什么，再说明需要配合的执行条件。",
      stopCondition: "客户要求不执行也要保证效果。",
    };
  }

  if (input.customerSegment === "high_intent_lead") {
    return {
      recommendedPath: "确认基础 → 推荐周期 → 提醒注意事项",
      whyThisPath: "客户意向较高，适合推进到具体基础信息确认。",
      nextStep: "请客户补充当前目标和基础情况，再给下一步建议。",
      stopCondition: "客户对效果边界仍不清楚时，先不要直接成交。",
    };
  }

  return {
    recommendedPath: "确认真实目标 → 补充价值依据 → 给出下一步",
    whyThisPath: "当前信号还不够明确，先稳住沟通质量。",
    nextStep: "用一个问题确认客户当前最想解决的点。",
    stopCondition: "客户明确拒绝或不愿继续沟通。",
  };
}
