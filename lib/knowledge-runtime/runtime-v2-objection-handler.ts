import { classifyRuntimeV2SalesIntent, type RuntimeV2SalesIntentProfile } from "./runtime-v2-sales-intent-classifier";
import type { RuntimeV2Input, RuntimeV2MemoryTraceItem, RuntimeV2Source } from "./runtime-v2-types";

export interface RuntimeV2ObjectionPlan {
  diagnosis: string;
  customerPsychology: string;
  responseStrategy: string;
  doNotSay: string[];
  recommendedCustomerCopy: string;
  nextAction: string;
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function firstEvidenceTitle(sources?: RuntimeV2Source[], memoryTrace?: RuntimeV2MemoryTraceItem[]) {
  return clean(sources?.[0]?.title) || clean(memoryTrace?.find((item) => item.applied)?.title);
}

export function buildObjectionHandlingPlan(input: {
  scope: RuntimeV2Input;
  salesProfile?: RuntimeV2SalesIntentProfile;
  sources?: RuntimeV2Source[];
  memoryTrace?: RuntimeV2MemoryTraceItem[];
}): RuntimeV2ObjectionPlan {
  const salesProfile = input.salesProfile ?? classifyRuntimeV2SalesIntent(input.scope, { sources: input.sources });
  const evidenceTitle = firstEvidenceTitle(input.sources, input.memoryTrace);
  const evidencePhrase = evidenceTitle ? `我会结合“${evidenceTitle}”这类资料来判断，` : "";

  if (salesProfile.salesIntent === "cycle_choice") {
    return {
      diagnosis: "客户已经进入方案选择阶段，核心不是继续解释概念，而是帮他按基础情况做决策。",
      customerPsychology: "客户怕选错周期、怕投入后不适合，所以需要清晰判断标准。",
      responseStrategy: "先把 33 和 77 的适合人群拆开，再问目标、作息和执行稳定性。",
      doNotSay: ["33一定更快", "77一定更有效", "随便选一个都行"],
      recommendedCustomerCopy: "33和77不是简单谁更快，主要看您的基础和执行稳定性。您先告诉我当前目标、作息饮食和过去是否容易反复，我再帮您判断从轻启动还是完整周期开始，这样更稳。",
      nextAction: "请客户补充目标、作息饮食、过去执行是否反复，再给 33/77 建议。",
    };
  }

  if (salesProfile.salesIntent === "price_objection") {
    return {
      diagnosis: "客户表面在问价格，真实可能是在判断值不值、适不适合、风险高不高。",
      customerPsychology: "客户需要被理解，而不是被催单或被压价。",
      responseStrategy: "先接住预算顾虑，再确认他担心的是费用压力还是效果不确定。",
      doNotSay: ["这已经很便宜了", "很多人都买了", "错过就没有了"],
      recommendedCustomerCopy: "理解的，价格确实要认真考虑。我先不催您定，想先确认一下：您主要是觉得预算有压力，还是担心不适合自己？我先把最关键的点讲清楚，您再判断是否继续，这样会更稳妥。",
      nextAction: "追问客户价格背后的真实顾虑，再按顾虑补充价值或边界。",
    };
  }

  if (salesProfile.salesIntent === "effect_doubt" || salesProfile.salesIntent === "trust_building") {
    return {
      diagnosis: "客户不是单纯要答案，而是在验证可信度和适配度。",
      customerPsychology: "客户担心承诺过度或自己执行不了，需要看到条件和边界。",
      responseStrategy: "用资料依据说明判断条件，同时明确不做绝对承诺。",
      doNotSay: ["保证有效", "一定能看到效果", "所有人都适合"],
      recommendedCustomerCopy: `${evidencePhrase}我先不跟您说绝对结果，因为每个人基础、作息和执行情况都不一样。您把当前目标和基础情况告诉我，我再帮您判断适不适合，以及从哪一步开始更稳。`,
      nextAction: "请客户补充目标和基础情况，再给适配判断。",
    };
  }

  if (salesProfile.salesIntent === "weight_fluctuation") {
    return {
      diagnosis: "客户关注健康或控体变化，需要稳定情绪并给出观察标准。",
      customerPsychology: "客户容易因为短期数字波动焦虑，需要知道看趋势而不是看单点。",
      responseStrategy: "先解释波动原因，再给 3 到 7 天观察标准，避免承诺结果。",
      doNotSay: ["一定会降", "很快就瘦", "不用管身体反馈"],
      recommendedCustomerCopy: "体重短期波动是正常的，不一定代表没有变化。水分、盐分、作息、排便和饮食节奏都会影响当天数字。我们先看 3 到 7 天趋势，再结合围度和执行情况判断，不用因为一天的数字太紧张。",
      nextAction: "让客户记录 3 到 7 天趋势和执行情况，再判断是否调整。",
    };
  }

  if (salesProfile.salesIntent === "usage_question") {
    return {
      diagnosis: "客户已经在问使用方式，说明有兴趣，但还需要明确目标和基础。",
      customerPsychology: "客户希望得到明确步骤，但直接套方案可能答偏。",
      responseStrategy: "先问目标和基础，再给更贴合的使用节奏。",
      doNotSay: ["直接照这个固定方案用", "不用看基础", "所有人一样"],
      recommendedCustomerCopy: "KKS怎么用要先看您的目标和当前基础，不建议一开始就套固定方案。您先告诉我现在主要想改善什么、饮食作息大概怎样，我再帮您判断从哪个节奏开始更稳。",
      nextAction: "请客户补充目标、饮食作息和当前基础，再安排节奏。",
    };
  }

  if (salesProfile.salesIntent === "considering") {
    return {
      diagnosis: "客户说考虑考虑，不等于拒绝，通常是还有一个顾虑没被讲清楚。",
      customerPsychology: "客户需要低压力空间，同时希望被理解。",
      responseStrategy: "先认可，再用单一问题锁定顾虑，最后给继续沟通入口。",
      doNotSay: ["那您尽快决定", "现在不定就没有了", "不用考虑"],
      recommendedCustomerCopy: "可以的，您考虑一下很正常，我也不想让您仓促决定。您现在主要是担心价格、效果，还是时间安排不太确定？您告诉我一个最在意的点，我先帮您讲清楚，您再判断也不迟。",
      nextAction: "让客户只回复一个最在意的点，避免一次性追问太多。",
    };
  }

  return {
    diagnosis: "当前问题需要先明确客户真实目标，再给出能继续沟通的动作。",
    customerPsychology: "客户通常更愿意回应具体问题，而不是空泛方案。",
    responseStrategy: "先给判断，再给低压力追问，最后推进下一步。",
    doNotSay: ["直接催单", "夸大承诺", "一次性问太多"],
    recommendedCustomerCopy: "我先帮您把问题拆清楚：您现在最想解决的是思路、执行步骤，还是给客户回复？您告诉我一个重点，我再给您一版更具体、可以直接使用的建议。",
    nextAction: "请客户补充最想解决的一个重点，再输出具体话术。",
  };
}
