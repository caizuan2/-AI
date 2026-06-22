import type { GptOSMonetizationPipelineResult } from "@/lib/enterprise/gpt-os-monetization-pipeline";
import {
  amplifyGptOSContentValue,
  type GptOSContentAmplificationResult
} from "@/lib/enterprise/gpt-os-content-amplifier";
import {
  buildGptOSContentLifecycle,
  type GptOSContentLifecycleState
} from "@/lib/enterprise/gpt-os-content-lifecycle";
import {
  buildGptOSKnowledgeReuse,
  type GptOSKnowledgeReuseResult
} from "@/lib/enterprise/gpt-os-knowledge-reuse";
import {
  scheduleGptOSGrowthLoop,
  type GptOSGrowthSchedulerResult
} from "@/lib/enterprise/gpt-os-growth-scheduler";

export interface GptOSContentGrowthResult {
  enabled: boolean;
  growthLoop: Array<"analyze" | "optimize" | "expand" | "redistribute" | "reuse">;
  lifecycle: GptOSContentLifecycleState;
  amplifier: GptOSContentAmplificationResult;
  reuse: GptOSKnowledgeReuseResult;
  scheduler: GptOSGrowthSchedulerResult;
  contentValueBefore: number;
  contentValueAfter: number;
  improvementDelta: number;
  growthPotential: "low" | "medium" | "high";
  responseFormatInfluence: "none";
  uiInfluence: "none";
  optimizationSummary: string;
  diagnostics: string[];
}

export function runGptOSContentGrowthEngine(input: {
  text: string;
  business: GptOSMonetizationPipelineResult;
}): GptOSContentGrowthResult {
  const lifecycle = buildGptOSContentLifecycle({
    text: input.text,
    business: input.business.content
  });
  const amplifier = amplifyGptOSContentValue({
    text: input.text,
    business: input.business.content
  });
  const reuse = buildGptOSKnowledgeReuse({
    business: input.business.content,
    amplifier,
    refreshNeeded: lifecycle.refreshNeeded
  });
  const scheduler = scheduleGptOSGrowthLoop({
    business: input.business,
    lifecycle,
    amplifier,
    reuse
  });
  const contentValueBefore = input.business.content.valueScore;
  const contentValueAfter = Number(Math.min(10, contentValueBefore + (amplifier.clarityLift + amplifier.structureLift + amplifier.businessValueLift) / 90).toFixed(1));
  const improvementDelta = Number((contentValueAfter - contentValueBefore).toFixed(1));

  return {
    enabled: true,
    growthLoop: scheduler.loop,
    lifecycle,
    amplifier,
    reuse,
    scheduler,
    contentValueBefore,
    contentValueAfter,
    improvementDelta,
    growthPotential: amplifier.growthPotential,
    responseFormatInfluence: "none",
    uiInfluence: "none",
    optimizationSummary: `后台增长评分：${lifecycle.currentStage} 阶段预计内容价值 ${contentValueBefore} → ${contentValueAfter}，可复用资产 ${reuse.reuseCount} 个；该评分只用于运营 metadata，不能控制主回复格式、语气或段落顺序。`,
    diagnostics: [
      ...scheduler.diagnostics,
      `growth:valueBefore:${contentValueBefore}`,
      `growth:valueAfter:${contentValueAfter}`,
      `growth:delta:${improvementDelta}`,
      `growth:reuseCount:${reuse.reuseCount}`,
      "growth:formattingInfluence:metadata_only",
      "growth:responseFormatInfluence:none",
      "growth:uiInfluence:none"
    ]
  };
}
