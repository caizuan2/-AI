import { ToolExecutor, type ToolExecutionResult } from "../tools/tool_executor";
import { createDefaultToolRegistry, type GptOsToolDefinition, type ToolRegistry } from "../tools/tool_registry";

export type AgentToolName = "search" | "rag_query" | "file_read" | "api_call" | "memory_store";

export interface AgentToolRuntime {
  registry: ToolRegistry;
  executor: ToolExecutor;
  tools: GptOsToolDefinition[];
}

export function createAgentToolRuntime(): AgentToolRuntime {
  const registry = createDefaultToolRegistry();
  return {
    registry,
    executor: new ToolExecutor(registry),
    tools: registry.list(),
  };
}

export function executeAgentTool(
  runtime: AgentToolRuntime,
  toolName: AgentToolName,
  input: Record<string, unknown>,
): ToolExecutionResult {
  return runtime.executor.execute(toolName, input);
}
