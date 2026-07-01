import type {
  RuntimeV2ClosingPath,
  RuntimeV2DealSignal,
  RuntimeV2SalesCustomerStage,
} from "./runtime-v2-sales-loop-types";

function hasSignal(signals: RuntimeV2DealSignal[], key: string) {
  return signals.some((signal) => signal.key === key);
}

export function buildRuntimeV2ClosingPath(input: {
  customerStage: RuntimeV2SalesCustomerStage;
  dealSignals: RuntimeV2DealSignal[];
  nextQuestion: string;
}): RuntimeV2ClosingPath {
  const { customerStage, dealSignals, nextQuestion } = input;

  if (customerStage === "price_sensitive") {
    return {
      currentGoal: "先拆清价格背后的真实顾虑",
      decisionPath: ["确认预算压力还是适配担忧", "用资料说明价值边界", "让客户选择是否继续了解方案"],
      recommendedClose: `先问：${nextQuestion}`,
      avoidActions: ["不要直接降价", "不要催促下单", "不要承诺绝对效果"],
    };
  }

  if (customerStage === "effect_doubt") {
    return {
      currentGoal: "先建立可信边界，再进入方案判断",
      decisionPath: ["确认客户担心的具体点", "给出资料或案例的适用范围", "让客户补充自身基础"],
      recommendedClose: `先问：${nextQuestion}`,
      avoidActions: ["不要保证效果", "不要夸大案例", "不要忽略个体差异"],
    };
  }

  if (hasSignal(dealSignals, "asking_cycle")) {
    return {
      currentGoal: "把 33/77 的选择转成适配判断",
      decisionPath: ["收集目标和基础", "判断轻启动还是完整周期", "给出低压力下一步"],
      recommendedClose: `先问：${nextQuestion}`,
      avoidActions: ["不要直接替客户拍板", "不要把周期说成越长越好", "不要跳过基础信息"],
    };
  }

  if (customerStage === "ready_to_decide") {
    return {
      currentGoal: "让客户做一个低压力的小决定",
      decisionPath: ["确认当前目标", "给两个可选路径", "让客户选择先轻启动或完整安排"],
      recommendedClose: `先问：${nextQuestion}`,
      avoidActions: ["不要强逼成交", "不要一次塞太多方案", "不要制造焦虑"],
    };
  }

  return {
    currentGoal: "先收敛客户真实问题",
    decisionPath: ["确认最关心的一点", "补充适配资料", "再给下一步建议"],
    recommendedClose: `先问：${nextQuestion}`,
    avoidActions: ["不要连续追问", "不要输出过度承诺", "不要在信息不足时给绝对结论"],
  };
}
