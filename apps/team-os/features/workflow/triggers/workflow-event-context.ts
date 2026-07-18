import "server-only";

import { NotFoundError, ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { selectTrainingFinishedAssignment } from "@/apps/team-os/features/workflow/triggers/training-assignment";
import type {
  HydratedWorkflowEvent,
  WorkflowDefinitionRecord,
  WorkflowEventInput
} from "@/apps/team-os/features/workflow/types";

function assertEventScope(workflow: WorkflowDefinitionRecord, teamId?: string) {
  if (workflow.scopeTeamId && workflow.scopeTeamId !== teamId) {
    throw new ValidationError("业务事件不属于工作流绑定的团队。");
  }
}

function maskName(value: string) {
  const characters = Array.from(value.trim());
  return characters.length > 0 ? `${characters[0]}**` : "客户";
}

export async function hydrateWorkflowEvent(input: {
  workflow: WorkflowDefinitionRecord;
  event: WorkflowEventInput;
  actorUserId?: string;
}): Promise<HydratedWorkflowEvent> {
  const { workflow, event } = input;
  if (workflow.eventType !== event.eventType) {
    throw new ValidationError("事件类型与工作流定义不匹配。");
  }
  const base = {
    eventId: event.eventId,
    eventType: event.eventType,
    companyId: workflow.companyId,
    occurredAt: new Date().toISOString()
  };

  if (event.eventType === "TASK_COMPLETED" || event.eventType === "TASK_OVERDUE") {
    const task = await prisma.task.findFirst({
      where: {
        id: event.referenceId,
        team: { companyId: workflow.companyId, status: "ACTIVE" }
      },
      select: {
        id: true,
        title: true,
        creatorId: true,
        teamId: true,
        status: true,
        deadline: true,
        updatedAt: true
      }
    });
    if (!task) throw new NotFoundError("任务事件引用不存在或不属于当前企业。");
    assertEventScope(workflow, task.teamId);
    const overdue = task.deadline.getTime() < Date.now()
      && task.status !== "COMPLETED"
      && task.status !== "CANCELLED";
    if (event.eventType === "TASK_COMPLETED" && task.status !== "COMPLETED") {
      throw new ValidationError("引用任务尚未完成，不能触发完成事件。");
    }
    return {
      ...base,
      idempotencyKey: `${event.eventType}:${task.id}:${task.updatedAt.toISOString()}`,
      teamId: task.teamId,
      targetUserId: task.creatorId,
      taskId: task.id,
      businessData: {
        taskTitle: task.title.slice(0, 160),
        taskStatus: task.status,
        overdue,
        deadline: task.deadline.toISOString()
      },
      occurredAt: task.updatedAt.toISOString()
    };
  }

  if (event.eventType === "CRM_RISK_FOUND") {
    const customer = await prisma.customer.findFirst({
      where: {
        id: event.referenceId,
        companyId: workflow.companyId,
        team: { status: "ACTIVE" }
      },
      select: {
        id: true,
        name: true,
        teamId: true,
        ownerId: true,
        updatedAt: true,
        aiProfile: {
          select: { riskLevel: true, purchaseProbability: true, updatedAt: true }
        }
      }
    });
    if (!customer) throw new NotFoundError("客户事件引用不存在或不属于当前企业。");
    assertEventScope(workflow, customer.teamId);
    return {
      ...base,
      idempotencyKey: `${event.eventType}:${customer.id}:${(customer.aiProfile?.updatedAt ?? customer.updatedAt).toISOString()}`,
      teamId: customer.teamId,
      targetUserId: customer.ownerId,
      customerId: customer.id,
      businessData: {
        customerName: maskName(customer.name),
        riskLevel: customer.aiProfile?.riskLevel ?? "UNKNOWN",
        purchaseProbability: customer.aiProfile?.purchaseProbability ?? null
      },
      occurredAt: (customer.aiProfile?.updatedAt ?? customer.updatedAt).toISOString()
    };
  }

  if (event.eventType === "EMPLOYEE_SCORE_LOW") {
    const report = await prisma.employeeAnalysisReport.findFirst({
      where: {
        id: event.referenceId,
        team: { companyId: workflow.companyId, status: "ACTIVE" }
      },
      select: {
        id: true,
        userId: true,
        teamId: true,
        score: true,
        createdAt: true
      }
    });
    if (!report) throw new NotFoundError("AI 教练报告不存在或不属于当前企业。");
    assertEventScope(workflow, report.teamId);
    return {
      ...base,
      idempotencyKey: `${event.eventType}:${report.id}`,
      teamId: report.teamId,
      targetUserId: report.userId,
      reportId: report.id,
      businessData: { employeeScore: report.score },
      occurredAt: report.createdAt.toISOString()
    };
  }

  if (event.eventType === "TRAINING_FINISHED") {
    const record = await prisma.trainingRecord.findFirst({
      where: {
        id: event.referenceId,
        course: { companyId: workflow.companyId }
      },
      select: {
        id: true,
        userId: true,
        courseId: true,
        score: true,
        status: true,
        completedAt: true
      }
    });
    if (!record) throw new NotFoundError("培训记录不存在或不属于当前企业。");
    const assignments = await prisma.trainingAssignment.findMany({
      where: {
        companyId: workflow.companyId,
        courseId: record.courseId,
        userId: record.userId,
        ...(workflow.scopeTeamId ? { teamId: workflow.scopeTeamId } : {}),
        team: { status: "ACTIVE" }
      },
      select: { id: true, teamId: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 2
    });
    const assignment = selectTrainingFinishedAssignment(
      assignments,
      Boolean(workflow.scopeTeamId)
    );
    assertEventScope(workflow, assignment.teamId);
    if (record.status !== "COMPLETED") {
      throw new ValidationError("引用培训尚未完成。");
    }
    return {
      ...base,
      idempotencyKey: `${event.eventType}:${record.id}:${(record.completedAt ?? new Date(0)).toISOString()}`,
      teamId: assignment.teamId,
      targetUserId: record.userId,
      trainingAssignmentId: assignment.id,
      businessData: {
        trainingStatus: record.status,
        trainingScore: record.score,
        courseId: record.courseId
      },
      occurredAt: (record.completedAt ?? new Date()).toISOString()
    };
  }

  if (event.eventType === "BUSINESS_METRIC_ALERT") {
    const metric = await prisma.businessMetric.findFirst({
      where: { id: event.referenceId, companyId: workflow.companyId },
      select: { id: true, metricType: true, metricValue: true, date: true }
    });
    if (!metric) throw new NotFoundError("经营指标不存在或不属于当前企业。");
    return {
      ...base,
      idempotencyKey: `${event.eventType}:${metric.id}`,
      ...(workflow.scopeTeamId ? { teamId: workflow.scopeTeamId } : {}),
      ...(input.actorUserId ? { targetUserId: input.actorUserId } : {}),
      metricId: metric.id,
      businessData: {
        metricType: metric.metricType,
        metricValue: metric.metricValue,
        metricDate: metric.date.toISOString()
      },
      occurredAt: metric.date.toISOString()
    };
  }

  return {
    ...base,
    idempotencyKey: `${event.eventType}:${event.eventId}`,
    ...(workflow.scopeTeamId ? { teamId: workflow.scopeTeamId } : {}),
    ...(input.actorUserId ? { targetUserId: input.actorUserId } : {}),
    businessData: { manual: true }
  };
}
