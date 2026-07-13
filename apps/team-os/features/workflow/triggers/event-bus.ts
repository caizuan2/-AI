import "server-only";

import { logger, toSafeErrorLog } from "@/lib/logger";
import { checkPersistentRateLimit } from "@/lib/rate-limit";
import { executeWorkflow } from "@/apps/team-os/features/workflow/engine/workflow-engine";
import {
  assertCanExecuteWorkflow,
  assertCanExecuteWorkflowActions,
  resolveWorkflowAccess
} from "@/apps/team-os/features/workflow/services/workflow-access";
import { findActiveWorkflowsForEvent } from "@/apps/team-os/features/workflow/services/workflow-repository";
import type { HydratedWorkflowEvent } from "@/apps/team-os/features/workflow/types";

export class EventBus {
  async publish(input: {
    event: HydratedWorkflowEvent;
    requestId?: string;
  }) {
    const workflows = await findActiveWorkflowsForEvent({
      companyId: input.event.companyId,
      teamId: input.event.teamId,
      eventType: input.event.eventType
    });
    const executions = [];
    for (const workflow of workflows) {
      try {
        const access = await resolveWorkflowAccess(workflow.createdBy, workflow.companyId);
        assertCanExecuteWorkflow(access, {
          companyId: workflow.companyId,
          teamId: workflow.scopeTeamId ?? null,
          eventType: workflow.eventType
        });
        assertCanExecuteWorkflowActions(access, {
          teamId: input.event.teamId,
          actionTypes: workflow.actions.map((action) => action.actionType)
        });
        const internalRequest = new Request("http://workflow.internal/event");
        const executionRateLimit = await checkPersistentRateLimit(internalRequest, {
          namespace: "team-os-workflow-event-bus",
          userId: access.userId,
          limit: 20,
          globalLimit: 300,
          windowMs: 5 * 60 * 1_000
        });
        if (!executionRateLimit.allowed) {
          logger.warn("team_os_workflow_event_skipped_rate_limited", {
            requestId: input.requestId,
            companyId: workflow.companyId,
            workflowId: workflow.id,
            retryAfterSeconds: executionRateLimit.retryAfterSeconds
          });
          continue;
        }
        if (workflow.actions.some((action) => action.actionType === "GENERATE_REPORT")) {
          const reportRateLimit = await checkPersistentRateLimit(internalRequest, {
            namespace: "team-os-workflow-report",
            userId: access.userId,
            limit: 6,
            globalLimit: 120,
            windowMs: 10 * 60 * 1_000
          });
          if (!reportRateLimit.allowed) {
            logger.warn("team_os_workflow_report_event_skipped_rate_limited", {
              requestId: input.requestId,
              companyId: workflow.companyId,
              workflowId: workflow.id,
              retryAfterSeconds: reportRateLimit.retryAfterSeconds
            });
            continue;
          }
        }
        executions.push(await executeWorkflow({
          workflow,
          event: input.event,
          mode: "PRODUCTION",
          triggeredBy: access.userId,
          requestId: input.requestId
        }));
      } catch (error) {
        logger.warn("team_os_workflow_event_skipped_invalid_actor", {
          requestId: input.requestId,
          companyId: workflow.companyId,
          workflowId: workflow.id,
          error: toSafeErrorLog(error)
        });
      }
    }
    return executions;
  }
}

export const workflowEventBus = new EventBus();
