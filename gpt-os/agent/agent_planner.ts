import type { AgentToolName } from "./agent_tools";

export type AgentIntent = "task" | "action" | "multi-step";

export type AgentPlanAction = AgentToolName | "analyze" | "generate_answer";

export interface AgentPlanStep {
  step: number;
  action: AgentPlanAction;
  description: string;
}

export interface AgentPlan {
  intent: AgentIntent;
  steps: AgentPlanStep[];
}

export interface AgentPlannerInput {
  query: string;
  intent: AgentIntent;
}

export function isAgentIntent(value: unknown): value is AgentIntent {
  return value === "task" || value === "action" || value === "multi-step";
}

export function planAgentTask(input: AgentPlannerInput): AgentPlan {
  const needsMemory = input.intent === "multi-step";

  return {
    intent: input.intent,
    steps: [
      {
        step: 1,
        action: "search",
        description: "Locate relevant knowledge context for the task.",
      },
      {
        step: 2,
        action: "rag_query",
        description: "Prepare a safe RAG query plan without changing the RAG pipeline.",
      },
      ...(needsMemory
        ? [{
            step: 3,
            action: "memory_store" as const,
            description: "Store temporary task context in isolated in-memory agent memory.",
          }]
        : []),
      {
        step: needsMemory ? 4 : 3,
        action: "analyze",
        description: "Analyze the gathered context and task constraints.",
      },
      {
        step: needsMemory ? 5 : 4,
        action: "generate_answer",
        description: "Generate a structured task result for the user.",
      },
    ],
  };
}
