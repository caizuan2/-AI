import type { GptOSTaskPlan } from "@/lib/enterprise/gpt-os-planner";
import type { GptOSUnifiedContext } from "@/lib/enterprise/gpt-os-multimodal-router";

export type GptOSPersonaStyle = "prefer concise" | "prefer deep analysis" | "prefer structured delivery";
export type GptOSPersonaDomain = "AI" | "coding" | "business" | "customer service" | "general";
export type GptOSPersonaBehavior = "frequent iteration user" | "question-answer user" | "builder user";

export interface GptOSPersonaMemory {
  style: GptOSPersonaStyle;
  domain: GptOSPersonaDomain;
  behavior: GptOSPersonaBehavior;
  learning: {
    failurePatterns: string[];
    successPatterns: string[];
    improvementHints: string[];
  };
  modalityMemory: {
    voiceBehavior: "voice-first" | "voice-assisted" | "text-first";
    fileInteractionPattern: "file-heavy" | "file-assisted" | "text-only";
    imageUsagePattern: "image-metadata-aware" | "image-light" | "no-image";
  };
  cognitiveModel: {
    dominantPattern: "text-driven" | "file-driven" | "voice-assisted" | "image-assisted" | "mixed-context";
    mergedSignals: string[];
  };
  taskContinuity: {
    taskHistory: string[];
    chainProgress: string;
    executionState: "idle" | "active" | "waiting_approval" | "paused";
    continuitySignals: string[];
  };
  crossTaskLearning: {
    learnedPatterns: string[];
    agentSelectionHints: string[];
    systemTuningHints: string[];
  };
  preferences: string[];
  personaLabel: string;
  confidence: number;
  memorySignals: string[];
}

interface PersonaInput {
  text: string;
  activeAgentName?: string | null;
  category?: string | null;
  recentMessages?: Array<{ role: "user" | "assistant"; content: string }>;
  plan?: GptOSTaskPlan;
  multimodalContext?: GptOSUnifiedContext;
}

function has(text: string, pattern: RegExp) {
  return pattern.test(text);
}

function inferDomain(text: string, category?: string | null): GptOSPersonaDomain {
  const source = `${text} ${category ?? ""}`;

  if (has(source, /代码|API|报错|Codex|Next\.js|TypeScript|build|lint|typecheck|接口/i)) {
    return "coding";
  }

  if (has(source, /AI|GPT|RAG|Agent|知识库|模型|投喂/i)) {
    return "AI";
  }

  if (has(source, /客户|客服|售后|话术|异议|退款/i)) {
    return "customer service";
  }

  if (has(source, /销售|招商|商业|SaaS|套餐|付费|转化/i)) {
    return "business";
  }

  return "general";
}

function inferStyle(text: string, plan?: GptOSTaskPlan): GptOSPersonaStyle {
  if (has(text, /详细|深度|严格|一定要|完整|执行到位|分析|排查|诊断/i) || plan?.complexity === "high") {
    return "prefer deep analysis";
  }

  if (has(text, /步骤|清单|SOP|表格|结构化|分类|计划/i) || plan?.intent === "creation") {
    return "prefer structured delivery";
  }

  return "prefer concise";
}

function inferBehavior(input: PersonaInput): GptOSPersonaBehavior {
  const recentCount = input.recentMessages?.length ?? 0;

  if (recentCount >= 6 || has(input.text, /继续|再|优化|升级|补全|修复|阶段/i)) {
    return "frequent iteration user";
  }

  if (has(input.text, /设计|搭建|实现|系统|工作流|规划/i)) {
    return "builder user";
  }

  return "question-answer user";
}

function buildPreferences(input: PersonaInput, style: GptOSPersonaStyle, domain: GptOSPersonaDomain) {
  const preferences = new Set<string>();

  if (style === "prefer deep analysis") {
    preferences.add("输出要有原因、步骤和风险边界");
  }

  if (style === "prefer structured delivery") {
    preferences.add("优先用清晰分段和可执行清单");
  }

  if (domain === "AI") {
    preferences.add("保留 Agent / RAG / 知识库上下文");
  }

  if (domain === "coding") {
    preferences.add("先定位真实链路，再最小化修改");
  }

  if (input.plan?.complexity === "high") {
    preferences.add("复杂任务需要拆解再回答");
  }

  if (input.multimodalContext?.fileUsed) {
    preferences.add("文件内容要并入同一条推理链");
  }

  if (input.multimodalContext?.imageUsed) {
    preferences.add("图片先按元数据和上下文说明，不虚构视觉细节");
  }

  if (input.multimodalContext?.voiceUsed) {
    preferences.add("语音转写要按自然口语理解后再结构化");
  }

  return Array.from(preferences).slice(0, 5);
}

function buildLearningMemory(input: PersonaInput): GptOSPersonaMemory["learning"] {
  const failurePatterns = new Set<string>();
  const successPatterns = new Set<string>();
  const improvementHints = new Set<string>();
  const source = [
    input.text,
    ...(input.recentMessages ?? []).map((message) => message.content)
  ].join("\n");

  if (/失败|报错|不对|没效果|回归|解析失败|白屏/i.test(source)) {
    failurePatterns.add("历史问题中出现失败或回归，需要优先保护稳定性");
    improvementHints.add("回答前先识别失败原因和验证路径");
  }

  if (/通过|成功|稳定|验收|build成功|自测/i.test(source)) {
    successPatterns.add("用户重视已验证成功路径，需要避免破坏");
    improvementHints.add("复用已成功的最小改动方式");
  }

  if (input.plan?.complexity === "high") {
    improvementHints.add("高复杂任务需要先拆目标、再循环自评");
  }

  if (input.multimodalContext?.unifiedReasoning.cognitiveFrame.riskNotes.length) {
    failurePatterns.add("上下文存在解析限制或风险提示，需要显式说明边界");
  }

  return {
    failurePatterns: Array.from(failurePatterns).slice(0, 4),
    successPatterns: Array.from(successPatterns).slice(0, 4),
    improvementHints: Array.from(improvementHints).slice(0, 5)
  };
}

function inferModalityMemory(multimodalContext?: GptOSUnifiedContext): GptOSPersonaMemory["modalityMemory"] {
  return {
    voiceBehavior: multimodalContext?.voiceUsed ? "voice-assisted" : "text-first",
    fileInteractionPattern: multimodalContext?.metadata.fileCount && multimodalContext.metadata.fileCount > 1
      ? "file-heavy"
      : multimodalContext?.fileUsed
        ? "file-assisted"
        : "text-only",
    imageUsagePattern: multimodalContext?.imageUsed ? "image-metadata-aware" : "no-image"
  };
}

function inferCognitiveModel(input: PersonaInput, modalityMemory: GptOSPersonaMemory["modalityMemory"]): GptOSPersonaMemory["cognitiveModel"] {
  const context = input.multimodalContext;
  const mergedSignals = [
    `text:${input.text.trim().length > 0 ? "present" : "empty"}`,
    `voice:${modalityMemory.voiceBehavior}`,
    `file:${modalityMemory.fileInteractionPattern}`,
    `image:${modalityMemory.imageUsagePattern}`,
    ...(context?.unifiedReasoning.agentHints ?? [])
  ];

  if (context?.modality === "multi") {
    return {
      dominantPattern: "mixed-context",
      mergedSignals
    };
  }

  if (context?.fileUsed) {
    return {
      dominantPattern: "file-driven",
      mergedSignals
    };
  }

  if (context?.voiceUsed) {
    return {
      dominantPattern: "voice-assisted",
      mergedSignals
    };
  }

  if (context?.imageUsed) {
    return {
      dominantPattern: "image-assisted",
      mergedSignals
    };
  }

  return {
    dominantPattern: "text-driven",
    mergedSignals
  };
}

function buildTaskContinuity(input: PersonaInput): GptOSPersonaMemory["taskContinuity"] {
  const source = [
    input.text,
    ...(input.recentMessages ?? []).map((message) => message.content)
  ].join("\n");
  const taskHistory = [
    ...(input.plan?.steps.slice(0, 5) ?? []),
    ...(input.recentMessages ?? [])
      .filter((message) => /执行|任务|步骤|继续|审批|确认|暂停|恢复/i.test(message.content))
      .slice(-3)
      .map((message) => message.content.trim().slice(0, 60))
  ];
  const executionState = /暂停|先停|stop/i.test(source)
    ? "paused"
    : /确认|审批|继续执行|恢复/i.test(source)
      ? "waiting_approval"
      : input.plan?.complexity === "high" || /执行|任务链|持续|推进|自动/i.test(source)
        ? "active"
        : "idle";
  const continuitySignals = [
    `execution:${executionState}`,
    input.plan ? `planSteps:${input.plan.steps.length}` : "planSteps:0",
    input.plan?.approvalRequired ? "approval:required" : "approval:not_required",
    input.plan?.blockedActions.length ? `blocked:${input.plan.blockedActions.join("|")}` : "blocked:none"
  ];

  return {
    taskHistory: Array.from(new Set(taskHistory)).slice(0, 8),
    chainProgress: input.plan
      ? `${input.plan.intent}/${input.plan.complexity} · ${input.plan.steps.length} steps`
      : "no active task chain",
    executionState,
    continuitySignals
  };
}

function buildCrossTaskLearning(input: PersonaInput, taskContinuity: GptOSPersonaMemory["taskContinuity"]): GptOSPersonaMemory["crossTaskLearning"] {
  const learnedPatterns = new Set<string>();
  const agentSelectionHints = new Set<string>();
  const systemTuningHints = new Set<string>();

  if (input.plan?.complexity === "high") {
    learnedPatterns.add("高复杂任务通常需要任务链持续推进，而不是一次性回答。");
    systemTuningHints.add("高复杂任务降低后台优化优先级，优先保障用户任务。");
  }

  if (input.plan?.approvalRequired || taskContinuity.executionState === "waiting_approval") {
    learnedPatterns.add("出现保存/导出/发布类动作时必须保留审批恢复点。");
    agentSelectionHints.add("审批场景优先保留 compliance-agent 作为守护资源。");
  }

  if (input.plan?.blockedActions.length) {
    learnedPatterns.add("危险动作要进入阻断记忆，后续同类任务直接提高风险等级。");
    agentSelectionHints.add("阻断场景优先选择 compliance-agent 或 analysis-agent。");
    systemTuningHints.add("检测到危险动作后启用 safe_throttle 调度策略。");
  }

  if (input.recentMessages?.some((message) => /继续|恢复|下一步|阶段/i.test(message.content))) {
    learnedPatterns.add("用户经常跨轮推进任务，需要保留 chainProgress。");
  }

  return {
    learnedPatterns: Array.from(learnedPatterns).slice(0, 5),
    agentSelectionHints: Array.from(agentSelectionHints).slice(0, 4),
    systemTuningHints: Array.from(systemTuningHints).slice(0, 4)
  };
}

export function buildGptOSPersonaMemory(input: PersonaInput): GptOSPersonaMemory {
  const domain = inferDomain(input.text, input.category);
  const style = inferStyle(input.text, input.plan);
  const behavior = inferBehavior(input);
  const modalityMemory = inferModalityMemory(input.multimodalContext);
  const cognitiveModel = inferCognitiveModel(input, modalityMemory);
  const taskContinuity = buildTaskContinuity(input);
  const crossTaskLearning = buildCrossTaskLearning(input, taskContinuity);
  const learning = buildLearningMemory(input);
  const preferences = buildPreferences(input, style, domain);
  const confidence = Math.min(0.94, 0.58 + preferences.length * 0.08 + (input.recentMessages?.length ? 0.1 : 0) + (input.multimodalContext?.modality === "multi" ? 0.04 : 0));
  const memorySignals = [
    `style:${style}`,
    `domain:${domain}`,
    `behavior:${behavior}`,
    `voice:${modalityMemory.voiceBehavior}`,
    `file:${modalityMemory.fileInteractionPattern}`,
    `image:${modalityMemory.imageUsagePattern}`,
    ...taskContinuity.continuitySignals,
    ...crossTaskLearning.learnedPatterns.map((pattern) => `crossTask:${pattern.slice(0, 24)}`),
    ...(input.multimodalContext?.memorySignals ?? []),
    ...(input.activeAgentName ? [`agent:${input.activeAgentName}`] : [])
  ];

  return {
    style,
    domain,
    behavior,
    learning,
    modalityMemory,
    cognitiveModel,
    taskContinuity,
    crossTaskLearning,
    preferences,
    personaLabel: style === "prefer deep analysis"
      ? "深度分析型用户"
      : style === "prefer structured delivery"
        ? "结构化执行型用户"
        : "简洁问答型用户",
    confidence,
    memorySignals
  };
}

export function updateGptOSPersonaMemory(input: PersonaInput, behavior?: Partial<GptOSPersonaMemory>) {
  return {
    ...buildGptOSPersonaMemory(input),
    ...behavior
  };
}

export function buildGptOSMemoryIterationUpdate(input: {
  memory: GptOSPersonaMemory;
  iteration: number;
  phase: string;
  observation: string;
  confidence: number;
}) {
  const signal = input.memory.style === "prefer deep analysis"
    ? "本轮继续保留深度分析偏好"
    : input.memory.style === "prefer structured delivery"
      ? "本轮继续保留结构化交付偏好"
      : "本轮保持简洁问答偏好";
  const confidence = Math.round(input.confidence * 100);

  return `iteration ${input.iteration} ${input.phase}: ${signal}；观察到 ${input.observation}；当前可信度 ${confidence}%。`;
}
