import type { TaskChainExecutionResult } from "@/lib/enterprise/gpt-os-task-chain-engine";

export type GptOSSelfTuningStatus = "stable" | "optimizing" | "throttled";

export interface GptOSSelfTuningInput {
  queueLength: number;
  activeTaskCount: number;
  completedTaskCount: number;
  failedTaskCount: number;
  memorySignals: string[];
  taskChain?: TaskChainExecutionResult | null;
}

export interface GptOSSelfTuningResult {
  status: GptOSSelfTuningStatus;
  score: number;
  schedulingMode: "normal" | "priority" | "safe_throttle";
  memoryStrategy: "retain" | "compact" | "learn_patterns";
  agentStrategy: "keep_current" | "rebalance" | "risk_guard";
  costStrategy: "normal" | "reduce_loops" | "avoid_tools";
  improvements: string[];
}

export function tuneGptOSSystem(input: GptOSSelfTuningInput): GptOSSelfTuningResult {
  const highQueue = input.queueLength >= 4;
  const hasFailures = input.failedTaskCount > 0 || (input.taskChain?.status === "blocked");
  const waitingApproval = input.taskChain?.status === "waiting_approval";
  const score = Math.max(0.42, Math.min(0.98, 0.9 - input.queueLength * 0.04 - input.failedTaskCount * 0.12 + input.completedTaskCount * 0.02));
  const improvements = new Set<string>();

  if (highQueue) {
    improvements.add("队列较长，优先处理用户任务并降低后台优化频率。");
  }

  if (hasFailures) {
    improvements.add("检测到阻断/失败任务，后续调度启用风险优先审查。");
  }

  if (waitingApproval) {
    improvements.add("当前存在人工审批点，系统暂停真实动作并保留恢复上下文。");
  }

  if (input.memorySignals.some((signal) => /failure|blocked|approval/i.test(signal))) {
    improvements.add("跨任务记忆中存在风险信号，Agent 选择倾向合规与分析。");
  }

  if (!improvements.size) {
    improvements.add("系统负载稳定，维持当前 Agent / Tool / Memory 调度策略。");
  }

  return {
    status: hasFailures || waitingApproval ? "throttled" : highQueue ? "optimizing" : "stable",
    score,
    schedulingMode: hasFailures ? "safe_throttle" : highQueue ? "priority" : "normal",
    memoryStrategy: input.memorySignals.length > 8 ? "compact" : input.completedTaskCount > 0 ? "learn_patterns" : "retain",
    agentStrategy: hasFailures ? "risk_guard" : highQueue ? "rebalance" : "keep_current",
    costStrategy: highQueue ? "reduce_loops" : hasFailures ? "avoid_tools" : "normal",
    improvements: Array.from(improvements)
  };
}
