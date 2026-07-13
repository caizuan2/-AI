import "server-only";

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { notificationGateway } from "@/apps/team-os/features/notification/services/notification-gateway";
import { NOTIFICATION_CHANNELS, type NotificationType } from "@/apps/team-os/features/notification/types";
import { toTeamOsSafeErrorMetadata } from "@/apps/team-os/features/production/services/production-logger";

interface BestEffortResult {
  createdCount: number;
  skipped: boolean;
}

const NOTIFICATION_EVENT_TIMEOUT_MS = 1_000;
const NOTIFICATION_RECIPIENT_BATCH_SIZE = 10;

function safeLabel(value: string, fallback: string, maxLength = 80) {
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return (normalized || fallback).slice(0, maxLength);
}

function maskedLabel(value: string) {
  const normalized = safeLabel(value, "客户", 40);
  const first = Array.from(normalized)[0] ?? "客";
  return `${first}***`;
}

function normalizedScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

async function activeRecipients(input: {
  companyId: string;
  userIds?: string[];
  teamIds?: string[];
  roles?: Array<"TEAM_OWNER" | "TEAM_MANAGER" | "TRAINER" | "TEAM_MEMBER">;
}) {
  const memberships = await prisma.teamMember.findMany({
    where: {
      status: "ACTIVE",
      ...(input.userIds ? { userId: { in: input.userIds } } : {}),
      ...(input.roles ? { role: { in: input.roles } } : {}),
      team: {
        companyId: input.companyId,
        status: "ACTIVE",
        ...(input.teamIds ? { id: { in: input.teamIds } } : {})
      }
    },
    select: { userId: true }
  });
  const candidateIds = Array.from(new Set(memberships.map((membership) => membership.userId)));
  if (candidateIds.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: candidateIds }, isActive: true },
    select: { id: true }
  });
  return users.map((user) => user.id);
}

async function createForRecipients(input: {
  companyId: string;
  teamId?: string;
  recipients: string[];
  type: NotificationType;
  title: string;
  content: string;
  source: string;
}) {
  const recipients = Array.from(new Set(input.recipients));
  const results: PromiseSettledResult<Awaited<ReturnType<typeof notificationGateway.sendNotification>>>[] = [];
  for (let offset = 0; offset < recipients.length; offset += NOTIFICATION_RECIPIENT_BATCH_SIZE) {
    const batch = recipients.slice(offset, offset + NOTIFICATION_RECIPIENT_BATCH_SIZE);
    results.push(...await Promise.allSettled(batch.map((userId) =>
      notificationGateway.sendNotification({
        companyId: input.companyId,
        teamId: input.teamId,
        userId,
        type: input.type,
        title: safeLabel(input.title, "AI Team OS 通知", 160),
        content: safeLabel(input.content, "您有一条新的企业通知。", 500),
        source: safeLabel(input.source, "SYSTEM", 120),
        channels: [...NOTIFICATION_CHANNELS],
        mode: "PRODUCTION"
      })
    )));
  }
  const failedCount = results.filter((result) => result.status === "rejected").length;
  if (failedCount > 0) {
    logger.warn("team_os_notification_recipient_write_failed", {
      companyId: input.companyId,
      type: input.type,
      recipientCount: results.length,
      failedCount
    });
  }
  return results.reduce((count, result) => {
    if (result.status !== "fulfilled") return count;
    return count + result.value.attempts.filter((attempt) =>
      attempt.channel === "IN_APP" && attempt.status === "CREATED"
    ).length;
  }, 0);
}

async function bestEffort(event: string, operation: () => Promise<BestEffortResult>): Promise<BestEffortResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<BestEffortResult>((resolve) => {
      timer = setTimeout(() => {
        logger.warn("team_os_notification_event_timed_out", {
          event,
          timeoutMs: NOTIFICATION_EVENT_TIMEOUT_MS
        });
        resolve({ createdCount: 0, skipped: false });
      }, NOTIFICATION_EVENT_TIMEOUT_MS);
    });
    return await Promise.race([operation(), timeout]);
  } catch (error) {
    logger.warn("team_os_notification_event_failed", {
      event,
      error: toTeamOsSafeErrorMetadata(error)
    });
    return { createdCount: 0, skipped: false };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function notifyTaskCompletedBestEffort(input: {
  companyId: string;
  taskId: string;
  taskTitle: string;
  creatorId: string;
  completedByUserId: string;
  becameCompleted?: boolean;
}) {
  if (input.becameCompleted === false) return Promise.resolve({ createdCount: 0, skipped: true });
  return bestEffort("TASK_COMPLETED", async () => {
    const task = await prisma.task.findFirst({
      where: {
        id: input.taskId,
        creatorId: input.creatorId,
        team: { companyId: input.companyId, status: "ACTIVE" }
      },
      select: { id: true, creatorId: true, title: true, teamId: true }
    });
    if (!task) return { createdCount: 0, skipped: true };
    const completedBy = await activeRecipients({
      companyId: input.companyId,
      teamIds: [task.teamId],
      userIds: [input.completedByUserId]
    });
    if (completedBy.length === 0) return { createdCount: 0, skipped: true };
    const [teamCreatorRecipients, ownerCreatorRecipients] = await Promise.all([
      activeRecipients({
        companyId: input.companyId,
        teamIds: [task.teamId],
        userIds: [task.creatorId]
      }),
      activeRecipients({
        companyId: input.companyId,
        userIds: [task.creatorId],
        roles: ["TEAM_OWNER"]
      })
    ]);
    const recipients = Array.from(new Set([...teamCreatorRecipients, ...ownerCreatorRecipients]));
    const title = safeLabel(task.title || input.taskTitle, "团队任务", 60);
    return {
      createdCount: await createForRecipients({
        companyId: input.companyId,
        teamId: task.teamId,
        recipients,
        type: "TASK",
        title: "任务完成提醒",
        content: `任务「${title}」已由团队成员完成，请及时查看完成记录。`,
        source: `TASK:${task.id}`
      }),
      skipped: recipients.length === 0
    };
  });
}

export function notifyAiCoachReportGeneratedBestEffort(input: {
  companyId: string;
  teamId: string;
  reportId: string;
  employeeUserId: string;
  score: number;
  reused?: boolean;
}) {
  if (input.reused === true) return Promise.resolve({ createdCount: 0, skipped: true });
  return bestEffort("AI_COACH_REPORT_GENERATED", async () => {
    const report = await prisma.employeeAnalysisReport.findFirst({
      where: {
        id: input.reportId,
        userId: input.employeeUserId,
        teamId: input.teamId,
        team: { companyId: input.companyId, status: "ACTIVE" }
      },
      select: { id: true, score: true }
    });
    if (!report) return { createdCount: 0, skipped: true };
    const [employeeRecipients, managerRecipients, ownerRecipients] = await Promise.all([
      activeRecipients({ companyId: input.companyId, teamIds: [input.teamId], userIds: [input.employeeUserId] }),
      activeRecipients({
        companyId: input.companyId,
        teamIds: [input.teamId],
        roles: ["TEAM_MANAGER"]
      }),
      activeRecipients({ companyId: input.companyId, roles: ["TEAM_OWNER"] })
    ]);
    const recipients = Array.from(new Set([...employeeRecipients, ...managerRecipients, ...ownerRecipients]));
    return {
      createdCount: await createForRecipients({
        companyId: input.companyId,
        teamId: input.teamId,
        recipients,
        type: "AI_COACH",
        title: "AI 教练报告已生成",
        content: `新的 AI 教练报告已生成，本次综合评分为 ${normalizedScore(report.score)} 分。`,
        source: `AI_COACH:${report.id}`
      }),
      skipped: recipients.length === 0
    };
  });
}

export function notifyCrmRiskDetectedBestEffort(input: {
  companyId: string;
  customerId: string;
  maskedCustomerName: string;
  ownerId: string;
  riskLevel: string;
  reused?: boolean;
}) {
  if (input.reused === true) return Promise.resolve({ createdCount: 0, skipped: true });
  return bestEffort("CRM_RISK_DETECTED", async () => {
    const customer = await prisma.customer.findFirst({
      where: {
        id: input.customerId,
        companyId: input.companyId,
        ownerId: input.ownerId,
        team: { status: "ACTIVE" }
      },
      select: {
        id: true,
        teamId: true,
        ownerId: true,
        aiProfile: { select: { riskLevel: true } }
      }
    });
    if (!customer) return { createdCount: 0, skipped: true };
    if (customer.aiProfile?.riskLevel !== "HIGH") return { createdCount: 0, skipped: true };
    const [teamOwnerRecipients, companyOwnerRecipients] = await Promise.all([
      activeRecipients({
        companyId: input.companyId,
        teamIds: [customer.teamId],
        userIds: [customer.ownerId]
      }),
      activeRecipients({
        companyId: input.companyId,
        userIds: [customer.ownerId],
        roles: ["TEAM_OWNER"]
      })
    ]);
    const recipients = Array.from(new Set([...teamOwnerRecipients, ...companyOwnerRecipients]));
    const customerName = maskedLabel(input.maskedCustomerName);
    const riskLevel = safeLabel(customer.aiProfile?.riskLevel ?? input.riskLevel, "待关注", 20);
    return {
      createdCount: await createForRecipients({
        companyId: input.companyId,
        teamId: customer.teamId,
        recipients,
        type: "CRM",
        title: "客户风险提醒",
        content: `客户 ${customerName} 出现 ${riskLevel} 风险信号，请及时跟进。`,
        source: `CRM:${customer.id}`
      }),
      skipped: recipients.length === 0
    };
  });
}

export function notifyTrainingCompletedBestEffort(input: {
  companyId: string;
  courseId: string;
  courseTitle: string;
  employeeUserId: string;
  score: number;
  becameCompleted?: boolean;
}) {
  if (input.becameCompleted === false) return Promise.resolve({ createdCount: 0, skipped: true });
  return bestEffort("TRAINING_COMPLETED", async () => {
    const [assignments, record] = await Promise.all([
      prisma.trainingAssignment.findMany({
        where: {
          companyId: input.companyId,
          courseId: input.courseId,
          userId: input.employeeUserId,
          status: { not: "CANCELLED" },
          team: { status: "ACTIVE" },
          course: { status: "ACTIVE" }
        },
        select: { teamId: true, assignedBy: true, course: { select: { title: true } } }
      }),
      prisma.trainingRecord.findFirst({
        where: {
          courseId: input.courseId,
          userId: input.employeeUserId,
          status: "COMPLETED",
          course: { companyId: input.companyId, status: "ACTIVE" }
        },
        select: { score: true }
      })
    ]);
    if (assignments.length === 0 || !record) return { createdCount: 0, skipped: true };
    const courseTitle = safeLabel(assignments[0].course.title || input.courseTitle, "培训课程", 60);
    const assignmentsByTeam = new Map<string, typeof assignments>();
    for (const assignment of assignments) {
      const teamAssignments = assignmentsByTeam.get(assignment.teamId) ?? [];
      teamAssignments.push(assignment);
      assignmentsByTeam.set(assignment.teamId, teamAssignments);
    }
    const ownerRecipients = await activeRecipients({ companyId: input.companyId, roles: ["TEAM_OWNER"] });
    let createdCount = 0;
    let hasRecipients = false;
    for (const [teamId, teamAssignments] of Array.from(assignmentsByTeam.entries())) {
      const explicitSupervisorIds = Array.from(new Set(teamAssignments.map((assignment) => assignment.assignedBy)));
      const [assignedByRecipients, managerAndTrainerRecipients] = await Promise.all([
        activeRecipients({
          companyId: input.companyId,
          teamIds: [teamId],
          userIds: explicitSupervisorIds
        }),
        activeRecipients({
          companyId: input.companyId,
          teamIds: [teamId],
          roles: ["TEAM_MANAGER", "TRAINER"]
        })
      ]);
      const recipients = Array.from(new Set([
        ...assignedByRecipients,
        ...managerAndTrainerRecipients,
        ...ownerRecipients
      ]));
      hasRecipients ||= recipients.length > 0;
      createdCount += await createForRecipients({
        companyId: input.companyId,
        teamId,
        recipients,
        type: "TRAINING",
        title: "培训完成提醒",
        content: `课程「${courseTitle}」已完成，本次成绩为 ${normalizedScore(record.score)} 分。`,
        source: `TRAINING:${input.courseId}:${teamId}`
      });
    }
    return { createdCount, skipped: !hasRecipients };
  });
}
