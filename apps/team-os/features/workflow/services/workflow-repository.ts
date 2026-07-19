import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { DEFAULT_WORKFLOW_TEMPLATES } from "@/apps/team-os/features/workflow/rules/default-workflows";
import type { WorkflowAccessScope } from "@/apps/team-os/features/workflow/services/workflow-access";
import type {
  AssignTrainingActionConfig,
  CreateWorkflowInput,
  HydratedWorkflowEvent,
  WorkflowActionConfig,
  WorkflowActionRecord,
  WorkflowDecisionResult,
  WorkflowDefinitionConfig,
  WorkflowDefinitionRecord,
  WorkflowExecutionMode,
  WorkflowExecutionRecord,
  WorkflowExecutionResult,
  WorkflowExecutionStatus,
  WorkflowListData
} from "@/apps/team-os/features/workflow/types";

const definitionInclude = {
  actions: { orderBy: [{ order: "asc" as const }, { id: "asc" as const }] }
};

function inputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function jsonRecord(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function serializeAction(action: {
  id: string;
  companyId: string;
  workflowId: string;
  actionType: WorkflowActionRecord["actionType"];
  config: Prisma.JsonValue;
  order: number;
  createdAt: Date;
}): WorkflowActionRecord {
  return {
    id: action.id,
    companyId: action.companyId,
    workflowId: action.workflowId,
    actionType: action.actionType,
    config: jsonRecord(action.config) as unknown as WorkflowActionConfig,
    order: action.order,
    createdAt: action.createdAt.toISOString()
  };
}

function serializeDefinition(definition: {
  id: string;
  companyId: string;
  teamId: string | null;
  name: string;
  description: string;
  triggerType: WorkflowDefinitionRecord["triggerType"];
  eventType: WorkflowDefinitionRecord["eventType"];
  status: WorkflowDefinitionRecord["status"];
  config: Prisma.JsonValue;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  actions: Array<Parameters<typeof serializeAction>[0]>;
}): WorkflowDefinitionRecord {
  const config = jsonRecord(definition.config);
  return {
    id: definition.id,
    companyId: definition.companyId,
    ...(definition.teamId ? { scopeTeamId: definition.teamId } : {}),
    name: definition.name,
    description: definition.description,
    triggerType: definition.triggerType,
    eventType: definition.eventType,
    status: definition.status,
    config: {
      decision: {
        enabled: config.decision !== null && typeof config.decision === "object" && !Array.isArray(config.decision)
          ? (config.decision as { enabled?: unknown }).enabled === true
          : false,
        minConfidence: config.decision !== null && typeof config.decision === "object" && !Array.isArray(config.decision)
          && typeof (config.decision as { minConfidence?: unknown }).minConfidence === "number"
          ? (config.decision as { minConfidence: number }).minConfidence
          : 0.7
      },
      ...(typeof config.templateKey === "string" ? { templateKey: config.templateKey } : {})
    },
    createdBy: definition.createdBy,
    actions: definition.actions.map(serializeAction),
    createdAt: definition.createdAt.toISOString(),
    updatedAt: definition.updatedAt.toISOString()
  };
}

function visibilityWhere(access: WorkflowAccessScope): Prisma.WorkflowDefinitionWhereInput {
  if (access.context.permissionLevel === "OWNER") {
    return { companyId: access.context.companyId };
  }
  if (access.context.permissionLevel === "MANAGER") {
    return {
      companyId: access.context.companyId,
      teamId: { in: access.managerTeamIds }
    };
  }
  return {
    companyId: access.context.companyId,
    OR: [
      { teamId: null },
      { teamId: { in: access.trainerTeamIds } }
    ],
    AND: [{
      OR: [
        { triggerType: "TRAINING" },
        { actions: { some: { actionType: "ASSIGN_TRAINING" } } }
      ]
    }]
  };
}

export async function listWorkflowDefinitions(access: WorkflowAccessScope): Promise<WorkflowListData> {
  const items = await prisma.workflowDefinition.findMany({
    where: visibilityWhere(access),
    include: definitionInclude,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 100
  });
  return {
    context: access.context,
    items: items.map(serializeDefinition),
    templates: DEFAULT_WORKFLOW_TEMPLATES
  };
}

export async function createWorkflowDefinition(
  access: WorkflowAccessScope,
  input: CreateWorkflowInput
) {
  const config: WorkflowDefinitionConfig = {
    decision: input.decision,
    ...(input.templateKey ? { templateKey: input.templateKey } : {})
  };
  const created = await prisma.workflowDefinition.create({
    data: {
      companyId: access.context.companyId,
      teamId: input.scopeTeamId,
      name: input.name,
      description: input.description,
      triggerType: input.triggerType,
      eventType: input.eventType,
      status: input.status,
      config: inputJson(config),
      createdBy: access.userId,
      actions: {
        create: input.actions.map((action) => ({
          companyId: access.context.companyId,
          actionType: action.actionType,
          config: inputJson(action.config),
          order: action.order
        }))
      }
    },
    include: definitionInclude
  });
  return serializeDefinition(created);
}

export async function assertWorkflowTrainingCoursesAvailable(
  access: WorkflowAccessScope,
  input: CreateWorkflowInput
) {
  const courseIds = Array.from(new Set(input.actions.flatMap((action) => (
    action.actionType === "ASSIGN_TRAINING"
      ? [(action.config as AssignTrainingActionConfig).courseId]
      : []
  ))));
  if (courseIds.length === 0) return;

  const availableCourses = await prisma.trainingCourse.findMany({
    where: {
      id: { in: courseIds },
      companyId: access.context.companyId,
      status: "ACTIVE"
    },
    select: { id: true }
  });
  const availableCourseIds = new Set(availableCourses.map((course) => course.id));
  if (courseIds.some((courseId) => !availableCourseIds.has(courseId))) {
    throw new ValidationError("培训动作引用的课程不存在、不属于当前企业或已停用。");
  }
}

export async function getWorkflowDefinitionForExecution(
  access: WorkflowAccessScope,
  workflowId: string
) {
  const workflow = await prisma.workflowDefinition.findFirst({
    where: {
      id: workflowId,
      companyId: access.context.companyId
    },
    include: definitionInclude
  });
  if (!workflow) throw new NotFoundError("工作流不存在或当前账号无权访问。");
  return serializeDefinition(workflow);
}

function serializeExecution(execution: {
  id: string;
  workflowId: string;
  companyId: string;
  teamId: string | null;
  triggeredBy: string | null;
  eventId: string;
  idempotencyKey: string;
  eventType: WorkflowExecutionRecord["eventType"];
  mode: WorkflowExecutionRecord["mode"];
  status: WorkflowExecutionRecord["status"];
  triggerData: Prisma.JsonValue;
  decision: Prisma.JsonValue | null;
  result: Prisma.JsonValue | null;
  error: Prisma.JsonValue | null;
  createdAt: Date;
  finishedAt: Date | null;
  workflow: { name: string };
}): WorkflowExecutionRecord {
  const error = jsonRecord(execution.error);
  return {
    id: execution.id,
    workflowId: execution.workflowId,
    workflowName: execution.workflow.name,
    companyId: execution.companyId,
    ...(execution.teamId ? { teamId: execution.teamId } : {}),
    ...(execution.triggeredBy ? { triggeredBy: execution.triggeredBy } : {}),
    eventId: execution.eventId,
    idempotencyKey: execution.idempotencyKey,
    eventType: execution.eventType,
    mode: execution.mode,
    status: execution.status,
    triggerData: jsonRecord(execution.triggerData),
    ...(execution.result ? { result: jsonRecord(execution.result) as unknown as WorkflowExecutionResult } : {}),
    ...(Object.keys(error).length > 0 ? {
      error: {
        code: typeof error.code === "string" ? error.code : "WORKFLOW_EXECUTION_FAILED",
        message: typeof error.message === "string" ? error.message : "工作流执行失败。",
        retryable: error.retryable === true,
        ...(typeof error.actionId === "string" ? { actionId: error.actionId } : {}),
        ...(typeof error.actionType === "string" ? { actionType: error.actionType as WorkflowActionRecord["actionType"] } : {}),
        at: typeof error.at === "string" ? error.at : execution.createdAt.toISOString()
      }
    } : {}),
    createdAt: execution.createdAt.toISOString(),
    ...(execution.finishedAt ? { finishedAt: execution.finishedAt.toISOString() } : {})
  };
}

const executionInclude = { workflow: { select: { name: true } } };

export async function claimWorkflowExecution(input: {
  workflow: WorkflowDefinitionRecord;
  event: HydratedWorkflowEvent;
  triggeredBy?: string;
  mode: WorkflowExecutionMode;
}) {
  const idempotencyKey = `${input.mode}:${input.event.idempotencyKey}`;
  try {
    const created = await prisma.workflowExecution.create({
      data: {
        workflowId: input.workflow.id,
        companyId: input.workflow.companyId,
        teamId: input.event.teamId,
        triggeredBy: input.triggeredBy,
        eventId: input.event.eventId,
        idempotencyKey,
        eventType: input.event.eventType,
        mode: input.mode,
        triggerData: inputJson(input.event),
        status: "RUNNING"
      },
      include: executionInclude
    });
    return { execution: serializeExecution(created), claimed: true };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const existing = await prisma.workflowExecution.findUnique({
      where: {
        companyId_workflowId_idempotencyKey: {
          companyId: input.workflow.companyId,
          workflowId: input.workflow.id,
          idempotencyKey
        }
      },
      include: executionInclude
    });
    if (!existing) throw error;
    return { execution: serializeExecution(existing), claimed: false };
  }
}

export async function finishWorkflowExecution(input: {
  executionId: string;
  companyId: string;
  status: Exclude<WorkflowExecutionStatus, "RUNNING">;
  decision: WorkflowDecisionResult;
  result?: WorkflowExecutionResult;
  error?: WorkflowExecutionRecord["error"];
}) {
  const updated = await prisma.workflowExecution.update({
    where: { id: input.executionId, companyId: input.companyId },
    data: {
      status: input.status,
      decision: inputJson(input.decision),
      result: input.result ? inputJson(input.result) : Prisma.DbNull,
      error: input.error ? inputJson(input.error) : Prisma.DbNull,
      finishedAt: new Date()
    },
    include: executionInclude
  });
  return serializeExecution(updated);
}

export async function listWorkflowExecutions(access: WorkflowAccessScope, limit: number) {
  const workflows = visibilityWhere(access);
  const items = await prisma.workflowExecution.findMany({
    where: {
      companyId: access.context.companyId,
      workflow: workflows,
      ...(access.context.permissionLevel === "TRAINER"
        ? { teamId: { in: access.trainerTeamIds } }
        : {})
    },
    include: executionInclude,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit
  });
  return {
    context: access.context,
    items: items.map(serializeExecution)
  };
}

export async function findActiveWorkflowsForEvent(input: {
  companyId: string;
  teamId?: string;
  eventType: WorkflowDefinitionRecord["eventType"];
}) {
  const workflows = await prisma.workflowDefinition.findMany({
    where: {
      companyId: input.companyId,
      eventType: input.eventType,
      status: "ACTIVE",
      OR: [
        { teamId: null },
        ...(input.teamId ? [{ teamId: input.teamId }] : [])
      ]
    },
    include: definitionInclude,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 50
  });
  return workflows.map(serializeDefinition);
}
