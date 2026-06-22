import type { GptOSTaskPlan } from "@/lib/enterprise/gpt-os-planner";
import type { GptOSPersonaMemory } from "@/lib/enterprise/gpt-os-persona-memory";

export interface GptOSGoalState {
  goalKey: string;
  currentGoal: string;
  subGoals: string[];
  progress: number;
  persistence: "conversation-memory";
  signals: string[];
}

interface GoalInput {
  text: string;
  plan: GptOSTaskPlan;
  memory: GptOSPersonaMemory;
  recentMessages?: Array<{ role: "user" | "assistant"; content: string }>;
}

function compact(value: string, maxLength = 80) {
  const text = value.trim().replace(/\s+/g, " ");

  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function inferGoal(input: GoalInput) {
  const recentUserGoal = [...(input.recentMessages ?? [])]
    .reverse()
    .find((message) => message.role === "user" && /目标|升级|实现|修复|构建|优化/.test(message.content));

  if (/知识库|投喂|入库|训练/.test(input.text)) {
    return "持续提升管理员投喂到知识入库的质量闭环";
  }

  if (/GPT OS|Agent|workflow|工作流|自治|推理/.test(input.text)) {
    return "把 GPT OS 升级成可控、可解释、可持续优化的 Agent 系统";
  }

  if (recentUserGoal) {
    return compact(recentUserGoal.content);
  }

  if (input.plan.intent === "debugging") {
    return "稳定解决当前异常并沉淀可复用排查路径";
  }

  if (input.plan.intent === "creation") {
    return "把当前想法转成可交付方案";
  }

  return "围绕当前问题生成可靠、自然、可执行的回答";
}

function goalKeyFor(goal: string, memory: GptOSPersonaMemory) {
  return `${memory.domain}:${goal.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-").slice(0, 48)}`;
}

export function buildGptOSGoalState(input: GoalInput): GptOSGoalState {
  const currentGoal = inferGoal(input);
  const subGoals = [
    ...input.plan.steps,
    input.memory.style === "prefer deep analysis" ? "保留原因、证据和风险边界" : "",
    input.memory.style === "prefer structured delivery" ? "输出可执行结构" : "",
    "形成可继续迭代的下一步"
  ].filter(Boolean).slice(0, 7);
  const recentCount = input.recentMessages?.length ?? 0;
  const progress = Math.min(0.92, 0.32 + input.plan.steps.length * 0.07 + (recentCount ? 0.12 : 0));

  return {
    goalKey: goalKeyFor(currentGoal, input.memory),
    currentGoal,
    subGoals,
    progress: Math.round(progress * 100) / 100,
    persistence: "conversation-memory",
    signals: [
      `goal:${currentGoal}`,
      `progress:${Math.round(progress * 100)}%`,
      `persona:${input.memory.personaLabel}`
    ]
  };
}
