import type { GptOSBusinessContentResult } from "@/lib/enterprise/gpt-os-business-engine";

export interface GptOSContentAmplificationResult {
  seoScore: number;
  clarityLift: number;
  structureLift: number;
  businessValueLift: number;
  growthPotential: "low" | "medium" | "high";
  keywordClusters: string[];
  amplificationActions: string[];
  distributionDrafts: string[];
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function unique(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)));
}

function detectKeywordClusters(text: string, business: GptOSBusinessContentResult) {
  const clusters = [
    business.type,
    ...business.template.optimizationFocus,
    ...business.highValueSignals,
    /知识库|FAQ|标准问答|训练/i.test(text) ? "知识库检索" : "",
    /SEO|关键词|搜索|文章/i.test(text) ? "SEO 长尾词" : "",
    /客户|成交|转化|招商/i.test(text) ? "客户转化" : "",
    /SOP|流程|标准化/i.test(text) ? "标准化执行" : ""
  ];

  return unique(clusters).slice(0, 8);
}

export function amplifyGptOSContentValue(input: {
  text: string;
  business: GptOSBusinessContentResult;
}): GptOSContentAmplificationResult {
  const keywordClusters = detectKeywordClusters(input.text, input.business);
  const seoScore = clamp(input.business.contentScore.virality * 9 + keywordClusters.length * 4);
  const clarityLift = clamp((10 - input.business.contentScore.readability) * 8 + 12);
  const structureLift = clamp((10 - input.business.contentScore.structure) * 8 + 15);
  const businessValueLift = clamp((10 - input.business.contentScore.businessValue) * 7 + input.business.highValueSignals.length * 5);
  const averageLift = (clarityLift + structureLift + businessValueLift + seoScore) / 4;
  const growthPotential = averageLift >= 72 || input.business.monetizationPotential === "high"
    ? "high"
    : averageLift >= 48
      ? "medium"
      : "low";
  const amplificationActions = unique([
    "重写标题和首段，让目标客户和核心收益前置。",
    "把内容拆成短段落、步骤、FAQ 和可复制话术。",
    "补充长尾关键词、同义问法和用户端检索词。",
    "增加案例、证据、前后对比或常见异议。",
    input.business.monetizationPotential === "high" ? "优先生成可人工确认的分发草稿和销售跟进材料。" : "先补强结构，再进入分发。"
  ]);
  const distributionDrafts = unique([
    `${input.business.type} 长文版本`,
    "用户端 FAQ 版本",
    "销售 / 客服话术版本",
    "PPT 汇报大纲",
    "短内容传播标题组"
  ]).slice(0, 5);

  return {
    seoScore,
    clarityLift,
    structureLift,
    businessValueLift,
    growthPotential,
    keywordClusters,
    amplificationActions,
    distributionDrafts
  };
}
