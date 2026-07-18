import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import type {
  AnalyzeConversationInput,
  CoachAnalysisOptions,
  CoachDashboardData,
  CoachMatchedStandard,
  CoachReport,
  CoachSkillKey,
  CoachSkillScore,
  CoachTeamOption,
  CoachTeamRole
} from "@/apps/team-os/features/ai-coach/types";
import { analyzeConversation } from "@/apps/team-os/services/ai-coach";
import { notifyAiCoachReportGeneratedBestEffort } from "@/apps/team-os/services/notification";

const TEAM_VIEW_ROLES = new Set<CoachTeamRole>(["TEAM_OWNER", "TEAM_MANAGER", "TRAINER"]);
const SKILL_ORDER: ReadonlyArray<{ key: CoachSkillKey; label: string }> = [
  { key: "ice_breaking", label: "破冰能力" },
  { key: "needs_discovery", label: "需求挖掘" },
  { key: "product_presentation", label: "产品介绍" },
  { key: "objection_handling", label: "异议处理" },
  { key: "closing_progress", label: "成交推进" }
];

type ReportRecord = Prisma.EmployeeAnalysisReportGetPayload<{
  include: {
    team: { select: { name: true } };
    skillScores: true;
  };
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toMatchedStandards(value: Prisma.JsonValue | null): CoachMatchedStandard[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (
      !isRecord(item) ||
      typeof item.standardId !== "string" ||
      typeof item.category !== "string" ||
      typeof item.title !== "string" ||
      typeof item.version !== "number" ||
      typeof item.evidence !== "string" ||
      typeof item.gap !== "string"
    ) {
      return [];
    }
    return [{
      standardId: item.standardId,
      category: item.category,
      title: item.title,
      version: item.version,
      evidence: item.evidence,
      gap: item.gap
    }];
  });
}

function displayName(user: { id: string; name: string | null; email: string | null; phone: string }) {
  return user.name?.trim() || user.email?.trim() || user.phone || user.id;
}

function toSkillScores(scores: ReportRecord["skillScores"]): CoachSkillScore[] {
  const byName = new Map(scores.map((score) => [score.skillName, score]));

  return SKILL_ORDER.map(({ key, label }) => {
    const item = byName.get(key);
    return {
      key,
      label,
      score: item?.score ?? 0,
      maxScore: 20,
      level: item?.level ?? "需提升"
    };
  });
}

async function serializeReport(report: ReportRecord): Promise<CoachReport> {
  const user = await prisma.user.findUnique({
    where: { id: report.userId },
    select: { id: true, name: true, email: true, phone: true }
  });

  return {
    id: report.id,
    userId: report.userId,
    employeeName: user ? displayName(user) : report.userId,
    teamId: report.teamId,
    teamName: report.team.name,
    submissionId: report.submissionId ?? undefined,
    score: report.score,
    ...(report.industryScore === null ? {} : { industryScore: report.industryScore }),
    summary: report.summary,
    problems: report.problems,
    suggestions: report.suggestions,
    trainingPlan: report.trainingPlan,
    matchedStandards: toMatchedStandards(report.matchedStandards),
    ...(report.coachFeedback ? { coachFeedback: report.coachFeedback } : {}),
    ...(report.improvementPlan ? { improvementPlan: report.improvementPlan } : {}),
    skills: toSkillScores(report.skillScores),
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString()
  };
}

async function getActiveDirectMemberships(userId: string) {
  return prisma.teamMember.findMany({
    where: {
      userId,
      status: "ACTIVE",
      team: { status: "ACTIVE" }
    },
    select: {
      role: true,
      team: {
        select: {
          id: true,
          name: true,
          companyId: true
        }
      }
    },
    orderBy: { createdAt: "asc" }
  });
}

async function attachCompanyNames(
  teams: Array<Omit<CoachTeamOption, "companyName">>
): Promise<CoachTeamOption[]> {
  const companyIds = Array.from(new Set(teams.map((team) => team.companyId)));
  const tenants = companyIds.length > 0
    ? await prisma.tenant.findMany({
        where: { id: { in: companyIds } },
        select: { id: true, name: true }
      })
    : [];
  const tenantNames = new Map(tenants.map((tenant) => [tenant.id, tenant.name]));

  return teams.map((team) => ({
    ...team,
    ...(tenantNames.get(team.companyId) ? { companyName: tenantNames.get(team.companyId) } : {})
  }));
}

async function getDashboardTeams(userId: string): Promise<CoachTeamOption[]> {
  const memberships = await getActiveDirectMemberships(userId);
  const ownerCompanyIds = Array.from(new Set(
    memberships
      .filter((membership) => membership.role === "TEAM_OWNER")
      .map((membership) => membership.team.companyId)
  ));
  const directByTeam = new Map(memberships.map((membership) => [membership.team.id, membership]));
  const directTeamIds = memberships.map((membership) => membership.team.id);
  const teams = await prisma.teamOrganization.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        ...(ownerCompanyIds.length > 0 ? [{ companyId: { in: ownerCompanyIds } }] : []),
        ...(directTeamIds.length > 0 ? [{ id: { in: directTeamIds } }] : [])
      ]
    },
    select: { id: true, name: true, companyId: true },
    orderBy: [{ companyId: "asc" }, { createdAt: "asc" }]
  });

  const namedTeams = await attachCompanyNames(teams.map((team) => {
    const direct = directByTeam.get(team.id);
    const role = ownerCompanyIds.includes(team.companyId)
      ? "TEAM_OWNER"
      : direct?.role ?? "TEAM_MEMBER";

    return {
      id: team.id,
      name: team.name,
      companyId: team.companyId,
      role,
      canViewTeam: TEAM_VIEW_ROLES.has(role)
    };
  }));

  return namedTeams.sort((left, right) => Number(right.canViewTeam) - Number(left.canViewTeam));
}

export async function getCoachAnalysisOptions(userId: string): Promise<CoachAnalysisOptions> {
  const [user, memberships] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, phone: true }
    }),
    getActiveDirectMemberships(userId)
  ]);
  if (!user) {
    throw new NotFoundError("当前用户不存在。");
  }

  const teams = await attachCompanyNames(memberships.map((membership) => ({
    id: membership.team.id,
    name: membership.team.name,
    companyId: membership.team.companyId,
    role: membership.role,
    canViewTeam: TEAM_VIEW_ROLES.has(membership.role)
  })));
  const teamIds = teams.map((team) => team.id);
  const submissions = teamIds.length > 0
    ? await prisma.taskSubmission.findMany({
        where: {
          userId,
          task: {
            teamId: { in: teamIds },
            team: { status: "ACTIVE" }
          }
        },
        select: {
          id: true,
          status: true,
          createdAt: true,
          task: { select: { teamId: true, title: true } },
          analysisReport: { select: { id: true } }
        },
        orderBy: { createdAt: "desc" },
        take: 100
      })
    : [];

  return {
    employee: { id: user.id, name: displayName(user) },
    teams,
    submissions: submissions.map((submission) => ({
      id: submission.id,
      teamId: submission.task.teamId,
      taskTitle: submission.task.title,
      createdAt: submission.createdAt.toISOString(),
      status: submission.status,
      analyzed: Boolean(submission.analysisReport) || submission.status === "ANALYZED",
      ...(submission.analysisReport ? { reportId: submission.analysisReport.id } : {})
    })),
    providers: [
      { id: "qwen", label: "Qwen" },
      { id: "openai", label: "GPT / OpenAI" },
      { id: "deepseek", label: "DeepSeek" }
    ]
  };
}

async function getExistingSubmissionReport(submissionId: string) {
  return prisma.employeeAnalysisReport.findUnique({
    where: { submissionId },
    include: {
      team: { select: { name: true } },
      skillScores: true
    }
  });
}

function composeConversation(
  conversation: string,
  submission: { content: string; summary: string } | null
) {
  const parts = [conversation];
  if (submission) {
    parts.push(`任务提交沟通记录：\n${submission.content}`);
    parts.push(`员工提交总结：\n${submission.summary}`);
  }

  return parts.filter((part) => part.trim()).join("\n\n").slice(0, 30_000).trim();
}

async function loadSelfAnalysisContext(userId: string, input: AnalyzeConversationInput) {
  if (input.employeeId && input.employeeId !== userId) {
    throw new ForbiddenError("只能分析当前登录员工自己的沟通记录。");
  }

  const membership = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId: input.teamId, userId } },
    select: {
      status: true,
      team: { select: { id: true, companyId: true, status: true } }
    }
  });
  if (!membership || membership.status !== "ACTIVE" || membership.team.status !== "ACTIVE") {
    throw new ForbiddenError("当前账号不是该团队的有效成员。");
  }

  const submission = input.submissionId
    ? await prisma.taskSubmission.findFirst({
        where: {
          id: input.submissionId,
          userId,
          task: {
            teamId: input.teamId,
            team: { status: "ACTIVE" }
          }
        },
        select: { id: true, content: true, summary: true }
      })
    : null;
  if (input.submissionId && !submission) {
    throw new ForbiddenError("任务提交记录与当前员工或团队不匹配。");
  }

  const conversation = composeConversation(input.conversation, submission);
  if (!conversation) {
    throw new ValidationError("任务提交记录中没有可分析的文本。");
  }

  return {
    teamCompanyId: membership.team.companyId,
    conversation
  };
}

async function createReportTransaction(
  userId: string,
  input: AnalyzeConversationInput,
  analysis: Awaited<ReturnType<typeof analyzeConversation>>["analysis"]
) {
  return prisma.$transaction(async (transaction) => {
    const membership = await transaction.teamMember.findUnique({
      where: { teamId_userId: { teamId: input.teamId, userId } },
      select: {
        status: true,
        team: { select: { status: true } }
      }
    });
    if (!membership || membership.status !== "ACTIVE" || membership.team.status !== "ACTIVE") {
      throw new ForbiddenError("分析期间团队权限已发生变化，请重新进入页面。");
    }

    if (input.submissionId) {
      const existing = await transaction.employeeAnalysisReport.findUnique({
        where: { submissionId: input.submissionId },
        include: {
          team: { select: { name: true } },
          skillScores: true
        }
      });
      if (existing) {
        return { report: existing, reused: true };
      }

      const submission = await transaction.taskSubmission.findFirst({
        where: {
          id: input.submissionId,
          userId,
          task: {
            teamId: input.teamId,
            team: { status: "ACTIVE" }
          }
        },
        select: { id: true }
      });
      if (!submission) {
        throw new ForbiddenError("任务提交记录与当前员工或团队不匹配。");
      }
    }

    const report = await transaction.employeeAnalysisReport.create({
      data: {
        userId,
        teamId: input.teamId,
        submissionId: input.submissionId,
        score: analysis.score,
        industryScore: analysis.industryScore,
        summary: analysis.summary,
        problems: analysis.problems,
        suggestions: analysis.suggestions,
        trainingPlan: analysis.trainingPlan,
        matchedStandards: analysis.matchedStandards.map((standard) => ({
          standardId: standard.standardId,
          category: standard.category,
          title: standard.title,
          version: standard.version,
          evidence: standard.evidence,
          gap: standard.gap
        })),
        coachFeedback: analysis.coachFeedback,
        improvementPlan: analysis.improvementPlan,
        skillScores: {
          create: analysis.skills.map((skill) => ({
            userId,
            skillName: skill.key,
            score: skill.score,
            level: skill.level
          }))
        }
      },
      include: {
        team: { select: { name: true } },
        skillScores: true
      }
    });

    if (input.submissionId) {
      await transaction.taskSubmission.update({
        where: { id: input.submissionId },
        data: { status: "ANALYZED" }
      });
    }

    return { report, reused: false };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable
  });
}

export async function analyzeAndSaveConversation(
  userId: string,
  input: AnalyzeConversationInput,
  requestId?: string
) {
  const context = await loadSelfAnalysisContext(userId, input);

  if (input.submissionId) {
    const existing = await getExistingSubmissionReport(input.submissionId);
    if (existing) {
      if (existing.userId !== userId || existing.teamId !== input.teamId) {
        throw new ForbiddenError("任务提交记录与当前员工或团队不匹配。");
      }
      const report = await serializeReport(existing);
      return {
        reportId: report.id,
        report,
        reused: true,
        knowledgeContextMode: "existing-report"
      };
    }
  }

  const serviceResult = await analyzeConversation({
    ...input,
    conversation: context.conversation,
    actorUserId: userId,
    teamCompanyId: context.teamCompanyId,
    requestId
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const saved = await createReportTransaction(userId, input, serviceResult.analysis);
      const report = await serializeReport(saved.report);
      if (!saved.reused) {
        await notifyAiCoachReportGeneratedBestEffort({
          companyId: context.teamCompanyId,
          teamId: input.teamId,
          reportId: report.id,
          employeeUserId: userId,
          score: report.score,
          reused: false
        });
      }
      return {
        reportId: report.id,
        report,
        reused: saved.reused,
        knowledgeContextMode: saved.reused ? "existing-report" : serviceResult.knowledgeContextMode
      };
    } catch (error) {
      const knownError = error instanceof Prisma.PrismaClientKnownRequestError ? error : null;
      const canResolveBySubmission = Boolean(
        input.submissionId && (knownError?.code === "P2002" || knownError?.code === "P2034")
      );

      if (canResolveBySubmission && input.submissionId) {
        const existing = await getExistingSubmissionReport(input.submissionId);
        if (existing && existing.userId === userId && existing.teamId === input.teamId) {
          const report = await serializeReport(existing);
          return {
            reportId: report.id,
            report,
            reused: true,
            knowledgeContextMode: "existing-report"
          };
        }
      }

      if (knownError?.code === "P2034" && attempt < 2) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("AI 教练报告事务未完成。");
}

export async function getCoachReport(userId: string, reportId: string): Promise<CoachReport> {
  const report = await prisma.employeeAnalysisReport.findUnique({
    where: { id: reportId },
    include: {
      team: { select: { name: true, companyId: true, status: true } },
      skillScores: true
    }
  });
  if (!report) {
    throw new NotFoundError("成长报告不存在。");
  }

  if (report.team.status !== "ACTIVE") {
    throw new ForbiddenError("当前账号无权查看该成长报告。");
  }

  if (report.userId === userId) {
    const selfMembership = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: report.teamId, userId } },
      select: { status: true }
    });
    if (selfMembership?.status !== "ACTIVE") {
      throw new ForbiddenError("当前账号无权查看该成长报告。");
    }
  } else {
    const authority = await prisma.teamMember.findFirst({
      where: {
        userId,
        status: "ACTIVE",
        team: { status: "ACTIVE" },
        OR: [
          {
            role: "TEAM_OWNER",
            team: { companyId: report.team.companyId, status: "ACTIVE" }
          },
          {
            teamId: report.teamId,
            role: { in: ["TEAM_MANAGER", "TRAINER"] }
          }
        ]
      },
      select: { id: true }
    });
    if (!authority) {
      throw new ForbiddenError("当前账号无权查看该成长报告。");
    }
  }

  return serializeReport(report);
}

function chinaDayRange(now = new Date()) {
  const chinaNow = new Date(now.getTime() + 8 * 60 * 60 * 1_000);
  const date = chinaNow.toISOString().slice(0, 10);
  const start = new Date(`${date}T00:00:00+08:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1_000);
  return { date, start, end };
}

export async function getCoachDashboard(
  userId: string,
  requestedTeamId?: string
): Promise<CoachDashboardData> {
  const teams = await getDashboardTeams(userId);
  const selectedTeam = requestedTeamId
    ? teams.find((team) => team.id === requestedTeamId)
    : teams[0];
  if (requestedTeamId && !selectedTeam) {
    throw new ForbiddenError("当前账号无权访问所选团队的教练数据。");
  }

  const { date, start, end } = chinaDayRange();
  if (!selectedTeam) {
    return {
      date,
      selectedTeamId: null,
      teams,
      canViewTeam: false,
      analyzedCount: 0,
      averageScore: 0,
      rankings: [],
      problemStats: [],
      members: []
    };
  }

  const visibleMemberships = await prisma.teamMember.findMany({
    where: {
      teamId: selectedTeam.id,
      status: "ACTIVE",
      ...(selectedTeam.canViewTeam ? {} : { userId })
    },
    select: { userId: true }
  });
  const visibleUserIds = visibleMemberships.map((membership) => membership.userId);
  const [users, reports] = await Promise.all([
    visibleUserIds.length > 0
      ? prisma.user.findMany({
          where: { id: { in: visibleUserIds } },
          select: { id: true, name: true, email: true, phone: true }
        })
      : [],
    visibleUserIds.length > 0
      ? prisma.employeeAnalysisReport.findMany({
          where: {
            teamId: selectedTeam.id,
            userId: { in: visibleUserIds },
            createdAt: { gte: start, lt: end }
          },
          include: {
            team: { select: { name: true } },
            skillScores: true
          },
          orderBy: { createdAt: "desc" }
        })
      : []
  ]);
  const userById = new Map(users.map((user) => [user.id, user]));
  const latestReportByUser = new Map<string, ReportRecord>();
  for (const report of reports) {
    if (!latestReportByUser.has(report.userId)) {
      latestReportByUser.set(report.userId, report);
    }
  }
  const latestReports = Array.from(latestReportByUser.values());
  const currentUserRecord = latestReportByUser.get(userId);
  const currentUserReport = currentUserRecord
    ? await serializeReport(currentUserRecord)
    : undefined;

  const members = visibleUserIds.map((memberUserId) => {
    const user = userById.get(memberUserId);
    const report = latestReportByUser.get(memberUserId);
    return {
      userId: memberUserId,
      employeeName: user ? displayName(user) : memberUserId,
      teamId: selectedTeam.id,
      teamName: selectedTeam.name,
      ...(report ? {
        reportId: report.id,
        score: report.score,
        mainProblem: report.problems[0],
        trainingPlan: report.trainingPlan,
        analyzedAt: report.createdAt.toISOString()
      } : {})
    };
  });

  if (!selectedTeam.canViewTeam) {
    return {
      date,
      selectedTeamId: selectedTeam.id,
      teams,
      canViewTeam: false,
      ...(currentUserReport ? { currentUserReport } : {}),
      analyzedCount: currentUserReport ? 1 : 0,
      averageScore: currentUserReport?.score ?? 0,
      rankings: [],
      problemStats: currentUserReport
        ? Array.from(new Set(currentUserReport.problems)).map((problem) => ({ problem, count: 1 }))
        : [],
      members
    };
  }

  const sorted = [...latestReports].sort((left, right) => right.score - left.score);
  const problemCounts = new Map<string, number>();
  for (const report of latestReports) {
    for (const problem of report.problems) {
      problemCounts.set(problem, (problemCounts.get(problem) ?? 0) + 1);
    }
  }

  return {
    date,
    selectedTeamId: selectedTeam.id,
    teams,
    canViewTeam: true,
    ...(currentUserReport ? { currentUserReport } : {}),
    analyzedCount: latestReports.length,
    averageScore: latestReports.length > 0
      ? Math.round(latestReports.reduce((sum, report) => sum + report.score, 0) / latestReports.length)
      : 0,
    rankings: sorted.map((report, index) => ({
      rank: index + 1,
      userId: report.userId,
      employeeName: userById.get(report.userId)
        ? displayName(userById.get(report.userId)!)
        : report.userId,
      score: report.score,
      reportId: report.id
    })),
    problemStats: Array.from(problemCounts.entries())
      .map(([problem, count]) => ({ problem, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 10),
    members
  };
}
