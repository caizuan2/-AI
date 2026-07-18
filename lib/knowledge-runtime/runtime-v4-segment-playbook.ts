import type { RuntimeV3CustomerSegment } from "./runtime-v3-sales-learning-types";
import type { RuntimeV4SegmentPlaybook } from "./runtime-v4-growth-types";

const PLAYBOOKS: Record<string, RuntimeV4SegmentPlaybook> = {
  new_lead: {
    customerSegment: "new_lead",
    bestTone: "warm",
    bestNextAction: "先建立信任，再用一个轻问题确认需求。",
    recommendedScriptStyle: "短句、低压力、先问现状。",
    avoidStrategy: "不要直接催成交或丢复杂方案。",
    reason: "新线索需要降低理解成本，先让客户愿意继续聊。",
  },
  curious_lead: {
    customerSegment: "curious_lead",
    bestTone: "warm",
    bestNextAction: "先回答客户关心点，再用一个问题承接下一步。",
    recommendedScriptStyle: "解释清楚 + 轻量追问。",
    avoidStrategy: "不要马上成交压迫，也不要给太长说明。",
    reason: "好奇客户需要被快速理解，再逐步拉到真实需求。",
  },
  warm_lead: {
    customerSegment: "warm_lead",
    bestTone: "decision_guiding",
    bestNextAction: "把客户现状和可执行动作连起来。",
    recommendedScriptStyle: "判断 + 两三步行动建议 + 下一步确认。",
    avoidStrategy: "不要只讲知识点，避免缺少推进。",
    reason: "温线索已经愿意听方案，重点是让下一步更具体。",
  },
  hesitating_lead: {
    customerSegment: "hesitating_lead",
    bestTone: "trust_building",
    bestNextAction: "先拆掉顾虑，再给低风险尝试动作。",
    recommendedScriptStyle: "共情 + 案例/依据 + 低压力推进。",
    avoidStrategy: "不要强压成交或否定客户顾虑。",
    reason: "犹豫客户需要安全感和确定性，而不是被催。",
  },
  price_sensitive_lead: {
    customerSegment: "price_sensitive_lead",
    bestTone: "trust_building",
    bestNextAction: "先讲价值边界，再问客户最在意哪一块。",
    recommendedScriptStyle: "价值解释 + 具体场景 + 不直接降价。",
    avoidStrategy: "不要一上来打折，不制造焦虑。",
    reason: "价格敏感用户需要看见价值依据，而不是被催着付款。",
  },
  effect_doubt: {
    customerSegment: "effect_doubt",
    bestTone: "trust_building",
    bestNextAction: "补充使用边界和真实依据，再问客户担心哪一点。",
    recommendedScriptStyle: "边界说明 + 依据 + 问顾虑。",
    avoidStrategy: "不要承诺效果，不要说绝对化结果。",
    reason: "效果质疑需要先建立可信边界，避免夸大承诺。",
  },
  high_intent_lead: {
    customerSegment: "high_intent_lead",
    bestTone: "closing_soft",
    bestNextAction: "确认基础信息，给出下一步可执行动作。",
    recommendedScriptStyle: "明确、简短、有下一步。",
    avoidStrategy: "不要继续绕圈解释，避免错过成交窗口。",
    reason: "高意向用户已经接近行动，应减少犹豫成本。",
  },
  started_customer: {
    customerSegment: "started_customer",
    bestTone: "decision_guiding",
    bestNextAction: "围绕使用反馈调整下一步，不重新推销。",
    recommendedScriptStyle: "复盘现状 + 调整动作 + 继续跟进。",
    avoidStrategy: "不要重复基础销售话术。",
    reason: "已开始客户需要运营式跟进，而不是重新成交。",
  },
  silent_risk: {
    customerSegment: "silent_risk",
    bestTone: "warm",
    bestNextAction: "降低频率，给客户留选择，不追问压迫。",
    recommendedScriptStyle: "温和收口 + 一句可回。",
    avoidStrategy: "不要连续轰炸，不用恐吓或焦虑表达。",
    reason: "沉默风险场景继续强推会提高流失概率。",
  },
  lost_or_stop: {
    customerSegment: "lost_or_stop",
    bestTone: "warm",
    bestNextAction: "停止推进，保留后续沟通空间。",
    recommendedScriptStyle: "礼貌结束 + 可再次咨询。",
    avoidStrategy: "不要继续成交追击。",
    reason: "客户已明确拒绝或停止，尊重边界优先。",
  },
};

export function buildRuntimeV4SegmentPlaybook(segment?: RuntimeV3CustomerSegment | string): RuntimeV4SegmentPlaybook[] {
  const current = segment && PLAYBOOKS[segment] ? PLAYBOOKS[segment] : PLAYBOOKS.new_lead;
  const defaults = [PLAYBOOKS.price_sensitive_lead, PLAYBOOKS.high_intent_lead, PLAYBOOKS.silent_risk]
    .filter((item) => item.customerSegment !== current.customerSegment);

  return [current, ...defaults].slice(0, 3);
}
