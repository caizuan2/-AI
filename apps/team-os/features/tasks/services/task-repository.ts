import "server-only";

import { Prisma, type TaskSubmission } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { notifyTaskCompletedBestEffort } from "@/apps/team-os/services/notification";
import type {
  CreateTaskInput,
  SubmitTaskInput,
  TaskListData,
  TaskListItem,
  TaskListScope,
  TaskSubmissionRecord,
  TeamOption
} from "@/apps/team-os/features/tasks/types";

type TaskWithProgress = Prisma.TaskGetPayload<{
  include: {
    team: { select: { id: true; name: true } };
    _count: { select: { submissions: true } };
  };
}>;

const MANAGER_ROLES = new Set(["TEAM_OWNER", "TEAM_MANAGER"]);

function toTeamOption(membership: {
  role: TeamOption["role"];
  team: { id: string; name: string };
}): TeamOption {
  return {
    id: membership.team.id,
    name: membership.team.name,
    role: membership.role,
    canManage: MANAGER_ROLES.has(membership.role)
  };
}

function toTaskListItem(task: TaskWithProgress): TaskListItem {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    creatorId: task.creatorId,
    teamId: task.teamId,
    teamName: task.team.name,
    deadline: task.deadline.toISOString(),
    targetCount: task.targetCount,
    completedCount: task._count.submissions,
    status: task.status,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString()
  };
}

function toSubmissionRecord(submission: TaskSubmission): TaskSubmissionRecord {
  return {
    id: submission.id,
    taskId: submission.taskId,
    userId: submission.userId,
    content: submission.content,
    images: submission.images,
    attachments: submission.attachments,
    summary: submission.summary,
    status: submission.status,
    createdAt: submission.createdAt.toISOString(),
    updatedAt: submission.updatedAt.toISOString()
  };
}

export async function listTasksForUser(userId: string, scope: TaskListScope): Promise<TaskListData> {
  const memberships = await prisma.teamMember.findMany({
    where: { userId },
    select: {
      role: true,
      team: { select: { id: true, name: true } }
    },
    orderBy: { createdAt: "asc" }
  });
  const teams = memberships.map(toTeamOption);
  const allTeamIds = teams.map((team) => team.id);
  const manageableTeamIds = teams.filter((team) => team.canManage).map((team) => team.id);

  const tasks = await prisma.task.findMany({
    where: scope === "my"
      ? {
          teamId: { in: allTeamIds },
          status: { not: "CANCELLED" }
        }
      : {
          teamId: { in: manageableTeamIds }
        },
    include: {
      team: { select: { id: true, name: true } },
      _count: { select: { submissions: true } }
    },
    orderBy: [
      { deadline: "asc" },
      { createdAt: "desc" }
    ]
  });

  return {
    tasks: tasks.map(toTaskListItem),
    teams
  };
}

export async function createTaskForManager(userId: string, input: CreateTaskInput): Promise<TaskListItem> {
  const membership = await prisma.teamMember.findUnique({
    where: {
      teamId_userId: {
        teamId: input.teamId,
        userId
      }
    },
    select: { role: true }
  });

  if (!membership || !MANAGER_ROLES.has(membership.role)) {
    throw new ForbiddenError("只有团队负责人或主管可以发布任务。");
  }

  const task = await prisma.task.create({
    data: {
      title: input.title,
      description: `${input.description}\n\n提交要求：\n${input.submissionRequirements}`,
      creatorId: userId,
      teamId: input.teamId,
      deadline: new Date(input.deadline),
      targetCount: input.targetCount
    },
    include: {
      team: { select: { id: true, name: true } },
      _count: { select: { submissions: true } }
    }
  });

  return toTaskListItem(task);
}

export async function submitTaskEvidence(
  userId: string,
  taskId: string,
  input: SubmitTaskInput
): Promise<TaskSubmissionRecord> {
  if (!taskId.trim()) {
    throw new ValidationError("任务 ID 不能为空。");
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await prisma.$transaction(async (transaction) => {
        const task = await transaction.task.findFirst({
          where: {
            id: taskId,
            team: { members: { some: { userId } } }
          },
          select: {
            id: true,
            status: true,
            targetCount: true,
            deadline: true,
            creatorId: true,
            title: true,
            team: { select: { companyId: true } }
          }
        });

        if (!task) {
          throw new NotFoundError("任务不存在或当前用户无权提交。");
        }

        if (task.status === "CANCELLED" || task.status === "COMPLETED") {
          throw new ValidationError(task.status === "COMPLETED" ? "任务已经完成。" : "任务已经取消。");
        }

        if (task.deadline.getTime() <= Date.now()) {
          throw new ValidationError("任务已超过截止时间，不能继续提交。");
        }

        const created = await transaction.taskSubmission.create({
          data: {
            taskId: task.id,
            userId,
            content: input.content,
            images: input.images,
            attachments: input.attachments,
            summary: input.summary
          }
        });
        const completedCount = await transaction.taskSubmission.count({
          where: { taskId: task.id }
        });
        const becameCompleted = completedCount >= task.targetCount;

        await transaction.task.update({
          where: { id: task.id },
          data: {
            status: becameCompleted ? "COMPLETED" : "IN_PROGRESS"
          }
        });

        return {
          submission: created,
          completionEvent: becameCompleted
            ? {
                companyId: task.team.companyId,
                taskId: task.id,
                taskTitle: task.title,
                creatorId: task.creatorId,
                completedByUserId: userId
              }
            : null
        };
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      });

      if (result.completionEvent) {
        await notifyTaskCompletedBestEffort({
          ...result.completionEvent,
          becameCompleted: true
        });
      }
      return toSubmissionRecord(result.submission);
    } catch (error) {
      const shouldRetry = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!shouldRetry || attempt === 2) {
        throw error;
      }
    }
  }

  throw new Error("任务提交事务未完成。");
}
