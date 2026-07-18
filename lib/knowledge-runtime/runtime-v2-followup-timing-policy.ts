import type {
  RuntimeV2DealProbability,
  RuntimeV2FollowupTiming,
  RuntimeV2SilenceRisk,
} from "./runtime-v2-sales-loop-types";
import type { RuntimeV2Input } from "./runtime-v2-types";

export interface RuntimeV2FollowupTimingInput {
  scope: RuntimeV2Input;
  dealProbability?: RuntimeV2DealProbability | null;
  silenceRisk?: RuntimeV2SilenceRisk | null;
}

function readConversationText(input: RuntimeV2Input) {
  return [
    input.query,
    ...(input.messages ?? []).slice(-4).map((message) => message.content),
  ].join("\n");
}

export function buildFollowupTiming(input: RuntimeV2FollowupTimingInput): RuntimeV2FollowupTiming {
  const text = readConversationText(input.scope);
  const highRisk = input.silenceRisk?.silenceRisk === "high";
  const ready = input.dealProbability?.probability === "high" || /怎么开始|怎么买|现在|下单|报名/.test(text);
  const priceOrEffect =
    input.silenceRisk?.riskType === "price_pressure" ||
    input.silenceRisk?.riskType === "effect_doubt";

  if (highRisk) {
    return {
      immediate: "当下先降低压力，只问客户最在意的一个点。",
      later: "稍后如果客户主动回复，再根据他的顾虑补一句解释。",
      finalClose: "如果客户连续不回复，就礼貌收口，不继续追问。",
      waitRecommendation: "不要连续催促，等客户给出明确反馈后再进入下一步。",
    };
  }

  if (ready) {
    return {
      immediate: "当下先确认开始前的基础信息和目标。",
      later: "下次客户回复时，再给一个简短的开始安排。",
      finalClose: "如果客户临时犹豫，就回到基础信息和顾虑确认，不强推。",
      waitRecommendation: "可以推进，但每次只推进一个动作。",
    };
  }

  if (priceOrEffect) {
    return {
      immediate: "当下先解释价值边界或效果边界，不直接催成交。",
      later: "稍后客户继续问时，再补一个与他情况相关的依据。",
      finalClose: "如果客户仍拒绝，就保留后续咨询入口即可。",
      waitRecommendation: "先建立信任，再判断是否需要下一步。",
    };
  }

  return {
    immediate: "当下先确认客户真实卡点。",
    later: "下次客户回复时，再给轻量建议或二选一问题。",
    finalClose: "如果客户没有继续意愿，就停止推进。",
    waitRecommendation: "保持低压力承接，不制造紧迫感。",
  };
}
