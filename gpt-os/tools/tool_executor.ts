import type { GptOsToolDefinition } from "./tool_registry";
import { ToolRegistry } from "./tool_registry";

export interface ToolExecutionResult {
  tool: string;
  status: "ok" | "disabled";
  reason: "stage4_safe_mock" | "stage4_agent_safe_tool" | "stage4_mock_disabled" | "stage3_skeleton_only" | "tool_not_registered";
  output: Record<string, unknown> | null;
}

export class ToolExecutor {
  constructor(private readonly registry: ToolRegistry) {}

  execute(toolName: string, input: Record<string, unknown> = {}): ToolExecutionResult {
    // Stage 4 tools are safe in-process placeholders; no external file or API execution happens here.
    const tool: GptOsToolDefinition | null = this.registry.get(toolName);
    if (!tool) {
      return {
        tool: toolName,
        status: "disabled",
        reason: "tool_not_registered",
        output: null,
      };
    }

    if (tool.status === "enabled") {
      return {
        tool: tool.name,
        status: "ok",
        reason: "stage4_safe_mock",
        output: {
          mode: "safe_mock",
          acceptedInputKeys: Object.keys(input),
        },
      };
    }

    return {
      tool: tool.name,
      status: "disabled",
      reason: tool.reason,
      output: null,
    };
  }
}
