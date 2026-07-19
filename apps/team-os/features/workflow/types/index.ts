import type { NotificationType } from "@/apps/team-os/features/notification/types";

export const WORKFLOW_TRIGGER_TYPES = [
  "TASK",
  "CRM",
  "AI_COACH",
  "TRAINING",
  "ANALYTICS",
  "SYSTEM"
] as const;

export const WORKFLOW_EVENT_TYPES = [
  "TASK_COMPLETED",
  "TASK_OVERDUE",
  "CRM_RISK_FOUND",
  "EMPLOYEE_SCORE_LOW",
  "TRAINING_FINISHED",
  "BUSINESS_METRIC_ALERT",
  "SYSTEM_TRIGGERED"
] as const;

export const WORKFLOW_STATUSES = ["ACTIVE", "DISABLED"] as const;
export const WORKFLOW_EXECUTION_STATUSES = ["RUNNING", "SUCCESS", "FAILED", "SKIPPED"] as const;
export const WORKFLOW_EXECUTION_MODES = ["TEST", "PRODUCTION"] as const;
export const WORKFLOW_ACTION_TYPES = [
  "CREATE_TASK",
  "SEND_NOTIFICATION",
  "ASSIGN_TRAINING",
  "CREATE_FOLLOWUP",
  "GENERATE_REPORT"
] as const;

export type WorkflowTriggerType = (typeof WORKFLOW_TRIGGER_TYPES)[number];
export type WorkflowEventType = (typeof WORKFLOW_EVENT_TYPES)[number];
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];
export type WorkflowExecutionStatus = (typeof WORKFLOW_EXECUTION_STATUSES)[number];
export type WorkflowExecutionMode = (typeof WORKFLOW_EXECUTION_MODES)[number];
export type WorkflowActionType = (typeof WORKFLOW_ACTION_TYPES)[number];
export type WorkflowPermissionLevel = "OWNER" | "MANAGER" | "TRAINER" | "MEMBER";

export interface WorkflowCompanyOption {
  id: string;
  name: string;
}

export interface WorkflowTeamOption {
  id: string;
  name: string;
  role: "TEAM_OWNER" | "TEAM_MANAGER" | "TRAINER" | "TEAM_MEMBER";
}

export interface WorkflowContext {
  companyId: string;
  companyName: string;
  companies: WorkflowCompanyOption[];
  teams: WorkflowTeamOption[];
  permissionLevel: WorkflowPermissionLevel;
  manageableTeamIds: string[];
  taskActionTeamIds: string[];
  trainingTeamIds: string[];
  canManageCompany: boolean;
  canCreate: boolean;
  canExecute: boolean;
}

export interface WorkflowDecisionConfig {
  enabled: boolean;
  minConfidence: number;
}

export interface WorkflowDefinitionConfig {
  decision: WorkflowDecisionConfig;
  templateKey?: string;
}

export interface CreateTaskActionConfig {
  title: string;
  description: string;
  submissionRequirements: string;
  deadlineDays: number;
  targetCount: number;
}

export interface SendNotificationActionConfig {
  title: string;
  content: string;
  notificationType: NotificationType;
  recipient: "EVENT_USER" | "WORKFLOW_ACTOR";
}

export interface AssignTrainingActionConfig {
  courseId: string;
  deadlineDays: number;
}

export interface CreateFollowUpActionConfig {
  title: string;
  plan: string;
  submissionRequirements: string;
  deadlineDays: number;
}

export interface GenerateReportActionConfig {
  rangeDays: 7 | 30 | 90;
}

export type WorkflowActionConfig =
  | CreateTaskActionConfig
  | SendNotificationActionConfig
  | AssignTrainingActionConfig
  | CreateFollowUpActionConfig
  | GenerateReportActionConfig;

export interface WorkflowActionInput {
  actionType: WorkflowActionType;
  config: WorkflowActionConfig;
  order: number;
}

export interface WorkflowActionRecord extends WorkflowActionInput {
  id: string;
  companyId: string;
  workflowId: string;
  createdAt: string;
}

export interface WorkflowDefinitionRecord {
  id: string;
  companyId: string;
  scopeTeamId?: string;
  name: string;
  description: string;
  triggerType: WorkflowTriggerType;
  eventType: WorkflowEventType;
  status: WorkflowStatus;
  config: WorkflowDefinitionConfig;
  createdBy: string;
  actions: WorkflowActionRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowActionResult {
  actionId: string;
  actionType: WorkflowActionType;
  order: number;
  status: "SUCCESS" | "FAILED" | "SKIPPED";
  summary: string;
  output?: Record<string, unknown>;
}

export interface WorkflowDecisionResult {
  trigger: boolean;
  reason: string;
  confidence: number;
  provider: string;
}

export interface WorkflowExecutionResult {
  decision: WorkflowDecisionResult;
  actions: WorkflowActionResult[];
}

export interface WorkflowExecutionRecord {
  id: string;
  workflowId: string;
  workflowName: string;
  companyId: string;
  teamId?: string;
  triggeredBy?: string;
  eventId: string;
  idempotencyKey: string;
  eventType: WorkflowEventType;
  mode: WorkflowExecutionMode;
  status: WorkflowExecutionStatus;
  triggerData: Record<string, unknown>;
  result?: WorkflowExecutionResult;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
    actionId?: string;
    actionType?: WorkflowActionType;
    at: string;
  };
  createdAt: string;
  finishedAt?: string;
}

export interface CreateWorkflowInput {
  companyId?: string;
  scopeTeamId?: string;
  name: string;
  description: string;
  triggerType: WorkflowTriggerType;
  eventType: WorkflowEventType;
  status: WorkflowStatus;
  decision: WorkflowDecisionConfig;
  templateKey?: string;
  actions: WorkflowActionInput[];
}

export interface WorkflowEventInput {
  eventId: string;
  eventType: WorkflowEventType;
  referenceId?: string;
}

export interface HydratedWorkflowEvent {
  eventId: string;
  idempotencyKey: string;
  eventType: WorkflowEventType;
  companyId: string;
  teamId?: string;
  targetUserId?: string;
  customerId?: string;
  taskId?: string;
  trainingAssignmentId?: string;
  reportId?: string;
  metricId?: string;
  businessData: Record<string, string | number | boolean | null>;
  occurredAt: string;
}

export interface ExecuteWorkflowInput {
  workflowId: string;
  companyId?: string;
  event: WorkflowEventInput;
}

export interface WorkflowListData {
  context: WorkflowContext;
  items: WorkflowDefinitionRecord[];
  templates: WorkflowTemplate[];
}

export interface WorkflowExecutionListData {
  context: WorkflowContext;
  items: WorkflowExecutionRecord[];
}

export interface WorkflowTemplate {
  key: string;
  name: string;
  description: string;
  triggerType: WorkflowTriggerType;
  eventType: WorkflowEventType;
  actions: WorkflowActionInput[];
}

export interface WorkflowApiSuccess<T> {
  ok: true;
  success: true;
  data: T;
}

export interface WorkflowApiError {
  ok: false;
  success: false;
  code?: string;
  message?: string;
  error?: { code?: string; message?: string };
}
