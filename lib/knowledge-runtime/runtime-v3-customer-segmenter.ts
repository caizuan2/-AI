import type {
  RuntimeV2DealProbability,
  RuntimeV2DealSignal,
  RuntimeV2SalesLoopPlan,
  RuntimeV2SilenceRisk,
} from "./runtime-v2-sales-loop-types";
import type { RuntimeV2MemoryTraceItem, RuntimeV2Source } from "./runtime-v2-types";
import type { RuntimeV3SegmentResult } from "./runtime-v3-sales-learning-types";

function textIncludes(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

function normalizeQuery(query: string) {
  return query.toLowerCase().replace(/\s+/g, "");
}

export function segmentCustomer(input: {
  query: string;
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
  customerStage?: string | null;
  salesLoopPlan?: RuntimeV2SalesLoopPlan | null;
  dealSignals?: RuntimeV2DealSignal[] | null;
  dealProbability?: RuntimeV2DealProbability | null;
  silenceRisk?: RuntimeV2SilenceRisk | null;
  memoryTrace?: RuntimeV2MemoryTraceItem[] | null;
  sources?: RuntimeV2Source[] | null;
}): RuntimeV3SegmentResult {
  const query = normalizeQuery(input.query);
  const userTurns = (input.messages ?? []).filter((message) => message.role === "user").length;
  const stage = input.customerStage || input.salesLoopPlan?.customerStage || "";
  const silenceRisk = input.silenceRisk?.silenceRisk;
  const riskType = input.silenceRisk?.riskType;
  const hasMemory = (input.memoryTrace?.length ?? 0) > 0 || (input.sources?.length ?? 0) > 0;

  if (textIncludes(query, [/不回复|没回|一直不理|沉默|冷淡|已读不回|不搭理/]) || silenceRisk === "high") {
    return {
      segment: "silent_risk",
      confidence: 0.86,
      reason: "客户互动降低或存在不回复风险，需要低压力跟进。",
      recommendedTone: "closing_soft",
    };
  }

  if (textIncludes(query, [/不要了|算了|不需要|拒绝|没兴趣|拉黑|别联系/])) {
    return {
      segment: "lost_or_stop",
      confidence: 0.88,
      reason: "客户已表达拒绝或停止意愿，应尊重边界。",
      recommendedTone: "closing_soft",
    };
  }

  if (textIncludes(query, [/没效果|怕没用|有没有效果|真的假的|靠谱吗|担心反弹|担心无效/]) || riskType === "effect_doubt") {
    return {
      segment: "effect_doubt",
      confidence: 0.82,
      reason: "客户核心顾虑是效果可信度，需要真实预期管理。",
      recommendedTone: "trust_building",
    };
  }

  if (textIncludes(query, [/贵|价格|多少钱|费用|太贵|便宜|优惠|划算|值不值/]) || stage === "price_sensitive") {
    return {
      segment: "price_sensitive_lead",
      confidence: 0.84,
      reason: "客户正在评估投入和价值，先解释价值，不直接降价。",
      recommendedTone: "trust_building",
    };
  }

  if (textIncludes(query, [/怎么开始|现在开始|怎么安排|适合哪个|选哪个|怎么报名|下单|购买|付款|周期怎么选/])) {
    return {
      segment: "high_intent_lead",
      confidence: 0.88,
      reason: "客户开始询问执行路径，已经接近行动决策。",
      recommendedTone: "decision_guiding",
    };
  }

  if (textIncludes(query, [/考虑考虑|想一下|再看看|纠结|犹豫|不确定|怕坚持不了/]) || stage === "hesitating") {
    return {
      segment: "hesitating_lead",
      confidence: 0.82,
      reason: "客户还没有拒绝，只是需要确认真实顾虑。",
      recommendedTone: "warm",
    };
  }

  if (textIncludes(query, [/33|77|循环|方案|流程|步骤|怎么用|如何用|细节|区别|对比/]) || userTurns >= 2 || hasMemory) {
    return {
      segment: userTurns >= 3 ? "warm_lead" : "warm_lead",
      confidence: 0.76,
      reason: "客户开始追问细节，适合给出清晰选择路径。",
      recommendedTone: "decision_guiding",
    };
  }

  if (textIncludes(query, [/是什么|介绍|了解|看看|讲讲|能不能说下/])) {
    return {
      segment: "curious_lead",
      confidence: 0.72,
      reason: "客户处于初步了解阶段，先建立理解和信任。",
      recommendedTone: "trust_building",
    };
  }

  if (stage === "after_start" || textIncludes(query, [/执行|打卡|体重|波动|坚持|复盘/])) {
    return {
      segment: "started_customer",
      confidence: 0.74,
      reason: "客户已进入执行或复盘状态，应先解决执行问题。",
      recommendedTone: "warm",
    };
  }

  return {
    segment: "new_lead",
    confidence: input.dealProbability?.score ?? 0.64,
    reason: "当前信息较少，先确认客户目标和基础情况。",
    recommendedTone: "warm",
  };
}
