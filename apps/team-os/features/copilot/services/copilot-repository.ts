import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  generateDashboard,
  getAIAnalytics,
  getCRMAnalytics,
  getTeamMetrics,
  getTrainingAnalytics
} from "@/apps/team-os/services/analytics/analytics-service";
import type { CopilotAccessScope } from "@/apps/team-os/features/copilot/services/copilot-access";
import type {
  CopilotChatMessage,
  CopilotInsightCandidate,
  CopilotInsightRecord,
  EmployeeCopilotSnapshot,
  ManagerCopilotSnapshot,
  OwnerCopilotSnapshot
} from "@/apps/team-os/features/copilot/types";
import {
  maskBusinessName,
  safePersonName
} from "@/apps/team-os/features/copilot/utils/copilot-format";
import {
  chinaDayRange,
  daysSince
} from "@/apps/team-os/features/copilot/utils/copilot-time";

const COPILOT_ROW_LIMIT = 500;
const CONVERSATION_LIMIT = 20;

function conversationMessages(value: Prisma.JsonValue | null | undefined): CopilotChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const entry = item as Record<string, unknown>;
    if (
      (entry.role !== "user" && entry.role !== "assistant") ||
      typeof entry.content !== "string" ||
      typeof entry.createdAt !== "string"
    ) return [];
    const role: CopilotChatMessage["role"] = entry.role === "user" ? "user" : "assistant";
    return [{
      role,
      content: entry.content.slice(0, 3_000),
      createdAt: entry.createdAt
    }];
  }).slice(-CONVERSATION_LIMIT);
}

export async function loadEmployeeCopilotSnapshot(
  scope: CopilotAccessScope,
  now = new Date()
): Promise<EmployeeCopilotSnapshot> {
  const { end } = chinaDayRange(now);
  const [tasks, customers, training, growth] = await Promise.all([
    prisma.task.findMany({
      where: {
        teamId: { in: scope.context.teamIds },
        team: { companyId: scope.context.companyId, status: "ACTIVE" },
        status: { notIn: ["COMPLETED", "CANCELLED"] },
        deadline: { lt: end }
      },
      select: {
        id: true,
        teamId: true,
        title: true,
        deadline: true,
        status: true,
        team: { select: { name: true } },
        submissions: {
          where: { userId: scope.userId },
          select: { id: true },
          take: 1
        }
      },
      orderBy: [{ deadline: "asc" }, { id: "asc" }],
      take: 30
    }),
    prisma.customer.findMany({
      where: {
        companyId: scope.context.companyId,
        teamId: { in: scope.context.teamIds },
        ownerId: scope.userId,
        stage: { not: "LOST" },
        team: { status: "ACTIVE" }
      },
      select: {
        id: true,
        teamId: true,
        name: true,
        aiProfile: { select: { riskLevel: true } },
        followUps: {
          select: { createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 1
        }
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: COPILOT_ROW_LIMIT
    }),
    prisma.trainingAssignment.findMany({
      where: {
        companyId: scope.context.companyId,
        teamId: { in: scope.context.teamIds },
        userId: scope.userId,
        status: { notIn: ["COMPLETED", "CANCELLED"] },
        team: { status: "ACTIVE" },
        course: { status: "ACTIVE" }
      },
      select: {
        id: true,
        teamId: true,
        deadline: true,
        status: true,
        course: { select: { title: true } }
      },
      orderBy: [{ deadline: "asc" }, { id: "asc" }],
      take: 30
    }),
    prisma.employeeAnalysisReport.findFirst({
      where: {
        userId: scope.userId,
        teamId: { in: scope.context.teamIds },
        team: { companyId: scope.context.companyId, status: "ACTIVE" }
      },
      select: {
        score: true,
        problems: true,
        suggestions: true,
        trainingPlan: true,
        createdAt: true
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    })
  ]);

  return {
    tasks: tasks.map((task) => ({
      id: task.id,
      teamId: task.teamId,
      teamName: task.team.name,
      title: task.title,
      deadline: task.deadline.toISOString(),
      status: task.status,
      submittedByCurrentUser: task.submissions.length > 0,
      overdue: task.deadline.getTime() < now.getTime()
    })),
    customers: customers
      .map((customer) => {
        const lastFollowUpAt = customer.followUps[0]?.createdAt;
        return {
          id: customer.id,
          teamId: customer.teamId,
          maskedName: maskBusinessName(customer.name),
          ...(lastFollowUpAt ? { lastFollowUpAt: lastFollowUpAt.toISOString() } : {}),
          ...(customer.aiProfile ? { riskLevel: customer.aiProfile.riskLevel } : {}),
          daysSinceFollowUp: daysSince(lastFollowUpAt, now)
        };
      })
      .filter((customer) => customer.daysSinceFollowUp >= 3 || customer.riskLevel === "HIGH")
      .slice(0, 20),
    training: training.map((assignment) => ({
      id: assignment.id,
      teamId: assignment.teamId,
      courseTitle: assignment.course.title,
      deadline: assignment.deadline.toISOString(),
      status: assignment.status,
      overdue: assignment.deadline.getTime() < now.getTime()
    })),
    ...(growth ? {
      growth: {
        score: growth.score,
        problems: growth.problems,
        suggestions: growth.suggestions,
        trainingPlan: growth.trainingPlan,
        createdAt: growth.createdAt.toISOString()
      }
    } : {})
  };
}

export async function loadManagerCopilotSnapshot(
  scope: CopilotAccessScope,
  now = new Date()
): Promise<ManagerCopilotSnapshot> {
  const { start, end } = chinaDayRange(now);
  const recentStart = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1_000);
  const reportStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1_000);
  const [todayTasks, overdueTaskCount, memberships, submissions, reports, customers, training] = await Promise.all([
    prisma.task.findMany({
      where: {
        teamId: { in: scope.context.teamIds },
        team: { companyId: scope.context.companyId, status: "ACTIVE" },
        status: { not: "CANCELLED" },
        deadline: { gte: start, lt: end }
      },
      select: { status: true },
      take: COPILOT_ROW_LIMIT
    }),
    prisma.task.count({
      where: {
        teamId: { in: scope.context.teamIds },
        team: { companyId: scope.context.companyId, status: "ACTIVE" },
        status: { notIn: ["COMPLETED", "CANCELLED"] },
        deadline: { lt: start }
      }
    }),
    prisma.teamMember.findMany({
      where: {
        teamId: { in: scope.context.teamIds },
        status: "ACTIVE",
        team: { companyId: scope.context.companyId, status: "ACTIVE" }
      },
      select: {
        userId: true,
        team: { select: { id: true, name: true } }
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: COPILOT_ROW_LIMIT
    }),
    prisma.taskSubmission.findMany({
      where: {
        createdAt: { gte: recentStart },
        task: {
          teamId: { in: scope.context.teamIds },
          team: { companyId: scope.context.companyId, status: "ACTIVE" }
        }
      },
      select: { userId: true, task: { select: { teamId: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: COPILOT_ROW_LIMIT
    }),
    prisma.employeeAnalysisReport.findMany({
      where: {
        teamId: { in: scope.context.teamIds },
        team: { companyId: scope.context.companyId, status: "ACTIVE" },
        createdAt: { gte: reportStart }
      },
      select: { userId: true, teamId: true, score: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: COPILOT_ROW_LIMIT
    }),
    prisma.customer.findMany({
      where: {
        companyId: scope.context.companyId,
        teamId: { in: scope.context.teamIds },
        team: { status: "ACTIVE" },
        aiProfile: { is: { riskLevel: "HIGH" } }
      },
      select: {
        id: true,
        teamId: true,
        ownerId: true,
        name: true,
        aiProfile: { select: { riskLevel: true } },
        followUps: {
          select: { createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 1
        }
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: 100
    }),
    prisma.trainingAssignment.findMany({
      where: {
        companyId: scope.context.companyId,
        teamId: { in: scope.context.teamIds },
        status: { notIn: ["COMPLETED", "CANCELLED"] },
        team: { status: "ACTIVE" },
        course: { status: "ACTIVE" }
      },
      select: { deadline: true },
      orderBy: [{ deadline: "asc" }, { id: "asc" }],
      take: COPILOT_ROW_LIMIT
    })
  ]);

  const userIds = Array.from(new Set([
    ...memberships.map((membership) => membership.userId),
    ...customers.map((customer) => customer.ownerId)
  ]));
  const users = userIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: userIds }, isActive: true },
        select: { id: true, name: true }
      })
    : [];
  const names = new Map(users.map((user) => [user.id, safePersonName(user.name, user.id)]));
  const submissionCount = new Map<string, number>();
  for (const submission of submissions) {
    const key = `${submission.task.teamId}:${submission.userId}`;
    submissionCount.set(key, (submissionCount.get(key) ?? 0) + 1);
  }
  const coachScore = new Map<string, number>();
  for (const report of reports) {
    const key = `${report.teamId}:${report.userId}`;
    if (!coachScore.has(key)) coachScore.set(key, report.score);
  }

  return {
    taskTotal: todayTasks.length,
    taskCompleted: todayTasks.filter((task) => task.status === "COMPLETED").length,
    overdueTaskCount,
    members: memberships.flatMap((membership) => {
      const employeeName = names.get(membership.userId);
      if (!employeeName) return [];
      const key = `${membership.team.id}:${membership.userId}`;
      return [{
        userId: membership.userId,
        teamId: membership.team.id,
        teamName: membership.team.name,
        employeeName,
        submissionCount: submissionCount.get(key) ?? 0,
        ...(coachScore.has(key) ? { coachScore: coachScore.get(key) } : {})
      }];
    }),
    customerRisks: customers.map((customer) => ({
      id: customer.id,
      teamId: customer.teamId,
      maskedName: maskBusinessName(customer.name),
      ownerName: names.get(customer.ownerId) ?? safePersonName(null, customer.ownerId),
      riskLevel: customer.aiProfile?.riskLevel ?? "HIGH",
      daysSinceFollowUp: daysSince(customer.followUps[0]?.createdAt, now)
    })),
    openTrainingCount: training.length,
    overdueTrainingCount: training.filter((assignment) => assignment.deadline.getTime() < now.getTime()).length
  };
}

export async function loadOwnerCopilotSnapshot(
  scope: CopilotAccessScope
): Promise<OwnerCopilotSnapshot> {
  const query = { companyId: scope.context.companyId, days: 30 as const };
  const [dashboard, team, crm, training, ai] = await Promise.all([
    generateDashboard(scope.userId, query),
    getTeamMetrics(scope.userId, query),
    getCRMAnalytics(scope.userId, query),
    getTrainingAnalytics(scope.userId, query),
    getAIAnalytics(scope.userId, query)
  ]);
  return {
    taskCompletionRate: dashboard.metrics.taskCompletionRate.value,
    employeeAverageScore: dashboard.metrics.employeeAverageScore.value,
    customerConversionRate: crm.conversionRate,
    trainingCompletionRate: training.completionRate,
    aiUsageCount: ai.aiUsageCount,
    attentionEmployeeCount: new Set(
      team.rankings
        .filter((member) => member.growthLevel === "需关注")
        .map((member) => member.userId)
    ).size,
    customerCount: crm.customerCount,
    riskCustomerCount: crm.riskCustomerCount,
    openTrainingCount: Math.max(0, training.assignmentCount - training.completedAssignmentCount),
    trackedAiOutputCount: ai.trackedOutputCount
  };
}

export async function saveCopilotConversation(input: {
  companyId: string;
  userId: string;
  role: "EMPLOYEE_ASSISTANT" | "MANAGER_ASSISTANT" | "OWNER_ASSISTANT";
  userMessage: string;
  assistantMessage: string;
}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (transaction) => {
        const existing = await transaction.aIAssistantSession.findUnique({
          where: {
            companyId_userId_role: {
              companyId: input.companyId,
              userId: input.userId,
              role: input.role
            }
          },
          select: { conversation: true }
        });
        const timestamp = new Date().toISOString();
        const conversation = [
          ...conversationMessages(existing?.conversation),
          { role: "user" as const, content: input.userMessage, createdAt: timestamp },
          { role: "assistant" as const, content: input.assistantMessage, createdAt: timestamp }
        ].slice(-CONVERSATION_LIMIT);
        const conversationJson: Prisma.InputJsonArray = conversation.map((message) => ({
          role: message.role,
          content: message.content,
          createdAt: message.createdAt
        }));
        const session = await transaction.aIAssistantSession.upsert({
          where: {
            companyId_userId_role: {
              companyId: input.companyId,
              userId: input.userId,
              role: input.role
            }
          },
          create: {
            companyId: input.companyId,
            userId: input.userId,
            role: input.role,
            conversation: conversationJson
          },
          update: { conversation: conversationJson },
          select: { id: true, conversation: true }
        });
        return { id: session.id, conversation: conversationMessages(session.conversation) };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      const shouldRetry = error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === "P2034"
        && attempt < 2;
      if (!shouldRetry) throw error;
    }
  }

  throw new Error("Unable to persist Copilot conversation.");
}

export async function getCopilotConversation(scope: CopilotAccessScope) {
  const session = await prisma.aIAssistantSession.findUnique({
    where: {
      companyId_userId_role: {
        companyId: scope.context.companyId,
        userId: scope.userId,
        role: scope.context.assistantRole
      }
    },
    select: { id: true, conversation: true }
  });
  return session
    ? { id: session.id, conversation: conversationMessages(session.conversation) }
    : { id: null, conversation: [] as CopilotChatMessage[] };
}

function serializeInsight(input: {
  id: string;
  companyId: string;
  teamId: string | null;
  role: "EMPLOYEE_ASSISTANT" | "MANAGER_ASSISTANT" | "OWNER_ASSISTANT";
  sourceKey: string;
  type: "TASK" | "CRM" | "TRAINING" | "TEAM" | "BUSINESS";
  title: string;
  content: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  createdAt: Date;
}, recommendation: string): CopilotInsightRecord {
  return {
    id: input.id,
    sourceKey: input.sourceKey,
    companyId: input.companyId,
    ...(input.teamId ? { teamId: input.teamId } : {}),
    assistantRole: input.role,
    type: input.type,
    title: input.title,
    content: input.content,
    recommendation,
    priority: input.priority,
    createdAt: input.createdAt.toISOString()
  };
}

export async function persistCopilotInsights(
  scope: CopilotAccessScope,
  candidates: CopilotInsightCandidate[]
) {
  const sources = Array.from(new Set(candidates.map((candidate) => candidate.sourceKey)));
  const [existingInsights, existingRecommendations] = await Promise.all([
    prisma.aIInsight.findMany({
      where: {
        companyId: scope.context.companyId,
        targetUserId: scope.userId,
        role: scope.context.assistantRole,
        sourceKey: { in: sources }
      },
      select: { sourceKey: true, status: true }
    }),
    prisma.aITaskRecommendation.findMany({
      where: {
        companyId: scope.context.companyId,
        userId: scope.userId,
        role: scope.context.assistantRole,
        source: { in: sources }
      },
      select: { source: true }
    })
  ]);
  const existingInsightSources = new Set(existingInsights.map((item) => item.sourceKey));
  const existingInsightStatus = new Map(
    existingInsights.map((item) => [item.sourceKey, item.status])
  );
  const existingRecommendationSources = new Set(existingRecommendations.map((item) => item.source));
  await Promise.all([
    prisma.aIInsight.updateMany({
      where: {
        companyId: scope.context.companyId,
        targetUserId: scope.userId,
        role: scope.context.assistantRole,
        status: "ACTIVE",
        ...(sources.length > 0 ? { sourceKey: { notIn: sources } } : {})
      },
      data: { status: "RESOLVED" }
    }),
    prisma.aITaskRecommendation.updateMany({
      where: {
        companyId: scope.context.companyId,
        userId: scope.userId,
        role: scope.context.assistantRole,
        status: "ACTIVE",
        ...(sources.length > 0 ? { source: { notIn: sources } } : {})
      },
      data: { status: "COMPLETED" }
    })
  ]);
  const records = candidates.length > 0
    ? await prisma.$transaction(candidates.map((candidate) => prisma.aIInsight.upsert({
    where: {
      companyId_targetUserId_role_sourceKey: {
        companyId: scope.context.companyId,
        targetUserId: scope.userId,
        role: scope.context.assistantRole,
        sourceKey: candidate.sourceKey
      }
    },
    create: {
      companyId: scope.context.companyId,
      teamId: candidate.teamId,
      targetUserId: scope.userId,
      role: scope.context.assistantRole,
      sourceKey: candidate.sourceKey,
      type: candidate.type,
      title: candidate.title,
      content: candidate.content,
      priority: candidate.priority
    },
    update: {
      teamId: candidate.teamId,
      title: candidate.title,
      content: candidate.content,
      priority: candidate.priority,
      status: "ACTIVE",
      ...(existingInsightStatus.get(candidate.sourceKey) !== "ACTIVE"
        ? { notifiedAt: null }
        : {})
    }
      })))
    : [];
  if (candidates.length > 0) await prisma.$transaction(candidates.map((candidate) => prisma.aITaskRecommendation.upsert({
    where: {
      companyId_userId_role_source: {
        companyId: scope.context.companyId,
        userId: scope.userId,
        role: scope.context.assistantRole,
        source: candidate.sourceKey
      }
    },
    create: {
      companyId: scope.context.companyId,
      teamId: candidate.teamId,
      userId: scope.userId,
      role: scope.context.assistantRole,
      source: candidate.sourceKey,
      recommendation: candidate.recommendation
    },
    update: {
      teamId: candidate.teamId,
      recommendation: candidate.recommendation,
      status: "ACTIVE"
    }
  })));

  return {
    records: records.map((record) => serializeInsight(
      record,
      candidates.find((candidate) => candidate.sourceKey === record.sourceKey)?.recommendation ?? "查看详情并及时处理。"
    )),
    createdInsightCount: candidates.filter((candidate) => !existingInsightSources.has(candidate.sourceKey)).length,
    createdRecommendationCount: candidates.filter((candidate) => !existingRecommendationSources.has(candidate.sourceKey)).length
  };
}

export async function listCopilotInsights(scope: CopilotAccessScope) {
  const [insights, recommendations] = await Promise.all([
    prisma.aIInsight.findMany({
      where: {
        companyId: scope.context.companyId,
        targetUserId: scope.userId,
        role: scope.context.assistantRole,
        status: "ACTIVE"
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100
    }),
    prisma.aITaskRecommendation.findMany({
      where: {
        companyId: scope.context.companyId,
        userId: scope.userId,
        role: scope.context.assistantRole,
        status: "ACTIVE"
      },
      select: { source: true, recommendation: true }
    })
  ]);
  const recommendationBySource = new Map(
    recommendations.map((recommendation) => [recommendation.source, recommendation.recommendation])
  );
  return insights.map((insight) => serializeInsight(
    insight,
    recommendationBySource.get(insight.sourceKey) ?? "查看详情并及时处理。"
  ));
}
