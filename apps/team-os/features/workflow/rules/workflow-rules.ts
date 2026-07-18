import type {
  WorkflowActionType,
  WorkflowEventType,
  WorkflowTriggerType
} from "@/apps/team-os/features/workflow/types";

export const EVENT_TRIGGER_MAP: Record<WorkflowEventType, WorkflowTriggerType> = {
  TASK_COMPLETED: "TASK",
  TASK_OVERDUE: "TASK",
  CRM_RISK_FOUND: "CRM",
  EMPLOYEE_SCORE_LOW: "AI_COACH",
  TRAINING_FINISHED: "TRAINING",
  BUSINESS_METRIC_ALERT: "ANALYTICS",
  SYSTEM_TRIGGERED: "SYSTEM"
};

const EVENT_ACTIONS: Record<WorkflowEventType, readonly WorkflowActionType[]> = {
  TASK_COMPLETED: ["SEND_NOTIFICATION", "CREATE_TASK", "GENERATE_REPORT"],
  TASK_OVERDUE: ["SEND_NOTIFICATION", "CREATE_TASK"],
  CRM_RISK_FOUND: ["CREATE_FOLLOWUP", "SEND_NOTIFICATION", "CREATE_TASK"],
  EMPLOYEE_SCORE_LOW: ["ASSIGN_TRAINING", "SEND_NOTIFICATION", "CREATE_TASK"],
  TRAINING_FINISHED: ["SEND_NOTIFICATION", "CREATE_TASK", "GENERATE_REPORT"],
  BUSINESS_METRIC_ALERT: ["GENERATE_REPORT", "SEND_NOTIFICATION", "CREATE_TASK"],
  SYSTEM_TRIGGERED: ["SEND_NOTIFICATION", "CREATE_TASK", "GENERATE_REPORT"]
};

export function assertTriggerMatchesEvent(
  triggerType: WorkflowTriggerType,
  eventType: WorkflowEventType
) {
  return EVENT_TRIGGER_MAP[eventType] === triggerType;
}

export function isActionAllowedForEvent(
  eventType: WorkflowEventType,
  actionType: WorkflowActionType
) {
  return EVENT_ACTIONS[eventType].includes(actionType);
}

export function allowedActionsForEvent(eventType: WorkflowEventType) {
  return [...EVENT_ACTIONS[eventType]];
}
