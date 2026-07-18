import {
  classifyActionRisk,
  requiresHumanApproval,
  type AutonomousActionRisk
} from "@/lib/enterprise/gpt-os-action-safety";

export type GptOSTaskIntent = "analysis" | "creation" | "debugging" | "learning";
export type GptOSTaskComplexity = "low" | "medium" | "high";
export type GptOSTaskAgentId =
  | "analysis-agent"
  | "sales-agent"
  | "teaching-agent"
  | "pm-agent"
  | "compliance-agent"
  | "content-strategist-agent"
  | "business-analyst-agent"
  | "conversion-optimizer-agent"
  | "knowledge-architect-agent"
  | "growth-analyst-agent"
  | "seo-optimizer-agent"
  | "knowledge-amplifier-agent";

export interface GptOSTaskPlan {
  intent: GptOSTaskIntent;
  steps: string[];
  executableSteps: Array<{
    id: string;
    title: string;
    description: string;
    actionType: string;
    risk: AutonomousActionRisk;
    approvalRequired: boolean;
  }>;
  taskChainSteps: Array<{
    id: string;
    order: number;
    title: string;
    description: string;
    actionType: string;
    risk: AutonomousActionRisk;
    approvalRequired: boolean;
    agentHint: GptOSTaskAgentId;
  }>;
  requiredAgents: GptOSTaskAgentId[];
  complexity: GptOSTaskComplexity;
  summary: string;
  signals: string[];
  approvalRequired: boolean;
  blockedActions: string[];
  businessIntent: {
    enabled: boolean;
    outputTypes: string[];
    optimizationGoals: string[];
    monetizationSignals: string[];
  };
}

interface PlannerInput {
  text: string;
  category?: string | null;
  activeAgentName?: string | null;
  attachments?: Array<{ fileName?: string; parseStatus?: string }>;
  recentMessages?: Array<{ role: "user" | "assistant"; content: string }>;
}

function includesAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function compactSteps(steps: string[]) {
  const seen = new Set<string>();

  return steps.filter((step) => {
    if (seen.has(step)) {
      return false;
    }

    seen.add(step);
    return true;
  }).slice(0, 7);
}

function detectIntent(text: string): { intent: GptOSTaskIntent; signals: string[] } {
  const signals: string[] = [];

  if (includesAny(text, [/debug|error|bug|报错|异常|失败|修复|排查|诊断|解析失败/i])) {
    signals.push("debugging");
    return { intent: "debugging", signals };
  }

  if (includesAny(text, [/设计|生成|创建|写一份|方案|SOP|流程图|PPT|话术|草稿|搭建|构建/i])) {
    signals.push("creation");
    return { intent: "creation", signals };
  }

  if (includesAny(text, [/讲解|教我|学习|解释|怎么理解|入门|教程|为什么/i])) {
    signals.push("learning");
    return { intent: "learning", signals };
  }

  signals.push("analysis");
  return { intent: "analysis", signals };
}

function detectBusinessIntent(text: string, category?: string | null): GptOSTaskPlan["businessIntent"] {
  const source = `${text} ${category ?? ""}`;
  const outputTypes = new Set<string>();
  const optimizationGoals = new Set<string>();
  const monetizationSignals = new Set<string>();

  if (includesAny(source, [/SOP|流程|标准化|操作规范/i])) outputTypes.add("SOP");
  if (includesAny(source, [/文章|SEO|公众号|小红书|关键词|传播/i])) outputTypes.add("article");
  if (includesAny(source, [/话术|销售|成交|招商|异议|客户沟通/i])) outputTypes.add("script");
  if (includesAny(source, [/知识库|FAQ|标准问答|入库|训练/i])) outputTypes.add("knowledge");
  if (includesAny(source, [/报告|商业分析|复盘|诊断|管理层/i])) outputTypes.add("report");
  if (includesAny(source, [/培训|课程|讲师|学习/i])) outputTypes.add("course");

  if (includesAny(source, [/SEO|关键词|搜索|传播/i])) optimizationGoals.add("SEO");
  if (includesAny(source, [/增长|增长闭环|生命周期|飞轮|复用|衍生|刷新|旧知识|更新/i])) optimizationGoals.add("growth loop");
  if (includesAny(source, [/转化|成交|招商|报价|客户/i])) optimizationGoals.add("conversion");
  if (includesAny(source, [/标准化|SOP|流程|模板/i])) optimizationGoals.add("standardization");
  if (includesAny(source, [/知识库|训练|复用|FAQ/i])) optimizationGoals.add("knowledge reuse");

  if (includesAny(source, [/变现|付费|商业|可赚钱|营收|套餐|转化|成交|招商/i])) monetizationSignals.add("direct monetization");
  if (includesAny(source, [/高价值|案例|客户|痛点|需求/i])) monetizationSignals.add("high value content");
  if (includesAny(source, [/报告|PPT|文档|导出|课程/i])) monetizationSignals.add("business deliverable");
  if (includesAny(source, [/增长|复用|衍生|放大|传播|刷新|更新/i])) monetizationSignals.add("growth amplification");

  return {
    enabled: outputTypes.size > 0 || optimizationGoals.size > 0 || monetizationSignals.size > 0,
    outputTypes: Array.from(outputTypes),
    optimizationGoals: Array.from(optimizationGoals),
    monetizationSignals: Array.from(monetizationSignals)
  };
}

function detectComplexity(input: PlannerInput, text: string): GptOSTaskComplexity {
  const hasAttachment = (input.attachments ?? []).length > 0;
  const messageCount = input.recentMessages?.length ?? 0;
  const asksForSystem = includesAny(text, [/系统|架构|闭环|多Agent|多 Agent|商业化|SaaS|全链路|端到端|复杂|完整/i]);
  const asksForMultipleSteps = includesAny(text, [/拆解|分步骤|先.*再|规划|工作流|流程|执行链/i]);

  if (text.length > 180 || hasAttachment || asksForSystem || asksForMultipleSteps || messageCount >= 6) {
    return "high";
  }

  if (text.length > 60 || includesAny(text, [/分析|对比|优化|总结|分类|入库|知识库/i])) {
    return "medium";
  }

  return "low";
}

function requiredAgentsFor(input: {
  text: string;
  intent: GptOSTaskIntent;
  complexity: GptOSTaskComplexity;
  category?: string | null;
}) {
  const agents = new Set<GptOSTaskAgentId>();
  const text = `${input.text} ${input.category ?? ""}`;

  if (input.intent === "debugging") {
    agents.add("analysis-agent");
    agents.add("pm-agent");
  }

  if (input.intent === "learning") {
    agents.add("teaching-agent");
  }

  if (input.intent === "creation") {
    agents.add("pm-agent");
  }

  if (includesAny(text, [/销售|成交|转化|招商|报价|客户异议|话术/i])) {
    agents.add("sales-agent");
    agents.add("conversion-optimizer-agent");
  }

  if (includesAny(text, [/合规|风险|审核|法律|医疗|财务|卡密|权限/i])) {
    agents.add("compliance-agent");
  }

  if (input.complexity === "high" || includesAny(text, [/分析|原因|为什么|优化|诊断/i])) {
    agents.add("analysis-agent");
  }

  if (includesAny(text, [/文章|SEO|内容|报告|商业|变现|可赚钱|PPT|课程/i])) {
    agents.add("content-strategist-agent");
    agents.add("business-analyst-agent");
  }

  if (includesAny(text, [/知识库|FAQ|标准问答|入库|训练|结构化/i])) {
    agents.add("knowledge-architect-agent");
  }

  if (includesAny(text, [/增长|增长闭环|飞轮|复用|衍生|刷新|旧知识|更新|持续优化/i])) {
    agents.add("growth-analyst-agent");
    agents.add("knowledge-amplifier-agent");
  }

  if (includesAny(text, [/SEO|关键词|搜索|排名|传播|分发|公众号|小红书/i])) {
    agents.add("seo-optimizer-agent");
    agents.add("content-strategist-agent");
  }

  if (agents.size === 0) {
    agents.add("analysis-agent");
  }

  return Array.from(agents);
}

function stepsFor(input: {
  text: string;
  intent: GptOSTaskIntent;
  complexity: GptOSTaskComplexity;
  hasAttachments: boolean;
  businessIntent: GptOSTaskPlan["businessIntent"];
}) {
  const base = ["理解问题"];
  const text = input.text;

  if (input.hasAttachments || includesAny(text, [/知识库|资料|投喂|入库|RAG|检索/i])) {
    base.push("检索知识");
  }

  if (input.intent === "debugging") {
    base.push("定位异常信号", "评估影响范围");
  }

  if (input.intent === "creation") {
    base.push("拆解需求", "设计结构");
  }

  if (input.businessIntent.enabled) {
    base.push("识别商业价值", "优化内容结构");
  }

  if (input.intent === "learning") {
    base.push("提炼概念", "按层级讲解");
  }

  if (input.complexity !== "low") {
    base.push("调用工具", "生成回答", "优化输出");
  } else {
    base.push("生成回答");
  }

  if (includesAny(text, [/保存|入库|训练|结构化/i])) {
    base.push("生成入库建议");
  }

  if (input.businessIntent.monetizationSignals.length > 0) {
    base.push("生成商业输出物");
  }

  if (input.businessIntent.optimizationGoals.includes("growth loop")) {
    base.push("生成增长复用链");
  }

  return compactSteps(base);
}

function actionTypeForStep(step: string) {
  if (/删除|清空|移除/i.test(step)) return "delete";
  if (/保存|入库|写入/i.test(step) && !/生成|建议|草稿/i.test(step)) return "save";
  if (/导出|发布|发送/i.test(step)) return "publish";
  if (/检查|风险|合规/i.test(step)) return "risk-check";
  if (/总结|提取|拆解|知识点|检索/i.test(step)) return "analyze";
  if (/生成|草稿|设计|话术|SOP|报告/i.test(step)) return "draft";

  return "reason";
}

function buildExecutableSteps(steps: string[]) {
  return steps.map((step, index) => {
    const actionType = actionTypeForStep(step);
    const risk = classifyActionRisk({
      title: step,
      actionType
    });

    return {
      id: `planner-step-${index + 1}`,
      title: step,
      description: risk === "safe" ? `可自动执行低风险步骤：${step}` : `该步骤需要进入安全审批：${step}`,
      actionType,
      risk,
      approvalRequired: requiresHumanApproval({ title: step, actionType })
    };
  });
}

export function planGptOSTask(input: PlannerInput): GptOSTaskPlan {
  const text = input.text.trim();
  const { intent, signals } = detectIntent(text);
  const complexity = detectComplexity(input, text);
  const businessIntent = detectBusinessIntent(text, input.category);
  const plannerSignals = [
    ...signals,
    ...(businessIntent.enabled ? ["business"] : []),
    ...businessIntent.outputTypes.map((type) => `businessOutput:${type}`),
    ...businessIntent.monetizationSignals.map((signal) => `monetization:${signal}`)
  ];
  const requiredAgents = requiredAgentsFor({
    text,
    intent,
    complexity,
    category: input.category
  });
  const steps = stepsFor({
    text,
    intent,
    complexity,
    hasAttachments: (input.attachments ?? []).length > 0,
    businessIntent
  });
  const executableSteps = buildExecutableSteps(steps);
  const taskChainSteps = executableSteps.map((step, index) => ({
    ...step,
    order: index + 1,
    agentHint: requiredAgents[index % requiredAgents.length] ?? "analysis-agent" as const
  }));

  return {
    intent,
    steps,
    executableSteps,
    taskChainSteps,
    requiredAgents,
    complexity,
    summary: `${intent} task · ${complexity} complexity · ${steps.length} steps`,
    signals: plannerSignals,
    approvalRequired: executableSteps.some((step) => step.approvalRequired),
    blockedActions: executableSteps.filter((step) => step.risk === "dangerous").map((step) => step.title),
    businessIntent
  };
}
