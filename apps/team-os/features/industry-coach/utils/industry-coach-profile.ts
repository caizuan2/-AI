export const INDUSTRY_COACH_PROFILE = [
  {
    key: "ice_breaking",
    label: "破冰能力",
    maxScore: 20,
    criteria: ["是否建立关系", "是否了解客户背景"]
  },
  {
    key: "needs_discovery",
    label: "需求挖掘",
    maxScore: 20,
    criteria: ["是否找到客户痛点", "是否提出有效问题"]
  },
  {
    key: "product_presentation",
    label: "产品价值传递",
    maxScore: 20,
    criteria: ["是否结合客户需求介绍产品价值"]
  },
  {
    key: "objection_handling",
    label: "异议处理",
    maxScore: 20,
    criteria: ["是否正确处理价格、效果和信任问题"]
  },
  {
    key: "closing_progress",
    label: "成交推进",
    maxScore: 20,
    criteria: ["是否形成明确的下一步行动"]
  }
] as const;

export type IndustryCoachProfileKey = (typeof INDUSTRY_COACH_PROFILE)[number]["key"];
