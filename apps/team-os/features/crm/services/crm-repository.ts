import "server-only";

import {
  Prisma,
  type CustomerAIProfile,
  type CustomerFollowUp
} from "@prisma/client";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import {
  authorizeCustomerAccess,
  crmDisplayName,
  resolveCrmListContext
} from "@/apps/team-os/features/crm/services/crm-access";
import type {
  CreateCustomerFollowUpInput,
  CreateCustomerInput,
  CreateCustomerResult,
  CustomerAIProfileRecord,
  CustomerDetailData,
  CustomerFollowUpRecord,
  CustomerListData,
  CustomerListFilters
} from "@/apps/team-os/features/crm/types";
import type {
  CustomerAiCustomer,
  CustomerAiFollowUp,
  CustomerAnalysisResult,
  FollowUpSuggestionResult
} from "@/apps/team-os/services/customer-ai";

function serializeProfile(profile: CustomerAIProfile): CustomerAIProfileRecord {
  return {
    id: profile.id,
    customerId: profile.customerId,
    intent: profile.intent,
    painPoints: profile.painPoints,
    riskLevel: profile.riskLevel,
    purchaseProbability: profile.purchaseProbability,
    nextAction: profile.nextAction,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString()
  };
}

function parseStoredFollowUpSuggestion(value: string): FollowUpSuggestionResult | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (
      record.schemaVersion !== 1 ||
      typeof record.suggestion !== "string" ||
      !record.suggestion.trim() ||
      typeof record.recommendedScript !== "string" ||
      !record.recommendedScript.trim()
    ) {
      return null;
    }
    return {
      suggestion: record.suggestion,
      recommendedScript: record.recommendedScript
    };
  } catch {
    return null;
  }
}

function serializeFollowUp(
  followUp: CustomerFollowUp,
  userName: string
): CustomerFollowUpRecord {
  const storedSuggestion = parseStoredFollowUpSuggestion(followUp.aiSuggestion);
  return {
    id: followUp.id,
    customerId: followUp.customerId,
    userId: followUp.userId,
    userName,
    content: followUp.content,
    summary: followUp.summary,
    nextPlan: followUp.nextPlan,
    type: followUp.type,
    ...(storedSuggestion
      ? {
          aiSuggestion: storedSuggestion.suggestion,
          aiRecommendedScript: storedSuggestion.recommendedScript
        }
      : followUp.aiSuggestion
        ? { aiSuggestion: followUp.aiSuggestion }
        : {}),
    createdAt: followUp.createdAt.toISOString()
  };
}

interface CustomerPageCursor {
  id: string;
  updatedAt: Date;
}

function decodeCustomerPageCursor(value: string): CustomerPageCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid cursor object");
    }
    const record = parsed as Record<string, unknown>;
    if (typeof record.id !== "string" || !record.id || typeof record.updatedAt !== "string") {
      throw new Error("invalid cursor fields");
    }
    const updatedAt = new Date(record.updatedAt);
    if (!Number.isFinite(updatedAt.getTime())) {
      throw new Error("invalid cursor timestamp");
    }
    return { id: record.id, updatedAt };
  } catch {
    throw new ValidationError("分页游标已失效，请重新加载客户列表。");
  }
}

function encodeCustomerPageCursor(customer: { id: string; updatedAt: Date }) {
  return Buffer.from(JSON.stringify({
    id: customer.id,
    updatedAt: customer.updatedAt.toISOString()
  })).toString("base64url");
}

async function loadAuthorizedCustomerIdentity(userId: string, customerId: string) {
  const customer = await prisma.customer.findFirst({
    where: {
      id: customerId,
      team: { status: "ACTIVE" }
    },
    select: {
      id: true,
      companyId: true,
      teamId: true,
      ownerId: true
    }
  });
  if (!customer) {
    throw new NotFoundError("客户不存在或当前账号无权访问。");
  }
  const authority = await authorizeCustomerAccess(userId, customer);
  return { customer, authority };
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
      if (known?.code === "P2034" && attempt < 2) {
        continue;
      }
      if (known?.code === "P2034") {
        throw new ValidationError("客户数据已发生变化，请重新提交。");
      }
      throw error;
    }
  }
  throw new ValidationError("客户数据已发生变化，请重新提交。");
}

async function assertCustomerAuthorityInTransaction(
  transaction: Prisma.TransactionClient,
  userId: string,
  customer: {
    companyId: string;
    teamId: string;
    ownerId: string;
  }
) {
  const memberships = await transaction.teamMember.findMany({
    where: {
      userId,
      status: "ACTIVE",
      team: {
        status: "ACTIVE",
        OR: [
          { id: customer.teamId },
          { companyId: customer.companyId }
        ]
      }
    },
    select: {
      role: true,
      team: {
        select: {
          id: true,
          companyId: true
        }
      }
    }
  });
  const isOwner = memberships.some((membership) => (
    membership.role === "TEAM_OWNER" &&
    membership.team.companyId === customer.companyId
  ));
  const direct = memberships.find((membership) => membership.team.id === customer.teamId);
  const allowed = isOwner ||
    direct?.role === "TEAM_MANAGER" ||
    (direct?.role === "TEAM_MEMBER" && customer.ownerId === userId);
  if (!allowed) {
    throw new NotFoundError("客户不存在或当前账号无权访问。");
  }
}

export async function listCustomersForUser(
  userId: string,
  filters: CustomerListFilters
): Promise<CustomerListData> {
  const access = await resolveCrmListContext(userId, filters.companyId, filters.teamId);
  const scopeWhere: Prisma.CustomerWhereInput = {
    companyId: access.context.companyId,
    teamId: access.selectedTeam.id,
    ...(access.viewMode === "OWN" ? { ownerId: userId } : {})
  };
  const filteredWhere: Prisma.CustomerWhereInput = {
    ...scopeWhere,
    ...(filters.stage ? { stage: filters.stage } : {}),
    ...(filters.level ? { level: filters.level } : {}),
    ...(filters.tag ? { tags: { has: filters.tag } } : {}),
    ...(filters.search ? {
      OR: [
        { name: { contains: filters.search, mode: "insensitive" } },
        { phone: { contains: filters.search, mode: "insensitive" } },
        { wechat: { contains: filters.search, mode: "insensitive" } },
        { source: { contains: filters.search, mode: "insensitive" } }
      ]
    } : {})
  };
  const cursor = filters.cursor ? decodeCustomerPageCursor(filters.cursor) : null;
  const pageWhere: Prisma.CustomerWhereInput = cursor
    ? {
        AND: [
          filteredWhere,
          {
            OR: [
              { updatedAt: { lt: cursor.updatedAt } },
              { updatedAt: cursor.updatedAt, id: { lt: cursor.id } }
            ]
          }
        ]
      }
    : filteredWhere;

  const [rows, total, facetRows] = await Promise.all([
    prisma.customer.findMany({
      where: pageWhere,
      select: {
        id: true,
        name: true,
        teamId: true,
        ownerId: true,
        source: true,
        tags: true,
        stage: true,
        level: true,
        updatedAt: true,
        team: { select: { name: true } },
        followUps: {
          select: { createdAt: true },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1
        }
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: filters.limit + 1
    }),
    prisma.customer.count({ where: filteredWhere }),
    prisma.customer.findMany({
      where: scopeWhere,
      select: { tags: true },
      orderBy: { updatedAt: "desc" },
      take: 1_000
    })
  ]);
  const visibleRows = rows.slice(0, filters.limit);
  const ownerIds = Array.from(new Set(visibleRows.map((row) => row.ownerId)));
  const owners = ownerIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: ownerIds } },
        select: { id: true, name: true, email: true, phone: true }
      })
    : [];
  const ownerById = new Map(owners.map((owner) => [owner.id, owner]));

  return {
    context: access.context,
    items: visibleRows.map((row) => {
      const owner = ownerById.get(row.ownerId);
      return {
        id: row.id,
        name: row.name,
        teamId: row.teamId,
        teamName: row.team.name,
        ownerId: row.ownerId,
        ownerName: owner ? crmDisplayName(owner) : row.ownerId,
        source: row.source,
        tags: row.tags,
        stage: row.stage,
        level: row.level,
        ...(row.followUps[0] ? { lastFollowUpAt: row.followUps[0].createdAt.toISOString() } : {}),
        updatedAt: row.updatedAt.toISOString()
      };
    }),
    facets: {
      tags: Array.from(new Set(facetRows.flatMap((row) => row.tags))).sort().slice(0, 100)
    },
    total,
    ...(rows.length > filters.limit && visibleRows.length > 0
      ? { nextCursor: encodeCustomerPageCursor(visibleRows[visibleRows.length - 1]) }
      : {})
  };
}

export async function createCustomerForUser(
  userId: string,
  input: CreateCustomerInput
): Promise<CreateCustomerResult> {
  return runSerializableTransaction(async (transaction) => {
    const team = await transaction.teamOrganization.findUnique({
      where: { id: input.teamId },
      select: { id: true, companyId: true, status: true }
    });
    if (!team || team.status !== "ACTIVE") {
      throw new ForbiddenError("所选团队不存在或已停用。");
    }

    const [directMembership, ownerAuthority] = await Promise.all([
      transaction.teamMember.findUnique({
        where: { teamId_userId: { teamId: team.id, userId } },
        select: { role: true, status: true }
      }),
      transaction.teamMember.findFirst({
        where: {
          userId,
          role: "TEAM_OWNER",
          status: "ACTIVE",
          team: {
            companyId: team.companyId,
            status: "ACTIVE"
          }
        },
        select: { id: true }
      })
    ]);
    const directRole = directMembership?.status === "ACTIVE" ? directMembership.role : null;
    const canAssign = Boolean(ownerAuthority || directRole === "TEAM_OWNER" || directRole === "TEAM_MANAGER");
    const canCreateOwn = directRole === "TEAM_MEMBER";
    if (!canAssign && !canCreateOwn) {
      throw new ForbiddenError("当前账号无权在该团队创建客户。");
    }

    const ownerId = canAssign ? input.ownerId ?? userId : userId;
    const [ownerMembership, ownerUser] = await Promise.all([
      transaction.teamMember.findUnique({
        where: { teamId_userId: { teamId: team.id, userId: ownerId } },
        select: { role: true, status: true }
      }),
      transaction.user.findUnique({
        where: { id: ownerId },
        select: { isActive: true }
      })
    ]);
    if (
      !ownerMembership ||
      ownerMembership.status !== "ACTIVE" ||
      ownerMembership.role === "TRAINER" ||
      !ownerUser?.isActive
    ) {
      throw new ValidationError("客户负责人必须是该团队的有效 CRM 成员。");
    }

    const customer = await transaction.customer.create({
      data: {
        companyId: team.companyId,
        teamId: team.id,
        ownerId,
        name: input.name,
        phone: input.phone,
        wechat: input.wechat,
        source: input.source,
        tags: input.tags,
        notes: input.notes
      },
      select: { id: true }
    });
    return { customerId: customer.id };
  });
}

export async function getCustomerDetailForUser(
  userId: string,
  customerId: string
): Promise<CustomerDetailData> {
  const { customer: identity } = await loadAuthorizedCustomerIdentity(userId, customerId);
  const customer = await prisma.customer.findFirst({
    where: {
      id: identity.id,
      companyId: identity.companyId,
      teamId: identity.teamId,
      ownerId: identity.ownerId,
      team: { status: "ACTIVE" }
    },
    include: {
      team: { select: { name: true } },
      followUps: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 101
      },
      aiProfile: true
    }
  });
  if (!customer) {
    throw new NotFoundError("客户不存在或当前账号无权访问。");
  }

  const visibleFollowUps = customer.followUps.slice(0, 100);
  const relatedUserIds = Array.from(new Set([
    customer.ownerId,
    ...visibleFollowUps.map((followUp) => followUp.userId)
  ]));
  const users = await prisma.user.findMany({
    where: { id: { in: relatedUserIds } },
    select: { id: true, name: true, email: true, phone: true }
  });
  const userById = new Map(users.map((user) => [user.id, user]));
  const owner = userById.get(customer.ownerId);
  const lastFollowUpAt = visibleFollowUps[0]?.createdAt.toISOString();

  return {
    customer: {
      id: customer.id,
      companyId: customer.companyId,
      teamId: customer.teamId,
      teamName: customer.team.name,
      ownerId: customer.ownerId,
      ownerName: owner ? crmDisplayName(owner) : customer.ownerId,
      name: customer.name,
      ...(customer.phone ? { phone: customer.phone } : {}),
      ...(customer.wechat ? { wechat: customer.wechat } : {}),
      source: customer.source,
      tags: customer.tags,
      stage: customer.stage,
      level: customer.level,
      notes: customer.notes,
      ...(lastFollowUpAt ? { lastFollowUpAt } : {}),
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString()
    },
    followUps: visibleFollowUps.map((followUp) => {
      const actor = userById.get(followUp.userId);
      return serializeFollowUp(
        followUp,
        actor ? crmDisplayName(actor) : followUp.userId
      );
    }),
    ...(customer.aiProfile ? { aiProfile: serializeProfile(customer.aiProfile) } : {}),
    followUpsTruncated: customer.followUps.length > visibleFollowUps.length,
    permissions: {
      canAddFollowUp: true,
      canAnalyze: visibleFollowUps.length > 0
    }
  };
}

export async function createCustomerFollowUp(
  userId: string,
  input: CreateCustomerFollowUpInput
): Promise<CustomerFollowUpRecord> {
  const followUp = await runSerializableTransaction(async (transaction) => {
    const customer = await transaction.customer.findFirst({
      where: {
        id: input.customerId,
        team: { status: "ACTIVE" }
      },
      select: {
        id: true,
        companyId: true,
        teamId: true,
        ownerId: true
      }
    });
    if (!customer) {
      throw new NotFoundError("客户不存在或当前账号无权访问。");
    }
    await assertCustomerAuthorityInTransaction(transaction, userId, customer);

    const created = await transaction.customerFollowUp.create({
      data: {
        customerId: customer.id,
        userId,
        content: input.content,
        summary: input.summary,
        nextPlan: input.nextPlan,
        type: input.type
      }
    });
    await transaction.customer.update({
      where: { id: customer.id },
      data: { updatedAt: new Date() }
    });
    return created;
  });
  const actor = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, phone: true }
  });
  return serializeFollowUp(followUp, actor ? crmDisplayName(actor) : userId);
}

function compactAiText(value: string, maxLength: number) {
  if (maxLength <= 0) {
    return "";
  }
  const trimmed = value.trim();
  return trimmed.length <= maxLength ? trimmed : trimmed.slice(0, maxLength) + "…";
}

function maskCustomerName(value: string) {
  const characters = Array.from(value.trim());
  return characters.length > 0 ? characters[0] + "**" : "客户";
}

export interface LoadedCustomerAnalysisContext {
  customerId: string;
  companyId: string;
  teamId: string;
  ownerId: string;
  knowledgeAuthorizationTeamId: string;
  customer: CustomerAiCustomer;
  followUps: CustomerAiFollowUp[];
  expectedCustomerUpdatedAt: string;
  expectedLatestFollowUpId?: string;
  expectedProfileUpdatedAt?: string;
}

export async function loadCustomerAnalysisContext(
  userId: string,
  customerId: string
): Promise<LoadedCustomerAnalysisContext> {
  const { customer: identity, authority } = await loadAuthorizedCustomerIdentity(userId, customerId);
  const customer = await prisma.customer.findFirst({
    where: {
      id: identity.id,
      companyId: identity.companyId,
      teamId: identity.teamId,
      ownerId: identity.ownerId,
      team: { status: "ACTIVE" }
    },
    select: {
      id: true,
      companyId: true,
      teamId: true,
      ownerId: true,
      name: true,
      stage: true,
      level: true,
      source: true,
      tags: true,
      notes: true,
      updatedAt: true,
      aiProfile: {
        select: { updatedAt: true }
      },
      followUps: {
        select: {
          id: true,
          type: true,
          content: true,
          summary: true,
          nextPlan: true,
          createdAt: true
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 30
      }
    }
  });
  if (!customer) {
    throw new NotFoundError("客户不存在或当前账号无权访问。");
  }
  if (customer.followUps.length === 0) {
    throw new ValidationError("请先添加至少一条客户跟进记录，再生成 AI 客户画像。");
  }
  let remainingCharacters = 30_000;
  const followUps: CustomerAiFollowUp[] = [];
  for (const followUp of customer.followUps) {
    if (remainingCharacters <= 0) break;
    const content = compactAiText(followUp.content, Math.min(6_000, remainingCharacters));
    remainingCharacters -= content.length;
    const summary = compactAiText(followUp.summary, Math.min(2_000, Math.max(0, remainingCharacters)));
    remainingCharacters -= summary.length;
    const nextPlan = compactAiText(followUp.nextPlan, Math.min(2_000, Math.max(0, remainingCharacters)));
    remainingCharacters -= nextPlan.length;
    followUps.push({
      type: followUp.type,
      content,
      summary,
      nextPlan,
      createdAt: followUp.createdAt.toISOString()
    });
  }

  return {
    customerId: customer.id,
    companyId: customer.companyId,
    teamId: customer.teamId,
    ownerId: customer.ownerId,
    knowledgeAuthorizationTeamId: authority.knowledgeAuthorizationTeamId,
    customer: {
      id: customer.id,
      name: maskCustomerName(customer.name),
      stage: customer.stage,
      level: customer.level,
      source: compactAiText(customer.source, 120),
      tags: customer.tags.slice(0, 20),
      notes: compactAiText(customer.notes, 4_000)
    },
    followUps,
    expectedCustomerUpdatedAt: customer.updatedAt.toISOString(),
    ...(customer.followUps[0] ? { expectedLatestFollowUpId: customer.followUps[0].id } : {}),
    ...(customer.aiProfile
      ? { expectedProfileUpdatedAt: customer.aiProfile.updatedAt.toISOString() }
      : {})
  };
}

export async function saveCustomerAnalysis(input: {
  userId: string;
  context: LoadedCustomerAnalysisContext;
  profile: CustomerAnalysisResult;
  suggestion: FollowUpSuggestionResult;
}): Promise<CustomerAIProfileRecord> {
  const profile = await runSerializableTransaction(async (transaction) => {
    const lockKey = `team-os:crm-analysis:${input.context.customerId}`;
    await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
    const customer = await transaction.customer.findFirst({
      where: {
        id: input.context.customerId,
        companyId: input.context.companyId,
        teamId: input.context.teamId,
        ownerId: input.context.ownerId,
        team: { status: "ACTIVE" }
      },
      select: {
        id: true,
        companyId: true,
        teamId: true,
        ownerId: true,
        updatedAt: true,
        followUps: {
          select: { id: true },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1
        },
        aiProfile: {
          select: { updatedAt: true }
        }
      }
    });
    if (!customer) {
      throw new NotFoundError("客户不存在或当前账号无权访问。");
    }
    await assertCustomerAuthorityInTransaction(transaction, input.userId, customer);
    if (customer.updatedAt.toISOString() !== input.context.expectedCustomerUpdatedAt) {
      throw new ValidationError("客户资料已被更新，请重新生成最新分析。");
    }
    const latestFollowUpId = customer.followUps[0]?.id;
    if (latestFollowUpId !== input.context.expectedLatestFollowUpId) {
      throw new ValidationError("分析期间产生了新的跟进记录，请重新生成客户画像。");
    }
    const profileUpdatedAt = customer.aiProfile?.updatedAt.toISOString();
    if (profileUpdatedAt !== input.context.expectedProfileUpdatedAt) {
      throw new ValidationError("客户画像已被更新，请重新生成最新分析。");
    }

    const saved = await transaction.customerAIProfile.upsert({
      where: { customerId: customer.id },
      create: {
        customerId: customer.id,
        intent: input.profile.intent,
        painPoints: input.profile.painPoints,
        riskLevel: input.profile.riskLevel,
        purchaseProbability: input.profile.purchaseProbability,
        nextAction: input.profile.nextAction
      },
      update: {
        intent: input.profile.intent,
        painPoints: input.profile.painPoints,
        riskLevel: input.profile.riskLevel,
        purchaseProbability: input.profile.purchaseProbability,
        nextAction: input.profile.nextAction
      }
    });
    if (latestFollowUpId) {
      await transaction.customerFollowUp.update({
        where: { id: latestFollowUpId },
        data: {
          aiSuggestion: JSON.stringify({
            schemaVersion: 1,
            suggestion: input.suggestion.suggestion,
            recommendedScript: input.suggestion.recommendedScript
          })
        }
      });
    }
    return saved;
  });

  return serializeProfile(profile);
}
