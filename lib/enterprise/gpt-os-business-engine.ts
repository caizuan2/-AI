import type { GptOSActionSuggestion } from "@/lib/enterprise/gpt-os-action-layer";
import type { GptOSTaskPlan } from "@/lib/enterprise/gpt-os-planner";
import {
  getGptOSBusinessTemplate,
  inferBusinessContentType,
  type GptOSBusinessContentType,
  type GptOSBusinessTemplate
} from "@/lib/enterprise/gpt-os-business-templates";
import {
  scoreGptOSBusinessContent,
  type GptOSContentScore
} from "@/lib/enterprise/gpt-os-content-scoring";

export type GptOSMonetizationPotential = "low" | "medium" | "high";

export interface GptOSBusinessContentResult {
  type: GptOSBusinessContentType;
  structure: "SEO optimized" | "conversion optimized" | "standardized knowledge" | "decision report";
  valueScore: number;
  monetizationPotential: GptOSMonetizationPotential;
  template: GptOSBusinessTemplate;
  contentScore: GptOSContentScore;
  contentOutline: string[];
  enhancementSuggestions: string[];
  optimizationSuggestions: string[];
  highValueSignals: string[];
  businessOutputs: string[];
}

interface BusinessEngineInput {
  text: string;
  planner?: GptOSTaskPlan;
  actions?: GptOSActionSuggestion[];
  category?: string | null;
}

function hasAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function detectStructure(type: GptOSBusinessContentType, text: string): GptOSBusinessContentResult["structure"] {
  if (type === "article" || /SEO|关键词|搜索/i.test(text)) return "SEO optimized";
  if (type === "script" || /转化|成交|销售|招商/i.test(text)) return "conversion optimized";
  if (type === "report" || /报告|分析|决策/i.test(text)) return "decision report";

  return "standardized knowledge";
}

function potentialFrom(score: GptOSContentScore, text: string): GptOSMonetizationPotential {
  if (score.totalScore >= 8 || hasAny(text, [/变现|付费|成交|转化|招商|高价值/i])) return "high";
  if (score.totalScore >= 6 || hasAny(text, [/客户|SOP|知识库|报告|话术/i])) return "medium";

  return "low";
}

function buildHighValueSignals(text: string, planner?: GptOSTaskPlan) {
  const signals = new Set<string>();

  if (hasAny(text, [/客户|用户|人群|画像/i])) signals.add("明确目标客户");
  if (hasAny(text, [/痛点|异议|问题|需求/i])) signals.add("包含用户痛点");
  if (hasAny(text, [/成交|转化|付费|报价|招商/i])) signals.add("具备转化意图");
  if (hasAny(text, [/SOP|流程|标准|模板/i])) signals.add("可标准化复制");
  if (hasAny(text, [/案例|检测|数据|证据|对比/i])) signals.add("具备证据或案例线索");
  if (planner?.complexity === "high") signals.add("适合拆成系列内容");

  return Array.from(signals).slice(0, 6);
}

export function generateGptOSBusinessContent(input: BusinessEngineInput): GptOSBusinessContentResult {
  const text = [input.text, input.category ?? "", input.planner?.steps.join(" ") ?? ""].join(" ");
  const type = inferBusinessContentType(text);
  const template = getGptOSBusinessTemplate(type);
  const structure = detectStructure(type, text);
  const contentScore = scoreGptOSBusinessContent({
    text,
    contentType: type,
    structureSignals: template.sections,
    optimizationGoals: template.optimizationFocus
  });
  const monetizationPotential = potentialFrom(contentScore, text);
  const highValueSignals = buildHighValueSignals(text, input.planner);
  const contentOutline = template.sections.map((section, index) => `${index + 1}. ${section}`);
  const enhancementSuggestions = Array.from(new Set([
    "补齐目标客户、使用场景和可量化价值。",
    "把松散内容整理成标题、章节、步骤和标准问答。",
    "补充一线案例、反例或常见异议，让内容更容易成交或培训。",
    ...contentScore.improvementSuggestions
  ])).slice(0, 5);
  const optimizationSuggestions = Array.from(new Set([
    ...template.optimizationFocus.map((focus) => `围绕「${focus}」优化表达。`),
    monetizationPotential === "high" ? "优先沉淀为可复用商业资产，并等待人工确认后再导出或发布。" : "先增强结构和价值主张，再进入商业输出。"
  ])).slice(0, 5);
  const businessOutputs = Array.from(new Set([
    ...template.exportOptions,
    ...(input.actions ?? []).filter((action) => action.type === "export" || action.type === "create").map((action) => action.label)
  ])).slice(0, 6);

  return {
    type,
    structure,
    valueScore: contentScore.totalScore,
    monetizationPotential,
    template,
    contentScore,
    contentOutline,
    enhancementSuggestions,
    optimizationSuggestions,
    highValueSignals,
    businessOutputs
  };
}
