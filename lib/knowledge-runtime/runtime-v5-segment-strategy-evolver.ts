import type { RuntimeV3CustomerSegment } from "./runtime-v3-sales-learning-types";
import type { RuntimeV5SegmentStrategy } from "./runtime-v5-strategy-types";

const SEGMENT_POLICIES: Record<string, Omit<RuntimeV5SegmentStrategy, "segment">> = {
  new_lead: {
    recommendedStyle: "先教育，再确认需求",
    nextAction: "用一个简单问题确认客户目标。",
    avoidStrategy: "不要直接推周期或价格。",
    bestPath: "基础解释 → 目标确认 → 轻建议",
    reason: "新客户还没有建立共同语境，直接成交会显得突兀。",
  },
  curious_lead: {
    recommendedStyle: "价值解释 + 轻问诊",
    nextAction: "确认客户为什么关注这个问题。",
    avoidStrategy: "不要一次给太复杂方案。",
    bestPath: "兴趣点 → 背景 → 下一步",
    reason: "好奇客户需要把兴趣转成具体场景。",
  },
  warm_lead: {
    recommendedStyle: "对比分析 + 适配建议",
    nextAction: "给出两个判断条件，让客户参与选择。",
    avoidStrategy: "不要过早强成交。",
    bestPath: "真实卡点 → 条件判断 → 推荐方向",
    reason: "温热客户适合进入决策辅助阶段。",
  },
  hesitating_lead: {
    recommendedStyle: "共情异议 + 拆卡点",
    nextAction: "问客户最犹豫的是价格、效果还是执行。",
    avoidStrategy: "不要用压迫式限时话术。",
    bestPath: "接住顾虑 → 找卡点 → 轻下一步",
    reason: "犹豫客户需要先降低心理压力。",
  },
  price_sensitive_lead: {
    recommendedStyle: "价值解释",
    nextAction: "先讲价值组成，再问预算压力点。",
    avoidStrategy: "不要直接降价。",
    bestPath: "价值 → 适配 → 决策",
    reason: "价格问题本质上通常是价值和适配没有讲清。",
  },
  effect_doubt: {
    recommendedStyle: "真实预期 + 执行条件",
    nextAction: "说明不能保证结果，但可以先判断适不适合。",
    avoidStrategy: "不要承诺效果。",
    bestPath: "预期 → 条件 → 复盘",
    reason: "效果怀疑要用边界感建立信任。",
  },
  high_intent_lead: {
    recommendedStyle: "低压力成交",
    nextAction: "确认基础信息后给下一步安排。",
    avoidStrategy: "不要跳过适配判断。",
    bestPath: "确认基础 → 推荐周期 → 注意事项",
    reason: "高意向适合推进，但仍要避免强逼单。",
  },
  started_customer: {
    recommendedStyle: "执行陪跑",
    nextAction: "先收集执行记录，再给复盘建议。",
    avoidStrategy: "不要只讲概念。",
    bestPath: "执行情况 → 复盘 → 调整",
    reason: "已开始客户最需要具体执行支持。",
  },
  silent_risk: {
    recommendedStyle: "低打扰唤回",
    nextAction: "发一条轻提醒，并保留退出空间。",
    avoidStrategy: "不要连续催促。",
    bestPath: "轻提醒 → 选择权 → 收口",
    reason: "沉默风险下信任边界比推进更重要。",
  },
  lost_or_stop: {
    recommendedStyle: "尊重停止",
    nextAction: "表达理解，不继续追问。",
    avoidStrategy: "不要继续推销。",
    bestPath: "理解 → 停止 → 留入口",
    reason: "明确拒绝时继续推进会伤害品牌信任。",
  },
};

export function evolveSegmentStrategy(input: {
  customerSegment?: RuntimeV3CustomerSegment | string | null;
}): RuntimeV5SegmentStrategy {
  const segment = input.customerSegment ?? "unknown";
  const policy = SEGMENT_POLICIES[String(segment)] ?? {
    recommendedStyle: "确认目标 + 轻建议",
    nextAction: "先问客户当前最想解决的问题。",
    avoidStrategy: "不要强行成交。",
    bestPath: "目标确认 → 背景补充 → 下一步",
    reason: "客户分层不明确时，先用稳妥低压力策略。",
  };

  return {
    segment,
    ...policy,
  };
}
