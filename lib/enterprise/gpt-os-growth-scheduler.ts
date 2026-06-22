import type { GptOSContentAmplificationResult } from "@/lib/enterprise/gpt-os-content-amplifier";
import type { GptOSContentLifecycleState } from "@/lib/enterprise/gpt-os-content-lifecycle";
import type { GptOSKnowledgeReuseResult } from "@/lib/enterprise/gpt-os-knowledge-reuse";
import type { GptOSMonetizationPipelineResult } from "@/lib/enterprise/gpt-os-monetization-pipeline";

export interface GptOSGrowthSchedulerResult {
  loop: Array<"analyze" | "optimize" | "expand" | "redistribute" | "reuse">;
  nextGrowthTask: string;
  optimizationStatus: "watching" | "optimizing" | "ready_to_reuse" | "waiting_approval";
  scheduledTasks: Array<{
    id: string;
    title: string;
    priority: "low" | "medium" | "high";
    approvalRequired: boolean;
  }>;
  diagnostics: string[];
}

export function scheduleGptOSGrowthLoop(input: {
  business: GptOSMonetizationPipelineResult;
  lifecycle: GptOSContentLifecycleState;
  amplifier: GptOSContentAmplificationResult;
  reuse: GptOSKnowledgeReuseResult;
}): GptOSGrowthSchedulerResult {
  const loop: GptOSGrowthSchedulerResult["loop"] = ["analyze", "optimize", "expand", "redistribute", "reuse"];
  const approvalRequired = input.business.approvalRequired;
  const highValue = input.business.monetizationPotential === "high" || input.amplifier.growthPotential === "high";
  const optimizationStatus = approvalRequired
    ? "waiting_approval"
    : input.reuse.reuseReadiness >= 75
      ? "ready_to_reuse"
      : input.lifecycle.refreshNeeded || input.business.content.valueScore < 7
        ? "optimizing"
        : "watching";
  const scheduledTasks = [
    {
      id: "growth-analyze-value",
      title: "分析内容商业价值和结构缺口",
      priority: "high" as const,
      approvalRequired: false
    },
    {
      id: "growth-optimize-seo",
      title: "优化标题、关键词、FAQ 和结构层级",
      priority: highValue ? "high" as const : "medium" as const,
      approvalRequired: false
    },
    {
      id: "growth-expand-assets",
      title: "生成衍生内容草稿和复用版本",
      priority: highValue ? "high" as const : "medium" as const,
      approvalRequired: false
    },
    {
      id: "growth-distribution-draft",
      title: "生成分发渠道草稿，等待人工确认发布",
      priority: "medium" as const,
      approvalRequired: true
    }
  ];

  return {
    loop,
    nextGrowthTask: scheduledTasks.find((task) => task.priority === "high")?.title ?? scheduledTasks[0].title,
    optimizationStatus,
    scheduledTasks,
    diagnostics: [
      `growth:status:${optimizationStatus}`,
      `growth:potential:${input.amplifier.growthPotential}`,
      `growth:reuse:${input.reuse.reuseReadiness}`,
      `growth:seo:${input.amplifier.seoScore}`,
      `growth:lifecycle:${input.lifecycle.currentStage}`
    ]
  };
}
