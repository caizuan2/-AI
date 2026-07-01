import type {
  RuntimeV2DealProbability,
  RuntimeV2StopPushPolicy,
  RuntimeV2SilenceRisk,
} from "./runtime-v2-sales-loop-types";
import type { RuntimeV2Input } from "./runtime-v2-types";

export interface RuntimeV2StopPushPolicyInput {
  scope: RuntimeV2Input;
  dealProbability?: RuntimeV2DealProbability | null;
  silenceRisk?: RuntimeV2SilenceRisk | null;
}

function readConversationText(input: RuntimeV2Input) {
  return [
    input.query,
    ...(input.messages ?? []).slice(-6).map((message) => message.content),
  ].join("\n");
}

export function buildStopPushRules(input: RuntimeV2StopPushPolicyInput): RuntimeV2StopPushPolicy {
  const text = readConversationText(input.scope);
  const rules = [
    "客户明确拒绝时停止推进。",
    "客户表达反感或压力时停止追问。",
    "客户连续不回复时使用低压力收口。",
    "涉及医疗判断或不适合继续建议时，引导客户咨询专业人士。",
    "客户只想了解资料时，只提供信息，不继续成交推进。",
  ];
  const explicitStop = /不用了|不需要|别发了|不要再|以后再说|没兴趣|算了/.test(text);
  const noReplyStop = /连续不回|连续不回复|一直不回|一直没回复|不回|没回复|沉默|失联/.test(text);
  const medicalBoundary = /医生|疾病|治疗|用药|孕|哺乳|严重不适|禁忌/.test(text);
  const highSilenceRisk = input.silenceRisk?.silenceRisk === "high";
  const lowProbability = input.dealProbability?.probability === "low";
  const shouldStop = explicitStop || noReplyStop || medicalBoundary || (highSilenceRisk && lowProbability);

  return {
    shouldStop,
    stopRules: shouldStop ? rules : rules.slice(0, 3),
    respectfulCloseMessage: shouldStop
      ? "没关系，你先不用急着定。如果后面想继续了解，直接回我你最在意的一个点就行。"
      : "我先不催你决定，先帮你把当前最关键的一点判断清楚。",
  };
}
