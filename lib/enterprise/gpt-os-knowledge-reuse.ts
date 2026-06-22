import type { GptOSBusinessContentResult } from "@/lib/enterprise/gpt-os-business-engine";
import type { GptOSContentAmplificationResult } from "@/lib/enterprise/gpt-os-content-amplifier";

export interface GptOSKnowledgeReuseResult {
  reuseCount: number;
  reuseChain: string[];
  derivativeAssets: string[];
  refreshLoop: string[];
  reuseReadiness: number;
}

function unique(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)));
}

export function buildGptOSKnowledgeReuse(input: {
  business: GptOSBusinessContentResult;
  amplifier: GptOSContentAmplificationResult;
  refreshNeeded: boolean;
}): GptOSKnowledgeReuseResult {
  const derivativeAssets = unique([
    "标准问答",
    `${input.business.template.label}`,
    ...input.amplifier.distributionDrafts,
    input.business.type === "article" ? "SEO FAQ" : "",
    input.business.type === "script" ? "异议处理卡片" : "",
    input.business.type === "SOP" ? "执行检查表" : ""
  ]).slice(0, 7);
  const refreshLoop = [
    "识别旧内容",
    "拆解可复用知识点",
    "补充新场景和关键词",
    "生成衍生内容草稿",
    "等待人工确认后入库或分发"
  ];
  const reuseReadiness = Math.min(100, Math.round(input.business.valueScore * 8 + derivativeAssets.length * 5 + (input.refreshNeeded ? 5 : 12)));

  return {
    reuseCount: derivativeAssets.length,
    reuseChain: [
      "旧内容",
      "知识点拆解",
      "结构重组",
      "衍生内容",
      "复用到知识库 / 话术 / 报告"
    ],
    derivativeAssets,
    refreshLoop,
    reuseReadiness
  };
}
