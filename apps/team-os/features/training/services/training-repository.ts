import "server-only";

import {
  Prisma,
  type AITrainingEvaluation,
  type TrainingAssignment,
  type TrainingCourse,
  type TrainingRecord
} from "@prisma/client";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import {
  assertTrainingCourseEditor,
  assertTrainingManager,
  getAssignableTrainingMembers,
  resolveTrainingAccess,
  trainingDisplayName,
  type TrainingAccessState
} from "@/apps/team-os/features/training/services/training-access";
import type {
  CreateTrainingAssignmentInput,
  TrainingAssignmentItem,
  TrainingCourseListData,
  TrainingCourseListFilters,
  TrainingCourseProgressItem,
  TrainingCourseRecord,
  TrainingDashboardData,
  TrainingEvaluationItem,
  TrainingManagementData,
  TrainingRecordItem,
  UpdateTrainingRecordInput,
  UpsertTrainingCourseInput
} from "@/apps/team-os/features/training/types";
import type {
  TrainingEvaluationResult as AiTrainingEvaluationResult,
  TrainingRecommendationInput
} from "@/apps/team-os/services/training-ai";

function serializeCourse(course: TrainingCourse): TrainingCourseRecord {
  return {
    id: course.id,
    companyId: course.companyId,
    title: course.title,
    description: course.description,
    category: course.category,
    content: course.content,
    level: course.level,
    status: course.status,
    createdAt: course.createdAt.toISOString(),
    updatedAt: course.updatedAt.toISOString()
  };
}

function serializeRecord(record: TrainingRecord): TrainingRecordItem {
  return {
    id: record.id,
    courseId: record.courseId,
    userId: record.userId,
    score: record.score,
    status: record.status,
    ...(record.completedAt ? { completedAt: record.completedAt.toISOString() } : {}),
    createdAt: record.createdAt.toISOString()
  };
}

function serializeEvaluation(evaluation: AITrainingEvaluation): TrainingEvaluationItem {
  return {
    id: evaluation.id,
    userId: evaluation.userId,
    courseId: evaluation.courseId,
    question: evaluation.question,
    answer: evaluation.answer,
    score: evaluation.score,
    feedback: evaluation.feedback,
    createdAt: evaluation.createdAt.toISOString()
  };
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function isAssignmentOverdue(assignment: { deadline: Date; status: string }) {
  return assignment.deadline.getTime() < Date.now() &&
    assignment.status !== "COMPLETED" && assignment.status !== "CANCELLED";
}

async function userNames(userIds: string[]) {
  const uniqueIds = Array.from(new Set(userIds));
  if (uniqueIds.length === 0) return new Map<string, string>();
  const users = await prisma.user.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, name: true, email: true, phone: true }
  });
  return new Map(users.map((user) => [user.id, trainingDisplayName(user)]));
}

function serializeAssignment(
  assignment: TrainingAssignment & {
    course: { title: string };
    team: { name: string };
  },
  names: Map<string, string>
): TrainingAssignmentItem {
  return {
    id: assignment.id,
    courseId: assignment.courseId,
    courseTitle: assignment.course.title,
    teamId: assignment.teamId,
    teamName: assignment.team.name,
    userId: assignment.userId,
    userName: names.get(assignment.userId) ?? "成员",
    assignedBy: assignment.assignedBy,
    assignedByName: names.get(assignment.assignedBy) ?? "负责人",
    deadline: assignment.deadline.toISOString(),
    status: assignment.status,
    overdue: isAssignmentOverdue(assignment),
    createdAt: assignment.createdAt.toISOString()
  };
}

async function runSerializableTransaction<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      });
    } catch (error) {
      const known = error instanceof Prisma.PrismaClientKnownRequestError ? error : null;
      if (known?.code === "P2034" && attempt < 2) continue;
      if (known?.code === "P2034") {
        throw new ValidationError("培训数据已发生变化，请重新提交。");
      }
      throw error;
    }
  }
  throw new ValidationError("培训数据已发生变化，请重新提交。");
}

export async function getTrainingCourseForUser(
  userId: string,
  courseId: string,
  options: { requireActive?: boolean } = {}
) {
  const memberships = await prisma.teamMember.findMany({
    where: {
      userId,
      status: "ACTIVE",
      team: { status: "ACTIVE" }
    },
    select: { team: { select: { companyId: true } } }
  });
  const companyIds = Array.from(new Set(
    memberships.map((membership) => membership.team.companyId)
  ));
  const course = companyIds.length > 0
    ? await prisma.trainingCourse.findFirst({
        where: {
          id: courseId,
          companyId: { in: companyIds },
          ...(options.requireActive ? { status: "ACTIVE" } : {})
        }
      })
    : null;
  if (!course) {
    throw new NotFoundError("课程不存在或当前账号无权访问。");
  }
  const access = await resolveTrainingAccess(userId, course.companyId);
  return { course, access };
}

export async function listTrainingCoursesForUser(
  userId: string,
  filters: TrainingCourseListFilters
): Promise<TrainingCourseListData> {
  const access = await resolveTrainingAccess(userId, filters.companyId);
  const canViewDisabled = access.context.permissions.canEditCourse;
  if (filters.status === "DISABLED" && !canViewDisabled) {
    throw new ForbiddenError("当前角色无权查看停用课程。");
  }
  const status = filters.status ?? (canViewDisabled ? undefined : "ACTIVE");
  const where: Prisma.TrainingCourseWhereInput = {
    companyId: access.context.companyId,
    ...(status ? { status } : {}),
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.level ? { level: filters.level } : {}),
    ...(filters.search ? {
      OR: [
        { title: { contains: filters.search, mode: "insensitive" } },
        { description: { contains: filters.search, mode: "insensitive" } }
      ]
    } : {})
  };
  const [courses, total] = await Promise.all([
    prisma.trainingCourse.findMany({
      where,
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }, { id: "desc" }],
      take: 200
    }),
    prisma.trainingCourse.count({ where })
  ]);
  return {
    context: access.context,
    items: courses.map(serializeCourse),
    total,
    truncated: courses.length < total
  };
}

export async function saveTrainingCourseForUser(
  userId: string,
  input: UpsertTrainingCourseInput & { description: string; content: string }
) {
  const access = await resolveTrainingAccess(userId, input.companyId);
  assertTrainingCourseEditor(access);
  try {
    const course = await runSerializableTransaction(async (transaction) => {
      const [currentEditor, currentUser] = await Promise.all([
        transaction.teamMember.findFirst({
          where: {
            userId,
            status: "ACTIVE",
            role: { in: ["TEAM_OWNER", "TRAINER"] },
            team: {
              companyId: access.context.companyId,
              status: "ACTIVE"
            }
          },
          select: { id: true }
        }),
        transaction.user.findFirst({
          where: { id: userId, isActive: true },
          select: { id: true }
        })
      ]);
      if (!currentEditor || !currentUser) {
        throw new ForbiddenError("当前角色无权创建或编辑企业课程。");
      }
      if (input.courseId) {
          const existing = await transaction.trainingCourse.findFirst({
            where: { id: input.courseId, companyId: access.context.companyId },
            select: { id: true }
          });
          if (!existing) {
            throw new NotFoundError("课程不存在或当前账号无权编辑。");
          }
          return transaction.trainingCourse.update({
            where: { id: existing.id },
            data: {
              title: input.title,
              description: input.description,
              category: input.category,
              content: input.content,
              level: input.level,
              status: input.status
            }
          });
      }
      return transaction.trainingCourse.create({
        data: {
          companyId: access.context.companyId,
          title: input.title,
          description: input.description,
          category: input.category,
          content: input.content,
          level: input.level,
          status: input.status
        }
      });
    });
    return { course: serializeCourse(course) };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ValidationError("当前企业已存在同名课程。");
    }
    throw error;
  }
}

export async function getTrainingDashboardForUser(
  userId: string,
  companyId?: string
): Promise<TrainingDashboardData> {
  const access = await resolveTrainingAccess(userId, companyId);
  const skillTeamIds = access.isCompanyOwner
    ? access.context.teams.map((team) => team.id)
    : access.directTeamIds;
  const [assignmentRows, recordRows, evaluationRows, skillScoreRows] = await Promise.all([
    prisma.trainingAssignment.findMany({
      where: {
        userId,
        status: { not: "CANCELLED" },
        course: { companyId: access.context.companyId }
      },
      include: { course: true, team: { select: { name: true } } },
      orderBy: [{ deadline: "asc" }, { createdAt: "desc" }],
      take: 201
    }),
    prisma.trainingRecord.findMany({
      where: { userId, course: { companyId: access.context.companyId } },
      include: { course: true },
      orderBy: { createdAt: "desc" },
      take: 201
    }),
    prisma.aITrainingEvaluation.findMany({
      where: { userId, course: { companyId: access.context.companyId } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 201
    }),
    prisma.employeeSkillScore.findMany({
      where: {
        userId,
        report: {
          teamId: { in: skillTeamIds },
          team: { companyId: access.context.companyId }
        }
      },
      select: { skillName: true, score: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 101
    })
  ]);
  const truncated = assignmentRows.length > 200 || recordRows.length > 200 ||
    evaluationRows.length > 200 || skillScoreRows.length > 100;
  const assignments = assignmentRows.slice(0, 200);
  const records = recordRows.slice(0, 200);
  const evaluations = evaluationRows.slice(0, 200);
  const skillScores = skillScoreRows.slice(0, 100);
  const courseById = new Map<string, TrainingCourse>();
  assignments.forEach((assignment) => courseById.set(assignment.course.id, assignment.course));
  records.forEach((record) => courseById.set(record.course.id, record.course));
  const recordByCourse = new Map(records.map((record) => [record.courseId, record]));
  const assignmentByCourse = new Map<string, (typeof assignments)[number]>();
  for (const assignment of assignments) {
    if (!assignmentByCourse.has(assignment.courseId)) {
      assignmentByCourse.set(assignment.courseId, assignment);
    }
  }
  const evaluationByCourse = new Map<string, AITrainingEvaluation>();
  for (const evaluation of evaluations) {
    if (!evaluationByCourse.has(evaluation.courseId)) {
      evaluationByCourse.set(evaluation.courseId, evaluation);
    }
  }
  const names = await userNames([
    userId,
    ...assignments.map((assignment) => assignment.assignedBy)
  ]);
  const myCourses: TrainingCourseProgressItem[] = Array.from(courseById.values()).map((course) => {
    const assignment = assignmentByCourse.get(course.id);
    const record = recordByCourse.get(course.id);
    const evaluation = evaluationByCourse.get(course.id);
    return {
      course: serializeCourse(course),
      ...(assignment ? { assignment: serializeAssignment(assignment, names) } : {}),
      ...(record ? { record: serializeRecord(record) } : {}),
      ...(evaluation ? { latestEvaluation: serializeEvaluation(evaluation) } : {})
    };
  }).sort((left, right) => {
    const leftDeadline = left.assignment?.deadline ?? "9999";
    const rightDeadline = right.assignment?.deadline ?? "9999";
    return leftDeadline.localeCompare(rightDeadline);
  });
  const latestSkillByName = new Map<string, number>();
  for (const skill of skillScores) {
    if (!latestSkillByName.has(skill.skillName)) latestSkillByName.set(skill.skillName, skill.score);
  }
  const completedScores = records.filter((record) => record.status === "COMPLETED").map((record) => record.score);
  const averageScore = average(completedScores);
  const skillAverage = average(Array.from(latestSkillByName.values()));
  const growthScore = average([averageScore, skillAverage].filter((score) => score > 0));

  return {
    context: access.context,
    myCourses,
    records: records.map(serializeRecord),
    truncated,
    stats: {
      assignedCourses: new Set(assignments.map((assignment) => assignment.courseId)).size,
      startedCourses: records.filter((record) => record.status !== "COMPLETED").length,
      completedCourses: records.filter((record) => record.status === "COMPLETED").length,
      averageScore,
      growthScore
    }
  };
}

export async function startTrainingCourseForUser(
  userId: string,
  input: UpdateTrainingRecordInput
) {
  const { course, access } = await getTrainingCourseForUser(userId, input.courseId, { requireActive: true });
  const record = await runSerializableTransaction(async (transaction) => {
    const [currentCourse, activeMembership, activeUser] = await Promise.all([
      transaction.trainingCourse.findFirst({
        where: {
          id: course.id,
          companyId: access.context.companyId,
          status: "ACTIVE"
        },
        select: { id: true }
      }),
      transaction.teamMember.findFirst({
        where: {
          userId,
          status: "ACTIVE",
          team: {
            companyId: access.context.companyId,
            status: "ACTIVE"
          }
        },
        select: { id: true }
      }),
      transaction.user.findFirst({
        where: { id: userId, isActive: true },
        select: { id: true }
      })
    ]);
    if (!currentCourse || !activeMembership || !activeUser) {
      throw new NotFoundError("课程不存在或当前账号无权访问。");
    }
    const existing = await transaction.trainingRecord.findUnique({
      where: { courseId_userId: { courseId: course.id, userId } }
    });
    const saved = existing?.status === "COMPLETED"
      ? existing
      : await transaction.trainingRecord.upsert({
          where: { courseId_userId: { courseId: course.id, userId } },
          create: { courseId: course.id, userId, status: "STARTED", score: 0 },
          update: { status: "STARTED", completedAt: null }
        });
    await transaction.trainingAssignment.updateMany({
      where: {
        courseId: course.id,
        userId,
        status: { in: ["ASSIGNED", "IN_PROGRESS"] }
      },
      data: { status: saved.status === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS" }
    });
    return saved;
  });
  return { record: serializeRecord(record) };
}

async function resultMembers(access: TrainingAccessState) {
  if (!access.context.permissions.canViewTeamProgress || access.resultTeamIds.length === 0) return [];
  const memberships = await prisma.teamMember.findMany({
    where: {
      teamId: { in: access.resultTeamIds },
      status: "ACTIVE",
      team: { companyId: access.context.companyId, status: "ACTIVE" }
    },
    select: {
      userId: true,
      role: true,
      team: { select: { id: true, name: true } }
    },
    orderBy: { createdAt: "asc" }
  });
  const ids = Array.from(new Set(memberships.map((membership) => membership.userId)));
  const users = ids.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: ids }, isActive: true },
        select: { id: true, name: true, email: true, phone: true }
      })
    : [];
  const userById = new Map(users.map((user) => [user.id, user]));
  return memberships.flatMap((membership) => {
    const user = userById.get(membership.userId);
    if (!user) return [];
    return [{
      id: user.id,
      name: trainingDisplayName(user),
      teamId: membership.team.id,
      teamName: membership.team.name,
      role: membership.role
    }];
  });
}

export async function getTrainingManagementForUser(
  userId: string,
  companyId?: string
): Promise<TrainingManagementData> {
  const access = await resolveTrainingAccess(userId, companyId);
  if (!access.context.permissions.canViewTeamProgress && !access.context.permissions.canAssignTraining) {
    throw new ForbiddenError("当前角色无权查看员工培训管理数据。");
  }
  const members = await resultMembers(access);
  const memberIds = Array.from(new Set(members.map((member) => member.id)));
  const [courseRows, assignmentRows] = await Promise.all([
    prisma.trainingCourse.findMany({
      where: {
        companyId: access.context.companyId,
        ...(access.context.permissions.canEditCourse ? {} : { status: "ACTIVE" })
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 201
    }),
    memberIds.length > 0
      ? prisma.trainingAssignment.findMany({
          where: {
            userId: { in: memberIds },
            teamId: { in: access.resultTeamIds },
            course: { companyId: access.context.companyId }
          },
          include: {
            course: { select: { title: true } },
            team: { select: { name: true } }
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1_001
        })
      : []
  ]);
  const coursesTruncated = courseRows.length > 200;
  const courses = courseRows.slice(0, 200);
  const assignmentsTruncated = assignmentRows.length > 1_000;
  const assignments = assignmentRows.slice(0, 1_000);
  const assignedPairs = new Set(
    assignments.map((assignment) => `${assignment.courseId}:${assignment.userId}`)
  );
  const assignedCourseIds = Array.from(new Set(assignments.map((assignment) => assignment.courseId)));
  const rawRecords = memberIds.length > 0
    ? await prisma.trainingRecord.findMany({
        where: {
          userId: { in: memberIds },
          course: { companyId: access.context.companyId },
          ...(!access.isCompanyOwner
            ? { courseId: { in: assignedCourseIds.length > 0 ? assignedCourseIds : ["__none__"] } }
            : {})
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1_001
      })
    : [];
  const recordsTruncated = rawRecords.length > 1_000;
  const records = (access.isCompanyOwner
    ? rawRecords
    : rawRecords.filter((record) => assignedPairs.has(`${record.courseId}:${record.userId}`)))
    .slice(0, 1_000);
  const names = await userNames([
    ...memberIds,
    ...assignments.map((assignment) => assignment.assignedBy)
  ]);
  const recordsByUser = new Map<string, TrainingRecord[]>();
  for (const record of records) {
    const items = recordsByUser.get(record.userId) ?? [];
    items.push(record);
    recordsByUser.set(record.userId, items);
  }
  const assignmentsByMember = new Map<string, TrainingAssignment[]>();
  for (const assignment of assignments) {
    const key = `${assignment.teamId}:${assignment.userId}`;
    const items = assignmentsByMember.get(key) ?? [];
    items.push(assignment);
    assignmentsByMember.set(key, items);
  }
  const assignableMembers = await getAssignableTrainingMembers(access);
  const assignableKeys = new Set(
    assignableMembers.map((member) => `${member.teamId}:${member.id}`)
  );

  return {
    context: access.context,
    members: members.filter((member) =>
      assignableKeys.has(`${member.teamId}:${member.id}`) ||
      !access.context.permissions.canAssignTraining
    ),
    courses: courses.map(serializeCourse),
    assignments: assignments.map((assignment) => serializeAssignment(assignment, names)),
    truncated: coursesTruncated || assignmentsTruncated || recordsTruncated,
    progress: members.map((member) => {
      const userAssignments = assignmentsByMember.get(`${member.teamId}:${member.id}`) ?? [];
      const userRecords = recordsByUser.get(member.id) ?? [];
      const assignedCourseIds = new Set(
        userAssignments
          .filter((assignment) => assignment.status !== "CANCELLED")
          .map((assignment) => assignment.courseId)
      );
      const completed = userRecords.filter((record) =>
        record.status === "COMPLETED" && assignedCourseIds.has(record.courseId)
      );
      return {
        userId: member.id,
        userName: member.name,
        teamId: member.teamId,
        teamName: member.teamName,
        assigned: userAssignments.filter((assignment) => assignment.status !== "CANCELLED").length,
        completed: completed.length,
        averageScore: average(completed.map((record) => record.score))
      };
    })
  };
}

export async function createTrainingAssignmentForUser(
  userId: string,
  input: CreateTrainingAssignmentInput
) {
  const { course, access } = await getTrainingCourseForUser(userId, input.courseId, { requireActive: true });
  assertTrainingManager(access);
  if (!access.managedTeamIds.includes(input.teamId)) {
    throw new ForbiddenError("当前账号无权在所选团队安排培训。");
  }
  const targetMembership = await prisma.teamMember.findFirst({
    where: {
      userId: input.userId,
      teamId: input.teamId,
      status: "ACTIVE",
      team: { companyId: access.context.companyId, status: "ACTIVE" }
    },
    select: { id: true }
  });
  const targetUser = targetMembership
    ? await prisma.user.findFirst({
        where: { id: input.userId, isActive: true },
        select: { id: true }
      })
    : null;
  if (!targetMembership || !targetUser) {
    throw new ForbiddenError("只能给当前管理范围内的有效员工安排培训。");
  }
  const assignment = await runSerializableTransaction(async (transaction) => {
    const deadline = new Date(input.deadline);
    const [currentCourse, currentTeam, currentActor, currentActorUser, currentTargetMembership, currentTargetUser, existing, completedRecord] = await Promise.all([
      transaction.trainingCourse.findFirst({
        where: {
          id: course.id,
          companyId: access.context.companyId,
          status: "ACTIVE"
        },
        select: { id: true }
      }),
      transaction.teamOrganization.findFirst({
        where: {
          id: input.teamId,
          companyId: access.context.companyId,
          status: "ACTIVE"
        },
        select: { id: true }
      }),
      transaction.teamMember.findFirst({
        where: {
          userId,
          status: "ACTIVE",
          OR: [
            {
              role: "TEAM_OWNER",
              team: {
                companyId: access.context.companyId,
                status: "ACTIVE"
              }
            },
            {
              role: "TEAM_MANAGER",
              team: {
                id: input.teamId,
                companyId: access.context.companyId,
                status: "ACTIVE"
              }
            }
          ]
        },
        select: { id: true }
      }),
      transaction.user.findFirst({
        where: { id: userId, isActive: true },
        select: { id: true }
      }),
      transaction.teamMember.findFirst({
        where: {
          userId: input.userId,
          teamId: input.teamId,
          status: "ACTIVE",
          team: {
            companyId: access.context.companyId,
            status: "ACTIVE"
          }
        },
        select: { id: true }
      }),
      transaction.user.findFirst({
        where: { id: input.userId, isActive: true },
        select: { id: true }
      }),
      transaction.trainingAssignment.findUnique({
        where: {
          courseId_teamId_userId: {
            courseId: course.id,
            teamId: input.teamId,
            userId: input.userId
          }
        }
      }),
      transaction.trainingRecord.findUnique({
        where: { courseId_userId: { courseId: course.id, userId: input.userId } },
        select: { status: true }
      })
    ]);
    if (!currentCourse || !currentTeam || !currentActor || !currentActorUser) {
      throw new ForbiddenError("当前账号无权在所选团队安排培训。");
    }
    if (!currentTargetMembership || !currentTargetUser) {
      throw new ForbiddenError("只能给当前管理范围内的有效员工安排培训。");
    }
    if (deadline.getTime() <= Date.now()) {
      throw new ValidationError("培训截止时间必须晚于当前时间。");
    }
    if (existing?.status === "COMPLETED" || completedRecord?.status === "COMPLETED") {
      throw new ValidationError("该员工已经完成此课程，无需重复安排。");
    }
    return transaction.trainingAssignment.upsert({
      where: {
        courseId_teamId_userId: {
          courseId: course.id,
          teamId: input.teamId,
          userId: input.userId
        }
      },
      create: {
        courseId: course.id,
        companyId: access.context.companyId,
        teamId: input.teamId,
        userId: input.userId,
        assignedBy: userId,
        deadline,
        status: "ASSIGNED"
      },
      update: {
        assignedBy: userId,
        deadline,
        status: "ASSIGNED"
      },
      include: {
        course: { select: { title: true } },
        team: { select: { name: true } }
      }
    });
  });
  const names = await userNames([userId, input.userId]);
  return { assignment: serializeAssignment(assignment, names) };
}

export interface LoadedTrainingEvaluationContext {
  course: TrainingCourseRecord;
  expectedCourseUpdatedAt: string;
  knowledgeAuthorizationTeamId: string;
}

export async function loadTrainingEvaluationContext(userId: string, courseId: string) {
  const { course, access } = await getTrainingCourseForUser(userId, courseId, { requireActive: true });
  const knowledgeAuthorizationTeamId = access.directTeamIds[0];
  if (!knowledgeAuthorizationTeamId) {
    throw new ForbiddenError("当前账号没有可用于企业知识授权的团队。");
  }
  return {
    course: serializeCourse(course),
    expectedCourseUpdatedAt: course.updatedAt.toISOString(),
    knowledgeAuthorizationTeamId,
    companyId: access.context.companyId
  };
}

export async function saveTrainingEvaluation(input: {
  userId: string;
  context: Awaited<ReturnType<typeof loadTrainingEvaluationContext>>;
  question: string;
  answer: string;
  result: AiTrainingEvaluationResult;
}) {
  await resolveTrainingAccess(input.userId, input.context.companyId);
  const saved = await runSerializableTransaction(async (transaction) => {
    const [course, activeMembership, activeUser] = await Promise.all([
      transaction.trainingCourse.findFirst({
        where: {
          id: input.context.course.id,
          companyId: input.context.companyId,
          status: "ACTIVE"
        },
        select: { id: true, updatedAt: true }
      }),
      transaction.teamMember.findFirst({
        where: {
          userId: input.userId,
          status: "ACTIVE",
          team: {
            companyId: input.context.companyId,
            status: "ACTIVE"
          }
        },
        select: { id: true }
      }),
      transaction.user.findFirst({
        where: { id: input.userId, isActive: true },
        select: { id: true }
      })
    ]);
    if (!course || !activeMembership || !activeUser) {
      throw new NotFoundError("课程不存在或当前账号无权访问。");
    }
    if (course.updatedAt.toISOString() !== input.context.expectedCourseUpdatedAt) {
      throw new ValidationError("课程内容已更新，请重新生成训练题目后作答。");
    }
    const current = await transaction.trainingRecord.findUnique({
      where: { courseId_userId: { courseId: course.id, userId: input.userId } }
    });
    const bestScore = Math.max(current?.score ?? 0, input.result.score);
    const completed = bestScore >= 60;
    const record = await transaction.trainingRecord.upsert({
      where: { courseId_userId: { courseId: course.id, userId: input.userId } },
      create: {
        courseId: course.id,
        userId: input.userId,
        score: bestScore,
        status: completed ? "COMPLETED" : "FAILED",
        completedAt: new Date()
      },
      update: {
        score: bestScore,
        status: completed || current?.status === "COMPLETED" ? "COMPLETED" : "FAILED",
        completedAt: current?.status === "COMPLETED"
          ? current.completedAt ?? new Date()
          : new Date()
      }
    });
    const feedback = [
      input.result.feedback,
      input.result.suggestions.length > 0
        ? `改进建议：\n${input.result.suggestions.map((item) => `- ${item}`).join("\n")}`
        : ""
    ].filter(Boolean).join("\n\n");
    const evaluation = await transaction.aITrainingEvaluation.create({
      data: {
        courseId: course.id,
        userId: input.userId,
        question: input.question,
        answer: input.answer,
        score: input.result.score,
        feedback
      }
    });
    await transaction.trainingAssignment.updateMany({
      where: {
        courseId: course.id,
        userId: input.userId,
        status: { not: "CANCELLED" }
      },
      data: { status: record.status === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS" }
    });
    return { evaluation, record };
  });
  return {
    evaluation: serializeEvaluation(saved.evaluation),
    record: serializeRecord(saved.record),
    score: input.result.score,
    feedback: input.result.feedback,
    suggestions: input.result.suggestions
  };
}

export async function loadTrainingRecommendationInput(
  userId: string,
  companyId?: string
): Promise<{
  access: TrainingAccessState;
  input: TrainingRecommendationInput;
}> {
  const access = await resolveTrainingAccess(userId, companyId);
  const crmRoleAllowed = access.crmTeamIds.length > 0;
  const crmTeamIds = access.crmTeamIds;
  const reportTeamIds = access.isCompanyOwner
    ? access.context.teams.map((team) => team.id)
    : access.directTeamIds;
  const skillWhere: Prisma.EmployeeSkillScoreWhereInput = {
    userId,
    report: {
      teamId: { in: reportTeamIds },
      team: { companyId: access.context.companyId }
    }
  };
  const reportWhere: Prisma.EmployeeAnalysisReportWhereInput = {
    userId,
    teamId: { in: reportTeamIds },
    team: { companyId: access.context.companyId }
  };
  const customerWhere: Prisma.CustomerAIProfileWhereInput = {
    customer: {
      companyId: access.context.companyId,
      teamId: { in: crmTeamIds },
      ownerId: userId
    }
  };
  const [skillGroups, reportAggregate, latestReports, courses] = await Promise.all([
    prisma.employeeSkillScore.groupBy({
      by: ["skillName"],
      where: skillWhere,
      _avg: { score: true },
      _count: { id: true },
      orderBy: [{ _avg: { score: "asc" } }, { skillName: "asc" }],
      take: 20
    }),
    prisma.employeeAnalysisReport.aggregate({
      where: reportWhere,
      _count: { id: true },
      _avg: { score: true }
    }),
    prisma.employeeAnalysisReport.findMany({
      where: reportWhere,
      select: { score: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 1
    }),
    prisma.trainingCourse.findMany({
      where: { companyId: access.context.companyId, status: "ACTIVE" },
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        level: true
      },
      orderBy: { updatedAt: "desc" },
      take: 80
    })
  ]);
  const selectedSkillNames = skillGroups.map((group) => group.skillName);
  const latestSkillRows = selectedSkillNames.length > 0
    ? await prisma.employeeSkillScore.findMany({
        where: {
          ...skillWhere,
          skillName: { in: selectedSkillNames }
        },
        select: { skillName: true, score: true },
        distinct: ["skillName"],
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      })
    : [];
  const latestSkillByName = new Map(
    latestSkillRows.map((row) => [row.skillName, row.score])
  );
  const skillMetrics = skillGroups.map((group) => ({
    skill: group.skillName,
    averageScore: Math.round(group._avg.score ?? 0),
    latestScore: latestSkillByName.get(group.skillName) ?? 0,
    sampleCount: group._count.id
  }));
  const reportCount = reportAggregate._count.id;
  const reportAverage = reportAggregate._avg.score ?? 0;
  const latestReportScore = latestReports[0]?.score ?? 0;
  const priorAverage = reportCount > 1
    ? ((reportAverage * reportCount) - latestReportScore) / (reportCount - 1)
    : 0;
  const trend = reportCount > 1 ? Math.round(latestReportScore - priorAverage) : 0;
  const intentDistribution: Record<string, number> = {};
  const riskDistribution: Record<string, number> = {};
  let profileCount = 0;
  let averagePurchaseProbability = 0;
  if (crmRoleAllowed && crmTeamIds.length > 0) {
    const [profileAggregate, intentGroups, riskGroups] = await Promise.all([
      prisma.customerAIProfile.aggregate({
        where: customerWhere,
        _count: { id: true },
        _avg: { purchaseProbability: true }
      }),
      prisma.customerAIProfile.groupBy({
        by: ["intent"],
        where: customerWhere,
        _count: { id: true }
      }),
      prisma.customerAIProfile.groupBy({
        by: ["riskLevel"],
        where: customerWhere,
        _count: { id: true }
      })
    ]);
    profileCount = profileAggregate._count.id;
    averagePurchaseProbability = Math.round(profileAggregate._avg.purchaseProbability ?? 0);
    for (const group of intentGroups) {
      intentDistribution[group.intent] = group._count.id;
    }
    for (const group of riskGroups) {
      riskDistribution[group.riskLevel] = group._count.id;
    }
  }

  return {
    access,
    input: {
      skillMetrics,
      reportMetrics: {
        reportCount,
        averageScore: Math.round(reportAverage),
        latestScore: latestReportScore,
        trend
      },
      crmMetrics: {
        profileCount,
        averagePurchaseProbability,
        intentDistribution,
        riskDistribution
      },
      courses,
      requestId: undefined
    }
  };
}
