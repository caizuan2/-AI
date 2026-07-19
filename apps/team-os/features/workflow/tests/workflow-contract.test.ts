import assert from "node:assert/strict";

import { ValidationError } from "@/lib/errors";
import { workflowActionPreview } from "@/apps/team-os/features/workflow/actions/action-preview";
import { DEFAULT_WORKFLOW_TEMPLATES } from "@/apps/team-os/features/workflow/rules/default-workflows";
import { evaluateWorkflowRules } from "@/apps/team-os/features/workflow/rules/decision-rules";
import {
  EVENT_TRIGGER_MAP,
  assertTriggerMatchesEvent,
  isActionAllowedForEvent
} from "@/apps/team-os/features/workflow/rules/workflow-rules";
import type { HydratedWorkflowEvent } from "@/apps/team-os/features/workflow/types";
import {
  parseCreateWorkflowInput,
  parseExecuteWorkflowInput,
  parseWorkflowExecutionQuery,
  parseWorkflowListQuery
} from "@/apps/team-os/features/workflow/utils/workflow-input";
import { selectTrainingFinishedAssignment } from "@/apps/team-os/features/workflow/triggers/training-assignment";

function expectValidationError(run: () => unknown, message: RegExp) {
  assert.throws(run, (error: unknown) => (
    error instanceof ValidationError && message.test(error.message)
  ));
}

assert.equal(EVENT_TRIGGER_MAP.TASK_OVERDUE, "TASK");
assert.equal(EVENT_TRIGGER_MAP.CRM_RISK_FOUND, "CRM");
assert.equal(assertTriggerMatchesEvent("AI_COACH", "EMPLOYEE_SCORE_LOW"), true);
assert.equal(assertTriggerMatchesEvent("TASK", "CRM_RISK_FOUND"), false);
assert.equal(isActionAllowedForEvent("CRM_RISK_FOUND", "CREATE_FOLLOWUP"), true);
assert.equal(isActionAllowedForEvent("CRM_RISK_FOUND", "ASSIGN_TRAINING"), false);
assert.match(workflowActionPreview("SEND_NOTIFICATION"), /通知网关/);
assert.match(workflowActionPreview("CREATE_FOLLOWUP"), /不写入虚假的 CRM/);

for (const template of DEFAULT_WORKFLOW_TEMPLATES) {
  assert.equal(assertTriggerMatchesEvent(template.triggerType, template.eventType), true);
  assert.deepEqual(
    template.actions.map((action) => action.order),
    template.actions.map((_action, index) => index + 1)
  );
  assert.ok(template.actions.every((action) => (
    isActionAllowedForEvent(template.eventType, action.actionType)
  )));
}
assert.ok(DEFAULT_WORKFLOW_TEMPLATES.every((template) => (
  template.actions.some((action) => action.actionType === "SEND_NOTIFICATION")
)), "Every default automation scenario must include notification linkage.");

const valid = parseCreateWorkflowInput({
  companyId: "company-a",
  scopeTeamId: "team-a",
  name: "任务延期提醒",
  description: "任务延期时通知负责人。",
  triggerType: "TASK",
  eventType: "TASK_OVERDUE",
  status: "ACTIVE",
  decision: { enabled: true, minConfidence: 0.8 },
  actions: [{
    actionType: "SEND_NOTIFICATION",
    order: 1,
    config: {
      title: "任务延期",
      content: "请及时处理。",
      notificationType: "TASK",
      recipient: "EVENT_USER"
    }
  }]
});
assert.equal(valid.eventType, "TASK_OVERDUE");
assert.equal(valid.actions[0]?.actionType, "SEND_NOTIFICATION");

expectValidationError(() => parseCreateWorkflowInput({
  ...valid,
  triggerType: "CRM"
}), /不匹配/);
expectValidationError(() => parseCreateWorkflowInput({
  ...valid,
  actions: [{
    actionType: "ASSIGN_TRAINING",
    order: 1,
    config: { courseId: "course-a", deadlineDays: 7 }
  }]
}), /不允许执行/);
expectValidationError(() => parseCreateWorkflowInput({
  ...valid,
  actions: [
    valid.actions[0],
    { ...valid.actions[0], order: 3 }
  ]
}), /必须从 1 开始连续/);
expectValidationError(() => parseCreateWorkflowInput({
  ...valid,
  decision: { enabled: true, minConfidence: 1.5 }
}), /0-1/);

assert.deepEqual(parseExecuteWorkflowInput({
  workflowId: "workflow-a",
  companyId: "company-a",
  event: {
    eventId: "task-overdue:task-a:2026-07-13",
    eventType: "TASK_OVERDUE",
    referenceId: "task-a"
  }
}), {
  workflowId: "workflow-a",
  companyId: "company-a",
  event: {
    eventId: "task-overdue:task-a:2026-07-13",
    eventType: "TASK_OVERDUE",
    referenceId: "task-a"
  }
});
expectValidationError(() => parseExecuteWorkflowInput({
  workflowId: "workflow-a",
  event: { eventId: "risk-1", eventType: "CRM_RISK_FOUND" }
}), /必须提供业务引用 ID/);
assert.deepEqual(parseWorkflowListQuery(new URLSearchParams("companyId=company-a")), {
  companyId: "company-a"
});
assert.deepEqual(parseWorkflowExecutionQuery(new URLSearchParams("companyId=company-a&limit=20")), {
  companyId: "company-a",
  limit: 20
});
expectValidationError(
  () => parseWorkflowListQuery(new URLSearchParams("companyId=")),
  /不能为空/
);
expectValidationError(
  () => parseWorkflowExecutionQuery(new URLSearchParams("limit=10&limit=20")),
  /不能重复/
);
expectValidationError(
  () => parseWorkflowListQuery(new URLSearchParams("unknown=value")),
  /不支持的字段/
);

function event(
  eventType: HydratedWorkflowEvent["eventType"],
  businessData: HydratedWorkflowEvent["businessData"]
): HydratedWorkflowEvent {
  return {
    eventId: "event-a",
    idempotencyKey: `TEST:${eventType}`,
    eventType,
    companyId: "company-a",
    businessData,
    occurredAt: "2026-07-13T00:00:00.000Z"
  };
}

assert.equal(evaluateWorkflowRules(event("TASK_OVERDUE", { overdue: true })).trigger, true);
assert.equal(evaluateWorkflowRules(event("TASK_OVERDUE", { overdue: false })).trigger, false);
assert.equal(evaluateWorkflowRules(event("CRM_RISK_FOUND", { riskLevel: "HIGH" })).trigger, true);
assert.equal(evaluateWorkflowRules(event("CRM_RISK_FOUND", { riskLevel: "LOW" })).trigger, false);
assert.equal(evaluateWorkflowRules(event("EMPLOYEE_SCORE_LOW", { employeeScore: 59 })).trigger, true);
assert.equal(evaluateWorkflowRules(event("EMPLOYEE_SCORE_LOW", { employeeScore: 80 })).trigger, false);
assert.equal(evaluateWorkflowRules(event("TRAINING_FINISHED", { trainingStatus: "COMPLETED" })).trigger, true);

assert.deepEqual(
  selectTrainingFinishedAssignment([{ id: "assignment-a", teamId: "team-a" }], false),
  { id: "assignment-a", teamId: "team-a" }
);
assert.throws(
  () => selectTrainingFinishedAssignment([], false),
  (error: unknown) => error instanceof Error && /没有当前工作流可访问/.test(error.message)
);
expectValidationError(
  () => selectTrainingFinishedAssignment([
    { id: "assignment-a", teamId: "team-a" },
    { id: "assignment-b", teamId: "team-b" }
  ], false),
  /绑定到具体团队/
);
assert.deepEqual(
  selectTrainingFinishedAssignment([
    { id: "assignment-a", teamId: "team-a" },
    { id: "assignment-b", teamId: "team-b" }
  ], true),
  { id: "assignment-a", teamId: "team-a" }
);

console.log("AI Team OS workflow contract tests passed.");
