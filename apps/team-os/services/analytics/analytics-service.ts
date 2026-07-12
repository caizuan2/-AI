import "server-only";

import { ForbiddenError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import {
  assertCrmAnalyticsAccess,
  resolveAnalyticsAccess,
  type AnalyticsAccessState
} from "@/apps/team-os/features/analytics/services/analytics-access";
import type {
  AiAnalyticsData,
  AnalyticsDailyPoint,
  AnalyticsDashboardData,
  AnalyticsQuery,
  CrmAnalyticsData,
  EmployeeGrowthItem,
  TeamAnalyticsData,
  TrainingAnalyticsData
} from "@/apps/team-os/features/analytics/types";
import {
  analyticsRange,
  average,
  chinaTodayRange,
  dateKeyInChina,
  emptyDailyPoints,
  growthLevel,
  metric,
  percentage
} from "@/apps/team-os/features/analytics/utils/analytics-math";

const ANALYTICS_ROW_LIMIT = 1_000;
const ANALYTICS_ROW_TAKE = ANALYTICS_ROW_LIMIT + 1;

const CUSTOMER_STAGE_LABELS = {
  LEAD: "线索",
  CONTACTED: "已联系",
  INTERESTED: "有意向",
  NEGOTIATING: "洽谈中",
  CUSTOMER: "已成交",
  LOST: "已流失"
} as const;

const ANALYTICS_SKILL_LABELS = {
  ice_breaking: "破冰能力",
  needs_discovery: "需求挖掘",
  product_presentation: "产品介绍",
  objection_handling: "异议处理",
  closing_progress: "成交推进"
} as const;

type AnalyticsSkillKey = keyof typeof ANALYTICS_SKILL_LABELS;

const ANALYTICS_SKILL_KEYS = Object.keys(ANALYTICS_SKILL_LABELS) as AnalyticsSkillKey[];

type AnalyticsWindow = ReturnType<typeof analyticsRange>;

type TaskRow = {
  id: string;
  teamId: string;
  status: string;
  deadline: Date;
};

type ReportRow = {
  id: string;
  userId: string;
  teamId: string;
  score: number;
  createdAt: Date;
};

type AssignmentRow = {
  id: string;
  courseId: string;
  teamId: string;
  userId: string;
  status: string;
  deadline: Date;
  course: { title: string };
};

type TrainingRecordRow = {
  id: string;
  courseId: string;
  userId: string;
  score: number;
  completedAt: Date | null;
};

type TrainingEvaluationRow = {
  id: string;
  courseId: string;
  userId: string;
  score: number;
  createdAt: Date;
};

function capped<T>(rows: T[]) {
  return {
    rows: rows.slice(0, ANALYTICS_ROW_LIMIT),
    truncated: rows.length > ANALYTICS_ROW_LIMIT
  };
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function uniqueCoverage(...groups: string[][]) {
  return unique(groups.flat()).slice(0, 30);
}

function pairKey(courseId: string, userId: string) {
  return `${courseId}:${userId}`;
}

function memberKey(teamId: string, userId: string) {
  return `${teamId}:${userId}`;
}

function memberFallbackName(userId: string) {
  const suffix = userId.slice(-4).padStart(4, "0");
  return `成员-${suffix}`;
}

function isBusinessScope(access: AnalyticsAccessState) {
  return access.isCompanyOwner || access.managerTeamIds.length > 0;
}

function canViewTrainingScope(access: AnalyticsAccessState) {
  return access.isCompanyOwner || access.managerTeamIds.length > 0 || access.trainerTeamIds.length > 0;
}

function growthScope(access: AnalyticsAccessState) {
  if (isBusinessScope(access)) {
    return {
      teamIds: access.businessTeamIds,
      userId: undefined as string | undefined
    };
  }
  return {
    teamIds: access.personalTeamIds,
    userId: undefined as string | undefined
  };
}

function withSelfScope(access: AnalyticsAccessState, userId: string) {
  const scope = growthScope(access);
  return {
    ...scope,
    userId: isBusinessScope(access) ? undefined : userId
  };
}

async function loadTasks(teamIds: string[], window: AnalyticsWindow) {
  if (teamIds.length === 0) return { rows: [] as TaskRow[], truncated: false };
  const result = await prisma.task.findMany({
    where: {
      teamId: { in: teamIds },
      status: { not: "CANCELLED" },
      deadline: { gte: window.start, lt: window.end }
    },
    select: { id: true, teamId: true, status: true, deadline: true },
    orderBy: [{ deadline: "desc" }, { id: "desc" }],
    take: ANALYTICS_ROW_TAKE
  });
  return capped(result);
}

async function loadTodayTaskCounts(teamIds: string[]) {
  if (teamIds.length === 0) return { total: 0, completed: 0 };
  const today = chinaTodayRange();
  const baseWhere = {
    teamId: { in: teamIds },
    status: { not: "CANCELLED" as const },
    deadline: { gte: today.start, lt: today.end }
  };
  const [total, completed] = await Promise.all([
    prisma.task.count({ where: baseWhere }),
    prisma.task.count({ where: { ...baseWhere, status: "COMPLETED" } })
  ]);
  return { total, completed };
}

async function loadReports(
  teamIds: string[],
  window: AnalyticsWindow,
  userId?: string
) {
  if (teamIds.length === 0) return { rows: [] as ReportRow[], truncated: false };
  const result = await prisma.employeeAnalysisReport.findMany({
    where: {
      teamId: { in: teamIds },
      createdAt: { gte: window.start, lt: window.end },
      ...(userId ? { userId } : {})
    },
    select: { id: true, userId: true, teamId: true, score: true, createdAt: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: ANALYTICS_ROW_TAKE
  });
  return capped(result);
}

async function loadRoster(teamIds: string[], userId?: string) {
  if (teamIds.length === 0) {
    return { rows: [] as Array<{ userId: string; teamId: string; teamName: string; employeeName: string }>, truncated: false };
  }
  const membershipsResult = await prisma.teamMember.findMany({
    where: {
      teamId: { in: teamIds },
      status: "ACTIVE",
      team: { status: "ACTIVE" },
      ...(userId ? { userId } : {})
    },
    select: {
      userId: true,
      team: { select: { id: true, name: true } }
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: ANALYTICS_ROW_TAKE
  });
  const memberships = capped(membershipsResult);
  const userIds = unique(memberships.rows.map((membership) => membership.userId));
  const users = userIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: userIds }, isActive: true },
        select: { id: true, name: true }
      })
    : [];
  const userNameById = new Map(users.map((user) => [
    user.id,
    user.name?.trim() || memberFallbackName(user.id)
  ]));
  const seen = new Set<string>();
  return {
    rows: memberships.rows.flatMap((membership) => {
      const employeeName = userNameById.get(membership.userId);
      const key = memberKey(membership.team.id, membership.userId);
      if (!employeeName || seen.has(key)) return [];
      seen.add(key);
      return [{
        userId: membership.userId,
        teamId: membership.team.id,
        teamName: membership.team.name,
        employeeName
      }];
    }),
    truncated: memberships.truncated
  };
}

async function loadSkillScores(
  teamIds: string[],
  window: AnalyticsWindow,
  userId?: string
) {
  if (teamIds.length === 0) {
    return {
      rows: [] as Array<{
        userId: string;
        skillName: string;
        score: number;
        createdAt: Date;
        report: { teamId: string };
      }>,
      truncated: false
    };
  }
  const result = await prisma.employeeSkillScore.findMany({
    where: {
      createdAt: { gte: window.start, lt: window.end },
      skillName: { in: ANALYTICS_SKILL_KEYS },
      ...(userId ? { userId } : {}),
      report: {
        teamId: { in: teamIds },
        ...(userId ? { userId } : {})
      }
    },
    select: {
      userId: true,
      skillName: true,
      score: true,
      createdAt: true,
      report: { select: { teamId: true } }
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: ANALYTICS_ROW_TAKE
  });
  return capped(result);
}

async function loadTaskSubmissions(
  teamIds: string[],
  window: AnalyticsWindow,
  userId?: string
) {
  if (teamIds.length === 0) {
    return {
      rows: [] as Array<{ userId: string; task: { teamId: string } }>,
      truncated: false
    };
  }
  const result = await prisma.taskSubmission.findMany({
    where: {
      createdAt: { gte: window.start, lt: window.end },
      task: { teamId: { in: teamIds } },
      ...(userId ? { userId } : {})
    },
    select: { userId: true, task: { select: { teamId: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: ANALYTICS_ROW_TAKE
  });
  return capped(result);
}

async function loadCustomerProfileSources(
  access: AnalyticsAccessState,
  window: AnalyticsWindow,
  userIds: string[]
) {
  if (!isBusinessScope(access) || access.crmTeamIds.length === 0 || userIds.length === 0) {
    return {
      rows: [] as Array<{ customer: { ownerId: string; teamId: string } }>,
      truncated: false
    };
  }
  const result = await prisma.customerAIProfile.findMany({
    where: {
      updatedAt: { gte: window.start, lt: window.end },
      customer: {
        companyId: access.context.companyId,
        teamId: { in: access.crmTeamIds },
        ownerId: { in: userIds }
      }
    },
    select: { customer: { select: { ownerId: true, teamId: true } } },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: ANALYTICS_ROW_TAKE
  });
  return capped(result);
}

function exactPairFilter(pairs: Array<{ courseId: string; userId: string }>) {
  return unique(pairs.map((pair) => pairKey(pair.courseId, pair.userId))).map((key) => {
    const separator = key.indexOf(":");
    return { courseId: key.slice(0, separator), userId: key.slice(separator + 1) };
  });
}

async function loadTrainingCohort(
  teamIds: string[],
  window: AnalyticsWindow,
  userId?: string
) {
  if (teamIds.length === 0) {
    return {
      assignments: [] as AssignmentRow[],
      records: [] as TrainingRecordRow[],
      truncated: false
    };
  }
  const assignmentResult = await prisma.trainingAssignment.findMany({
    where: {
      teamId: { in: teamIds },
      status: { not: "CANCELLED" },
      deadline: { gte: window.start, lt: window.end },
      ...(userId ? { userId } : {})
    },
    select: {
      id: true,
      courseId: true,
      teamId: true,
      userId: true,
      status: true,
      deadline: true,
      course: { select: { title: true } }
    },
    orderBy: [{ deadline: "desc" }, { id: "desc" }],
    take: ANALYTICS_ROW_TAKE
  });
  const assignmentRows = capped(assignmentResult);
  const pairs = exactPairFilter(assignmentRows.rows);
  if (pairs.length === 0) {
    return {
      assignments: assignmentRows.rows,
      records: [] as TrainingRecordRow[],
      truncated: assignmentRows.truncated
    };
  }
  const recordResult = await prisma.trainingRecord.findMany({
    where: { OR: pairs, status: "COMPLETED" },
    select: { id: true, courseId: true, userId: true, score: true, completedAt: true },
    orderBy: [{ completedAt: "desc" }, { id: "desc" }],
    take: ANALYTICS_ROW_TAKE
  });
  const records = capped(recordResult);
  const allowedPairs = new Set(pairs.map((pair) => pairKey(pair.courseId, pair.userId)));
  return {
    assignments: assignmentRows.rows,
    records: records.rows.filter((record) => allowedPairs.has(pairKey(record.courseId, record.userId))),
    truncated: assignmentRows.truncated || records.truncated
  };
}

async function loadTrainingEvaluationOutputs(
  companyId: string,
  teamIds: string[],
  window: AnalyticsWindow
) {
  if (teamIds.length === 0) {
    return { rows: [] as TrainingEvaluationRow[], truncated: false };
  }
  const assignmentResult = await prisma.trainingAssignment.findMany({
    where: {
      companyId,
      teamId: { in: teamIds },
      status: { not: "CANCELLED" }
    },
    select: { courseId: true, userId: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: ANALYTICS_ROW_TAKE
  });
  const assignments = capped(assignmentResult);
  const pairs = exactPairFilter(assignments.rows);
  if (pairs.length === 0) return { rows: [] as TrainingEvaluationRow[], truncated: assignments.truncated };
  const evaluationResult = await prisma.aITrainingEvaluation.findMany({
    where: {
      OR: pairs,
      createdAt: { gte: window.start, lt: window.end }
    },
    select: { id: true, courseId: true, userId: true, score: true, createdAt: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: ANALYTICS_ROW_TAKE
  });
  const evaluations = capped(evaluationResult);
  const allowedPairs = new Set(pairs.map((pair) => pairKey(pair.courseId, pair.userId)));
  return {
    rows: evaluations.rows.filter((evaluation) => allowedPairs.has(pairKey(evaluation.courseId, evaluation.userId))),
    truncated: assignments.truncated || evaluations.truncated
  };
}

function reportDailyScores(rows: ReportRow[], dateKeys: string[]) {
  const values = new Map(dateKeys.map((date) => [date, [] as number[]]));
  const latestMemberDays = new Set<string>();
  for (const row of rows) {
    const date = dateKeyInChina(row.createdAt);
    const key = `${date}:${row.userId}`;
    if (latestMemberDays.has(key)) continue;
    latestMemberDays.add(key);
    values.get(date)?.push(row.score);
  }
  return new Map(dateKeys.map((date) => [date, average(values.get(date) ?? [])]));
}

function taskDailyRates(rows: TaskRow[], dateKeys: string[]) {
  const values = new Map(dateKeys.map((date) => [date, { total: 0, completed: 0 }]));
  for (const row of rows) {
    const entry = values.get(dateKeyInChina(row.deadline));
    if (!entry) continue;
    entry.total += 1;
    if (row.status === "COMPLETED") entry.completed += 1;
  }
  return new Map(dateKeys.map((date) => {
    const entry = values.get(date) ?? { total: 0, completed: 0 };
    return [date, percentage(entry.completed, entry.total)];
  }));
}

function trainingDailyRates(rows: AssignmentRow[], dateKeys: string[]) {
  const values = new Map(dateKeys.map((date) => [date, { total: 0, completed: 0 }]));
  for (const row of rows) {
    const entry = values.get(dateKeyInChina(row.deadline));
    if (!entry) continue;
    entry.total += 1;
    if (row.status === "COMPLETED") entry.completed += 1;
  }
  return new Map(dateKeys.map((date) => {
    const entry = values.get(date) ?? { total: 0, completed: 0 };
    return [date, percentage(entry.completed, entry.total)];
  }));
}

async function buildTeamMetrics(
  userId: string,
  access: AnalyticsAccessState,
  window: AnalyticsWindow
): Promise<TeamAnalyticsData> {
  const scope = withSelfScope(access, userId);
  const [roster, reports, skills, submissions, training] = await Promise.all([
    loadRoster(scope.teamIds, scope.userId),
    loadReports(scope.teamIds, window, scope.userId),
    loadSkillScores(scope.teamIds, window, scope.userId),
    loadTaskSubmissions(scope.teamIds, window, scope.userId),
    loadTrainingCohort(scope.teamIds, window, scope.userId)
  ]);
  const customerProfiles = await loadCustomerProfileSources(
    access,
    window,
    unique(roster.rows.map((member) => member.userId))
  );
  const rosterKeys = new Set(roster.rows.map((member) => memberKey(member.teamId, member.userId)));

  const reportCountByMember = new Map<string, number>();
  const latestReportByMember = new Map<string, ReportRow>();
  for (const report of reports.rows) {
    const key = memberKey(report.teamId, report.userId);
    if (!rosterKeys.has(key)) continue;
    reportCountByMember.set(key, (reportCountByMember.get(key) ?? 0) + 1);
    if (!latestReportByMember.has(key)) latestReportByMember.set(key, report);
  }

  const submissionCountByMember = new Map<string, number>();
  for (const submission of submissions.rows) {
    const key = memberKey(submission.task.teamId, submission.userId);
    if (!rosterKeys.has(key)) continue;
    submissionCountByMember.set(key, (submissionCountByMember.get(key) ?? 0) + 1);
  }

  const profileCountByMember = new Map<string, number>();
  for (const profile of customerProfiles.rows) {
    const key = memberKey(profile.customer.teamId, profile.customer.ownerId);
    if (!rosterKeys.has(key)) continue;
    profileCountByMember.set(key, (profileCountByMember.get(key) ?? 0) + 1);
  }

  const recordByPair = new Map(training.records.map((record) => [
    pairKey(record.courseId, record.userId),
    record
  ]));
  const trainingScoresByMember = new Map<string, number[]>();
  const trainingRecordCountByMember = new Map<string, number>();
  for (const assignment of training.assignments) {
    const key = memberKey(assignment.teamId, assignment.userId);
    if (!rosterKeys.has(key)) continue;
    const record = recordByPair.get(pairKey(assignment.courseId, assignment.userId));
    if (!record) continue;
    const scores = trainingScoresByMember.get(key) ?? [];
    scores.push(record.score);
    trainingScoresByMember.set(key, scores);
    trainingRecordCountByMember.set(key, (trainingRecordCountByMember.get(key) ?? 0) + 1);
  }

  const rankings: EmployeeGrowthItem[] = roster.rows.map((member) => {
    const key = memberKey(member.teamId, member.userId);
    const latestReport = latestReportByMember.get(key);
    const skillScore = latestReport?.score ?? null;
    const trainingScore = average(trainingScoresByMember.get(key) ?? []);
    return {
      userId: member.userId,
      employeeName: member.employeeName,
      teamId: member.teamId,
      teamName: member.teamName,
      skillScore,
      taskScore: null,
      trainingScore,
      customerScore: null,
      growthScore: skillScore,
      growthLevel: growthLevel(skillScore),
      sources: {
        coachReports: reportCountByMember.get(key) ?? 0,
        taskSubmissions: submissionCountByMember.get(key) ?? 0,
        trainingRecords: trainingRecordCountByMember.get(key) ?? 0,
        customerProfiles: profileCountByMember.get(key) ?? 0
      }
    };
  }).sort((left, right) => {
    if (left.growthScore === null && right.growthScore !== null) return 1;
    if (left.growthScore !== null && right.growthScore === null) return -1;
    if (left.growthScore !== right.growthScore) return (right.growthScore ?? 0) - (left.growthScore ?? 0);
    return left.employeeName.localeCompare(right.employeeName, "zh-CN");
  });

  const latestSkillKeys = new Set<string>();
  const scoresBySkill = new Map<string, number[]>();
  for (const skill of skills.rows) {
    const rosterKey = memberKey(skill.report.teamId, skill.userId);
    if (!rosterKeys.has(rosterKey)) continue;
    const skillKey = skill.skillName as AnalyticsSkillKey;
    const label = ANALYTICS_SKILL_LABELS[skillKey];
    if (!label) continue;
    const key = JSON.stringify([rosterKey, skillKey]);
    if (latestSkillKeys.has(key)) continue;
    latestSkillKeys.add(key);
    const values = scoresBySkill.get(label) ?? [];
    values.push(skill.score);
    scoresBySkill.set(label, values);
  }
  const abilityDistribution = Array.from(scoresBySkill, ([label, values]) => ({
    label,
    value: average(values) ?? 0
  })).sort((left, right) => right.value - left.value || left.label.localeCompare(right.label, "zh-CN"));

  const reportTrend = reportDailyScores(reports.rows.filter((report) => (
    rosterKeys.has(memberKey(report.teamId, report.userId))
  )), window.dateKeys);
  const trainingScoresByDate = new Map(window.dateKeys.map((date) => [date, [] as number[]]));
  for (const record of training.records) {
    if (!record.completedAt) continue;
    trainingScoresByDate.get(dateKeyInChina(record.completedAt))?.push(record.score);
  }
  const growthTrend = window.dateKeys.map((date) => ({
    date,
    employeeAverageScore: reportTrend.get(date) ?? null,
    trainingAverageScore: average(trainingScoresByDate.get(date) ?? [])
  }));
  const truncated = roster.truncated || reports.truncated || skills.truncated ||
    submissions.truncated || training.truncated || customerProfiles.truncated;

  return {
    context: access.context,
    range: window.range,
    rankings,
    abilityDistribution,
    growthTrend,
    dataCoverage: uniqueCoverage([
      "成长排名只采用所选区间内每位成员最新一份 AI Coach 分析报告的 score；growthScore 与 skillScore 使用同一可靠口径。",
      "任务与 CRM 暂无可靠员工评分字段，因此 taskScore、customerScore 保持 null，不参与排名。",
      "trainingScore 单独展示所选截止区间培训安排对应的已完成课程分数，不参与成长排名。",
      "员工名称只读取 User.name；姓名为空时使用匿名成员编号，不读取邮箱或手机号。",
      "团队排名每行表示一条成员-团队记录；同一成员属于多个可见团队时会分行展示，不声称是唯一员工人数。",
      "能力分布只接受五个固定 AI Coach 技能键并映射固定中文标签，未知 skillName 不读取、不展示。",
      "培训成绩仅在同一 courseId:userId 存在当前可见团队培训安排时纳入。",
      ...(truncated ? ["数据超过单类 1000 行读取上限，排名、趋势或来源计数为截断结果。"] : [])
    ]),
    truncated
  };
}

async function loadCrmData(access: AnalyticsAccessState, window: AnalyticsWindow): Promise<CrmAnalyticsData> {
  assertCrmAnalyticsAccess(access);
  const customerWhere = {
    companyId: access.context.companyId,
    teamId: { in: access.crmTeamIds }
  };
  const [customerCount, stageGroups, teamGroups, highValueCustomerCount, riskCustomerCount] = await Promise.all([
    prisma.customer.count({ where: customerWhere }),
    prisma.customer.groupBy({
      by: ["stage"],
      where: customerWhere,
      _count: { _all: true }
    }),
    prisma.customer.groupBy({
      by: ["teamId"],
      where: customerWhere,
      _count: { _all: true }
    }),
    prisma.customer.count({ where: { ...customerWhere, level: "HIGH" } }),
    prisma.customerAIProfile.count({
      where: {
        customer: customerWhere,
        OR: [{ riskLevel: "HIGH" }, { intent: "CHURN_RISK" }]
      }
    })
  ]);
  const stageCounts = new Map<string, number>(
    stageGroups.map((group) => [group.stage, group._count._all])
  );
  const teamNameById = new Map(access.context.teams.map((team) => [team.id, team.name]));
  const stageDistribution = Object.entries(CUSTOMER_STAGE_LABELS).map(([stage, label]) => ({
    label,
    value: stageCounts.get(stage) ?? 0
  }));
  const contactedOrLater = (stageCounts.get("CONTACTED") ?? 0) +
    (stageCounts.get("INTERESTED") ?? 0) + (stageCounts.get("NEGOTIATING") ?? 0) +
    (stageCounts.get("CUSTOMER") ?? 0);
  const interestedOrLater = (stageCounts.get("INTERESTED") ?? 0) +
    (stageCounts.get("NEGOTIATING") ?? 0) + (stageCounts.get("CUSTOMER") ?? 0);
  const negotiatingOrCustomer = (stageCounts.get("NEGOTIATING") ?? 0) +
    (stageCounts.get("CUSTOMER") ?? 0);
  return {
    context: access.context,
    range: window.range,
    customerCount,
    conversionRate: percentage(stageCounts.get("CUSTOMER") ?? 0, customerCount),
    highValueCustomerCount,
    riskCustomerCount,
    stageDistribution,
    funnel: [
      { label: "总线索", value: customerCount },
      { label: "已联系及以后", value: contactedOrLater },
      { label: "有兴趣及以后", value: interestedOrLater },
      { label: "洽谈及成交", value: negotiatingOrCustomer },
      { label: "已成交", value: stageCounts.get("CUSTOMER") ?? 0 }
    ],
    teamDistribution: teamGroups.map((group) => ({
      label: teamNameById.get(group.teamId) ?? "当前团队",
      value: group._count._all
    })).sort((left, right) => right.value - left.value || left.label.localeCompare(right.label, "zh-CN")),
    dataCoverage: uniqueCoverage([
      "CRM 页面展示当前可见范围内全部客户的状态快照；日期选择不伪装为不存在的历史阶段事件。",
      "客户转化率定义为当前全部客户中处于 CUSTOMER（已成交）阶段的客户占比，不代表历史阶段转换事件。",
      "成交漏斗按当前阶段累计推导；流失客户只计入总线索，不伪装为仍处于后续销售阶段。",
      "风险客户定义为当前画像 riskLevel=HIGH 或 intent=CHURN_RISK；不读取客户身份信息或画像原文。"
    ])
  };
}

async function buildTrainingAnalytics(
  access: AnalyticsAccessState,
  window: AnalyticsWindow
): Promise<TrainingAnalyticsData> {
  if (!canViewTrainingScope(access)) {
    throw new ForbiddenError("当前角色只能查看个人成长数据，无权查看培训分析。");
  }
  const [cohort, evaluationOutputs] = await Promise.all([
    loadTrainingCohort(access.trainingTeamIds, window),
    loadTrainingEvaluationOutputs(access.context.companyId, access.trainingTeamIds, window)
  ]);
  const recordByPair = new Map(cohort.records.map((record) => [
    pairKey(record.courseId, record.userId),
    record
  ]));
  const courseRows = new Map<string, {
    courseId: string;
    title: string;
    assignmentCount: number;
    completedCount: number;
    scores: number[];
    scorePairs: Set<string>;
  }>();
  for (const assignment of cohort.assignments) {
    const row = courseRows.get(assignment.courseId) ?? {
      courseId: assignment.courseId,
      title: assignment.course.title,
      assignmentCount: 0,
      completedCount: 0,
      scores: [],
      scorePairs: new Set<string>()
    };
    row.assignmentCount += 1;
    if (assignment.status === "COMPLETED") row.completedCount += 1;
    const record = recordByPair.get(pairKey(assignment.courseId, assignment.userId));
    const recordPair = pairKey(assignment.courseId, assignment.userId);
    if (record && !row.scorePairs.has(recordPair)) {
      row.scorePairs.add(recordPair);
      row.scores.push(record.score);
    }
    courseRows.set(assignment.courseId, row);
  }
  const evaluationScoresByDate = new Map(window.dateKeys.map((date) => [date, [] as number[]]));
  for (const evaluation of evaluationOutputs.rows) {
    evaluationScoresByDate.get(dateKeyInChina(evaluation.createdAt))?.push(evaluation.score);
  }
  const completedAssignmentCount = cohort.assignments.filter((assignment) => (
    assignment.status === "COMPLETED"
  )).length;
  return {
    context: access.context,
    range: window.range,
    assignmentCount: cohort.assignments.length,
    completedAssignmentCount,
    completionRate: percentage(completedAssignmentCount, cohort.assignments.length),
    averageScore: average(cohort.records.map((record) => record.score)),
    scoredRecordCount: cohort.records.length,
    evaluatedCount: evaluationOutputs.rows.length,
    coursePerformance: Array.from(courseRows.values(), (row) => ({
      courseId: row.courseId,
      title: row.title,
      assignmentCount: row.assignmentCount,
      completedCount: row.completedCount,
      completionRate: percentage(row.completedCount, row.assignmentCount),
      averageScore: average(row.scores)
    })).sort((left, right) => (
      (right.completionRate ?? -1) - (left.completionRate ?? -1) || left.title.localeCompare(right.title, "zh-CN")
    )),
    improvementTrend: window.dateKeys.map((date) => {
      const scores = evaluationScoresByDate.get(date) ?? [];
      return { date, averageScore: average(scores), evaluationCount: scores.length };
    }),
    dataCoverage: uniqueCoverage([
      "培训完成率以所选区间内截止、未取消的培训安排为分母，以当前状态为 COMPLETED 的安排为分子。",
      "平均训练分只读取与可见培训安排具有相同 courseId:userId 的已完成 TrainingRecord。",
      "评估数量与提升趋势统计所有当前可见、未取消培训安排的 courseId:userId 对在所选区间新增的 AITrainingEvaluation，不受安排截止日期限制。",
      "TrainingRecord 与 AITrainingEvaluation 不含 teamId；同一课程员工对被多个团队安排时，成绩按共享课程员工结果展示，不能解释为某一团队独立产生。",
      ...(cohort.truncated || evaluationOutputs.truncated ? ["培训安排、成绩、评估或授权对超过单类 1000 行上限，当前结果为截断统计。"] : [])
    ]),
    truncated: cohort.truncated || evaluationOutputs.truncated
  };
}

async function buildAiAnalytics(
  access: AnalyticsAccessState,
  window: AnalyticsWindow
): Promise<AiAnalyticsData> {
  if (!isBusinessScope(access) || access.businessTeamIds.length === 0) {
    throw new ForbiddenError("只有企业负责人或团队主管可以查看 AI 运营分析。");
  }
  const [reportResult, profileResult, trainingEvaluations] = await Promise.all([
    prisma.employeeAnalysisReport.findMany({
      where: {
        teamId: { in: access.businessTeamIds },
        createdAt: { gte: window.start, lt: window.end }
      },
      select: { createdAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: ANALYTICS_ROW_TAKE
    }),
    prisma.customerAIProfile.findMany({
      where: {
        updatedAt: { gte: window.start, lt: window.end },
        customer: {
          companyId: access.context.companyId,
          teamId: { in: access.crmTeamIds }
        }
      },
      select: { updatedAt: true },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: ANALYTICS_ROW_TAKE
    }),
    loadTrainingEvaluationOutputs(access.context.companyId, access.businessTeamIds, window)
  ]);
  const reports = capped(reportResult);
  const profiles = capped(profileResult);
  const trend = new Map(window.dateKeys.map((date) => [date, {
    coachReportCount: 0,
    crmProfileUpdateCount: 0,
    trainingEvaluationCount: 0
  }]));
  for (const report of reports.rows) {
    const row = trend.get(dateKeyInChina(report.createdAt));
    if (row) row.coachReportCount += 1;
  }
  for (const profile of profiles.rows) {
    const row = trend.get(dateKeyInChina(profile.updatedAt));
    if (row) row.crmProfileUpdateCount += 1;
  }
  for (const evaluation of trainingEvaluations.rows) {
    const row = trend.get(dateKeyInChina(evaluation.createdAt));
    if (row) row.trainingEvaluationCount += 1;
  }
  const trackedOutputCount = reports.rows.length + profiles.rows.length + trainingEvaluations.rows.length;
  const truncated = reports.truncated || profiles.truncated || trainingEvaluations.truncated;
  return {
    context: access.context,
    range: window.range,
    scopeLabel: access.isCompanyOwner
      ? "企业全部有效团队"
      : `管理团队（${access.businessTeamIds.length} 个）`,
    aiUsageCount: null,
    trackedOutputCount,
    coachReportCount: reports.rows.length,
    crmProfileCount: profiles.rows.length,
    trainingEvaluationCount: trainingEvaluations.rows.length,
    suggestionExecutionRate: null,
    knowledgeCallCount: null,
    usageTrend: window.dateKeys.map((date) => {
      const value = trend.get(date) ?? {
        coachReportCount: 0,
        crmProfileUpdateCount: 0,
        trainingEvaluationCount: 0
      };
      return {
        date,
        ...value,
        total: value.coachReportCount + value.crmProfileUpdateCount + value.trainingEvaluationCount
      };
    }),
    unavailableMetrics: [
      "AI provider 调用次数暂无可靠、按企业团队归因的业务字段，因此 aiUsageCount 为 null。",
      "AI 建议执行缺少可验证的执行事件，因此 suggestionExecutionRate 为 null。",
      "知识库调用日志不在本模块允许读取范围内，因此 knowledgeCallCount 为 null。"
    ],
    dataCoverage: uniqueCoverage([
      "可追踪产出只统计区间内新增的 EmployeeAnalysisReport、当前 CustomerAIProfile 的区间内更新覆盖行，以及新增 AITrainingEvaluation；不等同 AI provider 调用次数。",
      "CRM 画像数仅表示 updatedAt 位于所选区间、当前仍保留的画像行数；它既不是全部当前画像覆盖数，也不是 AI 调用次数，单行多次更新只计一行。",
      "培训 AI 产出仅在同一 courseId:userId 存在当前可见团队培训安排时纳入。",
      ...(truncated ? ["AI 产出或培训授权对超过单类 1000 行上限，当前结果为截断统计。"] : [])
    ])
  };
}

async function loadDashboardCrm(access: AnalyticsAccessState) {
  if (!isBusinessScope(access) || access.crmTeamIds.length === 0) {
    return { customerCount: 0, convertedCount: 0 };
  }
  const where = {
    companyId: access.context.companyId,
    teamId: { in: access.crmTeamIds }
  };
  const [customerCount, convertedCount] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.count({ where: { ...where, stage: "CUSTOMER" } })
  ]);
  return { customerCount, convertedCount };
}

export async function generateDashboard(
  userId: string,
  query: AnalyticsQuery
): Promise<AnalyticsDashboardData> {
  const access = await resolveAnalyticsAccess(userId, query.companyId);
  const window = analyticsRange(query.days);
  const businessAllowed = isBusinessScope(access);
  const trainingAllowed = canViewTrainingScope(access);
  const [team, tasks, todayTasks, crmRows, training, ai] = await Promise.all([
    buildTeamMetrics(userId, access, window),
    businessAllowed ? loadTasks(access.businessTeamIds, window) : Promise.resolve({ rows: [] as TaskRow[], truncated: false }),
    businessAllowed ? loadTodayTaskCounts(access.businessTeamIds) : Promise.resolve({ total: 0, completed: 0 }),
    businessAllowed ? loadDashboardCrm(access) : Promise.resolve({ customerCount: 0, convertedCount: 0 }),
    trainingAllowed ? buildTrainingAnalytics(access, window) : Promise.resolve(null),
    businessAllowed ? buildAiAnalytics(access, window) : Promise.resolve(null)
  ]);
  const growthScoresByUser = new Map<string, number[]>();
  for (const employee of team.rankings) {
    if (employee.growthScore === null) continue;
    const values = growthScoresByUser.get(employee.userId) ?? [];
    values.push(employee.growthScore);
    growthScoresByUser.set(employee.userId, values);
  }
  const growthScores = Array.from(growthScoresByUser.values()).flatMap((values) => {
    const value = average(values);
    return value === null ? [] : [value];
  });
  const points = emptyDailyPoints(window.dateKeys);
  const taskTrend = tasks.truncated
    ? new Map(window.dateKeys.map((date) => [date, null] as const))
    : taskDailyRates(tasks.rows, window.dateKeys);
  const trainingTrend = training
    ? trainingDailyRates(
        (await loadTrainingCohort(access.trainingTeamIds, window)).assignments,
        window.dateKeys
      )
    : new Map<string, number | null>();
  const teamTrend = new Map(team.growthTrend.map((point) => [point.date, point.employeeAverageScore]));
  const aiTrend = new Map(ai?.usageTrend.map((point) => [point.date, point.total]) ?? []);
  for (const [date, point] of Array.from(points.entries())) {
    point.taskCompletionRate = businessAllowed ? taskTrend.get(date) ?? null : null;
    point.employeeAverageScore = teamTrend.get(date) ?? null;
    point.customerConversionRate = null;
    point.trainingCompletionRate = training ? trainingTrend.get(date) ?? null : null;
    point.aiOutputCount = businessAllowed ? aiTrend.get(date) ?? 0 : 0;
  }
  const dataCoverage = uniqueCoverage(
    team.dataCoverage,
    training?.dataCoverage ?? [],
    ai?.dataCoverage ?? [],
    [
      "总览任务完成率只统计上海时区今天到期且未取消的任务；趋势仍按所选区间逐日展示到期任务完成率。",
      "客户转化率是当前可见全部客户中 CUSTOMER（已成交）阶段占比；缺少历史阶段事件，因此日趋势保持 null。",
      "总览员工平均能力分先按 userId 合并多团队成员记录，再让每位唯一用户等权参与平均，避免多团队成员被重复计权。",
      "AI 调用次数无法从当前业务表可靠归因，因此总览 aiUsageCount 保持 null；趋势仅显示可追踪 AI 业务产出。",
      ...(!businessAllowed ? ["当前角色只显示个人成长或授权培训数据；任务、CRM 与 AI 运营指标不可用。"] : []),
      ...(tasks.truncated ? ["区间任务超过 1000 行读取上限，任务日趋势保持 null；今日任务完成率仍由精确 count 查询计算。"] : [])
    ]
  );

  return {
    context: access.context,
    range: window.range,
    generatedAt: new Date().toISOString(),
    metrics: {
      taskCompletionRate: metric({
        value: businessAllowed ? percentage(todayTasks.completed, todayTasks.total) : null,
        unit: "PERCENT",
        sampleSize: businessAllowed ? todayTasks.total : 0,
        definition: businessAllowed
          ? "上海时区今天到期且未取消任务中，当前状态为 COMPLETED 的比例。"
          : "当前角色无企业或管理团队任务分析权限。"
      }),
      employeeAverageScore: metric({
        value: average(growthScores),
        unit: "SCORE",
        sampleSize: growthScores.length,
        definition: "当前可见用户在所选区间内的 AI Coach 分数；多团队记录先按 userId 合并，再按唯一用户等权平均。"
      }),
      customerConversionRate: metric({
        value: businessAllowed ? percentage(crmRows.convertedCount, crmRows.customerCount) : null,
        unit: "PERCENT",
        sampleSize: businessAllowed ? crmRows.customerCount : 0,
        definition: businessAllowed
          ? "当前可见全部客户中，处于 CUSTOMER（已成交）阶段的客户占比。"
          : "当前角色无企业或管理团队 CRM 分析权限。"
      }),
      trainingCompletionRate: metric({
        value: training?.completionRate ?? null,
        unit: "PERCENT",
        sampleSize: training?.assignmentCount ?? 0,
        definition: training
          ? "所选区间内截止、未取消培训安排中，当前状态为 COMPLETED 的比例。"
          : "当前角色仅能查看个人成长，不能查看团队培训完成率。"
      }),
      aiUsageCount: metric({
        value: null,
        unit: "COUNT",
        sampleSize: 0,
        definition: "当前业务表无法可靠统计并按企业团队归因 AI provider 调用次数。"
      })
    },
    trend: Array.from(points.values()) as AnalyticsDailyPoint[],
    dataCoverage
  };
}

export async function getTeamMetrics(userId: string, query: AnalyticsQuery) {
  const access = await resolveAnalyticsAccess(userId, query.companyId);
  return buildTeamMetrics(userId, access, analyticsRange(query.days));
}

export async function getCRMAnalytics(userId: string, query: AnalyticsQuery) {
  const access = await resolveAnalyticsAccess(userId, query.companyId);
  return loadCrmData(access, analyticsRange(query.days));
}

export async function getTrainingAnalytics(userId: string, query: AnalyticsQuery) {
  const access = await resolveAnalyticsAccess(userId, query.companyId);
  return buildTrainingAnalytics(access, analyticsRange(query.days));
}

export async function getAIAnalytics(userId: string, query: AnalyticsQuery) {
  const access = await resolveAnalyticsAccess(userId, query.companyId);
  return buildAiAnalytics(access, analyticsRange(query.days));
}
