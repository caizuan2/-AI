import { executeAgentPlan, type AgentExecutionResult } from "./agent_executor";
import { isAgentIntent, planAgentTask, type AgentIntent, type AgentPlan } from "./agent_planner";

export interface AgentRuntimeStatus {
  enabled: boolean;
  reason: "stage4_explicit_task_intent_only";
}

export interface AgentRuntimeInput {
  query: string;
  userId: string;
  sessionId: string;
  intent: AgentIntent;
  model: string;
  actualModel: string;
  traceId: string;
}

export interface AgentRuntimeResult {
  enabled: true;
  status: "completed";
  intent: AgentIntent;
  model: string;
  actualModel: string;
  traceId: string;
  plan: AgentPlan;
  execution: AgentExecutionResult;
  answer: string;
}

export class AgentRuntime {
  readonly status: AgentRuntimeStatus = {
    enabled: true,
    reason: "stage4_explicit_task_intent_only",
  };

  canHandle(intent: unknown): intent is AgentIntent {
    return isAgentIntent(intent);
  }

  run(input: AgentRuntimeInput): AgentRuntimeResult {
    const plan = planAgentTask({
      query: input.query,
      intent: input.intent,
    });
    const execution = executeAgentPlan(plan, input.query, input.traceId);

    return {
      enabled: true,
      status: "completed",
      intent: input.intent,
      model: input.model,
      actualModel: input.actualModel,
      traceId: input.traceId,
      plan,
      execution,
      answer: [
        "### Agent 任务执行结果",
        "",
        `**任务意图**：${input.intent}`,
        `**执行模型**：${input.actualModel}`,
        "",
        "**执行步骤**",
        ...execution.steps.map((step) => `${step.step}. ${step.action}：${step.status}`),
        "",
        "当前阶段仅启用安全的本地 Agent 执行层：不会读取真实文件、不会调用外部 API、不会修改数据库。",
      ].join("\n"),
    };
  }
}

export type { AgentIntent };
