import {
  classifyActionRisk,
  getSafeUserMessage,
  type AutonomousActionLike,
  type AutonomousActionRisk
} from "@/lib/enterprise/gpt-os-action-safety";
import type { GptOSActionSuggestion } from "@/lib/enterprise/gpt-os-action-layer";

export type { AutonomousActionRisk } from "@/lib/enterprise/gpt-os-action-safety";

export type AutonomousTaskStatus =
  | "idle"
  | "planning"
  | "running"
  | "needs_approval"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export type AutonomousTaskMode = "plan_only" | "execute_safe" | "needs_approval";

export interface AutonomousStep {
  id: string;
  title: string;
  description: string;
  actionType: string;
  risk: AutonomousActionRisk;
  status: AutonomousTaskStatus;
  result?: string;
  error?: string;
}

export interface AutonomousTaskPlan {
  taskId: string;
  goal: string;
  steps: AutonomousStep[];
  status: AutonomousTaskStatus;
  approvalRequired: boolean;
  blockedActions: string[];
}

export interface AutonomousTaskRequest {
  enabled?: boolean;
  taskId?: string;
  mode?: AutonomousTaskMode;
}

export interface AutonomousTaskResult extends AutonomousTaskPlan {
  enabled: boolean;
  mode: AutonomousTaskMode;
  currentStep?: string;
  nextStep?: string;
  summaryResult: string;
}

export interface AutonomousExecutionContext {
  goal?: string;
  plannerSteps?: string[];
  actions?: GptOSActionSuggestion[];
  autonomous?: AutonomousTaskRequest;
}

const taskStore = new Map<string, AutonomousTaskPlan>();

function createTaskId() {
  return `auto-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function compact(value: string, maxLength = 96) {
  const text = value.trim().replace(/\s+/g, " ");

  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function actionTypeFor(title: string, fallback = "analyze") {
  if (/删除|清空|移除/i.test(title)) return "delete";
  if (/保存|入库|写入/i.test(title) && !/生成|建议|草稿/i.test(title)) return "save";
  if (/导出|发布|发送/i.test(title)) return "publish";
  if (/检查|风险|合规/i.test(title)) return "risk-check";
  if (/总结|提取|拆解|知识点/i.test(title)) return "analyze";
  if (/草稿|话术|SOP|报告|生成/i.test(title)) return "draft";

  return fallback;
}

function stepFromAction(action: AutonomousActionLike, index: number): AutonomousStep {
  const title = action.label ?? action.title ?? action.description ?? `执行步骤 ${index + 1}`;
  const actionType = action.actionType ?? action.type ?? actionTypeFor(title);
  const risk = classifyActionRisk({ ...action, title, actionType });

  return {
    id: action.id ?? `action-${index + 1}`,
    title,
    description: action.description ?? getSafeUserMessage({ title, actionType }),
    actionType,
    risk,
    status: "idle"
  };
}

function stepFromPlannerStep(step: string, index: number): AutonomousStep {
  const actionType = actionTypeFor(step);
  const normalizedStep = /保存|入库/i.test(step) && !/生成|建议|草稿/i.test(step)
    ? `${step}（需确认）`
    : step;
  const risk = classifyActionRisk({ title: normalizedStep, actionType });

  return {
    id: `plan-${index + 1}`,
    title: normalizedStep,
    description: risk === "safe"
      ? `自动执行低风险步骤：${normalizedStep}`
      : getSafeUserMessage({ title: normalizedStep, actionType }),
    actionType,
    risk,
    status: "idle"
  };
}

function uniqueSteps(steps: AutonomousStep[]) {
  const seen = new Set<string>();

  return steps.filter((step) => {
    const key = `${step.title}:${step.actionType}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  }).slice(0, 10);
}

function inferExtraSteps(input: string): AutonomousStep[] {
  const steps: AutonomousStep[] = [];

  if (/删除|清空|移除/i.test(input)) {
    steps.push(stepFromAction({
      id: "blocked-delete",
      title: "阻断删除动作",
      description: "删除知识库、文件或旧数据属于危险动作，GPT OS 只提示风险，不会自动执行。",
      actionType: "delete"
    }, 0));
  }

  if (/保存|入库|写入知识库/i.test(input)) {
    steps.push(stepFromAction({
      id: "approve-save-knowledge",
      title: "保存知识入库",
      description: "保存知识入库会产生写入效果，必须由管理员确认后再执行。",
      actionType: "save"
    }, steps.length));
  }

  return steps;
}

export function createAutonomousPlan(input: string, context: AutonomousExecutionContext = {}): AutonomousTaskPlan {
  const plannerSteps = context.plannerSteps?.length ? context.plannerSteps : ["理解任务", "生成执行草稿", "复核结果"];
  const steps = uniqueSteps([
    ...plannerSteps.map(stepFromPlannerStep),
    ...inferExtraSteps(input),
    ...(context.actions ?? []).map((action, index) => stepFromAction(action, plannerSteps.length + index))
  ]);
  const blockedActions = steps.filter((step) => step.risk === "dangerous").map((step) => step.title);
  const approvalRequired = steps.some((step) => step.risk === "review_required");
  const plan: AutonomousTaskPlan = {
    taskId: context.autonomous?.taskId ?? createTaskId(),
    goal: compact(context.goal ?? (input || "自主执行任务")),
    steps,
    status: "planning",
    approvalRequired,
    blockedActions
  };

  taskStore.set(plan.taskId, plan);
  return plan;
}

export function executeAutonomousStep(step: AutonomousStep): AutonomousStep {
  if (step.risk === "dangerous") {
    return {
      ...step,
      status: "failed",
      error: getSafeUserMessage(step)
    };
  }

  if (step.risk === "review_required") {
    return {
      ...step,
      status: "needs_approval",
      result: getSafeUserMessage(step)
    };
  }

  return {
    ...step,
    status: "completed",
    result: `已自动完成：${step.title}。结果以草稿/建议形式回流，不写数据库、不保存入库。`
  };
}

export function executeAutonomousPlan(plan: AutonomousTaskPlan, context: AutonomousExecutionContext = {}): AutonomousTaskResult {
  const enabled = context.autonomous?.enabled === true;
  const mode = context.autonomous?.mode ?? (enabled ? "execute_safe" : "plan_only");

  if (!enabled || mode === "plan_only") {
    const result = {
      ...plan,
      status: "idle" as const,
      enabled,
      mode,
      currentStep: plan.steps[0]?.title,
      nextStep: plan.steps[0]?.title,
      summaryResult: "自主执行默认关闭，GPT OS 只生成可审查计划，不自动执行。"
    };

    taskStore.set(plan.taskId, result);
    return result;
  }

  const executedSteps: AutonomousStep[] = [];
  let status: AutonomousTaskStatus = "running";
  let currentStep: string | undefined;
  let nextStep: string | undefined;

  for (const step of plan.steps) {
    currentStep = step.title;
    const executed = executeAutonomousStep(step);

    executedSteps.push(executed);

    if (executed.status === "failed") {
      status = "failed";
      nextStep = undefined;
      break;
    }

    if (executed.status === "needs_approval") {
      status = "needs_approval";
      nextStep = executed.title;
      break;
    }
  }

  if (status === "running") {
    status = "completed";
  }

  const result: AutonomousTaskResult = {
    ...plan,
    steps: [
      ...executedSteps,
      ...plan.steps.slice(executedSteps.length)
    ],
    status,
    enabled,
    mode,
    currentStep,
    nextStep,
    summaryResult: status === "completed"
      ? "安全步骤已自动执行完成，所有结果均为草稿/建议。"
      : status === "needs_approval"
        ? "已完成低风险步骤，后续写入/保存/导出类动作等待管理员确认。"
        : "检测到危险动作，GPT OS 已阻断并停止继续执行。"
  };

  taskStore.set(plan.taskId, result);
  return result;
}

function updateTaskStatus(taskId: string, status: AutonomousTaskStatus): AutonomousTaskPlan | null {
  const task = taskStore.get(taskId);

  if (!task) {
    return null;
  }

  const nextTask = { ...task, status };

  taskStore.set(taskId, nextTask);
  return nextTask;
}

export function pauseAutonomousTask(taskId: string) {
  return updateTaskStatus(taskId, "paused");
}

export function resumeAutonomousTask(taskId: string) {
  return updateTaskStatus(taskId, "running");
}

export function cancelAutonomousTask(taskId: string) {
  return updateTaskStatus(taskId, "cancelled");
}
