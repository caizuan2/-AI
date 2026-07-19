import "server-only";

import { ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import {
  assertBusinessInsightAccess,
  resolveAnalyticsAccess
} from "@/apps/team-os/features/analytics/services/analytics-access";
import { createTaskForManager } from "@/apps/team-os/features/tasks/services/task-repository";
import { assertTrainingManager } from "@/apps/team-os/features/training/services/training-access";
import {
  createTrainingAssignmentForUser,
  getTrainingCourseForUser
} from "@/apps/team-os/features/training/services/training-repository";
import { resolveNotificationAccess } from "@/apps/team-os/features/notification/services/notification-access";
import { notificationGateway } from "@/apps/team-os/features/notification/services/notification-gateway";
import { generateBusinessInsightForUser } from "@/apps/team-os/features/analytics/services/analytics-insight";
import { workflowActionPreview } from "@/apps/team-os/features/workflow/actions/action-preview";
import type {
  AssignTrainingActionConfig,
  CreateFollowUpActionConfig,
  CreateTaskActionConfig,
  GenerateReportActionConfig,
  HydratedWorkflowEvent,
  SendNotificationActionConfig,
  WorkflowActionRecord,
  WorkflowActionResult,
  WorkflowDefinitionRecord,
  WorkflowExecutionMode
} from "@/apps/team-os/features/workflow/types";

function addDays(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1_000).toISOString();
}

function templateValues(event: HydratedWorkflowEvent) {
  const values: Record<string, string> = {
    eventType: event.eventType,
    taskTitle: typeof event.businessData.taskTitle === "string" ? event.businessData.taskTitle : "",
    customerName: typeof event.businessData.customerName === "string" ? event.businessData.customerName : "",
    employeeScore: typeof event.businessData.employeeScore === "number" ? String(event.businessData.employeeScore) : "",
    metricType: typeof event.businessData.metricType === "string" ? event.businessData.metricType : "",
    metricValue: typeof event.businessData.metricValue === "number" ? String(event.businessData.metricValue) : ""
  };
  return values;
}

function renderTemplate(value: string, event: HydratedWorkflowEvent) {
  const values = templateValues(event);
  return value.replace(/\{\{([a-zA-Z]+)\}\}/g, (_match, key: string) => values[key] ?? "").trim();
}

function renderRequired(
  value: string,
  event: HydratedWorkflowEvent,
  label: string,
  maxLength: number
) {
  const rendered = renderTemplate(value, event);
  if (!rendered) throw new ValidationError(`${label}在变量替换后不能为空。`);
  if (rendered.length > maxLength) {
    throw new ValidationError(`${label}在变量替换后不能超过 ${maxLength} 个字符。`);
  }
  return rendered;
}

function requireTeam(event: HydratedWorkflowEvent) {
  if (!event.teamId) throw new ValidationError("当前事件没有可执行动作的团队范围。");
  return event.teamId;
}

function requireActor(actorUserId: string | undefined) {
  if (!actorUserId) throw new ValidationError("工作流执行必须有经过验证的流程操作者。");
  return actorUserId;
}

function renderFollowUpTitle(config: CreateFollowUpActionConfig, event: HydratedWorkflowEvent) {
  const customerLabel = typeof event.businessData.customerName === "string"
    ? event.businessData.customerName
    : "客户";
  const title = `${renderRequired(config.title, event, "跟进任务标题", 120)} · ${customerLabel}`;
  if (title.length > 120) {
    throw new ValidationError("跟进任务标题在变量替换后不能超过 120 个字符。");
  }
  return title;
}

function testResult(action: WorkflowActionRecord, summary: string): WorkflowActionResult {
  return {
    actionId: action.id,
    actionType: action.actionType,
    order: action.order,
    status: "SKIPPED",
    summary: `测试预演：${summary}`,
    output: { dryRun: true }
  };
}

async function preflightWorkflowAction(input: {
  workflow: WorkflowDefinitionRecord;
  action: WorkflowActionRecord;
  event: HydratedWorkflowEvent;
  actorUserId?: string;
}) {
  const { action, event, workflow } = input;
  const actorUserId = requireActor(input.actorUserId);

  if (action.actionType === "CREATE_TASK") {
    const config = action.config as CreateTaskActionConfig;
    requireTeam(event);
    renderRequired(config.title, event, "任务标题", 120);
    renderRequired(config.description, event, "任务描述", 5_000);
    renderRequired(config.submissionRequirements, event, "提交要求", 2_000);
    return;
  }

  if (action.actionType === "CREATE_FOLLOWUP") {
    if (!event.customerId) throw new ValidationError("客户跟进动作必须由客户风险事件触发。");
    const config = action.config as CreateFollowUpActionConfig;
    requireTeam(event);
    renderFollowUpTitle(config, event);
    renderRequired(config.plan, event, "跟进计划", 5_000);
    renderRequired(config.submissionRequirements, event, "跟进提交要求", 2_000);
    return;
  }

  if (action.actionType === "ASSIGN_TRAINING") {
    const config = action.config as AssignTrainingActionConfig;
    const teamId = requireTeam(event);
    if (!event.targetUserId) throw new ValidationError("培训动作没有可用的目标员工。");
    const { course, access } = await getTrainingCourseForUser(actorUserId, config.courseId, {
      requireActive: true
    });
    assertTrainingManager(access);
    const [targetMembership, targetUser] = course.companyId === workflow.companyId
      && access.managedTeamIds.includes(teamId)
      ? await Promise.all([
          prisma.teamMember.findFirst({
            where: {
              userId: event.targetUserId,
              teamId,
              status: "ACTIVE",
              team: { companyId: workflow.companyId, status: "ACTIVE" }
            },
            select: { id: true }
          }),
          prisma.user.findFirst({
            where: { id: event.targetUserId, isActive: true },
            select: { id: true }
          })
        ])
      : [null, null];
    if (!targetMembership || !targetUser) {
      throw new ValidationError("培训预检失败：课程、团队或目标员工当前不可用。");
    }
    return;
  }

  if (action.actionType === "SEND_NOTIFICATION") {
    const config = action.config as SendNotificationActionConfig;
    const recipientUserId = config.recipient === "EVENT_USER" ? event.targetUserId : actorUserId;
    if (!recipientUserId) throw new ValidationError("通知动作没有可用的接收人。");
    renderRequired(config.title, event, "通知标题", 160);
    renderRequired(config.content, event, "通知内容", 2_000);
    await resolveNotificationAccess({
      userId: recipientUserId,
      requestedCompanyId: workflow.companyId,
      requestedTeamId: event.teamId,
      scope: "MINE"
    });
    return;
  }

  const access = await resolveAnalyticsAccess(actorUserId, workflow.companyId);
  assertBusinessInsightAccess(access);
}

export async function executeWorkflowAction(input: {
  workflow: WorkflowDefinitionRecord;
  action: WorkflowActionRecord;
  event: HydratedWorkflowEvent;
  executionId: string;
  actorUserId?: string;
  mode: WorkflowExecutionMode;
}): Promise<WorkflowActionResult> {
  const { action, event } = input;
  if (input.mode === "TEST") {
    await preflightWorkflowAction(input);
    return testResult(action, workflowActionPreview(action.actionType));
  }

  const actorUserId = requireActor(input.actorUserId);
  if (action.actionType === "CREATE_TASK") {
    const config = action.config as CreateTaskActionConfig;
    const task = await createTaskForManager(actorUserId, {
      title: renderRequired(config.title, event, "任务标题", 120),
      description: renderRequired(config.description, event, "任务描述", 5_000),
      submissionRequirements: renderRequired(config.submissionRequirements, event, "提交要求", 2_000),
      teamId: requireTeam(event),
      deadline: addDays(config.deadlineDays),
      targetCount: config.targetCount
    });
    return {
      actionId: action.id,
      actionType: action.actionType,
      order: action.order,
      status: "SUCCESS",
      summary: "已通过任务服务创建团队任务。",
      output: { taskId: task.id, teamId: task.teamId }
    };
  }

  if (action.actionType === "CREATE_FOLLOWUP") {
    if (!event.customerId) throw new ValidationError("客户跟进动作必须由客户风险事件触发。");
    const config = action.config as CreateFollowUpActionConfig;
    const task = await createTaskForManager(actorUserId, {
      title: renderFollowUpTitle(config, event),
      description: renderRequired(config.plan, event, "跟进计划", 5_000),
      submissionRequirements: renderRequired(config.submissionRequirements, event, "跟进提交要求", 2_000),
      teamId: requireTeam(event),
      deadline: addDays(config.deadlineDays),
      targetCount: 1
    });
    return {
      actionId: action.id,
      actionType: action.actionType,
      order: action.order,
      status: "SUCCESS",
      summary: "已创建客户跟进团队任务；未写入 CRM 沟通历史。",
      output: { taskId: task.id, customerId: event.customerId, teamId: task.teamId }
    };
  }

  if (action.actionType === "ASSIGN_TRAINING") {
    const config = action.config as AssignTrainingActionConfig;
    if (!event.targetUserId) throw new ValidationError("培训动作没有可用的目标员工。");
    const assignment = await createTrainingAssignmentForUser(actorUserId, {
      courseId: config.courseId,
      teamId: requireTeam(event),
      userId: event.targetUserId,
      deadline: addDays(config.deadlineDays)
    });
    return {
      actionId: action.id,
      actionType: action.actionType,
      order: action.order,
      status: "SUCCESS",
      summary: "已通过培训服务安排课程。",
      output: {
        assignmentId: assignment.assignment.id,
        teamId: assignment.assignment.teamId
      }
    };
  }

  if (action.actionType === "SEND_NOTIFICATION") {
    const config = action.config as SendNotificationActionConfig;
    const recipientUserId = config.recipient === "EVENT_USER"
      ? event.targetUserId
      : actorUserId;
    if (!recipientUserId) throw new ValidationError("通知动作没有可用的接收人。");
    const delivery = await notificationGateway.sendNotification({
      companyId: input.workflow.companyId,
      teamId: event.teamId,
      userId: recipientUserId,
      type: config.notificationType,
      title: renderRequired(config.title, event, "通知标题", 160),
      content: renderRequired(config.content, event, "通知内容", 2_000),
      source: `WORKFLOW:${input.executionId}:${action.id}`.slice(0, 120),
      channels: ["IN_APP"],
      mode: "PRODUCTION"
    });
    const created = delivery.attempts.filter((attempt) => attempt.status === "CREATED").length;
    const failed = delivery.attempts.filter((attempt) => attempt.status === "FAILED").length;
    if (failed > 0) throw new Error("站内通知创建失败。");
    return {
      actionId: action.id,
      actionType: action.actionType,
      order: action.order,
      status: "SUCCESS",
      summary: created > 0 ? "站内通知已发送。" : "接收人已关闭站内通知，动作已安全跳过。",
      output: { recipientUserId, createdCount: created }
    };
  }

  const config = action.config as GenerateReportActionConfig;
  const report = await generateBusinessInsightForUser(actorUserId, {
    companyId: input.workflow.companyId,
    days: config.rangeDays
  });
  return {
    actionId: action.id,
    actionType: action.actionType,
    order: action.order,
    status: "SUCCESS",
    summary: "已生成授权范围内的经营分析报告。",
    output: {
      summary: report.summary.slice(0, 2_000),
      highlights: report.highlights.slice(0, 6),
      risks: report.risks.slice(0, 6),
      actions: report.actions.slice(0, 8),
      generatedAt: report.generatedAt
    }
  };
}
