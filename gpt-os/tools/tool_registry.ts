export type GptOsToolStatus = "enabled" | "disabled";

export interface GptOsToolDefinition {
  name: string;
  status: GptOsToolStatus;
  reason: "stage4_agent_safe_tool" | "stage4_mock_disabled" | "stage3_skeleton_only";
  description?: string;
}

export class ToolRegistry {
  private readonly tools = new Map<string, GptOsToolDefinition>();

  register(tool: GptOsToolDefinition): void {
    // Tools are registered as disabled placeholders during Stage 3.
    this.tools.set(tool.name, tool);
  }

  get(name: string): GptOsToolDefinition | null {
    return this.tools.get(name) ?? null;
  }

  list(): GptOsToolDefinition[] {
    return Array.from(this.tools.values());
  }
}

export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register({
    name: "search",
    status: "enabled",
    reason: "stage4_agent_safe_tool",
    description: "Safe in-process search planning placeholder.",
  });
  registry.register({
    name: "rag_query",
    status: "enabled",
    reason: "stage4_agent_safe_tool",
    description: "Safe RAG query planning placeholder.",
  });
  registry.register({
    name: "memory_store",
    status: "enabled",
    reason: "stage4_agent_safe_tool",
    description: "In-memory task context placeholder.",
  });
  registry.register({
    name: "file_read",
    status: "disabled",
    reason: "stage4_mock_disabled",
    description: "Disabled file read placeholder.",
  });
  registry.register({
    name: "api_call",
    status: "disabled",
    reason: "stage4_mock_disabled",
    description: "Disabled external API call placeholder.",
  });
  return registry;
}
