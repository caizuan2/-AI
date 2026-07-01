import type {
  RuntimeV2DealProbability,
  RuntimeV2DealSignal,
  RuntimeV2SalesCustomerStage,
} from "./runtime-v2-sales-loop-types";
import type { RuntimeV2Input, RuntimeV2MemoryTraceItem, RuntimeV2Source } from "./runtime-v2-types";

export interface RuntimeV2DealProbabilityInput {
  scope: RuntimeV2Input;
  customerStage?: RuntimeV2SalesCustomerStage | string | null;
  dealSignals?: RuntimeV2DealSignal[] | null;
  salesIntent?: string | null;
  memoryTrace?: RuntimeV2MemoryTraceItem[] | null;
  sources?: RuntimeV2Source[] | null;
}

function readConversationText(input: RuntimeV2Input) {
  return [
    input.query,
    ...(input.messages ?? []).slice(-6).map((message) => message.content),
  ].join("\n");
}

function hasSignal(signals: RuntimeV2DealSignal[] | null | undefined, key: string) {
  return Boolean(signals?.some((signal) => signal.key === key));
}

function hasAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}

export function scoreDealProbability(input: RuntimeV2DealProbabilityInput): RuntimeV2DealProbability {
  const text = readConversationText(input.scope);
  const signals = input.dealSignals ?? [];
  const sources = input.sources ?? [];
  const positiveSignals: string[] = [];
  const negativeSignals: string[] = [];
  const reasons: string[] = [];
  let score = 0.44;

  if (sources.length > 0) {
    score += 0.08;
    positiveSignals.push("当前问题已有小董AI大脑资料可承接。");
  }

  if (input.memoryTrace?.some((item) => item.applied)) {
    score += 0.04;
    positiveSignals.push("已结合历史记忆或投喂资料。");
  }

  if (input.customerStage === "ready_to_decide") {
    score += 0.2;
    positiveSignals.push("客户已经接近下一步动作。");
  }

  if (input.customerStage === "interested" || input.customerStage === "after_start") {
    score += 0.09;
    positiveSignals.push("客户仍在持续了解或反馈。");
  }

  if (hasSignal(signals, "ready_signal") || hasAny(text, [/怎么开始|怎么买|报名|下单|现在做|马上|怎么付/])) {
    score += 0.22;
    positiveSignals.push("客户正在询问开始方式或下一步。");
  }

  if (hasSignal(signals, "asking_cycle") || hasAny(text, [/33\s*循环|77\s*循环|怎么选|哪个(?:更)?适合|周期/])) {
    score += 0.16;
    positiveSignals.push("客户在比较 33/77 或方案周期。");
  }

  if (hasSignal(signals, "asking_usage") || hasAny(text, [/KKS|怎么用|如何使用|用法|流程|步骤|安排/i])) {
    score += 0.12;
    positiveSignals.push("客户在询问使用方式。");
  }

  if (hasSignal(signals, "after_start_feedback")) {
    score += 0.08;
    positiveSignals.push("客户已有执行或反馈信息。");
  }

  if (hasSignal(signals, "delaying") || hasAny(text, [/考虑考虑|再看看|想一想|等等|回头再说|还没决定/])) {
    score -= 0.12;
    negativeSignals.push("客户在延后决策，需要先找到真实卡点。");
  }

  if (hasSignal(signals, "asking_price") || hasAny(text, [/太贵|觉得贵|价格|多少钱|预算|优惠|便宜|划算/])) {
    score -= 0.06;
    negativeSignals.push("客户对价格或预算敏感。");
  }

  if (hasSignal(signals, "asking_effect") || hasAny(text, [/担心没效果|怕没效果|有没有用|真的有效|靠谱不/])) {
    score -= 0.04;
    negativeSignals.push("客户仍需要效果边界和信任依据。");
  }

  if (hasSignal(signals, "silent") || input.customerStage === "inactive" || hasAny(text, [/不回|没回复|沉默|失联|以后再说/])) {
    score -= 0.18;
    negativeSignals.push("客户响应意愿偏弱，不能连续追问。");
  }

  score = clamp01(score);
  const probability = score >= 0.72 ? "high" : score >= 0.45 ? "medium" : "low";

  if (probability === "high") {
    reasons.push("客户已经出现明确下一步或方案判断信号。");
  } else if (probability === "medium") {
    reasons.push("客户有兴趣，但仍需要补充信任、基础信息或选择依据。");
  } else {
    reasons.push("客户意向偏弱或信息不足，适合先低压力澄清。");
  }

  return {
    probability,
    score,
    reasons: Array.from(new Set([...reasons, ...positiveSignals.slice(0, 2), ...negativeSignals.slice(0, 2)])).slice(0, 5),
    positiveSignals: Array.from(new Set(positiveSignals)).slice(0, 4),
    negativeSignals: Array.from(new Set(negativeSignals)).slice(0, 4),
    recommendedFocus: probability === "high"
      ? "收敛到开始前的基础信息和下一步安排。"
      : probability === "medium"
        ? "先确认客户最卡的一个点，再给轻量选择。"
        : "先降压，不逼单，只问一个容易回答的问题。",
  };
}
