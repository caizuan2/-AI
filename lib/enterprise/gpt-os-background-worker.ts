import {
  createKernelTask,
  enqueueKernelTask,
  getKernelTaskSchedulerSnapshot,
  runKernelSchedulerTick,
  type KernelAgentResource,
  type KernelTaskSchedulerSnapshot
} from "@/lib/enterprise/gpt-os-task-scheduler";

export interface GptOSBackgroundWorkerSnapshot {
  workerId: string;
  active: boolean;
  ticks: number;
  mode: "daemon_simulation";
  lastAction: string;
  idleOptimizationRan: boolean;
  scheduler: KernelTaskSchedulerSnapshot;
}

let workerTicks = 0;

export function startGptOSBackgroundWorker(input: {
  agentPool: KernelAgentResource[];
  ensureOptimizationTask?: boolean;
}): GptOSBackgroundWorkerSnapshot {
  const before = getKernelTaskSchedulerSnapshot();
  const queueEmpty = before.queue.length === 0 && before.priorityQueue.length === 0;
  let idleOptimizationRan = false;

  if (queueEmpty && input.ensureOptimizationTask !== false) {
    enqueueKernelTask(createKernelTask({
      title: "后台系统自优化：压缩记忆、复核 Agent 负载、降低推理成本",
      origin: "optimization",
      priority: 10,
      toolHints: ["memory-compact", "agent-rebalance", "cost-check"]
    }));
    idleOptimizationRan = true;
  }

  workerTicks += 1;
  const scheduler = runKernelSchedulerTick(input.agentPool);

  return {
    workerId: "admin-ingest-gpt-os-kernel-worker",
    active: true,
    ticks: workerTicks,
    mode: "daemon_simulation",
    lastAction: scheduler.lastAssignedTask?.title ?? "idle",
    idleOptimizationRan,
    scheduler
  };
}
