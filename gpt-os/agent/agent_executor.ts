import { AgentMemory } from "./agent_memory";
import type { AgentPlan, AgentPlanStep } from "./agent_planner";
import { createAgentToolRuntime, executeAgentTool, type AgentToolName } from "./agent_tools";

export interface AgentStepExecution {
  step: number;
  action: AgentPlanStep["action"];
  status: "completed" | "skipped";
  output: Record<string, unknown> | null;
}

export interface AgentExecutionResult {
  status: "completed";
  steps: AgentStepExecution[];
  tools: ReturnType<typeof createAgentToolRuntime>["tools"];
  memory: ReturnType<AgentMemory["snapshot"]>;
}

function isToolAction(action: AgentPlanStep["action"]): action is AgentToolName {
  return action === "search"
    || action === "rag_query"
    || action === "file_read"
    || action === "api_call"
    || action === "memory_store";
}

export function executeAgentPlan(
  plan: AgentPlan,
  query: string,
  taskId: string,
): AgentExecutionResult {
  const toolRuntime = createAgentToolRuntime();
  const memory = new AgentMemory(taskId);
  memory.set("query", query);
  memory.set("intent", plan.intent);

  const steps = plan.steps.map((step) => {
    if (isToolAction(step.action)) {
      const toolResult = executeAgentTool(toolRuntime, step.action, {
        query,
        taskId,
        step: step.step,
      });
      const status: AgentStepExecution["status"] = toolResult.status === "ok" ? "completed" : "skipped";
      memory.recordStep({
        step: step.step,
        action: step.action,
        status,
        note: toolResult.reason,
      });

      return {
        step: step.step,
        action: step.action,
        status,
        output: toolResult.output,
      };
    }

    memory.recordStep({
      step: step.step,
      action: step.action,
      status: "completed",
      note: step.description,
    });

    return {
      step: step.step,
      action: step.action,
      status: "completed" as const,
      output: {
        mode: "agent_safe_internal",
        description: step.description,
      },
    };
  });

  return {
    status: "completed",
    steps,
    tools: toolRuntime.tools,
    memory: memory.snapshot(),
  };
}
