import type { RuntimeV2DealSignal, RuntimeV2SalesCustomerStage } from "./runtime-v2-sales-loop-types";
import type { RuntimeV2Input } from "./runtime-v2-types";

function includesSignal(signals: RuntimeV2DealSignal[], key: string) {
  return signals.some((signal) => signal.key === key);
}

export function buildRuntimeV2NextQuestion(input: {
  scope: RuntimeV2Input;
  customerStage: RuntimeV2SalesCustomerStage;
  dealSignals: RuntimeV2DealSignal[];
}) {
  const { customerStage, dealSignals } = input;

  if (includesSignal(dealSignals, "asking_cycle")) {
    return "您现在的目标、作息饮食和过去执行情况大概是怎样的？";
  }

  if (customerStage === "price_sensitive") {
    return "您主要是预算有压力，还是担心花了钱不适合自己？";
  }

  if (customerStage === "effect_doubt") {
    return "您最想确认的是安全性、效果周期，还是有没有相似情况可以参考？";
  }

  if (customerStage === "hesitating") {
    return "您现在最卡的是价格、效果，还是时间安排？";
  }

  if (customerStage === "ready_to_decide") {
    return "您更想先轻启动试一段，还是直接按完整周期安排？";
  }

  if (customerStage === "after_start") {
    return "您最近 3 天饮食、作息和体重记录大概怎样？";
  }

  if (customerStage === "inactive") {
    return "我先简单问一句：您现在还想继续了解，还是先暂停一下？";
  }

  if (customerStage === "curious" || customerStage === "interested") {
    return "您现在想先了解使用方式、周期安排，还是适不适合自己？";
  }

  return "您现在最想先解决哪一个点？";
}
