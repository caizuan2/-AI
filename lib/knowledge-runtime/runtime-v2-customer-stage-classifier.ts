import type { RuntimeV2DealSignal, RuntimeV2SalesCustomerStage } from "./runtime-v2-sales-loop-types";
import type { RuntimeV2Input, RuntimeV2Source } from "./runtime-v2-types";

export interface RuntimeV2CustomerStageResult {
  stage: RuntimeV2SalesCustomerStage;
  reason: string;
}

function hasSignal(signals: RuntimeV2DealSignal[], key: string) {
  return signals.some((signal) => signal.key === key);
}

export function classifyRuntimeV2CustomerStage(input: {
  scope: RuntimeV2Input;
  dealSignals: RuntimeV2DealSignal[];
  sources?: RuntimeV2Source[];
}): RuntimeV2CustomerStageResult {
  const { dealSignals, sources = [] } = input;
  const hasKnowledge = sources.length > 0 || Boolean(input.scope.kbId || input.scope.knowledgeBaseId || input.scope.agentId || input.scope.expertId);

  if (hasSignal(dealSignals, "ready_signal")) {
    return { stage: "ready_to_decide", reason: "客户已经询问报名、购买或开始动作。" };
  }

  if (hasSignal(dealSignals, "asking_price")) {
    return { stage: "price_sensitive", reason: "客户当前主要卡在价格或预算判断。" };
  }

  if (hasSignal(dealSignals, "asking_effect") || hasSignal(dealSignals, "asking_safety")) {
    return { stage: "effect_doubt", reason: "客户需要效果、安全或信任依据。" };
  }

  if (hasSignal(dealSignals, "asking_cycle")) {
    return { stage: "ready_to_decide", reason: "客户正在比较方案，已经进入决策前阶段。" };
  }

  if (hasSignal(dealSignals, "delaying")) {
    return { stage: "hesitating", reason: "客户没有拒绝，但正在延迟决策。" };
  }

  if (hasSignal(dealSignals, "after_start_feedback")) {
    return { stage: "after_start", reason: "客户正在反馈使用或执行后的状态。" };
  }

  if (hasSignal(dealSignals, "silent")) {
    return { stage: "inactive", reason: "客户响应弱，需要低频轻触达。" };
  }

  if (hasSignal(dealSignals, "asking_usage")) {
    return { stage: "interested", reason: "客户已经开始询问使用路径。" };
  }

  if (hasKnowledge) {
    return { stage: "curious", reason: "当前问题可由知识库承接，客户处于了解阶段。" };
  }

  return { stage: "cold", reason: "客户意图尚未收敛，需要先确认问题。" };
}
