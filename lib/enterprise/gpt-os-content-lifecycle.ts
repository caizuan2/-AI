import type { GptOSBusinessContentResult } from "@/lib/enterprise/gpt-os-business-engine";

export type GptOSContentLifecycleStage = "CREATE" | "ANALYZE" | "OPTIMIZE" | "DISTRIBUTE" | "REUSE" | "REFINE";

export interface GptOSContentLifecycleState {
  currentStage: GptOSContentLifecycleStage;
  stages: Array<{
    stage: GptOSContentLifecycleStage;
    label: string;
    status: "done" | "active" | "next";
  }>;
  assetState: "new_asset" | "improving_asset" | "growth_asset";
  refreshNeeded: boolean;
  refreshReasons: string[];
}

const LIFECYCLE: Array<{ stage: GptOSContentLifecycleStage; label: string }> = [
  { stage: "CREATE", label: "创建内容资产" },
  { stage: "ANALYZE", label: "分析价值和结构" },
  { stage: "OPTIMIZE", label: "优化 SEO / 结构 / 转化" },
  { stage: "DISTRIBUTE", label: "生成分发草稿" },
  { stage: "REUSE", label: "拆解复用为新内容" },
  { stage: "REFINE", label: "持续更新旧知识" }
];

function hasAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function currentStageFor(input: {
  text: string;
  business: GptOSBusinessContentResult;
}): GptOSContentLifecycleStage {
  if (hasAny(input.text, [/更新|过期|旧知识|刷新|复盘|重新优化/i])) return "REFINE";
  if (hasAny(input.text, [/复用|衍生|改写|拆成|再生成/i])) return "REUSE";
  if (hasAny(input.text, [/分发|传播|渠道|公众号|小红书|SEO/i])) return "DISTRIBUTE";
  if (input.business.valueScore < 7 || hasAny(input.text, [/优化|提升|改进|增强/i])) return "OPTIMIZE";
  if (input.business.highValueSignals.length > 0) return "ANALYZE";

  return "CREATE";
}

export function buildGptOSContentLifecycle(input: {
  text: string;
  business: GptOSBusinessContentResult;
}): GptOSContentLifecycleState {
  const currentStage = currentStageFor(input);
  const currentIndex = LIFECYCLE.findIndex((item) => item.stage === currentStage);
  const refreshReasons = [
    input.business.valueScore < 7 ? "内容价值评分低于增长阈值，需要优化结构和商业表达。" : "",
    input.business.contentScore.structure < 7 ? "结构评分偏低，需要补齐标题、分段、步骤和 FAQ。" : "",
    hasAny(input.text, [/旧|过期|更新|变化|版本/i]) ? "内容存在旧知识或版本变化信号，需要进入刷新循环。" : ""
  ].filter(Boolean);

  return {
    currentStage,
    stages: LIFECYCLE.map((item, index) => ({
      ...item,
      status: index < currentIndex ? "done" : index === currentIndex ? "active" : "next"
    })),
    assetState: input.business.monetizationPotential === "high"
      ? "growth_asset"
      : input.business.valueScore >= 6
        ? "improving_asset"
        : "new_asset",
    refreshNeeded: refreshReasons.length > 0,
    refreshReasons
  };
}
