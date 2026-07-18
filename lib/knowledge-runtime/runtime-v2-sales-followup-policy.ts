import type { RuntimeV2SalesIntentProfile } from "./runtime-v2-sales-intent-classifier";
import type { RuntimeV2Input } from "./runtime-v2-types";

export function buildRuntimeV2SalesFollowupPlan(input: RuntimeV2Input, profile: RuntimeV2SalesIntentProfile) {
  if (profile.salesIntent === "considering") {
    return {
      followupGoal: "找出客户真正犹豫点",
      nextQuestion: "您现在最担心的是价格、效果，还是时间安排？",
      nextMessage: "您不用现在马上定，我先帮您把最担心的点讲清楚，您再判断会更稳。",
      followupTiming: "客户回复顾虑后再补充资料或案例，不要连续追问。",
    };
  }

  if (profile.salesIntent === "price_objection") {
    return {
      followupGoal: "把价格问题转成价值和适配判断",
      nextQuestion: "您主要是预算有压力，还是担心花了钱不适合自己？",
      nextMessage: "我先帮您把适不适合讲清楚，再看是否值得继续，不急着让您定。",
      followupTiming: "先确认预算顾虑，再给对比或方案边界。",
    };
  }

  if (profile.salesIntent === "cycle_choice") {
    return {
      followupGoal: "收集 33/77 决策信息",
      nextQuestion: "您现在目标、作息饮食和过去执行情况大概是怎样的？",
      nextMessage: "我先按您的基础判断从轻启动还是完整周期开始，这样比直接选更稳。",
      followupTiming: "拿到基础信息后再给明确周期建议。",
    };
  }

  return {
    followupGoal: "让客户补充一个关键信息",
    nextQuestion: "您现在最想先解决哪一个点？",
    nextMessage: "您先回我一个最在意的点，我再把话术和下一步整理给您。",
    followupTiming: "先等客户补充，再输出更具体方案。",
  };
}
