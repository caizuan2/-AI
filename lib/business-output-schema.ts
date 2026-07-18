export const BUSINESS_OUTPUT_SCHEMA_VERSION = "ai-knowledge-os-v7.2";

export const BUSINESS_OUTPUT_SCHEMA_SECTION_TITLES = [
  "用户意图",
  "问题分析",
  "商业策略",
  "推荐动作",
  "标准回复话术",
  "下一步引导"
] as const;

export type BusinessOutputSchemaSectionTitle = typeof BUSINESS_OUTPUT_SCHEMA_SECTION_TITLES[number];

export interface BusinessOutputSchemaCompliance {
  version: typeof BUSINESS_OUTPUT_SCHEMA_VERSION;
  presentSections: BusinessOutputSchemaSectionTitle[];
  missingSections: BusinessOutputSchemaSectionTitle[];
  isCompliant: boolean;
}

export function buildBusinessOutputSchemaInstruction(intent: string) {
  return [
    "[OUTPUT_SCHEMA_ENFORCEMENT]",
    "AI 最终输出必须严格包含以下 6 个一级中文小节，顺序不能改变，标题必须使用完整全角方括号。",
    "",
    "【用户意图】",
    intent || "cold_user / warm_user / hot_user / buyer_user",
    "",
    "【问题分析】",
    "用 2-4 句判断用户当前需求、商业阶段、核心顾虑和知识库依据边界。",
    "",
    "【商业策略】",
    "说明当前应执行的商业策略，必须与用户意图、知识库资料和安全边界一致。",
    "",
    "【推荐动作】",
    "- ACTION_1：给出最优先动作",
    "- ACTION_2：给出辅助推进动作",
    "- ACTION_3：给出人工确认或风险控制动作",
    "",
    "【标准回复话术】",
    "给出一段可以直接复制给客户的自然中文话术。",
    "",
    "【下一步引导】",
    "明确告诉用户下一步应该补充什么、确认什么，或何时转人工。",
    "",
    "禁止输出自由散文式回答；禁止省略任何小节；禁止把结构标题改成英文或其它格式。"
  ].join("\n");
}

export function evaluateBusinessOutputSchema(content: string): BusinessOutputSchemaCompliance {
  const normalizedContent = typeof content === "string" ? content : "";
  const presentSections = BUSINESS_OUTPUT_SCHEMA_SECTION_TITLES.filter((title) => (
    normalizedContent.includes(`【${title}】`)
  ));
  const missingSections = BUSINESS_OUTPUT_SCHEMA_SECTION_TITLES.filter((title) => !presentSections.includes(title));

  return {
    version: BUSINESS_OUTPUT_SCHEMA_VERSION,
    presentSections,
    missingSections,
    isCompliant: missingSections.length === 0
  };
}
