import { AgentRuntime } from "../agent/agent_runtime";
import { InMemoryTraceLogger } from "../diagnostics/trace_logger";
import { SessionMemory } from "../memory/session_memory";
import { createDefaultToolRegistry, ToolRegistry } from "../tools/tool_registry";
import { ToolExecutor } from "../tools/tool_executor";

export interface GptOsRuntime {
  agentRuntime: AgentRuntime;
  sessionMemory: SessionMemory;
  toolRegistry: ToolRegistry;
  toolExecutor: ToolExecutor;
  traceLogger: InMemoryTraceLogger;
}

export function createGptOsRuntime(sessionId: string): GptOsRuntime {
  // Runtime construction is standalone and not wired into existing chat routes.
  const toolRegistry = createDefaultToolRegistry();
  return {
    agentRuntime: new AgentRuntime(),
    sessionMemory: new SessionMemory(sessionId),
    toolRegistry,
    toolExecutor: new ToolExecutor(toolRegistry),
    traceLogger: new InMemoryTraceLogger(),
  };
}
