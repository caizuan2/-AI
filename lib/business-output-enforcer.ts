export const BUSINESS_OUTPUT_ENFORCER_VERSION = "ai-knowledge-os-v7.4-hard-schema-enforcement";

export const BUSINESS_OUTPUT_ENFORCER_SECTION_TITLES = [
  "用户意图",
  "业务问题分析",
  "商业执行策略",
  "推荐动作",
  "标准回复话术",
  "下一步行动"
] as const;

export type BusinessOutputEnforcerSectionTitle = typeof BUSINESS_OUTPUT_ENFORCER_SECTION_TITLES[number];

export interface BusinessOutputEnforcerCompliance {
  version: typeof BUSINESS_OUTPUT_ENFORCER_VERSION;
  presentSections: BusinessOutputEnforcerSectionTitle[];
  missingSections: BusinessOutputEnforcerSectionTitle[];
  isCompliant: boolean;
}

export function buildBusinessOutputEnforcerInstruction(intent: string) {
  return [
    "[BUSINESS_OUTPUT_ENFORCER]",
    "AI 最终输出必须严格符合以下 6 个一级中文小节，顺序不能改变，标题必须使用完整全角方括号。",
    "不得把这些小节改写成同义词，不得合并小节，不得省略小节。",
    "",
    "【用户意图】",
    intent || "cold_user / warm_user / hot_user / buyer_user",
    "",
    "【业务问题分析】",
    "判断用户当前业务状态、真实需求、意向强度、主要顾虑，以及知识库依据边界。",
    "",
    "【商业执行策略】",
    "基于用户意图选择当前应执行的商业策略，并说明为什么这样推进。",
    "",
    "【推荐动作】",
    "- ACTION_1：最优先执行的动作",
    "- ACTION_2：辅助推进或增强信任的动作",
    "- ACTION_3：人工确认、风险控制或成交闭环动作",
    "",
    "【标准回复话术】",
    "给出一段可以直接复制给客户的自然中文回复。",
    "",
    "【下一步行动】",
    "明确告诉用户必须执行的下一步，或应该补充什么信息，必要时引导人工确认。",
    "",
    "额外硬性规则：",
    "- 必须先基于知识库资料回答，再执行商业策略。",
    "- 禁止输出纯知识回答后就结束。",
    "- 禁止编造价格、优惠、订单、支付、合同、退款、资格、收益或交付时间。",
    "- 涉及订单、付款、合同、售后或退款，必须引导人工确认。"
  ].join("\n");
}

export function evaluateBusinessOutputEnforcer(content: string): BusinessOutputEnforcerCompliance {
  const normalizedContent = typeof content === "string" ? content : "";
  const presentSections = BUSINESS_OUTPUT_ENFORCER_SECTION_TITLES.filter((title) => (
    normalizedContent.includes(`【${title}】`)
  ));
  const missingSections = BUSINESS_OUTPUT_ENFORCER_SECTION_TITLES.filter((title) => !presentSections.includes(title));

  return {
    version: BUSINESS_OUTPUT_ENFORCER_VERSION,
    presentSections,
    missingSections,
    isCompliant: missingSections.length === 0
  };
}
