import type {
  RuntimeV3CustomerSegment,
  RuntimeV3NextBestAction,
} from "./runtime-v3-sales-learning-types";

export function buildNextBestAction(input: {
  customerSegment: RuntimeV3CustomerSegment;
  query: string;
}) : RuntimeV3NextBestAction {
  switch (input.customerSegment) {
    case "high_intent_lead":
      return {
        action: "ask_clarifying_question",
        question: "您现在的目标、作息饮食和过去尝试情况分别是什么？",
        message: "先确认基础信息，再判断从哪一步开始更稳。",
        timing: "现在就问，客户正在主动询问开始方式。",
      };
    case "price_sensitive_lead":
      return {
        action: "send_value_explanation",
        question: "您最在意的是预算，还是担心投入后没有变化？",
        message: "先解释价值和适配度，不直接降价，也不催单。",
        timing: "客户提到价格时立即降低决策压力。",
      };
    case "effect_doubt":
      return {
        action: "send_trust_building_script",
        question: "您最担心的是坚持不了，还是担心看不到变化？",
        message: "先做真实预期管理，明确不保证效果，再看基础情况。",
        timing: "客户提出效果顾虑时使用。",
      };
    case "hesitating_lead":
      return {
        action: "ask_clarifying_question",
        question: "您现在主要是在考虑价格、效果，还是不知道怎么开始？",
        message: "先问真实顾虑，再给对应回复，不急着推进成交。",
        timing: "客户说考虑考虑后的第一轮跟进。",
        stopIf: "客户明确拒绝或连续不回复时停止推进。",
      };
    case "silent_risk":
      return {
        action: "wait_for_customer",
        question: "如果您后面还想了解，可以直接告诉我最卡住的一点。",
        message: "先不继续催促，保留低压力回复入口。",
        timing: "等待 24-48 小时，不连续追问。",
        stopIf: "客户仍无回应或表达拒绝。",
      };
    case "lost_or_stop":
      return {
        action: "stop_followup",
        question: "无需继续追问。",
        message: "尊重客户决定，停止推进。",
        timing: "立即停止。",
        stopIf: "已停止推进。",
      };
    case "started_customer":
      return {
        action: "send_trust_building_script",
        question: "您这几天执行最卡的是哪一步？",
        message: "先复盘执行，不新增销售压力。",
        timing: "客户已开始后优先复盘执行。",
      };
    default:
      return {
        action: "send_decision_guide",
        question: "您现在最想解决的是目标、方法，还是执行难点？",
        message: "先确认真实需求，再给下一步建议。",
        timing: "客户还在了解时使用。",
      };
  }
}
