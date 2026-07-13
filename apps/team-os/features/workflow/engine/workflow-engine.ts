import "server-only";

import { ValidationError, toAppError } from "@/lib/errors";
import { executeWorkflowAction } from "@/apps/team-os/features/workflow/actions/workflow-actions";
import { aiWorkflowDecisionService } from "@/apps/team-os/features/workflow/engine/ai-workflow-decision-service";
import {
  claimWorkflowExecution,
  finishWorkflowExecution
} from "@/apps/team-os/features/workflow/services/workflow-repository";
import type {
  HydratedWorkflowEvent,
  WorkflowDefinitionRecord,
  WorkflowExecutionMode
} from "@/apps/team-os/features/workflow/types";

export async function executeWorkflow(input: {
  workflow: WorkflowDefinitionRecord;
  event: HydratedWorkflowEvent;
  mode: WorkflowExecutionMode;
  triggeredBy?: string;
  requestId?: string;
}) {
  if (input.mode === "PRODUCTION" && input.workflow.status !== "ACTIVE") {
    throw new ValidationError("已停用工作流不能进行生产执行。");
  }
  if (input.workflow.eventType !== input.event.eventType) {
    throw new ValidationError("工作流与事件类型不匹配。");
  }
  const claim = await claimWorkflowExecution({
    workflow: input.workflow,
    event: input.event,
    triggeredBy: input.triggeredBy,
    mode: input.mode
  });
  if (!claim.claimed) return claim.execution;

  const decision = await aiWorkflowDecisionService.decide({
    event: input.event,
    config: input.workflow.config.decision,
    requestId: input.requestId
  });
  if (!decision.trigger) {
    const preflightResults = [];
    if (input.mode === "TEST") {
      for (const action of [...input.workflow.actions].sort((left, right) => (
        left.order - right.order || left.id.localeCompare(right.id)
      ))) {
        try {
          preflightResults.push(await executeWorkflowAction({
            workflow: input.workflow,
            action,
            event: input.event,
            executionId: claim.execution.id,
            actorUserId: input.triggeredBy ?? input.workflow.createdBy,
            mode: "TEST"
          }));
        } catch (error) {
          const appError = toAppError(error);
          preflightResults.push({
            actionId: action.id,
            actionType: action.actionType,
            order: action.order,
            status: "FAILED" as const,
            summary: appError.message.slice(0, 500)
          });
          return finishWorkflowExecution({
            executionId: claim.execution.id,
            companyId: input.workflow.companyId,
            status: "FAILED",
            decision,
            result: { decision, actions: preflightResults },
            error: {
              code: appError.code,
              message: appError.message.slice(0, 500),
              retryable: false,
              actionId: action.id,
              actionType: action.actionType,
              at: new Date().toISOString()
            }
          });
        }
      }
    }
    return finishWorkflowExecution({
      executionId: claim.execution.id,
      companyId: input.workflow.companyId,
      status: "SKIPPED",
      decision,
      result: { decision, actions: preflightResults }
    });
  }

  const actionResults = [];
  for (const action of [...input.workflow.actions].sort((left, right) => (
    left.order - right.order || left.id.localeCompare(right.id)
  ))) {
    try {
      actionResults.push(await executeWorkflowAction({
        workflow: input.workflow,
        action,
        event: input.event,
        executionId: claim.execution.id,
        actorUserId: input.triggeredBy ?? input.workflow.createdBy,
        mode: input.mode
      }));
    } catch (error) {
      const appError = toAppError(error);
      actionResults.push({
        actionId: action.id,
        actionType: action.actionType,
        order: action.order,
        status: "FAILED" as const,
        summary: appError.message.slice(0, 500)
      });
      return finishWorkflowExecution({
        executionId: claim.execution.id,
        companyId: input.workflow.companyId,
        status: "FAILED",
        decision,
        result: { decision, actions: actionResults },
        error: {
          code: appError.code,
          message: appError.message.slice(0, 500),
          retryable: false,
          actionId: action.id,
          actionType: action.actionType,
          at: new Date().toISOString()
        }
      });
    }
  }

  return finishWorkflowExecution({
    executionId: claim.execution.id,
    companyId: input.workflow.companyId,
    status: "SUCCESS",
    decision,
    result: { decision, actions: actionResults }
  });
}

export class WorkflowEngine {
  executeWorkflow = executeWorkflow;
}

export const workflowEngine = new WorkflowEngine();
