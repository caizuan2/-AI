import type { GptOSActionSuggestion } from "@/lib/enterprise/gpt-os-action-layer";
import type { GptOSTaskAgentId, GptOSTaskPlan } from "@/lib/enterprise/gpt-os-planner";
import type { GptOSPersonaMemory } from "@/lib/enterprise/gpt-os-persona-memory";
import type { TaskChainExecutionResult } from "@/lib/enterprise/gpt-os-task-chain-engine";
import {
  createKernelTask,
  createKernelTaskFromChain,
  enqueueKernelTask,
  getKernelTaskSchedulerSnapshot,
  type KernelAgentResource,
  type KernelTask,
  type KernelTaskSchedulerSnapshot
} from "@/lib/enterprise/gpt-os-task-scheduler";
import {
  startGptOSBackgroundWorker,
  type GptOSBackgroundWorkerSnapshot
} from "@/lib/enterprise/gpt-os-background-worker";
import {
  tuneGptOSSystem,
  type GptOSSelfTuningResult
} from "@/lib/enterprise/gpt-os-self-tuner";

export interface GptOSKernelRuntimeInput {
  goal: string;
  planner: GptOSTaskPlan;
  memory: GptOSPersonaMemory;
  selectedAgentId: GptOSTaskAgentId;
  taskChain: TaskChainExecutionResult;
  actions: GptOSActionSuggestion[];
}

export interface GptOSKernelState {
  running: boolean;
  loopState: "booting" | "active" | "idle" | "optimizing" | "throttled";
  activeTasks: KernelTask[];
  completedTasks: KernelTask[];
  failedTasks: KernelTask[];
  memoryState: {
    crossTaskPatterns: string[];
    learnedFromTasks: number;
    memoryUsage: number;
    lastLearning: string;
  };
  agentPool: KernelAgentResource[];
  resourceUsage: {
    queueLength: number;
    activeTaskCount: number;
    completedTaskCount: number;
    failedTaskCount: number;
    memorySignals: number;
  };
  scheduler: KernelTaskSchedulerSnapshot;
  backgroundWorker: GptOSBackgroundWorkerSnapshot;
  selfTuning: GptOSSelfTuningResult;
  systemSignals: string[];
}

function buildAgentPool(selectedAgentId: GptOSTaskAgentId, planner: GptOSTaskPlan, memory: GptOSPersonaMemory): KernelAgentResource[] {
  const agentIds = Array.from(new Set<GptOSTaskAgentId>([
    selectedAgentId,
    ...planner.requiredAgents,
    memory.domain === "coding" ? "pm-agent" : "analysis-agent",
    memory.taskContinuity.executionState === "waiting_approval" ? "compliance-agent" : selectedAgentId
  ]));

  return agentIds.map((id, index) => ({
    id,
    status: index === 0 ? "assigned" : id === "compliance-agent" ? "guarding" : "idle",
    load: index === 0 ? 0.62 : id === "compliance-agent" ? 0.42 : 0.2,
    capabilities: [
      id.replace("-agent", ""),
      planner.intent,
      memory.domain,
      memory.taskContinuity.executionState
    ]
  }));
}

function enqueueKernelTasks(input: GptOSKernelRuntimeInput) {
  const chainTask = createKernelTaskFromChain(input.taskChain, input.selectedAgentId);

  enqueueKernelTask(chainTask);

  if (input.taskChain.status === "waiting_approval") {
    enqueueKernelTask(createKernelTask({
      title: "等待管理员审批后恢复任务链",
      origin: "system",
      priority: 24,
      assignedAgentId: "compliance-agent",
      toolHints: ["approval-gate", "resume-context"],
      chainId: input.taskChain.chainId
    }));
  }

  if (input.actions.length) {
    enqueueKernelTask(createKernelTask({
      title: `整理下一步建议：${input.actions.slice(0, 2).map((action) => action.label).join(" / ")}`,
      origin: "system",
      priority: 18,
      assignedAgentId: input.selectedAgentId,
      toolHints: input.actions.map((action) => action.risk),
      chainId: input.taskChain.chainId
    }));
  }
}

function buildMemoryState(input: GptOSKernelRuntimeInput, scheduler: KernelTaskSchedulerSnapshot) {
  const patterns = Array.from(new Set([
    ...input.memory.memorySignals,
    ...input.memory.learning.successPatterns,
    ...input.memory.learning.failurePatterns,
    ...input.memory.taskContinuity.continuitySignals,
    `taskChain:${input.taskChain.status}`
  ])).slice(0, 12);
  const learnedFromTasks = scheduler.completedTasks.length + input.taskChain.completedSteps;

  return {
    crossTaskPatterns: patterns,
    learnedFromTasks,
    memoryUsage: Math.min(1, patterns.length / 12),
    lastLearning: patterns[0] ?? "no cross-task learning yet"
  };
}

export function runGptOSKernelRuntime(input: GptOSKernelRuntimeInput): GptOSKernelState {
  const agentPool = buildAgentPool(input.selectedAgentId, input.planner, input.memory);

  enqueueKernelTasks(input);

  const backgroundWorker = startGptOSBackgroundWorker({
    agentPool,
    ensureOptimizationTask: true
  });
  const scheduler = getKernelTaskSchedulerSnapshot();
  const selfTuning = tuneGptOSSystem({
    queueLength: scheduler.queue.length + scheduler.priorityQueue.length + scheduler.delayedTasks.length,
    activeTaskCount: scheduler.lastAssignedTask ? 1 : 0,
    completedTaskCount: scheduler.completedTasks.length,
    failedTaskCount: scheduler.failedTasks.length,
    memorySignals: input.memory.memorySignals,
    taskChain: input.taskChain
  });
  const memoryState = buildMemoryState(input, scheduler);
  const loopState = selfTuning.status === "throttled"
    ? "throttled"
    : backgroundWorker.idleOptimizationRan
      ? "optimizing"
      : scheduler.lastAssignedTask
        ? "active"
        : "idle";

  return {
    running: true,
    loopState,
    activeTasks: scheduler.lastAssignedTask ? [scheduler.lastAssignedTask] : [],
    completedTasks: scheduler.completedTasks,
    failedTasks: scheduler.failedTasks,
    memoryState,
    agentPool,
    resourceUsage: {
      queueLength: scheduler.queue.length + scheduler.priorityQueue.length + scheduler.delayedTasks.length,
      activeTaskCount: scheduler.lastAssignedTask ? 1 : 0,
      completedTaskCount: scheduler.completedTasks.length,
      failedTaskCount: scheduler.failedTasks.length,
      memorySignals: input.memory.memorySignals.length
    },
    scheduler,
    backgroundWorker,
    selfTuning,
    systemSignals: [
      "kernel:daemon_simulation",
      `loop:${loopState}`,
      `workerTicks:${backgroundWorker.ticks}`,
      `scheduler:${selfTuning.schedulingMode}`,
      `memory:${selfTuning.memoryStrategy}`,
      `agents:${selfTuning.agentStrategy}`,
      `cost:${selfTuning.costStrategy}`
    ]
  };
}
