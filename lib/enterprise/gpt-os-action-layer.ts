import type { GptOSTaskPlan } from "@/lib/enterprise/gpt-os-planner";
import type { GptOSPersonaMemory } from "@/lib/enterprise/gpt-os-persona-memory";
import {
  classifyActionRisk,
  requiresHumanApproval,
  type AutonomousActionRisk
} from "@/lib/enterprise/gpt-os-action-safety";

export type GptOSActionType = "create" | "analyze" | "export" | "refine" | "save";

export interface GptOSActionSuggestion {
  id: string;
  label: string;
  description: string;
  type: GptOSActionType;
  risk: AutonomousActionRisk;
  requiresApproval: boolean;
}

interface ActionContext {
  text: string;
  plan: GptOSTaskPlan;
  persona: GptOSPersonaMemory;
  selectedAgentId?: string;
  category?: string | null;
  attachments?: Array<{ fileName?: string; parseStatus?: string }>;
}

function uniqueActions(actions: GptOSActionSuggestion[]) {
  const seen = new Set<string>();

  return actions.filter((action) => {
    if (seen.has(action.label)) {
      return false;
    }

    seen.add(action.label);
    return true;
  }).slice(0, 4);
}

function withSafety(action: Omit<GptOSActionSuggestion, "risk" | "requiresApproval">): GptOSActionSuggestion {
  const risk = classifyActionRisk(action);

  return {
    ...action,
    risk,
    requiresApproval: requiresHumanApproval(action)
  };
}

export function generateGptOSActions(context: ActionContext): GptOSActionSuggestion[] {
  const text = context.text;
  const actions: GptOSActionSuggestion[] = [];

  if (/PPT|演示|汇报|方案/i.test(text) || context.plan.intent === "creation") {
    actions.push(withSafety({
      id: "make-ppt-outline",
      label: "生成PPT大纲",
      description: "把当前回答继续整理成可汇报的章节结构。",
      type: "export"
    }));
  }

  if (context.plan.businessIntent.enabled || /商业|变现|可赚钱|内容运营|SEO|报告|文章/i.test(text)) {
    actions.push(withSafety({
      id: "build-business-output",
      label: "生成商业输出物",
      description: "把当前内容整理成 SOP、报告、文章或销售话术草稿，等待人工确认后再导出或发布。",
      type: "create"
    }));
  }

  if (context.plan.businessIntent.monetizationSignals.length > 0 || /转化|成交|招商|付费/i.test(text)) {
    actions.push(withSafety({
      id: "optimize-monetization-path",
      label: "优化变现链路",
      description: "识别目标客户、价值主张、转化动作和后续运营路径。",
      type: "refine"
    }));
  }

  if (/增长|增长闭环|飞轮|持续优化|价值提升/i.test(text) || context.plan.businessIntent.optimizationGoals.includes("growth loop")) {
    actions.push(withSafety({
      id: "run-content-growth-loop",
      label: "启动内容增长循环",
      description: "按 analyze → optimize → expand → redistribute → reuse 生成增长任务草稿。",
      type: "refine"
    }));
  }

  if (/SEO|关键词|搜索|分发|传播/i.test(text) || context.plan.businessIntent.optimizationGoals.includes("SEO")) {
    actions.push(withSafety({
      id: "optimize-seo-structure",
      label: "优化SEO与结构",
      description: "补充标题、关键词、FAQ、长尾问法和分发标题组。",
      type: "refine"
    }));
  }

  if (/流程|SOP|执行|步骤|工作流/i.test(text) || context.plan.steps.length >= 5) {
    actions.push(withSafety({
      id: "split-sop",
      label: "拆解SOP",
      description: "把方案拆成角色、条件、步骤和检查点。",
      type: "create"
    }));
  }

  if (/知识库|入库|投喂|训练|标准问答/i.test(text) || context.category?.includes("知识库")) {
    actions.push(withSafety({
      id: "save-knowledge",
      label: "保存为知识草稿",
      description: "把当前结论沉淀为标题、分类、标签和标准问答。",
      type: "save"
    }));
  }

  if (context.plan.businessIntent.outputTypes.includes("knowledge") || /知识库|FAQ|标准问答/i.test(text)) {
    actions.push(withSafety({
      id: "enhance-knowledge-asset",
      label: "增强知识资产",
      description: "补齐分类、标签、适用场景、标准问答和用户端检索关键词。",
      type: "refine"
    }));
  }

  if (/复用|衍生|旧内容|旧知识|刷新|更新/i.test(text)) {
    actions.push(withSafety({
      id: "refresh-and-reuse-knowledge",
      label: "刷新并复用旧知识",
      description: "把旧内容拆解、重组为新的 FAQ、SOP、文章和话术草稿。",
      type: "create"
    }));
  }

  if (context.plan.intent === "debugging") {
    actions.push(withSafety({
      id: "make-debug-checklist",
      label: "生成排查清单",
      description: "按影响范围、入口、日志和验证命令继续排查。",
      type: "analyze"
    }));
  }

  if (context.persona.style === "prefer deep analysis" || context.plan.complexity === "high") {
    actions.push(withSafety({
      id: "deepen-analysis",
      label: "扩展深度分析",
      description: "继续补全背景、原因、替代路径和风险点。",
      type: "refine"
    }));
  }

  if ((context.attachments ?? []).length > 0) {
    actions.push(withSafety({
      id: "extract-file-knowledge",
      label: "提取附件知识点",
      description: "继续从附件中提炼可复用知识与引用来源。",
      type: "analyze"
    }));
  }

  actions.push(withSafety({
    id: "next-questions",
    label: "生成下一轮追问",
    description: "给管理员三个可继续推进的追问方向。",
    type: "refine"
  }));

  return uniqueActions(actions);
}
