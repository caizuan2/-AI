import {
  classifyActionRisk,
  getSafeUserMessage,
  type AutonomousActionRisk
} from "@/lib/enterprise/gpt-os-action-safety";
import type {
  AutonomousTaskPlan,
  AutonomousTaskResult
} from "@/lib/enterprise/gpt-os-autonomous-executor";
import type { GptOSTaskAgentId } from "@/lib/enterprise/gpt-os-planner";

export type TaskChainStatus = "running" | "paused" | "waiting_approval" | "completed" | "blocked" | "cancelled";
export type TaskStepStatus = "waiting" | "running" | "done" | "waiting_approval" | "blocked" | "cancelled";

export interface TaskStep {
  id: string;
  title: string;
  description: string;
  actionType: string;
  risk: AutonomousActionRisk;
  status: TaskStepStatus;
  agentId?: GptOSTaskAgentId;
  dependsOn?: string[];
  result?: string;
  error?: string;
}

export interface TaskChain {
  chainId: string;
  goal: string;
  steps: TaskStep[];
  status: TaskChainStatus;
  currentStepIndex: number;
  createdAt: string;
  updatedAt: string;
  progress: number;
  waitingApprovalStepId?: string;
  blockedActions: string[];
  continuityKey?: string;
}

export interface TaskChainExecutionResult extends TaskChain {
  currentStep?: TaskStep;
  nextStep?: TaskStep;
  completedSteps: number;
  summary: string;
  canResume: boolean;
}

export interface TaskChainContext {
  goal?: string;
  selectedAgentId?: GptOSTaskAgentId;
  plannerSteps?: string[];
  autonomousResult?: AutonomousTaskResult;
  continuityKey?: string;
}

function nowIso() {
  return new Date().toISOString();
}

function compact(value: string, maxLength = 100) {
  const text = value.trim().replace(/\s+/g, " ");

  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function progressFor(steps: TaskStep[]) {
  if (!steps.length) {
    return 1;
  }

  return steps.filter((step) => step.status === "done").length / steps.length;
}

function firstActiveStepIndex(steps: TaskStep[]) {
  const index = steps.findIndex((step) => !["done", "cancelled"].includes(step.status));

  return index >= 0 ? index : steps.length;
}

function actionTypeFor(title: string, fallback = "reason") {
  if (/删除|清空|移除/i.test(title)) return "delete";
  if (/保存|入库|写入/i.test(title) && !/生成|建议|草稿/i.test(title)) return "save";
  if (/导出|发布|发送/i.test(title)) return "publish";
  if (/检查|风险|合规/i.test(title)) return "risk-check";
  if (/总结|提取|拆解|知识点|检索/i.test(title)) return "analyze";
  if (/生成|草稿|设计|话术|SOP|报告/i.test(title)) return "draft";

  return fallback;
}

function stepDedupeKey(step: TaskStep) {
  return `${step.actionType}:${step.title.replace(/（需确认）|\(需确认\)/g, "").trim()}`;
}

function uniqueTaskSteps(steps: TaskStep[]) {
  const seen = new Set<string>();

  return steps.filter((step) => {
    const key = stepDedupeKey(step);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function summaryFor(chain: TaskChain) {
  if (chain.status === "completed") {
    return "任务链已完成。所有自动结果均为草稿、分析或建议，真实保存仍需使用明确保存入口。";
  }

  if (chain.status === "waiting_approval") {
    const step = chain.steps.find((item) => item.id === chain.waitingApprovalStepId);

    return `任务链已暂停在人工审批点：${step?.title ?? "待确认步骤"}。管理员确认后会从下一步继续。`;
  }

  if (chain.status === "blocked") {
    return "任务链检测到危险动作并已阻断，不会继续执行删除、发布或外部写入类操作。";
  }

  if (chain.status === "paused") {
    return "任务链已暂停，保留当前上下文，继续后会从当前步骤恢复。";
  }

  if (chain.status === "cancelled") {
    return "任务链已取消，不会继续推进后续步骤。";
  }

  return "任务链正在推进低风险步骤，高风险动作会等待管理员确认。";
}

export function finalizeTaskChain(chain: TaskChain, summary = summaryFor(chain)): TaskChainExecutionResult {
  const activeIndex = firstActiveStepIndex(chain.steps);
  const currentStep = chain.steps[activeIndex];
  const nextStep = chain.steps.slice(activeIndex + 1).find((step) => step.status === "waiting");
  const completedSteps = chain.steps.filter((step) => step.status === "done").length;
  const progress = progressFor(chain.steps);

  return {
    ...chain,
    currentStepIndex: activeIndex,
    currentStep,
    nextStep,
    completedSteps,
    progress,
    summary,
    canResume: chain.status === "paused" || chain.status === "waiting_approval"
  };
}

export function createTaskChainFromAutonomousPlan(
  plan: AutonomousTaskPlan,
  context: TaskChainContext = {}
): TaskChain {
  const createdAt = nowIso();
  const plannerStepTitles = context.plannerSteps ?? [];
  const steps: TaskStep[] = uniqueTaskSteps(plan.steps.map((step, index) => {
    const title = step.title || plannerStepTitles[index] || `任务步骤 ${index + 1}`;
    const actionType = step.actionType || actionTypeFor(title);
    const risk = step.risk ?? classifyActionRisk({ title, actionType });

    return {
      id: `chain-${step.id}`,
      title,
      description: step.description || getSafeUserMessage({ title, actionType }),
      actionType,
      risk,
      status: "waiting",
      agentId: context.selectedAgentId,
      dependsOn: index > 0 ? [`chain-${plan.steps[index - 1].id}`] : undefined
    };
  }));

  return {
    chainId: `chain-${plan.taskId}`,
    goal: compact(context.goal ?? plan.goal),
    steps,
    status: "running",
    currentStepIndex: 0,
    createdAt,
    updatedAt: createdAt,
    progress: 0,
    blockedActions: [...plan.blockedActions],
    continuityKey: context.continuityKey
  };
}

export function executeNextStep(chain: TaskChain): TaskChainExecutionResult {
  if (["paused", "waiting_approval", "completed", "blocked", "cancelled"].includes(chain.status)) {
    return finalizeTaskChain(chain);
  }

  const steps = [...chain.steps];
  const index = firstActiveStepIndex(steps);
  const step = steps[index];

  if (!step) {
    return finalizeTaskChain({
      ...chain,
      status: "completed",
      updatedAt: nowIso(),
      progress: 1
    });
  }

  if (step.risk === "dangerous") {
    steps[index] = {
      ...step,
      status: "blocked",
      error: getSafeUserMessage(step)
    };

    return finalizeTaskChain({
      ...chain,
      steps,
      status: "blocked",
      currentStepIndex: index,
      updatedAt: nowIso(),
      blockedActions: Array.from(new Set([...chain.blockedActions, step.title]))
    });
  }

  if (step.risk === "review_required") {
    steps[index] = {
      ...step,
      status: "waiting_approval",
      result: getSafeUserMessage(step)
    };

    return finalizeTaskChain({
      ...chain,
      steps,
      status: "waiting_approval",
      currentStepIndex: index,
      waitingApprovalStepId: step.id,
      updatedAt: nowIso()
    });
  }

  steps[index] = {
    ...step,
    status: "done",
    result: `已完成低风险步骤：${step.title}。结果作为草稿/建议回流到任务链，不执行外部写入。`
  };

  const hasRemaining = steps.some((item) => item.status === "waiting");

  return finalizeTaskChain({
    ...chain,
    steps,
    status: hasRemaining ? "running" : "completed",
    currentStepIndex: hasRemaining ? firstActiveStepIndex(steps) : Math.max(0, steps.length - 1),
    updatedAt: nowIso()
  });
}

export function executeTaskChain(chain: TaskChain, maxSteps = 8): TaskChainExecutionResult {
  let result = finalizeTaskChain(chain);
  let guard = 0;

  while (result.status === "running" && guard < maxSteps) {
    guard += 1;
    result = executeNextStep(result);
  }

  return result;
}

export function approveTaskChainStep(chain: TaskChain, stepId: string): TaskChainExecutionResult {
  const steps = chain.steps.map((step) => step.id === stepId
    ? {
      ...step,
      status: "done" as const,
      result: `${step.title} 已由管理员确认。任务链将从后续低风险步骤继续。`
    }
    : step);

  return executeTaskChain({
    ...chain,
    steps,
    status: "running",
    waitingApprovalStepId: undefined,
    currentStepIndex: firstActiveStepIndex(steps),
    updatedAt: nowIso()
  });
}

export function pauseTaskChain(chain: TaskChain): TaskChainExecutionResult {
  return finalizeTaskChain({
    ...chain,
    status: "paused",
    updatedAt: nowIso()
  });
}

export function resumeTaskChain(chain: TaskChain): TaskChainExecutionResult {
  return executeTaskChain({
    ...chain,
    status: "running",
    updatedAt: nowIso()
  });
}

export function cancelTaskChain(chain: TaskChain): TaskChainExecutionResult {
  return finalizeTaskChain({
    ...chain,
    status: "cancelled",
    steps: chain.steps.map((step) => ["done", "blocked"].includes(step.status) ? step : { ...step, status: "cancelled" }),
    updatedAt: nowIso()
  });
}
