import "server-only";

import type { Prisma } from "@prisma/client";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import {
  assertActiveTargetMember,
  assertCrmManagementRole,
  resolveCrmOperationsScope,
  resolveCustomerOperationsScope,
  type CrmOperationsScope
} from "@/apps/team-os/features/crm/operations/access";
import { inspectConversationDeterministically } from "@/apps/team-os/features/crm/operations/quality-inspection";
import type {
  CreateConversationInput,
  CreateDailyPlanInput,
  CreateIntegrationInput,
  CreateSalesTargetInput,
  CreateVisitInput,
  CrmOperationsListInput,
  CrmVisitStatus,
  UpdateVisitStatusInput
} from "@/apps/team-os/features/crm/operations/types";

function inputJson(value: Record<string, unknown> | Array<Record<string, unknown>> | undefined) {
  return value as Prisma.InputJsonValue | undefined;
}

function asDateOnly(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function dateRange(input: CrmOperationsListInput, field: string) {
  if (!input.from && !input.to) return {};
  return {
    [field]: {
      ...(input.from ? { gte: input.from } : {}),
      ...(input.to ? { lte: input.to } : {})
    }
  };
}

function scopedOwnerFilter(scope: CrmOperationsScope, field = "userId") {
  return scope.viewMode === "OWN" ? { [field]: scope.userId } : {};
}

function pageResult<T extends { id: string }>(items: T[], limit: number) {
  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  return {
    items: data,
    nextCursor: hasMore ? data[data.length - 1]?.id ?? null : null
  };
}

async function assertConversationReferences(
  input: CreateConversationInput,
  scope: CrmOperationsScope
) {
  const [contact, opportunity, integration] = await Promise.all([
    input.contactId
      ? prisma.crmContact.findFirst({
          where: {
            id: input.contactId,
            companyId: scope.companyId,
            customerId: input.customerId,
            OR: [{ teamId: scope.teamId }, { teamId: null }]
          },
          select: { id: true }
        })
      : null,
    input.opportunityId
      ? prisma.crmOpportunity.findFirst({
          where: {
            id: input.opportunityId,
            companyId: scope.companyId,
            customerId: input.customerId,
            OR: [{ teamId: scope.teamId }, { teamId: null }]
          },
          select: { id: true }
        })
      : null,
    input.integrationSourceId
      ? prisma.crmIntegrationSource.findFirst({
          where: {
            id: input.integrationSourceId,
            companyId: scope.companyId,
            channel: input.channel,
            status: "ACTIVE",
            OR: [{ teamId: scope.teamId }, { teamId: null }]
          },
          select: { id: true }
        })
      : null
  ]);
  if (input.contactId && !contact) {
    throw new ValidationError("联系人不存在、与客户不匹配或无权访问。");
  }
  if (input.opportunityId && !opportunity) {
    throw new ValidationError("商机不存在、与客户不匹配或无权访问。");
  }
  if (input.integrationSourceId && !integration) {
    throw new ValidationError("集成来源不存在、渠道不匹配或当前不可用。");
  }
}

async function assertCustomerIdsAccessible(
  scope: CrmOperationsScope,
  customerIds: string[]
) {
  if (customerIds.length === 0) return;
  const count = await prisma.customer.count({
    where: {
      id: { in: customerIds },
      companyId: scope.companyId,
      teamId: scope.teamId,
      ...(scope.viewMode === "OWN" ? { ownerId: scope.userId } : {})
    }
  });
  if (count !== customerIds.length) {
    throw new ValidationError("重点客户中包含不存在、跨企业或当前账号无权访问的客户。");
  }
}

export async function listCrmConversationsForUser(
  userId: string,
  input: CrmOperationsListInput
) {
  let scope = await resolveCrmOperationsScope(userId, input.teamId);
  if (input.customerId) {
    scope = (await resolveCustomerOperationsScope(userId, input.customerId, input.teamId)).scope;
  }
  const items = await prisma.crmConversation.findMany({
    where: {
      companyId: scope.companyId,
      teamId: scope.teamId,
      ...(input.customerId ? { customerId: input.customerId } : {}),
      ...(input.channel ? { channel: input.channel } : {}),
      ...dateRange(input, "startedAt"),
      ...scopedOwnerFilter(scope)
    },
    select: {
      id: true,
      customerId: true,
      contactId: true,
      opportunityId: true,
      userId: true,
      channel: true,
      direction: true,
      title: true,
      content: true,
      transcript: true,
      summary: true,
      startedAt: true,
      endedAt: true,
      durationSeconds: true,
      mediaUrls: true,
      consentRecorded: true,
      createdAt: true,
      customer: { select: { name: true } },
      qualityInspections: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          score: true,
          validCall: true,
          sensitiveWords: true,
          createdAt: true
        }
      }
    },
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {})
  });
  return { scope, ...pageResult(items, input.limit) };
}

export async function createCrmConversationForUser(
  userId: string,
  input: CreateConversationInput
) {
  const { scope } = await resolveCustomerOperationsScope(userId, input.customerId, input.teamId);
  await assertConversationReferences(input, scope);
  if (input.externalId) {
    const duplicate = await prisma.crmConversation.findUnique({
      where: {
        companyId_channel_externalId: {
          companyId: scope.companyId,
          channel: input.channel,
          externalId: input.externalId
        }
      },
      select: { id: true }
    });
    if (duplicate) {
      throw new ValidationError("该外部沟通记录已导入，请勿重复提交。");
    }
  }
  return prisma.crmConversation.create({
    data: {
      companyId: scope.companyId,
      teamId: scope.teamId,
      customerId: input.customerId,
      contactId: input.contactId,
      opportunityId: input.opportunityId,
      userId,
      integrationSourceId: input.integrationSourceId,
      channel: input.channel,
      direction: input.direction,
      externalId: input.externalId,
      title: input.title,
      content: input.content,
      transcript: input.transcript,
      summary: input.summary,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      durationSeconds: input.durationSeconds,
      mediaUrls: input.mediaUrls,
      metadata: inputJson(input.metadata),
      consentRecorded: true
    },
    select: {
      id: true,
      companyId: true,
      teamId: true,
      customerId: true,
      userId: true,
      channel: true,
      direction: true,
      title: true,
      startedAt: true,
      durationSeconds: true,
      consentRecorded: true,
      createdAt: true
    }
  });
}

export async function inspectCrmConversationForUser(userId: string, conversationId: string) {
  const conversation = await prisma.crmConversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      companyId: true,
      teamId: true,
      customerId: true,
      userId: true,
      content: true,
      transcript: true,
      summary: true,
      durationSeconds: true,
      consentRecorded: true
    }
  });
  if (!conversation) {
    throw new NotFoundError("沟通记录不存在或当前账号无权访问。");
  }
  const { scope } = await resolveCustomerOperationsScope(userId, conversation.customerId);
  if (conversation.companyId !== scope.companyId || conversation.teamId !== scope.teamId) {
    throw new NotFoundError("沟通记录不存在或当前账号无权访问。");
  }
  if (scope.viewMode === "OWN" && conversation.userId !== userId) {
    throw new NotFoundError("沟通记录不存在或当前账号无权访问。");
  }
  if (!conversation.consentRecorded) {
    throw new ForbiddenError("该沟通记录未确认数据处理授权，不能执行质检。");
  }
  if (![conversation.content, conversation.transcript, conversation.summary].some((value) => value.trim())) {
    throw new ValidationError("沟通记录没有可用于质检的文本内容。");
  }

  const inspection = inspectConversationDeterministically(conversation);
  return prisma.crmQualityInspection.create({
    data: {
      companyId: scope.companyId,
      teamId: scope.teamId,
      conversationId: conversation.id,
      customerId: conversation.customerId,
      userId: conversation.userId,
      inspectedById: userId,
      status: "COMPLETED",
      score: inspection.score,
      validCall: inspection.validCall,
      matchedRules: inputJson(inspection.matchedRules),
      needs: inspection.needs,
      objections: inspection.objections,
      priceRequests: inspection.priceRequests,
      sensitiveWords: inspection.sensitiveWords,
      issues: inputJson(inspection.issues),
      unresolvedQuestions: inspection.unresolvedQuestions,
      suggestions: inspection.suggestions
    },
    select: {
      id: true,
      conversationId: true,
      status: true,
      score: true,
      validCall: true,
      matchedRules: true,
      needs: true,
      objections: true,
      priceRequests: true,
      sensitiveWords: true,
      issues: true,
      unresolvedQuestions: true,
      suggestions: true,
      createdAt: true
    }
  });
}

export async function listCrmDailyPlansForUser(
  userId: string,
  input: CrmOperationsListInput
) {
  const scope = await resolveCrmOperationsScope(userId, input.teamId);
  const items = await prisma.crmDailyPlan.findMany({
    where: {
      companyId: scope.companyId,
      teamId: scope.teamId,
      ...dateRange(input, "planDate"),
      ...scopedOwnerFilter(scope)
    },
    orderBy: [{ planDate: "desc" }, { id: "desc" }],
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {})
  });
  return { scope, ...pageResult(items, input.limit) };
}

export async function upsertCrmDailyPlanForUser(
  userId: string,
  input: CreateDailyPlanInput
) {
  const scope = await resolveCrmOperationsScope(userId, input.teamId);
  await assertCustomerIdsAccessible(scope, input.keyCustomerIds);
  const planDate = asDateOnly(input.planDate);
  const submittedAt = ["SUBMITTED", "COMPLETED"].includes(input.status) ? new Date() : null;
  return prisma.crmDailyPlan.upsert({
    where: {
      companyId_userId_planDate: {
        companyId: scope.companyId,
        userId,
        planDate
      }
    },
    create: {
      companyId: scope.companyId,
      teamId: scope.teamId,
      userId,
      planDate,
      status: input.status,
      goals: inputJson(input.goals),
      keyCustomerIds: input.keyCustomerIds,
      actionItems: inputJson(input.actionItems),
      completedSummary: input.completedSummary,
      submittedAt
    },
    update: {
      teamId: scope.teamId,
      status: input.status,
      goals: inputJson(input.goals),
      keyCustomerIds: input.keyCustomerIds,
      actionItems: inputJson(input.actionItems),
      completedSummary: input.completedSummary,
      submittedAt
    }
  });
}

export async function listCrmSalesTargetsForUser(
  userId: string,
  input: CrmOperationsListInput
) {
  const scope = await resolveCrmOperationsScope(userId, input.teamId);
  const items = await prisma.crmSalesTarget.findMany({
    where: {
      companyId: scope.companyId,
      teamId: scope.teamId,
      ...(scope.viewMode === "OWN" ? { userId } : {}),
      ...(input.from ? { periodEnd: { gte: input.from } } : {}),
      ...(input.to ? { periodStart: { lte: input.to } } : {})
    },
    include: {
      user: { select: { id: true, name: true, phone: true } }
    },
    orderBy: [{ periodStart: "desc" }, { id: "desc" }],
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {})
  });
  return { scope, ...pageResult(items, input.limit) };
}

export async function createCrmSalesTargetForUser(
  userId: string,
  input: CreateSalesTargetInput
) {
  const scope = await resolveCrmOperationsScope(userId, input.teamId);
  let targetUserId = input.targetUserId;
  if (scope.viewMode === "OWN") {
    if (targetUserId && targetUserId !== userId) {
      throw new ForbiddenError("员工只能创建自己的销售目标。");
    }
    targetUserId = userId;
  } else if (targetUserId) {
    await assertActiveTargetMember(scope, targetUserId);
  }
  return prisma.crmSalesTarget.create({
    data: {
      companyId: scope.companyId,
      teamId: scope.teamId,
      userId: targetUserId,
      createdById: userId,
      metric: input.metric,
      periodStart: asDateOnly(input.periodStart),
      periodEnd: asDateOnly(input.periodEnd),
      targetValue: input.targetValue,
      status: input.status
    }
  });
}

export async function listCrmIntegrationsForUser(
  userId: string,
  input: CrmOperationsListInput
) {
  const scope = await resolveCrmOperationsScope(userId, input.teamId);
  assertCrmManagementRole(scope, "查看 CRM 集成来源");
  const items = await prisma.crmIntegrationSource.findMany({
    where: {
      companyId: scope.companyId,
      OR: [{ teamId: scope.teamId }, { teamId: null }],
      ...(input.channel ? { channel: input.channel } : {})
    },
    select: {
      id: true,
      teamId: true,
      channel: true,
      name: true,
      status: true,
      externalTenantId: true,
      config: true,
      lastSyncAt: true,
      createdAt: true,
      updatedAt: true
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {})
  });
  return { scope, ...pageResult(items, input.limit) };
}

export async function createCrmIntegrationForUser(
  userId: string,
  input: CreateIntegrationInput
) {
  const scope = await resolveCrmOperationsScope(userId, input.teamId);
  assertCrmManagementRole(scope, "配置 CRM 集成来源");
  return prisma.crmIntegrationSource.create({
    data: {
      companyId: scope.companyId,
      teamId: scope.teamId,
      createdById: userId,
      channel: input.channel,
      name: input.name,
      status: input.status,
      externalTenantId: input.externalTenantId,
      config: inputJson(input.config)
    },
    select: {
      id: true,
      companyId: true,
      teamId: true,
      channel: true,
      name: true,
      status: true,
      externalTenantId: true,
      config: true,
      createdAt: true
    }
  });
}

export async function listCrmVisitsForUser(
  userId: string,
  input: CrmOperationsListInput
) {
  let scope = await resolveCrmOperationsScope(userId, input.teamId);
  if (input.customerId) {
    scope = (await resolveCustomerOperationsScope(userId, input.customerId, input.teamId)).scope;
  }
  const items = await prisma.crmVisitPlan.findMany({
    where: {
      companyId: scope.companyId,
      teamId: scope.teamId,
      ...(input.customerId ? { customerId: input.customerId } : {}),
      ...dateRange(input, "plannedStart"),
      ...scopedOwnerFilter(scope, "ownerId")
    },
    include: {
      customer: { select: { id: true, name: true } },
      contact: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true, phone: true } }
    },
    orderBy: [{ plannedStart: "desc" }, { id: "desc" }],
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {})
  });
  return { scope, ...pageResult(items, input.limit) };
}

export async function createCrmVisitForUser(userId: string, input: CreateVisitInput) {
  const { scope } = await resolveCustomerOperationsScope(userId, input.customerId, input.teamId);
  if (input.contactId) {
    const contact = await prisma.crmContact.findFirst({
      where: {
        id: input.contactId,
        companyId: scope.companyId,
        customerId: input.customerId,
        OR: [{ teamId: scope.teamId }, { teamId: null }]
      },
      select: { id: true }
    });
    if (!contact) {
      throw new ValidationError("联系人不存在、与客户不匹配或无权访问。");
    }
  }
  return prisma.crmVisitPlan.create({
    data: {
      companyId: scope.companyId,
      teamId: scope.teamId,
      customerId: input.customerId,
      contactId: input.contactId,
      ownerId: userId,
      title: input.title,
      purpose: input.purpose,
      plannedStart: input.plannedStart,
      plannedEnd: input.plannedEnd,
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
      status: "PLANNED"
    }
  });
}

const VISIT_TRANSITIONS: Record<CrmVisitStatus, readonly CrmVisitStatus[]> = {
  PLANNED: ["PLANNED", "IN_PROGRESS", "CANCELLED", "MISSED"],
  IN_PROGRESS: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
  COMPLETED: ["COMPLETED"],
  CANCELLED: ["CANCELLED"],
  MISSED: ["MISSED"]
};

export async function updateCrmVisitStatusForUser(
  userId: string,
  input: UpdateVisitStatusInput
) {
  const visit = await prisma.crmVisitPlan.findUnique({
    where: { id: input.id },
    select: {
      id: true,
      customerId: true,
      companyId: true,
      teamId: true,
      ownerId: true,
      status: true,
      actualStart: true
    }
  });
  if (!visit) {
    throw new NotFoundError("拜访计划不存在或当前账号无权访问。");
  }
  const { scope } = await resolveCustomerOperationsScope(userId, visit.customerId);
  if (
    visit.companyId !== scope.companyId ||
    visit.teamId !== scope.teamId ||
    (scope.viewMode === "OWN" && visit.ownerId !== userId)
  ) {
    throw new NotFoundError("拜访计划不存在或当前账号无权访问。");
  }
  if (!VISIT_TRANSITIONS[visit.status].includes(input.status)) {
    throw new ValidationError(`拜访状态不能从 ${visit.status} 变更为 ${input.status}。`);
  }
  const actualStart = input.actualStart ??
    (input.status === "IN_PROGRESS" ? visit.actualStart ?? new Date() : visit.actualStart);
  const actualEnd = input.actualEnd ??
    (input.status === "COMPLETED" ? new Date() : undefined);
  if (actualStart && actualEnd && actualEnd < actualStart) {
    throw new ValidationError("实际结束时间不能早于实际开始时间。");
  }
  return prisma.crmVisitPlan.update({
    where: { id: visit.id },
    data: {
      status: input.status,
      ...(actualStart ? { actualStart } : {}),
      ...(actualEnd ? { actualEnd } : {}),
      ...(input.signInAt ? { signInAt: input.signInAt } : {}),
      ...(input.signInLocation !== undefined ? { signInLocation: input.signInLocation } : {}),
      ...(input.result !== undefined ? { result: input.result } : {}),
      ...(input.nextAction !== undefined ? { nextAction: input.nextAction } : {})
    }
  });
}

export async function getCrmOperationsDashboardForUser(
  userId: string,
  input: CrmOperationsListInput
) {
  const scope = await resolveCrmOperationsScope(userId, input.teamId);
  const now = new Date();
  const today = asDateOnly(now);
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const ownerConversation = scopedOwnerFilter(scope);
  const ownerVisit = scopedOwnerFilter(scope, "ownerId");
  const customerOwner = scope.viewMode === "OWN" ? { customer: { ownerId: userId } } : {};
  const [conversationCount, quality, dailyPlan, visits, targets, riskScores] = await Promise.all([
    prisma.crmConversation.count({
      where: {
        companyId: scope.companyId,
        teamId: scope.teamId,
        startedAt: { gte: input.from ?? today, lte: input.to ?? now },
        ...ownerConversation
      }
    }),
    prisma.crmQualityInspection.aggregate({
      where: {
        companyId: scope.companyId,
        teamId: scope.teamId,
        createdAt: { gte: input.from ?? today, lte: input.to ?? now },
        ...ownerConversation
      },
      _count: { _all: true },
      _avg: { score: true }
    }),
    prisma.crmDailyPlan.findUnique({
      where: {
        companyId_userId_planDate: {
          companyId: scope.companyId,
          userId,
          planDate: today
        }
      }
    }),
    prisma.crmVisitPlan.groupBy({
      by: ["status"],
      where: {
        companyId: scope.companyId,
        teamId: scope.teamId,
        plannedStart: { gte: input.from ?? today, lt: input.to ?? tomorrow },
        ...ownerVisit
      },
      _count: { _all: true }
    }),
    prisma.crmSalesTarget.findMany({
      where: {
        companyId: scope.companyId,
        teamId: scope.teamId,
        status: "ACTIVE",
        periodStart: { lte: today },
        periodEnd: { gte: today },
        ...(scope.viewMode === "OWN" ? { userId } : {})
      },
      orderBy: [{ metric: "asc" }, { createdAt: "desc" }],
      take: 30
    }),
    prisma.crmCustomerScore.findMany({
      where: {
        companyId: scope.companyId,
        teamId: scope.teamId,
        OR: [{ validUntil: null }, { validUntil: { gte: now } }],
        ...customerOwner
      },
      distinct: ["customerId"],
      orderBy: [{ customerId: "asc" }, { createdAt: "desc" }],
      select: { riskLevel: true }
    })
  ]);

  return {
    scope,
    period: {
      from: (input.from ?? today).toISOString(),
      to: (input.to ?? now).toISOString()
    },
    conversationCount,
    quality: {
      inspectedCount: quality._count._all,
      averageScore: quality._avg.score ?? null
    },
    dailyPlan,
    visits: Object.fromEntries(visits.map((item) => [item.status, item._count._all])),
    targets,
    customerRisk: riskScores.reduce<Record<string, number>>((result, item) => {
      result[item.riskLevel] = (result[item.riskLevel] ?? 0) + 1;
      return result;
    }, {})
  };
}
