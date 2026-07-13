import { ValidationError } from "@/lib/errors";
import {
  NOTIFICATION_TYPES,
  type NotificationType
} from "@/apps/team-os/features/notification/types";
import {
  WORKFLOW_ACTION_TYPES,
  WORKFLOW_EVENT_TYPES,
  WORKFLOW_STATUSES,
  WORKFLOW_TRIGGER_TYPES,
  type AssignTrainingActionConfig,
  type CreateFollowUpActionConfig,
  type CreateTaskActionConfig,
  type CreateWorkflowInput,
  type ExecuteWorkflowInput,
  type GenerateReportActionConfig,
  type SendNotificationActionConfig,
  type WorkflowActionInput,
  type WorkflowActionType,
  type WorkflowEventInput,
  type WorkflowEventType,
  type WorkflowStatus,
  type WorkflowTriggerType
} from "@/apps/team-os/features/workflow/types";
import {
  assertTriggerMatchesEvent,
  isActionAllowedForEvent
} from "@/apps/team-os/features/workflow/rules/workflow-rules";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new ValidationError(`${label}必须是 JSON 对象。`);
  return value;
}

function assertOnlyKeys(value: Record<string, unknown>, allowed: string[], label = "请求") {
  const allow = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !allow.has(key));
  if (unknown.length > 0) {
    throw new ValidationError(`${label}包含不支持的字段：${unknown.join("、")}。`);
  }
}

function textField(
  value: unknown,
  label: string,
  maxLength: number,
  options: { optional?: boolean } = {}
) {
  if ((value === undefined || value === null || value === "") && options.optional) return undefined;
  if (typeof value !== "string" || !value.trim()) {
    throw new ValidationError(`${label}不能为空。`);
  }
  const normalized = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").trim();
  if (normalized.length > maxLength) throw new ValidationError(`${label}不能超过 ${maxLength} 个字符。`);
  return normalized;
}

function integerField(value: unknown, label: string, min: number, max: number) {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    throw new ValidationError(`${label}必须是 ${min}-${max} 之间的整数。`);
  }
  return Number(value);
}

function enumField<T extends readonly string[]>(value: unknown, values: T, label: string): T[number] {
  if (typeof value !== "string" || !values.includes(value)) {
    throw new ValidationError(`${label}不正确。`);
  }
  return value as T[number];
}

export function parseWorkflowCompanyId(value: unknown) {
  return textField(value, "企业 ID", 120, { optional: true });
}

function parseCreateTaskConfig(value: unknown): CreateTaskActionConfig {
  const config = assertRecord(value, "创建任务配置");
  assertOnlyKeys(config, ["title", "description", "submissionRequirements", "deadlineDays", "targetCount"], "创建任务配置");
  return {
    title: textField(config.title, "任务标题", 120)!,
    description: textField(config.description, "任务描述", 5_000)!,
    submissionRequirements: textField(config.submissionRequirements, "提交要求", 2_000)!,
    deadlineDays: integerField(config.deadlineDays, "截止天数", 1, 90),
    targetCount: integerField(config.targetCount, "目标数量", 1, 10_000)
  };
}

function parseNotificationConfig(value: unknown): SendNotificationActionConfig {
  const config = assertRecord(value, "通知配置");
  assertOnlyKeys(config, ["title", "content", "notificationType", "recipient"], "通知配置");
  return {
    title: textField(config.title, "通知标题", 160)!,
    content: textField(config.content, "通知内容", 2_000)!,
    notificationType: enumField(config.notificationType, NOTIFICATION_TYPES, "通知类型") as NotificationType,
    recipient: enumField(config.recipient, ["EVENT_USER", "WORKFLOW_ACTOR"] as const, "通知接收人")
  };
}

function parseTrainingConfig(value: unknown): AssignTrainingActionConfig {
  const config = assertRecord(value, "培训配置");
  assertOnlyKeys(config, ["courseId", "deadlineDays"], "培训配置");
  return {
    courseId: textField(config.courseId, "课程 ID", 120)!,
    deadlineDays: integerField(config.deadlineDays, "培训截止天数", 1, 90)
  };
}

function parseFollowUpConfig(value: unknown): CreateFollowUpActionConfig {
  const config = assertRecord(value, "客户跟进任务配置");
  assertOnlyKeys(config, ["title", "plan", "submissionRequirements", "deadlineDays"], "客户跟进任务配置");
  return {
    title: textField(config.title, "跟进任务标题", 120)!,
    plan: textField(config.plan, "跟进计划", 5_000)!,
    submissionRequirements: textField(config.submissionRequirements, "跟进提交要求", 2_000)!,
    deadlineDays: integerField(config.deadlineDays, "跟进截止天数", 1, 30)
  };
}

function parseReportConfig(value: unknown): GenerateReportActionConfig {
  const config = assertRecord(value, "报告配置");
  assertOnlyKeys(config, ["rangeDays"], "报告配置");
  const rangeDays = integerField(config.rangeDays, "报告周期", 7, 90);
  if (rangeDays !== 7 && rangeDays !== 30 && rangeDays !== 90) {
    throw new ValidationError("报告周期只能是 7、30 或 90 天。");
  }
  return { rangeDays };
}

function parseActionConfig(actionType: WorkflowActionType, value: unknown) {
  if (actionType === "CREATE_TASK") return parseCreateTaskConfig(value);
  if (actionType === "SEND_NOTIFICATION") return parseNotificationConfig(value);
  if (actionType === "ASSIGN_TRAINING") return parseTrainingConfig(value);
  if (actionType === "CREATE_FOLLOWUP") return parseFollowUpConfig(value);
  return parseReportConfig(value);
}

function parseAction(value: unknown, index: number, eventType: WorkflowEventType): WorkflowActionInput {
  const action = assertRecord(value, `第 ${index + 1} 个动作`);
  assertOnlyKeys(action, ["actionType", "config", "order"], `第 ${index + 1} 个动作`);
  const actionType = enumField(action.actionType, WORKFLOW_ACTION_TYPES, "动作类型") as WorkflowActionType;
  if (!isActionAllowedForEvent(eventType, actionType)) {
    throw new ValidationError(`${eventType} 事件不允许执行 ${actionType} 动作。`);
  }
  return {
    actionType,
    order: integerField(action.order, "动作顺序", 1, 10),
    config: parseActionConfig(actionType, action.config)
  };
}

export function parseCreateWorkflowInput(value: unknown): CreateWorkflowInput {
  const body = assertRecord(value, "请求体");
  assertOnlyKeys(body, [
    "companyId",
    "scopeTeamId",
    "name",
    "description",
    "triggerType",
    "eventType",
    "status",
    "decision",
    "templateKey",
    "actions"
  ]);
  const triggerType = enumField(body.triggerType, WORKFLOW_TRIGGER_TYPES, "触发领域") as WorkflowTriggerType;
  const eventType = enumField(body.eventType, WORKFLOW_EVENT_TYPES, "事件类型") as WorkflowEventType;
  if (!assertTriggerMatchesEvent(triggerType, eventType)) {
    throw new ValidationError("触发领域与具体事件不匹配。");
  }
  const decision = assertRecord(body.decision, "AI 决策配置");
  assertOnlyKeys(decision, ["enabled", "minConfidence"], "AI 决策配置");
  if (typeof decision.enabled !== "boolean") throw new ValidationError("AI 决策开关必须是布尔值。");
  if (typeof decision.minConfidence !== "number" || !Number.isFinite(decision.minConfidence) || decision.minConfidence < 0 || decision.minConfidence > 1) {
    throw new ValidationError("AI 决策置信度必须在 0-1 之间。");
  }
  if (!Array.isArray(body.actions) || body.actions.length < 1 || body.actions.length > 10) {
    throw new ValidationError("工作流必须包含 1-10 个动作。");
  }
  const actions = body.actions.map((action, index) => parseAction(action, index, eventType));
  const orders = actions.map((action) => action.order).sort((left, right) => left - right);
  if (orders.some((order, index) => order !== index + 1)) {
    throw new ValidationError("动作顺序必须从 1 开始连续且不能重复。");
  }
  return {
    companyId: parseWorkflowCompanyId(body.companyId),
    scopeTeamId: textField(body.scopeTeamId, "团队 ID", 120, { optional: true }),
    name: textField(body.name, "工作流名称", 120)!,
    description: textField(body.description, "工作流说明", 2_000)!,
    triggerType,
    eventType,
    status: enumField(body.status, WORKFLOW_STATUSES, "工作流状态") as WorkflowStatus,
    decision: {
      enabled: decision.enabled,
      minConfidence: decision.minConfidence
    },
    templateKey: textField(body.templateKey, "模板标识", 120, { optional: true }),
    actions
  };
}

export function parseWorkflowEvent(value: unknown): WorkflowEventInput {
  const event = assertRecord(value, "事件");
  assertOnlyKeys(event, ["eventId", "eventType", "referenceId"], "事件");
  const eventType = enumField(event.eventType, WORKFLOW_EVENT_TYPES, "事件类型") as WorkflowEventType;
  const referenceId = textField(event.referenceId, "业务引用 ID", 120, { optional: true });
  if (eventType !== "SYSTEM_TRIGGERED" && !referenceId) {
    throw new ValidationError(`${eventType} 事件必须提供业务引用 ID。`);
  }
  return {
    eventId: textField(event.eventId, "事件 ID", 160)!,
    eventType,
    referenceId
  };
}

export function parseExecuteWorkflowInput(value: unknown): ExecuteWorkflowInput {
  const body = assertRecord(value, "请求体");
  assertOnlyKeys(body, ["workflowId", "companyId", "event"]);
  return {
    workflowId: textField(body.workflowId, "工作流 ID", 120)!,
    companyId: parseWorkflowCompanyId(body.companyId),
    event: parseWorkflowEvent(body.event)
  };
}

function assertQueryKeys(searchParams: URLSearchParams, allowed: string[]) {
  const allow = new Set(allowed);
  const keys = Array.from(new Set(searchParams.keys()));
  const unknown = keys.filter((key) => !allow.has(key));
  if (unknown.length > 0) {
    throw new ValidationError(`查询参数包含不支持的字段：${unknown.join("、")}。`);
  }
  for (const key of keys) {
    if (searchParams.getAll(key).length > 1) {
      throw new ValidationError(`查询参数 ${key} 不能重复。`);
    }
  }
}

function queryCompanyId(searchParams: URLSearchParams) {
  const value = searchParams.get("companyId");
  if (value !== null && !value.trim()) {
    throw new ValidationError("企业 ID 不能为空。");
  }
  return parseWorkflowCompanyId(value);
}

export function parseWorkflowListQuery(searchParams: URLSearchParams) {
  assertQueryKeys(searchParams, ["companyId"]);
  return { companyId: queryCompanyId(searchParams) };
}

export function parseWorkflowExecutionQuery(searchParams: URLSearchParams) {
  assertQueryKeys(searchParams, ["companyId", "limit"]);
  const limitValue = searchParams.get("limit");
  const limit = limitValue === null ? 50 : Number(limitValue);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new ValidationError("执行记录数量必须是 1-100 之间的整数。");
  }
  return {
    companyId: queryCompanyId(searchParams),
    limit
  };
}
