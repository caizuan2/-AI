import type {
  RuntimeV2DealSignal,
  RuntimeV2SalesCustomerStage,
  RuntimeV2SilenceRisk,
  RuntimeV2SilenceRiskType,
} from "./runtime-v2-sales-loop-types";
import type { RuntimeV2Input, RuntimeV2MemoryTraceItem, RuntimeV2Source } from "./runtime-v2-types";

export interface RuntimeV2SilenceRiskInput {
  scope: RuntimeV2Input;
  customerStage?: RuntimeV2SalesCustomerStage | string | null;
  dealSignals?: RuntimeV2DealSignal[] | null;
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

function resolveRiskType(input: {
  text: string;
  signals: RuntimeV2DealSignal[];
  customerStage?: string | null;
}): RuntimeV2SilenceRiskType {
  if (hasSignal(input.signals, "asking_price") || /太贵|价格|预算|便宜|优惠/.test(input.text)) {
    return "price_pressure";
  }

  if (hasSignal(input.signals, "asking_effect") || /没效果|有没有用|有效|靠谱不|担心/.test(input.text)) {
    return "effect_doubt";
  }

  if (/考虑考虑|再看看|想一想|等等|回头再说/.test(input.text) || input.customerStage === "hesitating") {
    return "decision_fatigue";
  }

  if (input.customerStage === "inactive" || /不回|没回复|沉默|失联/.test(input.text)) {
    return "low_interest";
  }

  if (input.signals.length === 0) {
    return "information_gap";
  }

  return "trust_gap";
}

export function detectSilenceRisk(input: RuntimeV2SilenceRiskInput): RuntimeV2SilenceRisk {
  const text = readConversationText(input.scope);
  const signals = input.dealSignals ?? [];
  const reasons: string[] = [];
  const explicitNoReply = hasSignal(signals, "silent") ||
    input.customerStage === "inactive" ||
    hasAny(text, [/连续不回|连续不回复|一直不回|一直没回复|不回|没回复|沉默|失联|以后再说/]);
  let score = 0.28;

  if (hasAny(text, [/考虑考虑|再看看|想一想|等等|回头再说|还没决定/])) {
    score += 0.3;
    reasons.push("客户在延后决策，但还没有说清具体卡点。");
  }

  if (hasSignal(signals, "asking_price") || hasAny(text, [/太贵|价格|预算|便宜|优惠|划算/])) {
    score += 0.18;
    reasons.push("客户存在价格压力，需要先解释价值和适配边界。");
  }

  if (hasSignal(signals, "asking_effect") || hasAny(text, [/没效果|有没有用|真的有效|担心|靠谱不/])) {
    score += 0.18;
    reasons.push("客户对效果信任不足，不能直接承诺结果。");
  }

  if (explicitNoReply) {
    score += 0.45;
    reasons.push("客户响应意愿变弱，继续追问容易造成压力。");
  }

  if (hasSignal(signals, "asking_cycle") || hasAny(text, [/33\s*循环|77\s*循环|怎么选|周期/])) {
    score += 0.08;
    reasons.push("客户在选择路径上还有不确定，需要降低选择成本。");
  }

  if ((input.sources?.length ?? 0) > 0 || input.memoryTrace?.some((item) => item.applied)) {
    score -= 0.08;
  }

  if (
    input.customerStage === "ready_to_decide" ||
    hasSignal(signals, "ready_signal") ||
    hasAny(text, [/怎么开始|怎么买|报名|下单|现在做|马上|怎么付/])
  ) {
    score -= 0.22;
    reasons.push("客户已经在问下一步，沉默风险相对较低。");
  }

  if (input.customerStage === "after_start" || hasSignal(signals, "after_start_feedback")) {
    score -= 0.1;
    reasons.push("客户已有执行反馈，更适合复盘而不是催促。");
  }

  const normalizedScore = explicitNoReply ? Math.max(0.72, Math.min(1, score)) : Math.max(0, Math.min(1, score));
  const silenceRisk = normalizedScore >= 0.68 ? "high" : normalizedScore >= 0.42 ? "medium" : "low";
  const riskType = resolveRiskType({ text, signals, customerStage: input.customerStage });

  if (reasons.length === 0) {
    reasons.push("当前信息还不完整，先用低压力问题承接。");
  }

  const recoveryStrategy =
    silenceRisk === "high"
      ? "先停止连续推进，用一句低压力收口话术让客户只回复一个最在意的点。"
      : silenceRisk === "medium"
        ? "先确认客户最卡的一个点，再给轻量选择，避免一次讲太多。"
        : "可以继续承接下一步，但仍要先问基础信息，不要直接催单。";

  return {
    silenceRisk,
    reasons: Array.from(new Set(reasons)).slice(0, 4),
    riskType,
    recoveryStrategy,
  };
}
