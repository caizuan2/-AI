export interface AgentMemoryStep {
  step: number;
  action: string;
  status: "pending" | "completed" | "skipped";
  note?: string;
}

export interface AgentMemorySnapshot {
  taskId: string;
  steps: AgentMemoryStep[];
  variables: Record<string, unknown>;
}

export class AgentMemory {
  private readonly steps: AgentMemoryStep[] = [];
  private readonly variables: Record<string, unknown> = {};

  constructor(private readonly taskId: string) {}

  set(key: string, value: unknown): void {
    this.variables[key] = value;
  }

  recordStep(step: AgentMemoryStep): void {
    this.steps.push(step);
  }

  snapshot(): AgentMemorySnapshot {
    return {
      taskId: this.taskId,
      steps: [...this.steps],
      variables: { ...this.variables },
    };
  }
}
