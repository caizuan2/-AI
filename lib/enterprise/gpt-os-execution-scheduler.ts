import {
  executeTaskChain,
  finalizeTaskChain,
  type TaskChain,
  type TaskChainExecutionResult
} from "@/lib/enterprise/gpt-os-task-chain-engine";

export interface ExecutionSchedulerSnapshot {
  queue: TaskChainExecutionResult[];
  activeTask: TaskChainExecutionResult | null;
  completed: TaskChainExecutionResult[];
  paused: TaskChainExecutionResult[];
  lastUpdatedAt: string;
}

const schedulerState: ExecutionSchedulerSnapshot = {
  queue: [],
  activeTask: null,
  completed: [],
  paused: [],
  lastUpdatedAt: new Date().toISOString()
};

function updateTimestamp() {
  schedulerState.lastUpdatedAt = new Date().toISOString();
}

function dedupeByChainId(items: TaskChainExecutionResult[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    if (seen.has(item.chainId)) {
      return false;
    }

    seen.add(item.chainId);
    return true;
  });
}

function normalize(chain: TaskChain | TaskChainExecutionResult) {
  return "summary" in chain ? chain : finalizeTaskChain(chain);
}

function syncBuckets(result: TaskChainExecutionResult) {
  schedulerState.queue = schedulerState.queue.filter((item) => item.chainId !== result.chainId);
  schedulerState.completed = schedulerState.completed.filter((item) => item.chainId !== result.chainId);
  schedulerState.paused = schedulerState.paused.filter((item) => item.chainId !== result.chainId);

  if (result.status === "completed" || result.status === "blocked" || result.status === "cancelled") {
    schedulerState.completed = dedupeByChainId([result, ...schedulerState.completed]).slice(0, 8);
    return;
  }

  if (result.status === "paused" || result.status === "waiting_approval") {
    schedulerState.paused = dedupeByChainId([result, ...schedulerState.paused]).slice(0, 8);
    return;
  }

  schedulerState.queue = dedupeByChainId([result, ...schedulerState.queue]).slice(0, 8);
}

export function scheduleTaskChain(chain: TaskChain | TaskChainExecutionResult): ExecutionSchedulerSnapshot {
  const task = normalize(chain);

  schedulerState.activeTask = task;
  syncBuckets(task);
  updateTimestamp();

  return getExecutionSchedulerSnapshot();
}

export function runScheduledChains(chain?: TaskChain | TaskChainExecutionResult): ExecutionSchedulerSnapshot {
  const task = chain ? normalize(chain) : schedulerState.activeTask ?? schedulerState.queue[0] ?? null;

  if (!task) {
    updateTimestamp();
    return getExecutionSchedulerSnapshot();
  }

  const result = task.status === "running" ? executeTaskChain(task) : task;

  schedulerState.activeTask = result;
  syncBuckets(result);
  updateTimestamp();

  return getExecutionSchedulerSnapshot();
}

export function pauseScheduledChain(chainId: string): ExecutionSchedulerSnapshot {
  const task = [
    schedulerState.activeTask,
    ...schedulerState.queue,
    ...schedulerState.paused
  ].find((item): item is TaskChainExecutionResult => Boolean(item && item.chainId === chainId));

  if (task) {
    const paused = finalizeTaskChain({
      ...task,
      status: "paused",
      updatedAt: new Date().toISOString()
    });

    schedulerState.activeTask = paused;
    syncBuckets(paused);
  }

  updateTimestamp();
  return getExecutionSchedulerSnapshot();
}

export function resumeScheduledChain(chainId: string): ExecutionSchedulerSnapshot {
  const task = [
    schedulerState.activeTask,
    ...schedulerState.queue,
    ...schedulerState.paused
  ].find((item): item is TaskChainExecutionResult => Boolean(item && item.chainId === chainId));

  if (task) {
    const resumed = executeTaskChain({
      ...task,
      status: "running",
      updatedAt: new Date().toISOString()
    });

    schedulerState.activeTask = resumed;
    syncBuckets(resumed);
  }

  updateTimestamp();
  return getExecutionSchedulerSnapshot();
}

export function getExecutionSchedulerSnapshot(): ExecutionSchedulerSnapshot {
  return {
    queue: [...schedulerState.queue],
    activeTask: schedulerState.activeTask,
    completed: [...schedulerState.completed],
    paused: [...schedulerState.paused],
    lastUpdatedAt: schedulerState.lastUpdatedAt
  };
}
