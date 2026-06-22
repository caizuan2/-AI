import type { GptOSActionSuggestion } from "@/lib/enterprise/gpt-os-action-layer";
import type { GptOSTaskPlan } from "@/lib/enterprise/gpt-os-planner";
import type { GptOSPersonaMemory } from "@/lib/enterprise/gpt-os-persona-memory";
import {
  generateGptOSBusinessContent,
  type GptOSBusinessContentResult,
  type GptOSMonetizationPotential
} from "@/lib/enterprise/gpt-os-business-engine";

export interface GptOSMonetizationPipelineResult {
  enabled: boolean;
  stage: "generate" | "enhance" | "score" | "structure" | "output";
  status: "ready" | "needs_enhancement" | "high_value" | "approval_required";
  content: GptOSBusinessContentResult;
  monetizationPotential: GptOSMonetizationPotential;
  monetizationPath: string[];
  valueChain: string[];
  knowledgeEnhancement: string[];
  businessOutputTemplates: string[];
  revenueReadiness: number;
  approvalRequired: boolean;
  diagnostics: string[];
}

interface PipelineInput {
  text: string;
  planner: GptOSTaskPlan;
  memory: GptOSPersonaMemory;
  actions: GptOSActionSuggestion[];
  category?: string | null;
  selectedAgentId?: string;
}

function statusFor(input: {
  score: number;
  potential: GptOSMonetizationPotential;
  approvalRequired: boolean;
}): GptOSMonetizationPipelineResult["status"] {
  if (input.approvalRequired) return "approval_required";
  if (input.potential === "high" && input.score >= 7.5) return "high_value";
  if (input.score < 6.5) return "needs_enhancement";

  return "ready";
}

export function runGptOSMonetizationPipeline(input: PipelineInput): GptOSMonetizationPipelineResult {
  const content = generateGptOSBusinessContent(input);
  const approvalRequired = input.actions.some((action) => action.requiresApproval) || input.planner.approvalRequired;
  const revenueReadiness = Math.round(Math.min(100, Math.max(20, content.valueScore * 10 + content.highValueSignals.length * 4)));
  const monetizationPath = [
    "内容生成",
    "结构增强",
    "价值评分",
    content.monetizationPotential === "high" ? "商业输出草稿" : "继续补强内容资产",
    approvalRequired ? "等待人工确认" : "进入知识库运营"
  ];
  const valueChain = [
    "原始投喂内容",
    content.type === "knowledge" ? "标准知识库条目" : `${content.template.label}`,
    "可复用商业资产",
    "人工确认后导出 / 发布 / 培训"
  ];
  const knowledgeEnhancement = [
    "补齐标题、分类、标签和标准问答。",
    "把口语或零散材料整理为可复制 SOP。",
    "为用户端检索补充关键词、场景和安全边界。",
    ...content.enhancementSuggestions
  ].slice(0, 6);

  return {
    enabled: true,
    stage: "output",
    status: statusFor({
      score: content.valueScore,
      potential: content.monetizationPotential,
      approvalRequired
    }),
    content,
    monetizationPotential: content.monetizationPotential,
    monetizationPath,
    valueChain,
    knowledgeEnhancement,
    businessOutputTemplates: content.businessOutputs,
    revenueReadiness,
    approvalRequired,
    diagnostics: [
      `business:type:${content.type}`,
      `business:valueScore:${content.valueScore}`,
      `business:potential:${content.monetizationPotential}`,
      `business:readiness:${revenueReadiness}`,
      `business:agent:${input.selectedAgentId ?? "unknown"}`,
      `business:persona:${input.memory.domain}`
    ]
  };
}
