export interface AgentOptimizerInput {
  agent_success_rate?: number;
  tool_error_rate?: number;
  avg_steps?: number;
  task_completion_rate?: number;
}

export interface AgentOptimizationRecommendation {
  workflow_suggestions: string[];
  proposed_agent_pipeline: string[];
  success_rate_target: number;
  auto_modify_agent: false;
}

function clamp01(value: number | undefined, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, value));
}

export function optimizeAgentDesign(input: AgentOptimizerInput = {}): AgentOptimizationRecommendation {
  const successRate = clamp01(input.agent_success_rate, 0.72);
  const toolErrorRate = clamp01(input.tool_error_rate, 0.08);
  const avgSteps = Math.max(0, input.avg_steps ?? 3);
  const taskCompletionRate = clamp01(input.task_completion_rate, 0.7);
  const workflowSuggestions: string[] = [];

  if (successRate < 0.65) {
    workflowSuggestions.push("add_task_planning_quality_gate");
  }

  if (toolErrorRate > 0.12) {
    workflowSuggestions.push("add_tool_permission_and_retry_guard_design");
  }

  if (avgSteps > 6) {
    workflowSuggestions.push("compress_agent_steps_with_checkpoint_summary");
  }

  if (taskCompletionRate < 0.65) {
    workflowSuggestions.push("add_human_review_checkpoint_for_uncertain_tasks");
  }

  return {
    workflow_suggestions: workflowSuggestions.length > 0 ? workflowSuggestions : ["keep_agent_workflow_observed"],
    proposed_agent_pipeline: [
      "intent_classifier",
      "task_planner",
      "tool_permission_gate",
      "step_executor",
      "result_validator",
      "human_review_terminal_state",
    ],
    success_rate_target: Math.max(0.82, Math.round((successRate + 0.1) * 100) / 100),
    auto_modify_agent: false,
  };
}
