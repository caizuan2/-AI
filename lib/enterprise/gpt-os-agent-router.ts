export type GptOSAgentId =
  | "analysis-agent"
  | "sales-agent"
  | "teaching-agent"
  | "pm-agent"
  | "compliance-agent";
export type GptOSAgentMode = "analysis" | "sales" | "teaching" | "pm" | "compliance";
export type GptOSReasoningStrategy = "deep" | "fast" | "balanced";
export type GptOSWorkflowHint = "use_rag" | "use_tool" | "multi_step" | "risk_review" | "refine_output";
export type GptOSAgentUXMode = "auto" | "simple" | "pro" | "dev";

export interface GptOSAgentDecisionPolicy {
  mode: GptOSAgentMode;
  reasoningStrategy: GptOSReasoningStrategy;
  reasoningDepth: "low" | "medium" | "high";
  toolPermission: true;
  allowToolLoop: true;
  maxLoopDepth: number;
  replanEnabled: boolean;
  convergenceThreshold: number;
  costAware: boolean;
  uxMode: GptOSAgentUXMode;
  workflowHints: GptOSWorkflowHint[];
}

export interface GptOSAgentDefinition {
  id: GptOSAgentId;
  name: string;
  role: string;
  intentSignals: string[];
  systemFocus: string;
  outputBias: string;
  reasoningStyle: string;
  promptModifier: string;
  outputContract: string;
  preferredPluginIds: Array<"knowledge-search" | "summary-tool" | "risk-check" | "formatting-tool">;
  decisionPolicy: GptOSAgentDecisionPolicy;
}

export interface GptOSRouteInput {
  text: string;
  activeAgentName?: string | null;
  category?: string | null;
  attachments?: Array<{ fileName?: string; parseStatus?: string }>;
  recentMessages?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface GptOSAgentRoute {
  selectedAgent: GptOSAgentDefinition;
  decisionPolicy: GptOSAgentDecisionPolicy;
  confidence: number;
  matchedSignals: string[];
  reason: string;
}

export const GPT_OS_AGENTS: GptOSAgentDefinition[] = [
  {
    id: "analysis-agent",
    name: "Analysis Agent",
    role: "分析型",
    intentSignals: ["分析", "原因", "为什么", "拆解", "判断", "复盘", "总结", "逻辑"],
    systemFocus: "拆解问题、解释原因、提炼关键判断和行动建议。",
    outputBias: "先给判断，再展开依据、变量、边界和下一步。",
    reasoningStyle: "deep_chain_analysis",
    promptModifier: "请先识别问题背后的变量、因果链和缺失信息，再给出分层判断。不要急着给模板答案。",
    outputContract: "输出应包含明确结论、关键原因、可验证依据和下一步行动。",
    preferredPluginIds: ["summary-tool", "knowledge-search", "formatting-tool"],
    decisionPolicy: {
      mode: "analysis",
      reasoningStrategy: "deep",
      reasoningDepth: "high",
      toolPermission: true,
      allowToolLoop: true,
      maxLoopDepth: 3,
      replanEnabled: true,
      convergenceThreshold: 0.85,
      costAware: true,
      uxMode: "auto",
      workflowHints: ["use_rag", "use_tool", "multi_step", "refine_output"]
    }
  },
  {
    id: "sales-agent",
    name: "Sales Agent",
    role: "销售话术",
    intentSignals: ["话术", "转化", "怎么卖", "成交", "客户", "异议", "报价", "销售", "招商"],
    systemFocus: "把知识转成一线人员可复制的沟通策略和成交推进话术。",
    outputBias: "突出客户心理、回应口径、追问方式和风险边界。",
    reasoningStyle: "conversion_strategy",
    promptModifier: "请从客户痛点、信任建立、异议处理和下一步行动设计回答，优先生成自然可复制的话术。",
    outputContract: "输出应有客户心理判断、推荐说法、可追问问题和禁用表达。",
    preferredPluginIds: ["knowledge-search", "risk-check", "formatting-tool"],
    decisionPolicy: {
      mode: "sales",
      reasoningStrategy: "balanced",
      reasoningDepth: "medium",
      toolPermission: true,
      allowToolLoop: true,
      maxLoopDepth: 3,
      replanEnabled: true,
      convergenceThreshold: 0.85,
      costAware: true,
      uxMode: "auto",
      workflowHints: ["use_rag", "use_tool", "risk_review", "refine_output"]
    }
  },
  {
    id: "teaching-agent",
    name: "Teaching Agent",
    role: "讲师模式",
    intentSignals: ["讲解", "教我", "培训", "课程", "怎么讲", "学习", "课堂", "讲师"],
    systemFocus: "把资料改写成容易理解、可教学、可复述的知识结构。",
    outputBias: "用清晰层级、例子和复盘问题帮助理解。",
    reasoningStyle: "step_by_step_teaching",
    promptModifier: "请像讲师一样循序渐进地讲清背景、概念、例子和练习问题。",
    outputContract: "输出应包含通俗解释、关键步骤、示例和复习问题。",
    preferredPluginIds: ["summary-tool", "formatting-tool"],
    decisionPolicy: {
      mode: "teaching",
      reasoningStrategy: "balanced",
      reasoningDepth: "medium",
      toolPermission: true,
      allowToolLoop: true,
      maxLoopDepth: 3,
      replanEnabled: true,
      convergenceThreshold: 0.85,
      costAware: true,
      uxMode: "auto",
      workflowHints: ["use_tool", "multi_step", "refine_output"]
    }
  },
  {
    id: "pm-agent",
    name: "PM Agent",
    role: "产品经理",
    intentSignals: ["设计", "产品", "系统", "流程", "方案", "功能", "PRD", "架构", "工作流"],
    systemFocus: "把需求、系统、流程和知识生产动作组织成可执行方案。",
    outputBias: "输出目标、流程、状态、依赖、异常分支和验收点。",
    reasoningStyle: "product_system_design",
    promptModifier: "请从目标、对象、流程、边界、状态、异常分支和验收标准组织答案。",
    outputContract: "输出应包含系统结构、执行流程、风险依赖和验收口径。",
    preferredPluginIds: ["knowledge-search", "summary-tool", "formatting-tool"],
    decisionPolicy: {
      mode: "pm",
      reasoningStrategy: "deep",
      reasoningDepth: "high",
      toolPermission: true,
      allowToolLoop: true,
      maxLoopDepth: 3,
      replanEnabled: true,
      convergenceThreshold: 0.85,
      costAware: true,
      uxMode: "auto",
      workflowHints: ["use_rag", "use_tool", "multi_step", "refine_output"]
    }
  },
  {
    id: "compliance-agent",
    name: "Compliance Agent",
    role: "合规审查",
    intentSignals: ["风险", "合规", "禁忌", "法律", "医疗", "财务", "承诺", "夸大", "审核"],
    systemFocus: "识别表达风险、承诺边界、证据不足和需要复核的内容。",
    outputBias: "标注风险等级、替代表达和必须保留的安全边界。",
    reasoningStyle: "risk_control",
    promptModifier: "请优先检查承诺、夸大、证据不足、医疗/法律/财务边界，并给出更稳妥表述。",
    outputContract: "输出应包含风险点、原因、替代表达和必须复核的内容。",
    preferredPluginIds: ["risk-check", "summary-tool", "formatting-tool"],
    decisionPolicy: {
      mode: "compliance",
      reasoningStrategy: "deep",
      reasoningDepth: "high",
      toolPermission: true,
      allowToolLoop: true,
      maxLoopDepth: 3,
      replanEnabled: true,
      convergenceThreshold: 0.85,
      costAware: true,
      uxMode: "auto",
      workflowHints: ["use_tool", "risk_review", "multi_step", "refine_output"]
    }
  }
];

const defaultAgent = GPT_OS_AGENTS[0];

export function routeGptOSAgent(input: GptOSRouteInput): GptOSAgentRoute {
  const text = [
    input.text,
    input.activeAgentName ?? "",
    input.category ?? "",
    ...(input.recentMessages ?? []).slice(-4).map((message) => message.content)
  ].join(" ");
  const scores = GPT_OS_AGENTS.map((agent) => {
    const matchedSignals = agent.intentSignals.filter((signal) => text.includes(signal));

    return {
      agent,
      matchedSignals,
      score: matchedSignals.length
    };
  }).sort((left, right) => right.score - left.score);
  const top = scores[0];
  const selectedAgent = top.score > 0 ? top.agent : defaultAgent;
  const confidence = top.score > 0 ? Math.min(0.94, 0.62 + top.score * 0.08) : 0.52;
  const matchedSignals = top.score > 0 ? top.matchedSignals : [];
  const attachmentHint = input.attachments?.length ? `，并携带 ${input.attachments.length} 个附件上下文` : "";

  // GPT OS 路由只做轻量意图识别，不改动底层 GPT / DeepSeek 调用参数。
  return {
    selectedAgent,
    decisionPolicy: selectedAgent.decisionPolicy,
    confidence,
    matchedSignals,
    reason: matchedSignals.length
      ? `命中 ${matchedSignals.join("、")}，路由到 ${selectedAgent.name}${attachmentHint}`
      : `未命中特定关键词，默认使用 ${selectedAgent.name} 做通用分析${attachmentHint}`
  };
}
