import { ratioPercent, type AgentExecutionRecord } from "./dashboard_types";

export interface AgentDashboard {
  agent_trigger_count: number;
  agent_execution_rate: number;
  task_success_rate: number;
  step_execution_chain: string[][];
  executor_status: Record<string, number>;
}

export function buildAgentDashboard(records: AgentExecutionRecord[]): AgentDashboard {
  const triggered = records.filter((record) => record.triggered);
  const successful = triggered.filter((record) => record.success);

  return {
    agent_trigger_count: triggered.length,
    agent_execution_rate: ratioPercent(triggered.length, records.length),
    task_success_rate: ratioPercent(successful.length, triggered.length),
    step_execution_chain: triggered.map((record) => record.steps).slice(0, 10),
    executor_status: countBy(triggered.map((record) => record.executor_status)),
  };
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }

  return counts;
}
