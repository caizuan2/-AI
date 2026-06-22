import type { GptOSTaskAgentId } from "@/lib/enterprise/gpt-os-planner";
import type { TaskChainExecutionResult } from "@/lib/enterprise/gpt-os-task-chain-engine";

export type KernelTaskOrigin = "user" | "system" | "optimization";
export type KernelTaskStatus = "queued" | "running" | "completed" | "failed" | "delayed";

export interface KernelTask {
  id: string;
  title: string;
  origin: KernelTaskOrigin;
  priority: number;
  status: KernelTaskStatus;
  assignedAgentId?: GptOSTaskAgentId;
  toolHints: string[];
  chainId?: string;
  createdAt: string;
  updatedAt: string;
  result?: string;
}

export interface KernelAgentResource {
  id: GptOSTaskAgentId;
  status: "idle" | "assigned" | "guarding";
  load: number;
  capabilities: string[];
}

export interface KernelTaskSchedulerSnapshot {
  queue: KernelTask[];
  priorityQueue: KernelTask[];
  delayedTasks: KernelTask[];
  completedTasks: KernelTask[];
  failedTasks: KernelTask[];
  lastAssignedTask?: KernelTask;
  lastUpdatedAt: string;
}

const schedulerState: KernelTaskSchedulerSnapshot = {
  queue: [],
  priorityQueue: [],
  delayedTasks: [],
  completedTasks: [],
  failedTasks: [],
  lastUpdatedAt: new Date().toISOString()
};

function nowIso() {
  return new Date().toISOString();
}

function createTaskId(origin: KernelTaskOrigin) {
  return `kernel-${origin}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function taskKey(task: KernelTask) {
  return `${task.origin}:${task.chainId ?? "system"}:${task.title}`;
}

function dedupeTasks(tasks: KernelTask[], limit = 12) {
  const seen = new Set<string>();

  return tasks.filter((task) => {
    const key = taskKey(task);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  }).slice(0, limit);
}

function priorityWeight(origin: KernelTaskOrigin) {
  if (origin === "user") return 30;
  if (origin === "system") return 20;

  return 10;
}

export function createKernelTask(input: {
  title: string;
  origin: KernelTaskOrigin;
  priority?: number;
  assignedAgentId?: GptOSTaskAgentId;
  toolHints?: string[];
  chainId?: string;
}): KernelTask {
  const createdAt = nowIso();

  return {
    id: createTaskId(input.origin),
    title: input.title,
    origin: input.origin,
    priority: input.priority ?? priorityWeight(input.origin),
    status: "queued",
    assignedAgentId: input.assignedAgentId,
    toolHints: input.toolHints ?? [],
    chainId: input.chainId,
    createdAt,
    updatedAt: createdAt
  };
}

export function createKernelTaskFromChain(chain: TaskChainExecutionResult, assignedAgentId?: GptOSTaskAgentId) {
  return createKernelTask({
    title: chain.currentStep?.title ?? chain.goal,
    origin: "user",
    priority: chain.status === "waiting_approval" ? 28 : 34,
    assignedAgentId,
    toolHints: chain.steps.filter((step) => step.status !== "done").map((step) => step.actionType),
    chainId: chain.chainId
  });
}

export function enqueueKernelTask(task: KernelTask): KernelTaskSchedulerSnapshot {
  const target = task.priority >= 30 ? "priorityQueue" : task.status === "delayed" ? "delayedTasks" : "queue";

  schedulerState[target] = dedupeTasks([task, ...schedulerState[target]]);
  schedulerState.lastUpdatedAt = nowIso();

  return getKernelTaskSchedulerSnapshot();
}

export function nextKernelTask(): KernelTask | null {
  const source = schedulerState.priorityQueue.length ? "priorityQueue" : schedulerState.queue.length ? "queue" : null;

  if (!source) {
    return null;
  }

  const [task, ...rest] = schedulerState[source];

  schedulerState[source] = rest;
  schedulerState.lastUpdatedAt = nowIso();
  return task ?? null;
}

export function runKernelSchedulerTick(agentPool: KernelAgentResource[]): KernelTaskSchedulerSnapshot {
  const task = nextKernelTask();

  if (!task) {
    schedulerState.lastUpdatedAt = nowIso();
    return getKernelTaskSchedulerSnapshot();
  }

  const assignedAgent = agentPool.find((agent) => agent.id === task.assignedAgentId)
    ?? agentPool.find((agent) => agent.status === "idle")
    ?? agentPool[0];
  const runningTask: KernelTask = {
    ...task,
    status: "running",
    assignedAgentId: assignedAgent?.id ?? task.assignedAgentId,
    updatedAt: nowIso()
  };
  const completedTask: KernelTask = {
    ...runningTask,
    status: "completed",
    result: `Kernel tick completed: ${runningTask.title}`,
    updatedAt: nowIso()
  };

  schedulerState.lastAssignedTask = completedTask;
  schedulerState.completedTasks = dedupeTasks([completedTask, ...schedulerState.completedTasks], 16);
  schedulerState.lastUpdatedAt = nowIso();

  return getKernelTaskSchedulerSnapshot();
}

export function getKernelTaskSchedulerSnapshot(): KernelTaskSchedulerSnapshot {
  return {
    queue: [...schedulerState.queue],
    priorityQueue: [...schedulerState.priorityQueue],
    delayedTasks: [...schedulerState.delayedTasks],
    completedTasks: [...schedulerState.completedTasks],
    failedTasks: [...schedulerState.failedTasks],
    lastAssignedTask: schedulerState.lastAssignedTask,
    lastUpdatedAt: schedulerState.lastUpdatedAt
  };
}
