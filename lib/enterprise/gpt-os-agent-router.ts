import {
  planGptOSTask,
  type GptOSTaskAgentId,
  type GptOSTaskComplexity,
  type GptOSTaskIntent
} from "@/lib/enterprise/gpt-os-planner";
import {
  buildGptOSPersonaMemory,
  type GptOSPersonaMemory
} from "@/lib/enterprise/gpt-os-persona-memory";
import {
  generateGptOSActions,
  type GptOSActionSuggestion
} from "@/lib/enterprise/gpt-os-action-layer";
import {
  buildGptOSUnifiedContext,
  type GptOSUnifiedContext
} from "@/lib/enterprise/gpt-os-multimodal-router";
import {
  runGptOSReasoningLoop,
  type GptOSReasoningLoopResult
} from "@/lib/enterprise/gpt-os-reasoning-loop";
import {
  buildGptOSGoalState,
  type GptOSGoalState
} from "@/lib/enterprise/gpt-os-goal-manager";
import {
  createAutonomousPlan,
  executeAutonomousPlan,
  type AutonomousTaskMode,
  type AutonomousTaskPlan,
  type AutonomousTaskResult
} from "@/lib/enterprise/gpt-os-autonomous-executor";
import {
  createTaskChainFromAutonomousPlan,
  executeTaskChain,
  pauseTaskChain,
  type TaskChainExecutionResult
} from "@/lib/enterprise/gpt-os-task-chain-engine";
import {
  scheduleTaskChain,
  type ExecutionSchedulerSnapshot
} from "@/lib/enterprise/gpt-os-execution-scheduler";
import {
  runGptOSKernelRuntime,
  type GptOSKernelState
} from "@/lib/enterprise/gpt-os-kernel-runtime";
import {
  runGptOSMonetizationPipeline,
  type GptOSMonetizationPipelineResult
} from "@/lib/enterprise/gpt-os-monetization-pipeline";
import {
  runGptOSContentGrowthEngine,
  type GptOSContentGrowthResult
} from "@/lib/enterprise/gpt-os-content-growth-engine";
import {
  createGptOSTrace,
  type GptOSTrace
} from "@/lib/enterprise/gpt-os-trace-manager";
import {
  estimateGptOSCost,
  type GptOSCostBreakdown
} from "@/lib/enterprise/gpt-os-cost-tracker";
import {
  profileGptOSLatency,
  type GptOSLatencyBreakdown
} from "@/lib/enterprise/gpt-os-latency-profiler";
import {
  buildGptOSFallbackAnalytics,
  type GptOSFallbackAnalytics
} from "@/lib/enterprise/gpt-os-fallback-normalizer";

export type GptOSAgentId = GptOSTaskAgentId;
export type GptOSAgentMode = "analysis" | "sales" | "teaching" | "pm" | "compliance" | "content" | "business" | "conversion" | "knowledge" | "growth" | "seo" | "amplifier";
export type GptOSReasoningStrategy = "deep" | "fast" | "balanced";
export type GptOSWorkflowHint = "use_rag" | "use_tool" | "multi_step" | "risk_review" | "refine_output";

export interface GptOSAgentDecisionPolicy {
  mode: GptOSAgentMode;
  reasoningStrategy: GptOSReasoningStrategy;
  reasoningDepth: "low" | "medium" | "high";
  toolPermission: boolean;
  workflowHints: GptOSWorkflowHint[];
  allowToolLoop: boolean;
  maxLoopDepth: number;
  replanEnabled: boolean;
  convergenceThreshold: number;
  costAware: boolean;
  uxMode: "auto" | "simple" | "pro" | "dev";
}

export interface GptOSAgentProfile {
  id: GptOSAgentId;
  label: string;
  mode: GptOSAgentMode;
  promptModifier: string;
  reasoningInstruction: string;
  signals: RegExp[];
  decisionPolicy: GptOSAgentDecisionPolicy;
}

export interface GptOSRouteInput {
  text: string;
  voiceTranscript?: string | null;
  activeAgentName?: string | null;
  category?: string | null;
  attachments?: Array<{
    fileName?: string;
    fileType?: string;
    mimeType?: string;
    parseStatus?: string;
    extractedText?: string;
    text?: string;
    content?: string;
    visibleText?: string;
    summary?: string;
    pageSummaries?: string[];
    slideTexts?: Array<{ slideIndex?: number; text?: string } | string>;
    limitationNote?: string;
  }>;
  recentMessages?: Array<{ role: "user" | "assistant"; content: string }>;
  multimodalContext?: GptOSUnifiedContext;
  autonomous?: {
    enabled?: boolean;
    taskId?: string;
    mode?: AutonomousTaskMode;
  };
}

export interface GptOSRouteResult {
  status: "internal_only";
  ui: null;
  pipeline: string[];
  multimodal: GptOSUnifiedContext;
  planner: ReturnType<typeof planGptOSTask>;
  memory: GptOSPersonaMemory;
  selectedAgent: Pick<GptOSAgentProfile, "id" | "label" | "mode" | "promptModifier" | "reasoningInstruction">;
  decisionPolicy: GptOSAgentDecisionPolicy;
  goal: GptOSGoalState;
  reasoningLoop: GptOSReasoningLoopResult;
  autonomousPlan: AutonomousTaskPlan;
  autonomousResult: AutonomousTaskResult;
  taskChain: TaskChainExecutionResult;
  executionScheduler: ExecutionSchedulerSnapshot;
  kernel: GptOSKernelState;
  business: GptOSMonetizationPipelineResult;
  growth: GptOSContentGrowthResult;
  observability: {
    trace: GptOSTrace;
    cost: GptOSCostBreakdown;
    latency: GptOSLatencyBreakdown;
    fallback: GptOSFallbackAnalytics;
    modelUsage: {
      provider: string;
      modelUsed: string;
      distribution: Array<{
        model: string;
        provider: string;
        count: number;
      }>;
    };
    agent: {
      selectedAgentId: GptOSAgentId;
      selectedAgentLabel: string;
      alternateAgentId?: GptOSAgentId;
      selectionReason: string;
      confidence: number;
    };
    tools: {
      toolChain: string[];
      toolFeedbackCount: number;
      actionCount: number;
      successRate: number;
    };
    diagnostics: string[];
  };
  agentEvolution: {
    selectedScore: number;
    alternateAgentId?: GptOSAgentId;
    canSwitch: boolean;
    performanceHint: string;
    optimizationHint: string;
  };
  actions: GptOSActionSuggestion[];
  confidence: number;
  matchedSignals: string[];
  reason: string;
}

const GPT_OS_AGENTS: GptOSAgentProfile[] = [
  {
    id: "analysis-agent",
    label: "分析 Agent",
    mode: "analysis",
    promptModifier: "用多步骤分析拆解原因、证据、风险和可执行结论。",
    reasoningInstruction: "增强推理深度，先识别问题结构，再给出判断依据。",
    signals: [/分析|原因|为什么|优化|诊断|排查|复盘/i],
    decisionPolicy: basePolicy("analysis", "deep", ["use_rag", "multi_step", "refine_output"])
  },
  {
    id: "sales-agent",
    label: "销售 Agent",
    mode: "sales",
    promptModifier: "围绕客户痛点、转化路径、异议处理和行动引导组织答案。",
    reasoningInstruction: "优先输出可复制话术和成交推进策略。",
    signals: [/销售|转化|成交|招商|报价|话术|异议/i],
    decisionPolicy: basePolicy("sales", "balanced", ["use_rag", "use_tool", "refine_output"])
  },
  {
    id: "content-strategist-agent",
    label: "内容策略 Agent",
    mode: "content",
    promptModifier: "把材料转成可传播、可复用、可运营的内容资产。",
    reasoningInstruction: "优先识别内容类型、受众、结构和传播路径。",
    signals: [/内容|文章|SEO|公众号|小红书|标题|传播|课程|PPT/i],
    decisionPolicy: basePolicy("content", "balanced", ["use_rag", "multi_step", "refine_output"])
  },
  {
    id: "business-analyst-agent",
    label: "商业分析 Agent",
    mode: "business",
    promptModifier: "围绕商业价值、变现路径、客户价值和运营闭环组织答案。",
    reasoningInstruction: "把内容价值转成可执行的商业输出和运营建议。",
    signals: [/商业|变现|可赚钱|营收|SaaS|套餐|报告|行业分析/i],
    decisionPolicy: basePolicy("business", "deep", ["use_rag", "use_tool", "multi_step", "refine_output"])
  },
  {
    id: "conversion-optimizer-agent",
    label: "转化优化 Agent",
    mode: "conversion",
    promptModifier: "优化客户痛点、异议处理、转化动作和成交推进。",
    reasoningInstruction: "优先把回答沉淀成可复制的销售或客服转化资产。",
    signals: [/转化|成交|销售|招商|报价|异议|客户痛点|付费/i],
    decisionPolicy: basePolicy("conversion", "balanced", ["use_tool", "refine_output"])
  },
  {
    id: "knowledge-architect-agent",
    label: "知识架构 Agent",
    mode: "knowledge",
    promptModifier: "把内容沉淀为可检索、可训练、可复用的知识结构。",
    reasoningInstruction: "优先补齐分类、标签、标准问答、场景和安全边界。",
    signals: [/知识库|FAQ|标准问答|入库|投喂|训练|结构化/i],
    decisionPolicy: basePolicy("knowledge", "balanced", ["use_rag", "multi_step", "refine_output"])
  },
  {
    id: "growth-analyst-agent",
    label: "增长分析 Agent",
    mode: "growth",
    promptModifier: "把内容资产放进 Create → Improve → Distribute → Reuse 的增长循环。",
    reasoningInstruction: "优先识别增长潜力、旧内容刷新、衍生内容和复用路径。",
    signals: [/增长|增长闭环|飞轮|复用|衍生|持续优化|旧知识|刷新/i],
    decisionPolicy: basePolicy("growth", "deep", ["use_rag", "multi_step", "refine_output"])
  },
  {
    id: "seo-optimizer-agent",
    label: "SEO 优化 Agent",
    mode: "seo",
    promptModifier: "优化标题、关键词、FAQ、长尾问法和内容结构。",
    reasoningInstruction: "优先提升搜索可见度、可读性和内容分发质量。",
    signals: [/SEO|关键词|搜索|排名|长尾词|分发|传播|文章/i],
    decisionPolicy: basePolicy("seo", "balanced", ["use_tool", "refine_output"])
  },
  {
    id: "knowledge-amplifier-agent",
    label: "知识放大 Agent",
    mode: "amplifier",
    promptModifier: "把旧知识拆解、重组、扩展为更多可复用商业资产。",
    reasoningInstruction: "优先生成复用链、衍生资产和知识刷新建议。",
    signals: [/复用|衍生|放大|旧内容|旧知识|更新|刷新|拆解/i],
    decisionPolicy: basePolicy("amplifier", "balanced", ["use_rag", "multi_step", "refine_output"])
  },
  {
    id: "teaching-agent",
    label: "讲师 Agent",
    mode: "teaching",
    promptModifier: "按由浅入深的讲解路径回答，保留例子和关键概念。",
    reasoningInstruction: "用 step-by-step 讲解帮助管理员理解和复用。",
    signals: [/讲解|教我|学习|教程|解释|怎么理解/i],
    decisionPolicy: basePolicy("teaching", "balanced", ["multi_step", "refine_output"])
  },
  {
    id: "pm-agent",
    label: "产品经理 Agent",
    mode: "pm",
    promptModifier: "从目标、角色、流程、系统边界和交付形态组织答案。",
    reasoningInstruction: "把模糊需求拆成结构化方案和落地路径。",
    signals: [/产品|系统|设计|架构|需求|工作流|闭环|规划/i],
    decisionPolicy: basePolicy("pm", "deep", ["use_rag", "multi_step", "use_tool", "refine_output"])
  },
  {
    id: "compliance-agent",
    label: "合规 Agent",
    mode: "compliance",
    promptModifier: "优先识别风险边界、禁用承诺、权限和审核要求。",
    reasoningInstruction: "对输出做风险审查，避免夸大、越权或误导。",
    signals: [/合规|风险|审核|权限|卡密|法律|医疗|财务|承诺/i],
    decisionPolicy: basePolicy("compliance", "balanced", ["risk_review", "use_rag", "refine_output"])
  }
];

function basePolicy(
  mode: GptOSAgentMode,
  reasoningStrategy: GptOSReasoningStrategy,
  workflowHints: GptOSWorkflowHint[]
): GptOSAgentDecisionPolicy {
  return {
    mode,
    reasoningStrategy,
    reasoningDepth: reasoningStrategy === "deep" ? "high" : reasoningStrategy === "fast" ? "low" : "medium",
    toolPermission: true,
    workflowHints,
    allowToolLoop: true,
    maxLoopDepth: 3,
    replanEnabled: reasoningStrategy !== "fast",
    convergenceThreshold: 0.85,
    costAware: true,
    uxMode: "auto"
  };
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function policyForComplexity(policy: GptOSAgentDecisionPolicy, complexity: GptOSTaskComplexity, intent: GptOSTaskIntent) {
  const workflowHints = unique([
    ...policy.workflowHints,
    complexity !== "low" ? "multi_step" as const : undefined,
    intent === "debugging" ? "use_tool" as const : undefined,
    intent === "debugging" ? "refine_output" as const : undefined
  ].filter((item): item is GptOSWorkflowHint => Boolean(item)));

  return {
    ...policy,
    reasoningStrategy: complexity === "high" ? "deep" as const : policy.reasoningStrategy,
    reasoningDepth: complexity === "high" ? "high" as const : policy.reasoningDepth,
    maxLoopDepth: complexity === "low" ? 2 : 3,
    workflowHints
  };
}

function scoreAgent(agent: GptOSAgentProfile, plan: ReturnType<typeof planGptOSTask>, memory: GptOSPersonaMemory, multimodal: GptOSUnifiedContext) {
  const source = [
    multimodal.unifiedReasoning.singleReasoningInput,
    multimodal.unifiedReasoning.intent,
    multimodal.unifiedReasoning.cognitiveFrame.reasoningGoal,
    memory.personaLabel,
    memory.style,
    memory.domain
  ].join("\n");
  const signalMatches = agent.signals.filter((signal) => signal.test(source)).length;
  let score = signalMatches * 3;

  if (plan.requiredAgents.includes(agent.id)) {
    score += 4;
  }

  if (plan.businessIntent.enabled && [
    "content-strategist-agent",
    "business-analyst-agent",
    "conversion-optimizer-agent",
    "knowledge-architect-agent",
    "growth-analyst-agent",
    "seo-optimizer-agent",
    "knowledge-amplifier-agent"
  ].includes(agent.id)) {
    score += 3;
  }

  if (plan.businessIntent.monetizationSignals.length > 0 && (agent.id === "business-analyst-agent" || agent.id === "conversion-optimizer-agent")) {
    score += 3;
  }

  if (plan.businessIntent.outputTypes.includes("knowledge") && agent.id === "knowledge-architect-agent") {
    score += 3;
  }

  if (plan.businessIntent.optimizationGoals.includes("growth loop") && agent.id === "growth-analyst-agent") {
    score += 8;
  }

  if (plan.businessIntent.optimizationGoals.includes("growth loop") && agent.id === "knowledge-amplifier-agent") {
    score += 6;
  }

  if (plan.businessIntent.optimizationGoals.includes("SEO") && agent.id === "seo-optimizer-agent") {
    score += 6;
  }

  if (plan.complexity === "high" && (agent.id === "analysis-agent" || agent.id === "pm-agent")) {
    score += 2;
  }

  if (memory.style === "prefer deep analysis" && agent.id === "analysis-agent") {
    score += 2;
  }

  if (memory.domain === "business" && agent.id === "sales-agent") {
    score += 2;
  }

  if (memory.domain === "business" && (agent.id === "business-analyst-agent" || agent.id === "conversion-optimizer-agent")) {
    score += 2;
  }

  if (memory.domain === "coding" && agent.id === "pm-agent") {
    score += 1;
  }

  if (multimodal.unifiedReasoning.agentHints.includes(agent.id)) {
    score += 3;
  }

  if (multimodal.unifiedReasoning.systemSignals.cognitiveLoad === "high" && (agent.id === "analysis-agent" || agent.id === "pm-agent")) {
    score += 1;
  }

  if (multimodal.unifiedReasoning.cognitiveFrame.riskNotes.length > 0 && agent.id === "compliance-agent") {
    score += 1;
  }

  return score;
}

export function routeGptOSAgent(input: GptOSRouteInput): GptOSRouteResult {
  const initialMultimodal = input.multimodalContext ?? buildGptOSUnifiedContext(input);
  const planner = planGptOSTask({
    ...input,
    text: initialMultimodal.unifiedReasoning.singleReasoningInput || input.text
  });
  const memory = buildGptOSPersonaMemory({ ...input, plan: planner, multimodalContext: initialMultimodal });
  const multimodal = buildGptOSUnifiedContext(input, {
    planner,
    memory
  });
  const scored = GPT_OS_AGENTS.map((agent) => ({
    agent,
    score: scoreAgent(agent, planner, memory, multimodal)
  })).sort((left, right) => right.score - left.score);
  const selected = scored[0]?.agent ?? GPT_OS_AGENTS[0];
  const alternate = scored.find((item) => item.agent.id !== selected.id);
  const decisionPolicy = policyForComplexity(selected.decisionPolicy, planner.complexity, planner.intent);
  const goal = buildGptOSGoalState({
    text: input.text,
    plan: planner,
    memory,
    recentMessages: input.recentMessages
  });
  const actions = generateGptOSActions({
    text: input.text,
    plan: planner,
    persona: memory,
    selectedAgentId: selected.id,
    category: input.category,
    attachments: input.attachments
  });
  const business = runGptOSMonetizationPipeline({
    text: input.text,
    planner,
    memory,
    actions,
    category: input.category,
    selectedAgentId: selected.id
  });
  const growth = runGptOSContentGrowthEngine({
    text: input.text,
    business
  });
  const autonomousPlan = createAutonomousPlan(input.text, {
    goal: goal.currentGoal,
    plannerSteps: planner.steps,
    actions,
    autonomous: input.autonomous
  });
  const autonomousResult = executeAutonomousPlan(autonomousPlan, {
    goal: goal.currentGoal,
    plannerSteps: planner.steps,
    actions,
    autonomous: input.autonomous
  });
  const taskChainBase = createTaskChainFromAutonomousPlan(autonomousPlan, {
    goal: goal.currentGoal,
    selectedAgentId: selected.id,
    plannerSteps: planner.steps,
    autonomousResult,
    continuityKey: memory.taskContinuity.chainProgress
  });
  const taskChain = input.autonomous?.enabled
    ? executeTaskChain(taskChainBase)
    : pauseTaskChain(taskChainBase);
  const executionScheduler = scheduleTaskChain(taskChain);
  const kernel = runGptOSKernelRuntime({
    goal: goal.currentGoal,
    planner,
    memory,
    selectedAgentId: selected.id,
    taskChain,
    actions
  });
  const matchedSignals = unique([
    ...planner.signals,
    ...memory.memorySignals,
    ...planner.requiredAgents
  ]);
  const routeConfidence = Math.min(0.96, 0.62 + (scored[0]?.score ?? 0) * 0.04);
  const reasoningLoop = runGptOSReasoningLoop({
    planner,
    memory,
    multimodal,
    selectedAgent: {
      id: selected.id,
      label: selected.label,
      promptModifier: selected.promptModifier,
      reasoningInstruction: selected.reasoningInstruction
    },
    goal,
    decisionPolicy,
    actions,
    confidence: routeConfidence,
    autonomousTask: autonomousResult
  });
  const trace = createGptOSTrace({
    text: input.text,
    provider: "gpt-os",
    model: "gpt-os-router",
    agentId: selected.id,
    agentLabel: selected.label,
    plannerIntent: planner.intent,
    plannerComplexity: planner.complexity,
    memoryLabel: memory.personaLabel,
    reasoningLoop: {
      iterations: reasoningLoop.iterations,
      loopStatus: reasoningLoop.loopStatus,
      toolFeedback: reasoningLoop.toolFeedback
    },
    businessType: business.content.type,
    growthPotential: growth.growthPotential,
    kernelState: kernel.loopState,
    fallbackUsed: false
  });
  const cost = estimateGptOSCost({
    provider: "gpt-os",
    model: "gpt-os-router",
    inputText: input.text,
    reasoningIterations: reasoningLoop.iterations,
    toolCalls: reasoningLoop.toolFeedback.length
  });
  const latency = profileGptOSLatency({
    steps: trace.steps
  });
  const fallback = buildGptOSFallbackAnalytics({
    fallbackUsed: false,
    provider: "mock"
  });
  const toolChain = trace.toolChain.length
    ? trace.toolChain
    : reasoningLoop.toolFeedback.map((feedback) => feedback.split(":")[0]?.trim()).filter(Boolean);
  const observability = {
    trace,
    cost,
    latency,
    fallback,
    modelUsage: {
      provider: "gpt-os",
      modelUsed: "gpt-os-router",
      distribution: [
        {
          model: "gpt-os-router",
          provider: "gpt-os",
          count: 1
        }
      ]
    },
    agent: {
      selectedAgentId: selected.id,
      selectedAgentLabel: selected.label,
      alternateAgentId: alternate?.agent.id,
      selectionReason: `score=${scored[0]?.score ?? 0}; plan=${planner.intent}/${planner.complexity}; memory=${memory.personaLabel}`,
      confidence: routeConfidence
    },
    tools: {
      toolChain,
      toolFeedbackCount: reasoningLoop.toolFeedback.length,
      actionCount: actions.length,
      successRate: reasoningLoop.toolFeedback.length > 0 ? 1 : 0
    },
    diagnostics: [
      `traceId:${trace.traceId}`,
      `requestId:${trace.requestId}`,
      `latency:${latency.totalLatencyMs}`,
      `cost:${cost.totalCost}`,
      `fallback:${fallback.fallbackCount}`,
      `agent:${selected.id}`,
      `tools:${toolChain.join("|") || "none"}`
    ]
  };

  return {
    status: "internal_only",
    ui: null,
    pipeline: ["Unified Reasoning Core", "Planner", "Goal Manager", "Continuous Reasoning Loop", "Self Evaluation", "Memory", "Agent Perception", "Tool Layer", "Action Layer", "Trace Manager", "Cost Intelligence", "Latency Profiler", "Business Content Engine", "Monetization Pipeline", "Content Growth Engine", "Growth Scheduler", "Autonomous Executor", "Task Chain Engine", "Execution Scheduler", "Digital Worker OS", "Autonomous OS Kernel"],
    multimodal,
    planner,
    memory,
    selectedAgent: {
      id: selected.id,
      label: selected.label,
      mode: selected.mode,
      promptModifier: selected.promptModifier,
      reasoningInstruction: selected.reasoningInstruction
    },
    decisionPolicy,
    goal,
    reasoningLoop,
    autonomousPlan,
    autonomousResult,
    taskChain,
    executionScheduler,
    kernel,
    business,
    growth,
    observability,
    agentEvolution: {
      selectedScore: scored[0]?.score ?? 0,
      alternateAgentId: alternate?.agent.id,
      canSwitch: Boolean(alternate && (alternate.score + 2 >= (scored[0]?.score ?? 0))),
      performanceHint: reasoningLoop.selfEvaluation.improvementNeeded
        ? "self-evaluation suggests refining or switching strategy"
        : "selected agent path is stable",
      optimizationHint: reasoningLoop.selfEvaluation.improvementHints[0] ?? "keep current agent strategy"
    },
    actions,
    confidence: reasoningLoop.confidence,
    matchedSignals: unique([
      ...matchedSignals,
      `reasoningLoop:${reasoningLoop.loopStatus}`,
      `iterations:${reasoningLoop.iterations}`,
      `selfEvaluation:${reasoningLoop.selfEvaluation.totalScore}`,
      `goal:${goal.goalKey}`,
      `autonomous:${autonomousResult.status}`,
      `taskChain:${taskChain.status}`,
      `taskChainProgress:${Math.round(taskChain.progress * 100)}`,
      `kernel:${kernel.loopState}`,
      `kernelQueue:${kernel.resourceUsage.queueLength}`,
      `business:${business.content.type}`,
      `businessScore:${business.content.valueScore}`,
      `monetization:${business.monetizationPotential}`,
      `growth:${growth.growthPotential}`,
      `seo:${growth.amplifier.seoScore}`,
      `reuse:${growth.reuse.reuseCount}`,
      `trace:${observability.trace.traceId}`,
      `latency:${observability.latency.totalLatencyMs}`,
      `cost:${observability.cost.totalCost}`,
      `fallback:${observability.fallback.fallbackCount}`
    ]),
    reason: `Planner detected ${planner.intent}/${planner.complexity}; goal is ${goal.currentGoal}; memory profile is ${memory.personaLabel}; routed to ${selected.label}; loop ${reasoningLoop.loopStatus} after ${reasoningLoop.iterations} iterations; trace ${observability.trace.traceId}; latency ${observability.latency.totalLatencyMs}ms; estimated cost ${observability.cost.totalCost} USD; business ${business.content.type}/${business.monetizationPotential} with value score ${business.content.valueScore}; growth ${growth.growthPotential} with value ${growth.contentValueBefore}→${growth.contentValueAfter} and reuse ${growth.reuse.reuseCount}; autonomous status ${autonomousResult.status}; task chain ${taskChain.status} at ${Math.round(taskChain.progress * 100)}%; kernel ${kernel.loopState} with queue ${kernel.resourceUsage.queueLength}; self score ${reasoningLoop.selfEvaluation.totalScore}/10.`
  };
}
