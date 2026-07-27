import "server-only";

import {
  Prisma,
  type CrmContract,
  type CrmLead,
  type CrmOpportunity,
  type CrmReceivable
} from "@prisma/client";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import {
  assertRecordInCrmSalesScope,
  assertVisibleTeamFilter,
  crmSalesScopeWhere,
  resolveCrmSalesAssignment,
  resolveCrmSalesScope
} from "@/apps/team-os/features/crm/sales/access";
import {
  assertCrmLeadTransition,
  assertCrmOpportunityStageTransition
} from "@/apps/team-os/features/crm/sales/input";
import {
  CRM_CONTRACT_STATUSES,
  CRM_LEAD_STATUSES,
  CRM_OPPORTUNITY_STAGES,
  CRM_RECEIVABLE_STATUSES,
  type ChangeCrmOpportunityStageInput,
  type ChangeCrmContractStatusInput,
  type ConvertCrmLeadInput,
  type CreateCrmContractInput,
  type CreateCrmLeadInput,
  type CreateCrmOpportunityInput,
  type CreateCrmReceivableInput,
  type CrmContractListFilters,
  type CrmDashboardData,
  type CrmLeadListFilters,
  type CrmListResult,
  type CrmOpportunityListFilters,
  type CrmReceivableListFilters,
  type CrmSalesActor,
  type CrmSalesAuditContext,
  type CrmSalesScope,
  type RecordCrmPaymentInput,
  type UpdateCrmLeadInput
} from "@/apps/team-os/features/crm/sales/types";

type Transaction = Prisma.TransactionClient;

interface PageCursor {
  id: string;
  updatedAt: Date;
}

function money(value: Prisma.Decimal | null | undefined) {
  return value?.toFixed(2) ?? "0.00";
}

function date(value: Date | null | undefined) {
  return value?.toISOString();
}

function displayUser(user: {
  id: string;
  name: string | null;
  email: string | null;
  phone: string;
} | null) {
  if (!user) return undefined;
  return {
    id: user.id,
    name: user.name?.trim() || user.email?.trim() || user.phone || user.id
  };
}

function decodeCursor(value: string): PageCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid cursor");
    }
    const cursor = parsed as Record<string, unknown>;
    if (typeof cursor.id !== "string" || typeof cursor.updatedAt !== "string") {
      throw new Error("invalid cursor");
    }
    const updatedAt = new Date(cursor.updatedAt);
    if (!cursor.id || !Number.isFinite(updatedAt.getTime())) {
      throw new Error("invalid cursor");
    }
    return { id: cursor.id, updatedAt };
  } catch {
    throw new ValidationError("分页游标已失效，请重新加载。");
  }
}

function encodeCursor(value: { id: string; updatedAt: Date }) {
  return Buffer.from(JSON.stringify({
    id: value.id,
    updatedAt: value.updatedAt.toISOString()
  })).toString("base64url");
}

async function runSerializable<T>(operation: (transaction: Transaction) => Promise<T>) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      });
    } catch (error) {
      const known = error instanceof Prisma.PrismaClientKnownRequestError ? error : null;
      if (known?.code === "P2034" && attempt < 2) continue;
      if (known?.code === "P2034") {
        throw new ValidationError("CRM 数据已发生变化，请刷新后重试。");
      }
      throw error;
    }
  }
  throw new ValidationError("CRM 数据已发生变化，请刷新后重试。");
}

function metadata(value: Record<string, unknown>): Prisma.InputJsonObject {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  ) as Prisma.InputJsonObject;
}

async function writeMutationAudit(
  transaction: Transaction,
  actor: CrmSalesActor,
  audit: CrmSalesAuditContext,
  action: string,
  targetType: string,
  targetId: string,
  details: Record<string, unknown>
) {
  await transaction.auditLog.create({
    data: {
      userId: actor.userId,
      role: null,
      action,
      targetType,
      targetId,
      ip: audit.ip,
      userAgent: audit.userAgent,
      metadata: metadata({
        companyId: actor.companyId,
        teamRole: actor.teamRole,
        ...details
      })
    }
  });
}

function scopedWhere(scope: CrmSalesScope, actorUserId: string) {
  return crmSalesScopeWhere(scope, actorUserId);
}

function cursorWhere(cursor?: string) {
  if (!cursor) return undefined;
  const decoded = decodeCursor(cursor);
  return {
    OR: [
      { updatedAt: { lt: decoded.updatedAt } },
      { updatedAt: decoded.updatedAt, id: { lt: decoded.id } }
    ]
  };
}

function pageResult<T extends { id: string; updatedAt: Date }, R>(
  rows: T[],
  limit: number,
  total: number,
  serialize: (row: T) => R
): CrmListResult<R> {
  const visibleRows = rows.slice(0, limit);
  const last = visibleRows.at(-1);
  return {
    items: visibleRows.map(serialize),
    total,
    ...(rows.length > limit && last ? { nextCursor: encodeCursor(last) } : {})
  };
}

async function loadScopedCustomer(
  client: Transaction | typeof prisma,
  actor: CrmSalesActor,
  scope: CrmSalesScope,
  customerId: string
) {
  const customer = await client.customer.findFirst({
    where: {
      id: customerId,
      companyId: actor.companyId,
      team: { status: "ACTIVE" }
    },
    select: {
      id: true,
      companyId: true,
      teamId: true,
      ownerId: true,
      name: true
    }
  });
  if (!customer) throw new NotFoundError("客户不存在或当前账号无权访问。");
  assertRecordInCrmSalesScope(scope, actor.userId, customer);
  return customer;
}

function serializeLead(row: CrmLead & {
  team: { id: string; name: string } | null;
  owner: { id: string; name: string | null; email: string | null; phone: string } | null;
}) {
  return {
    id: row.id,
    team: row.team,
    owner: displayUser(row.owner),
    createdById: row.createdById,
    name: row.name,
    companyName: row.companyName ?? undefined,
    contactName: row.contactName ?? undefined,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    wechat: row.wechat ?? undefined,
    industry: row.industry ?? undefined,
    source: row.source,
    sourceDetail: row.sourceDetail ?? undefined,
    status: row.status,
    score: row.score,
    scoreReason: row.scoreReason ?? undefined,
    estimatedValue: row.estimatedValue ? money(row.estimatedValue) : undefined,
    lastContactAt: date(row.lastContactAt),
    nextFollowUpAt: date(row.nextFollowUpAt),
    convertedCustomerId: row.convertedCustomerId ?? undefined,
    convertedAt: date(row.convertedAt),
    lostReason: row.lostReason ?? undefined,
    tags: row.tags,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function serializeOpportunity(row: CrmOpportunity & {
  team: { id: string; name: string } | null;
  customer: { id: string; name: string };
  owner: { id: string; name: string | null; email: string | null; phone: string };
  primaryContact: { id: string; name: string } | null;
}) {
  return {
    id: row.id,
    team: row.team,
    customer: row.customer,
    primaryContact: row.primaryContact ?? undefined,
    owner: displayUser(row.owner)!,
    name: row.name,
    stage: row.stage,
    status: row.status,
    amount: money(row.amount),
    probability: row.probability,
    expectedCloseDate: date(row.expectedCloseDate),
    nextAction: row.nextAction,
    competitors: row.competitors,
    decisionChain: row.decisionChain ?? undefined,
    lossReason: row.lossReason ?? undefined,
    wonAt: date(row.wonAt),
    lostAt: date(row.lostAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function serializeContract(row: CrmContract & {
  team: { id: string; name: string } | null;
  customer: { id: string; name: string };
  opportunity: { id: string; name: string } | null;
  owner: { id: string; name: string | null; email: string | null; phone: string };
}) {
  return {
    id: row.id,
    team: row.team,
    customer: row.customer,
    opportunity: row.opportunity ?? undefined,
    owner: displayUser(row.owner)!,
    contractNo: row.contractNo,
    title: row.title,
    amount: money(row.amount),
    status: row.status,
    signedAt: date(row.signedAt),
    startDate: date(row.startDate),
    endDate: date(row.endDate),
    terms: row.terms ?? undefined,
    fileUrls: row.fileUrls,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function serializeReceivable(row: CrmReceivable & {
  team: { id: string; name: string } | null;
  customer: { id: string; name: string };
  contract: { id: string; contractNo: string; title: string };
  owner: { id: string; name: string | null; email: string | null; phone: string } | null;
}) {
  const outstandingAmount = row.amount.minus(row.receivedAmount);
  return {
    id: row.id,
    team: row.team,
    customer: row.customer,
    contract: row.contract,
    owner: displayUser(row.owner),
    installmentNo: row.installmentNo,
    amount: money(row.amount),
    receivedAmount: money(row.receivedAmount),
    outstandingAmount: money(outstandingAmount),
    dueDate: row.dueDate.toISOString(),
    receivedAt: date(row.receivedAt),
    status: row.status,
    reminderAt: date(row.reminderAt),
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

export async function getCrmSalesDashboard(actor: CrmSalesActor): Promise<CrmDashboardData> {
  const scope = await resolveCrmSalesScope(actor);
  const base = scopedWhere(scope, actor.userId);
  const [leadGroups, opportunityGroups, openOpportunities, contractGroups, receivableGroups, overdue] =
    await Promise.all([
      prisma.crmLead.groupBy({
        by: ["status"],
        where: base,
        _count: { _all: true }
      }),
      prisma.crmOpportunity.groupBy({
        by: ["stage"],
        where: base,
        _count: { _all: true },
        _sum: { amount: true }
      }),
      prisma.crmOpportunity.findMany({
        where: {
          AND: [base, { status: { in: ["OPEN", "ON_HOLD"] } }]
        },
        select: { amount: true, probability: true }
      }),
      prisma.crmContract.groupBy({
        by: ["status"],
        where: base,
        _count: { _all: true },
        _sum: { amount: true }
      }),
      prisma.crmReceivable.groupBy({
        by: ["status"],
        where: base,
        _count: { _all: true },
        _sum: { amount: true, receivedAmount: true }
      }),
      prisma.crmReceivable.findMany({
        where: {
          AND: [
            base,
            {
              dueDate: { lt: new Date() },
              status: { in: ["PENDING", "PARTIAL", "OVERDUE"] }
            }
          ]
        },
        select: { amount: true, receivedAmount: true }
      })
    ]);

  const leadStatus = Object.fromEntries(CRM_LEAD_STATUSES.map((status) => [status, 0])) as
    CrmDashboardData["leads"]["byStatus"];
  for (const row of leadGroups) leadStatus[row.status] = row._count._all;

  const opportunityStages = Object.fromEntries(
    CRM_OPPORTUNITY_STAGES.map((stage) => [stage, { count: 0, amount: "0.00" }])
  ) as CrmDashboardData["opportunities"]["byStage"];
  for (const row of opportunityGroups) {
    opportunityStages[row.stage] = {
      count: row._count._all,
      amount: money(row._sum.amount)
    };
  }
  const openAmount = openOpportunities.reduce(
    (total, row) => total.plus(row.amount),
    new Prisma.Decimal(0)
  );
  const weightedAmount = openOpportunities.reduce(
    (total, row) => total.plus(row.amount.mul(row.probability).div(100)),
    new Prisma.Decimal(0)
  );

  const contractStatuses = Object.fromEntries(
    CRM_CONTRACT_STATUSES.map((status) => [status, { count: 0, amount: "0.00" }])
  ) as CrmDashboardData["contracts"]["byStatus"];
  for (const row of contractGroups) {
    contractStatuses[row.status] = {
      count: row._count._all,
      amount: money(row._sum.amount)
    };
  }
  const activeAmount = contractGroups
    .filter((row) => row.status === "ACTIVE")
    .reduce((total, row) => total.plus(row._sum.amount ?? 0), new Prisma.Decimal(0));

  const receivableStatuses = Object.fromEntries(
    CRM_RECEIVABLE_STATUSES.map((status) => [status, { count: 0, amount: "0.00" }])
  ) as CrmDashboardData["receivables"]["byStatus"];
  let receivableTotal = new Prisma.Decimal(0);
  let receivedTotal = new Prisma.Decimal(0);
  for (const row of receivableGroups) {
    receivableStatuses[row.status] = {
      count: row._count._all,
      amount: money(row._sum.amount)
    };
    if (row.status !== "CANCELLED") {
      receivableTotal = receivableTotal.plus(row._sum.amount ?? 0);
      receivedTotal = receivedTotal.plus(row._sum.receivedAmount ?? 0);
    }
  }
  const overdueAmount = overdue.reduce(
    (total, row) => total.plus(row.amount.minus(row.receivedAmount)),
    new Prisma.Decimal(0)
  );

  return {
    scope: {
      companyId: scope.companyId,
      mode: scope.mode,
      visibleTeamIds: scope.visibleTeamIds
    },
    leads: {
      total: leadGroups.reduce((total, row) => total + row._count._all, 0),
      byStatus: leadStatus
    },
    opportunities: {
      total: opportunityGroups.reduce((total, row) => total + row._count._all, 0),
      openAmount: money(openAmount),
      weightedAmount: money(weightedAmount),
      byStage: opportunityStages
    },
    contracts: {
      total: contractGroups.reduce((total, row) => total + row._count._all, 0),
      activeAmount: money(activeAmount),
      byStatus: contractStatuses
    },
    receivables: {
      totalAmount: money(receivableTotal),
      receivedAmount: money(receivedTotal),
      outstandingAmount: money(receivableTotal.minus(receivedTotal)),
      overdueAmount: money(overdueAmount),
      byStatus: receivableStatuses
    }
  };
}

export async function listCrmLeads(
  actor: CrmSalesActor,
  filters: CrmLeadListFilters
) {
  const scope = await resolveCrmSalesScope(actor);
  assertVisibleTeamFilter(scope, filters.teamId);
  const filtered: Prisma.CrmLeadWhereInput = {
    AND: [
      scopedWhere(scope, actor.userId),
      ...(filters.teamId ? [{ teamId: filters.teamId }] : []),
      ...(filters.ownerId ? [{ ownerId: filters.ownerId }] : []),
      ...(filters.source ? [{ source: filters.source }] : []),
      ...(filters.status ? [{ status: filters.status }] : []),
      ...(filters.q ? [{
        OR: [
          { name: { contains: filters.q, mode: "insensitive" as const } },
          { companyName: { contains: filters.q, mode: "insensitive" as const } },
          { contactName: { contains: filters.q, mode: "insensitive" as const } },
          { phone: { contains: filters.q, mode: "insensitive" as const } },
          { email: { contains: filters.q, mode: "insensitive" as const } }
        ]
      }] : [])
    ]
  };
  const pageWhere: Prisma.CrmLeadWhereInput = {
    AND: [filtered, ...(filters.cursor ? [cursorWhere(filters.cursor)!] : [])]
  };
  const [rows, total] = await Promise.all([
    prisma.crmLead.findMany({
      where: pageWhere,
      include: {
        team: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true, email: true, phone: true } }
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: filters.limit + 1
    }),
    prisma.crmLead.count({ where: filtered })
  ]);
  return pageResult(rows, filters.limit, total, serializeLead);
}

export async function createCrmLead(
  actor: CrmSalesActor,
  audit: CrmSalesAuditContext,
  input: CreateCrmLeadInput
) {
  return runSerializable(async (transaction) => {
    const scope = await resolveCrmSalesScope(actor, transaction);
    const assignment = await resolveCrmSalesAssignment(
      transaction,
      scope,
      actor.userId,
      input.teamId,
      input.ownerId,
      { allowUnassigned: true }
    );
    const status = assignment.ownerId ? "ASSIGNED" : "UNASSIGNED";
    const lead = await transaction.crmLead.create({
      data: {
        companyId: scope.companyId,
        teamId: assignment.teamId,
        ownerId: assignment.ownerId,
        createdById: actor.userId,
        name: input.name,
        companyName: input.companyName,
        contactName: input.contactName,
        phone: input.phone,
        email: input.email,
        wechat: input.wechat,
        industry: input.industry,
        source: input.source,
        sourceDetail: input.sourceDetail,
        status,
        score: input.score,
        scoreReason: input.scoreReason as Prisma.InputJsonObject | undefined,
        estimatedValue: input.estimatedValue
          ? new Prisma.Decimal(input.estimatedValue)
          : undefined,
        lastContactAt: input.lastContactAt ? new Date(input.lastContactAt) : undefined,
        nextFollowUpAt: input.nextFollowUpAt ? new Date(input.nextFollowUpAt) : undefined,
        tags: input.tags,
        notes: input.notes
      }
    });
    await writeMutationAudit(transaction, actor, audit, "CRM_LEAD_CREATE", "crm_lead", lead.id, {
      teamId: lead.teamId,
      ownerId: lead.ownerId,
      status: lead.status
    });
    return { leadId: lead.id };
  });
}

export async function updateCrmLead(
  actor: CrmSalesActor,
  audit: CrmSalesAuditContext,
  leadId: string,
  input: UpdateCrmLeadInput
) {
  return runSerializable(async (transaction) => {
    const scope = await resolveCrmSalesScope(actor, transaction);
    const lead = await transaction.crmLead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundError("线索不存在或当前账号无权访问。");
    assertRecordInCrmSalesScope(scope, actor.userId, lead);
    if (lead.status === "CONVERTED") {
      throw new ValidationError("已转化线索不能再修改状态或负责人。");
    }

    const nextTeamId = input.teamId === undefined ? lead.teamId : input.teamId;
    const nextOwnerId = input.ownerId === undefined ? lead.ownerId : input.ownerId;
    const assignmentChanged = input.teamId !== undefined || input.ownerId !== undefined;
    const assignment = assignmentChanged
      ? await resolveCrmSalesAssignment(
          transaction,
          scope,
          actor.userId,
          nextTeamId ?? undefined,
          nextOwnerId ?? undefined,
          { allowUnassigned: true }
        )
      : { teamId: lead.teamId, ownerId: lead.ownerId };
    const requestedStatus = input.status ??
      (assignmentChanged ? (assignment.ownerId ? "ASSIGNED" : "UNASSIGNED") : lead.status);
    assertCrmLeadTransition(lead.status, requestedStatus);
    if (requestedStatus === "ASSIGNED" && !assignment.ownerId) {
      throw new ValidationError("ASSIGNED 状态必须设置负责人。");
    }
    if (
      ["UNASSIGNED", "RECYCLED"].includes(requestedStatus) &&
      assignment.ownerId
    ) {
      throw new ValidationError(`${requestedStatus} 状态不能保留负责人。`);
    }
    if (requestedStatus === "DISQUALIFIED" && !input.lostReason && !lead.lostReason) {
      throw new ValidationError("线索判定无效时必须填写原因。");
    }

    const updated = await transaction.crmLead.update({
      where: { id: lead.id },
      data: {
        teamId: assignment.teamId,
        ownerId: ["UNASSIGNED", "RECYCLED"].includes(requestedStatus)
          ? null
          : assignment.ownerId,
        status: requestedStatus,
        ...(input.lostReason !== undefined ? { lostReason: input.lostReason } : {}),
        ...(input.nextFollowUpAt !== undefined
          ? { nextFollowUpAt: input.nextFollowUpAt ? new Date(input.nextFollowUpAt) : null }
          : {})
      }
    });
    await writeMutationAudit(transaction, actor, audit, "CRM_LEAD_UPDATE", "crm_lead", lead.id, {
      fromStatus: lead.status,
      toStatus: updated.status,
      fromTeamId: lead.teamId,
      toTeamId: updated.teamId,
      fromOwnerId: lead.ownerId,
      toOwnerId: updated.ownerId
    });
    return { leadId: updated.id, status: updated.status };
  });
}

export async function convertCrmLead(
  actor: CrmSalesActor,
  audit: CrmSalesAuditContext,
  leadId: string,
  input: ConvertCrmLeadInput
) {
  return runSerializable(async (transaction) => {
    const scope = await resolveCrmSalesScope(actor, transaction);
    const lead = await transaction.crmLead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundError("线索不存在或当前账号无权访问。");
    assertRecordInCrmSalesScope(scope, actor.userId, lead);
    if (lead.convertedCustomerId || lead.status === "CONVERTED") {
      throw new ValidationError("该线索已经转化为客户。");
    }
    if (lead.status !== "QUALIFIED") {
      throw new ValidationError("只有 QUALIFIED 状态的线索可以转化为客户。");
    }
    if (!lead.phone && !lead.wechat) {
      throw new ValidationError("现有客户档案至少需要手机号或微信号，转化前请先补充。");
    }
    const requestedTeamId = input.teamId ?? lead.teamId ??
      (scope.visibleTeamIds.length === 1 ? scope.visibleTeamIds[0] : undefined);
    const requestedOwnerId = input.ownerId ?? lead.ownerId ?? actor.userId;
    const assignment = await resolveCrmSalesAssignment(
      transaction,
      scope,
      actor.userId,
      requestedTeamId,
      requestedOwnerId
    );
    if (!assignment.teamId || !assignment.ownerId) {
      throw new ValidationError("转化客户必须设置团队和负责人。");
    }

    const customer = await transaction.customer.create({
      data: {
        companyId: scope.companyId,
        teamId: assignment.teamId,
        ownerId: assignment.ownerId,
        name: input.customerName ?? lead.companyName ?? lead.contactName ?? lead.name,
        phone: lead.phone,
        wechat: lead.wechat,
        source: `CRM_LEAD:${lead.source}`,
        tags: input.tags ?? lead.tags,
        stage: "LEAD",
        level: input.level ?? "LOW",
        notes: input.notes ?? lead.notes
      }
    });
    const now = new Date();
    const customerLevel = input.level ?? "LOW";
    await Promise.all([
      transaction.crmCustomerStageEvent.create({
        data: {
          companyId: scope.companyId,
          teamId: assignment.teamId,
          customerId: customer.id,
          changedById: actor.userId,
          fromStage: null,
          toStage: "LEAD",
          reason: "线索转化建档",
          snapshot: { leadId: lead.id, level: customerLevel }
        }
      }),
      transaction.crmCustomerScore.create({
        data: {
          companyId: scope.companyId,
          teamId: assignment.teamId,
          customerId: customer.id,
          calculatedByUserId: actor.userId,
          score: customerLevel === "HIGH" ? 90 : customerLevel === "MEDIUM" ? 60 : 25,
          level: customerLevel,
          riskLevel: "LOW",
          source: "MANUAL",
          reason: "线索转化初始等级",
          dimensions: { leadId: lead.id, source: "LEAD_CONVERSION" }
        }
      })
    ]);
    await transaction.crmLead.update({
      where: { id: lead.id },
      data: {
        teamId: assignment.teamId,
        ownerId: assignment.ownerId,
        status: "CONVERTED",
        convertedCustomerId: customer.id,
        convertedAt: now
      }
    });
    await writeMutationAudit(transaction, actor, audit, "CRM_LEAD_CONVERT", "crm_lead", lead.id, {
      customerId: customer.id,
      teamId: assignment.teamId,
      ownerId: assignment.ownerId
    });
    return { leadId: lead.id, customerId: customer.id };
  });
}

export async function listCrmOpportunities(
  actor: CrmSalesActor,
  filters: CrmOpportunityListFilters
) {
  const scope = await resolveCrmSalesScope(actor);
  assertVisibleTeamFilter(scope, filters.teamId);
  const filtered: Prisma.CrmOpportunityWhereInput = {
    AND: [
      scopedWhere(scope, actor.userId),
      ...(filters.teamId ? [{ teamId: filters.teamId }] : []),
      ...(filters.ownerId ? [{ ownerId: filters.ownerId }] : []),
      ...(filters.customerId ? [{ customerId: filters.customerId }] : []),
      ...(filters.stage ? [{ stage: filters.stage }] : []),
      ...(filters.status ? [{ status: filters.status }] : []),
      ...(filters.q ? [{
        OR: [
          { name: { contains: filters.q, mode: "insensitive" as const } },
          { customer: { name: { contains: filters.q, mode: "insensitive" as const } } }
        ]
      }] : [])
    ]
  };
  const pageWhere: Prisma.CrmOpportunityWhereInput = {
    AND: [filtered, ...(filters.cursor ? [cursorWhere(filters.cursor)!] : [])]
  };
  const [rows, total] = await Promise.all([
    prisma.crmOpportunity.findMany({
      where: pageWhere,
      include: {
        team: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true, email: true, phone: true } },
        primaryContact: { select: { id: true, name: true } }
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: filters.limit + 1
    }),
    prisma.crmOpportunity.count({ where: filtered })
  ]);
  return pageResult(rows, filters.limit, total, serializeOpportunity);
}

export async function createCrmOpportunity(
  actor: CrmSalesActor,
  audit: CrmSalesAuditContext,
  input: CreateCrmOpportunityInput
) {
  return runSerializable(async (transaction) => {
    const scope = await resolveCrmSalesScope(actor, transaction);
    const customer = await loadScopedCustomer(transaction, actor, scope, input.customerId);
    if (input.teamId && input.teamId !== customer.teamId) {
      throw new ValidationError("商机团队必须与客户所属团队一致。");
    }
    const assignment = await resolveCrmSalesAssignment(
      transaction,
      scope,
      actor.userId,
      customer.teamId,
      input.ownerId ?? customer.ownerId
    );
    if (!assignment.ownerId) throw new ValidationError("商机必须设置负责人。");
    if (input.primaryContactId) {
      const contact = await transaction.crmContact.findFirst({
        where: {
          id: input.primaryContactId,
          companyId: scope.companyId,
          customerId: customer.id
        },
        select: { id: true }
      });
      if (!contact) throw new ValidationError("首要联系人不属于当前客户。");
    }

    const opportunity = await transaction.crmOpportunity.create({
      data: {
        companyId: scope.companyId,
        teamId: customer.teamId,
        customerId: customer.id,
        primaryContactId: input.primaryContactId,
        ownerId: assignment.ownerId,
        name: input.name,
        stage: "DISCOVERY",
        status: "OPEN",
        amount: new Prisma.Decimal(input.amount),
        probability: input.probability,
        expectedCloseDate: input.expectedCloseDate ? new Date(input.expectedCloseDate) : undefined,
        nextAction: input.nextAction,
        competitors: input.competitors,
        decisionChain: input.decisionChain as Prisma.InputJsonObject | undefined
      }
    });
    await transaction.crmOpportunityStageEvent.create({
      data: {
        companyId: scope.companyId,
        teamId: customer.teamId,
        opportunityId: opportunity.id,
        changedById: actor.userId,
        fromStage: null,
        toStage: "DISCOVERY",
        reason: "创建商机",
        snapshot: metadata({
          amount: money(opportunity.amount),
          probability: opportunity.probability,
          status: opportunity.status
        })
      }
    });
    await writeMutationAudit(
      transaction,
      actor,
      audit,
      "CRM_OPPORTUNITY_CREATE",
      "crm_opportunity",
      opportunity.id,
      {
        customerId: customer.id,
        teamId: customer.teamId,
        ownerId: opportunity.ownerId,
        amount: money(opportunity.amount)
      }
    );
    return { opportunityId: opportunity.id };
  });
}

export async function changeCrmOpportunityStage(
  actor: CrmSalesActor,
  audit: CrmSalesAuditContext,
  opportunityId: string,
  input: ChangeCrmOpportunityStageInput
) {
  return runSerializable(async (transaction) => {
    const scope = await resolveCrmSalesScope(actor, transaction);
    const opportunity = await transaction.crmOpportunity.findUnique({
      where: { id: opportunityId }
    });
    if (!opportunity) throw new NotFoundError("商机不存在或当前账号无权访问。");
    assertRecordInCrmSalesScope(scope, actor.userId, opportunity);
    assertCrmOpportunityStageTransition(opportunity.stage, input.toStage);

    const now = new Date();
    const status = input.toStage === "WON"
      ? "WON"
      : input.toStage === "LOST"
        ? "LOST"
        : "OPEN";
    const probability = input.toStage === "WON"
      ? 100
      : input.toStage === "LOST"
        ? 0
        : input.probability ?? opportunity.probability;
    const updated = await transaction.crmOpportunity.update({
      where: { id: opportunity.id },
      data: {
        stage: input.toStage,
        status,
        probability,
        ...(input.expectedCloseDate !== undefined
          ? {
              expectedCloseDate: input.expectedCloseDate
                ? new Date(input.expectedCloseDate)
                : null
            }
          : {}),
        ...(input.nextAction !== undefined ? { nextAction: input.nextAction } : {}),
        lossReason: input.toStage === "LOST" ? input.reason : null,
        wonAt: input.toStage === "WON" ? now : null,
        lostAt: input.toStage === "LOST" ? now : null
      }
    });
    await transaction.crmOpportunityStageEvent.create({
      data: {
        companyId: scope.companyId,
        teamId: opportunity.teamId,
        opportunityId: opportunity.id,
        changedById: actor.userId,
        fromStage: opportunity.stage,
        toStage: updated.stage,
        reason: input.reason,
        snapshot: metadata({
          amount: money(updated.amount),
          probability: updated.probability,
          status: updated.status,
          expectedCloseDate: date(updated.expectedCloseDate)
        })
      }
    });
    await writeMutationAudit(
      transaction,
      actor,
      audit,
      "CRM_OPPORTUNITY_STAGE_CHANGE",
      "crm_opportunity",
      opportunity.id,
      {
        fromStage: opportunity.stage,
        toStage: updated.stage,
        status: updated.status
      }
    );
    return {
      opportunityId: updated.id,
      stage: updated.stage,
      status: updated.status
    };
  });
}

export async function listCrmContracts(
  actor: CrmSalesActor,
  filters: CrmContractListFilters
) {
  const scope = await resolveCrmSalesScope(actor);
  assertVisibleTeamFilter(scope, filters.teamId);
  const filtered: Prisma.CrmContractWhereInput = {
    AND: [
      scopedWhere(scope, actor.userId),
      ...(filters.teamId ? [{ teamId: filters.teamId }] : []),
      ...(filters.ownerId ? [{ ownerId: filters.ownerId }] : []),
      ...(filters.customerId ? [{ customerId: filters.customerId }] : []),
      ...(filters.opportunityId ? [{ opportunityId: filters.opportunityId }] : []),
      ...(filters.status ? [{ status: filters.status }] : []),
      ...(filters.q ? [{
        OR: [
          { contractNo: { contains: filters.q, mode: "insensitive" as const } },
          { title: { contains: filters.q, mode: "insensitive" as const } },
          { customer: { name: { contains: filters.q, mode: "insensitive" as const } } }
        ]
      }] : [])
    ]
  };
  const pageWhere: Prisma.CrmContractWhereInput = {
    AND: [filtered, ...(filters.cursor ? [cursorWhere(filters.cursor)!] : [])]
  };
  const [rows, total] = await Promise.all([
    prisma.crmContract.findMany({
      where: pageWhere,
      include: {
        team: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
        opportunity: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true, email: true, phone: true } }
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: filters.limit + 1
    }),
    prisma.crmContract.count({ where: filtered })
  ]);
  return pageResult(rows, filters.limit, total, serializeContract);
}

export async function createCrmContract(
  actor: CrmSalesActor,
  audit: CrmSalesAuditContext,
  input: CreateCrmContractInput
) {
  return runSerializable(async (transaction) => {
    const scope = await resolveCrmSalesScope(actor, transaction);
    const customer = await loadScopedCustomer(transaction, actor, scope, input.customerId);
    if (input.teamId && input.teamId !== customer.teamId) {
      throw new ValidationError("合同团队必须与客户所属团队一致。");
    }
    const assignment = await resolveCrmSalesAssignment(
      transaction,
      scope,
      actor.userId,
      customer.teamId,
      input.ownerId ?? customer.ownerId
    );
    if (!assignment.ownerId) throw new ValidationError("合同必须设置负责人。");
    if (input.opportunityId) {
      const opportunity = await transaction.crmOpportunity.findFirst({
        where: {
          id: input.opportunityId,
          companyId: scope.companyId,
          customerId: customer.id,
          teamId: customer.teamId
        },
        select: { id: true }
      });
      if (!opportunity) throw new ValidationError("关联合同的商机不属于当前客户。");
    }
    try {
      const contract = await transaction.crmContract.create({
        data: {
          companyId: scope.companyId,
          teamId: customer.teamId,
          customerId: customer.id,
          opportunityId: input.opportunityId,
          ownerId: assignment.ownerId,
          contractNo: input.contractNo,
          title: input.title,
          amount: new Prisma.Decimal(input.amount),
          status: "DRAFT",
          signedAt: input.signedAt ? new Date(input.signedAt) : undefined,
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          endDate: input.endDate ? new Date(input.endDate) : undefined,
          terms: input.terms as Prisma.InputJsonObject | undefined,
          fileUrls: input.fileUrls,
          notes: input.notes
        }
      });
      await writeMutationAudit(
        transaction,
        actor,
        audit,
        "CRM_CONTRACT_CREATE",
        "crm_contract",
        contract.id,
        {
          customerId: customer.id,
          opportunityId: contract.opportunityId,
          contractNo: contract.contractNo,
          amount: money(contract.amount)
        }
      );
      return { contractId: contract.id };
    } catch (error) {
      const known = error instanceof Prisma.PrismaClientKnownRequestError ? error : null;
      if (known?.code === "P2002") {
        throw new ValidationError("当前企业已存在相同合同编号。");
      }
      throw error;
    }
  });
}

const CONTRACT_STATUS_TRANSITIONS = {
  DRAFT: ["APPROVING", "ACTIVE", "CANCELLED"],
  APPROVING: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: []
} as const;

export async function changeCrmContractStatus(
  actor: CrmSalesActor,
  audit: CrmSalesAuditContext,
  contractId: string,
  input: ChangeCrmContractStatusInput
) {
  return runSerializable(async (transaction) => {
    const scope = await resolveCrmSalesScope(actor, transaction);
    const contract = await transaction.crmContract.findUnique({ where: { id: contractId } });
    if (!contract) throw new NotFoundError("合同不存在或当前账号无权访问。");
    assertRecordInCrmSalesScope(scope, actor.userId, contract);
    const allowed = CONTRACT_STATUS_TRANSITIONS[contract.status] as readonly string[];
    if (!allowed.includes(input.status)) {
      throw new ValidationError("合同状态不能从当前状态变更到目标状态。");
    }
    const signedAt = input.signedAt ? new Date(input.signedAt) : contract.signedAt;
    if (input.status === "ACTIVE" && !signedAt) {
      throw new ValidationError("合同生效前必须记录签约时间。");
    }
    const updated = await transaction.crmContract.update({
      where: { id: contract.id },
      data: {
        status: input.status,
        ...(signedAt ? { signedAt } : {})
      }
    });
    await writeMutationAudit(
      transaction,
      actor,
      audit,
      "CRM_CONTRACT_STATUS_CHANGE",
      "crm_contract",
      contract.id,
      {
        fromStatus: contract.status,
        toStatus: updated.status,
        reason: input.reason
      }
    );
    return { contractId: updated.id, status: updated.status };
  });
}

export async function listCrmReceivables(
  actor: CrmSalesActor,
  filters: CrmReceivableListFilters
) {
  const scope = await resolveCrmSalesScope(actor);
  assertVisibleTeamFilter(scope, filters.teamId);
  const filtered: Prisma.CrmReceivableWhereInput = {
    AND: [
      scopedWhere(scope, actor.userId),
      ...(filters.teamId ? [{ teamId: filters.teamId }] : []),
      ...(filters.ownerId ? [{ ownerId: filters.ownerId }] : []),
      ...(filters.customerId ? [{ customerId: filters.customerId }] : []),
      ...(filters.contractId ? [{ contractId: filters.contractId }] : []),
      ...(filters.status ? [{ status: filters.status }] : []),
      ...(filters.overdueOnly
        ? [{
            dueDate: { lt: new Date() },
            status: { in: ["PENDING", "PARTIAL", "OVERDUE"] }
          } satisfies Prisma.CrmReceivableWhereInput]
        : []),
      ...(filters.q ? [{
        OR: [
          { contract: { contractNo: { contains: filters.q, mode: "insensitive" as const } } },
          { contract: { title: { contains: filters.q, mode: "insensitive" as const } } },
          { customer: { name: { contains: filters.q, mode: "insensitive" as const } } }
        ]
      }] : [])
    ]
  };
  const pageWhere: Prisma.CrmReceivableWhereInput = {
    AND: [filtered, ...(filters.cursor ? [cursorWhere(filters.cursor)!] : [])]
  };
  const [rows, total] = await Promise.all([
    prisma.crmReceivable.findMany({
      where: pageWhere,
      include: {
        team: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
        contract: { select: { id: true, contractNo: true, title: true } },
        owner: { select: { id: true, name: true, email: true, phone: true } }
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: filters.limit + 1
    }),
    prisma.crmReceivable.count({ where: filtered })
  ]);
  return pageResult(rows, filters.limit, total, serializeReceivable);
}

export async function createCrmReceivable(
  actor: CrmSalesActor,
  audit: CrmSalesAuditContext,
  input: CreateCrmReceivableInput
) {
  return runSerializable(async (transaction) => {
    const scope = await resolveCrmSalesScope(actor, transaction);
    const customer = await loadScopedCustomer(transaction, actor, scope, input.customerId);
    if (input.teamId && input.teamId !== customer.teamId) {
      throw new ValidationError("应收团队必须与客户所属团队一致。");
    }
    const contract = await transaction.crmContract.findFirst({
      where: {
        id: input.contractId,
        companyId: scope.companyId,
        customerId: customer.id,
        teamId: customer.teamId
      },
      select: {
        id: true,
        amount: true,
        ownerId: true,
        status: true
      }
    });
    if (!contract) throw new ValidationError("合同不存在或不属于当前客户。");
    if (contract.status === "CANCELLED") {
      throw new ValidationError("已取消合同不能创建应收计划。");
    }
    const assignment = await resolveCrmSalesAssignment(
      transaction,
      scope,
      actor.userId,
      customer.teamId,
      input.ownerId ?? contract.ownerId
    );
    const scheduled = await transaction.crmReceivable.aggregate({
      where: {
        companyId: scope.companyId,
        contractId: contract.id,
        status: { not: "CANCELLED" }
      },
      _sum: { amount: true }
    });
    const requestedAmount = new Prisma.Decimal(input.amount);
    if ((scheduled._sum.amount ?? new Prisma.Decimal(0)).plus(requestedAmount).gt(contract.amount)) {
      throw new ValidationError("该合同的应收计划总额不能超过合同金额。");
    }
    try {
      const receivable = await transaction.crmReceivable.create({
        data: {
          companyId: scope.companyId,
          teamId: customer.teamId,
          customerId: customer.id,
          contractId: contract.id,
          ownerId: assignment.ownerId,
          installmentNo: input.installmentNo,
          amount: requestedAmount,
          receivedAmount: new Prisma.Decimal(0),
          dueDate: new Date(input.dueDate),
          status: new Date(input.dueDate) < new Date() ? "OVERDUE" : "PENDING",
          reminderAt: input.reminderAt ? new Date(input.reminderAt) : undefined,
          notes: input.notes
        }
      });
      await writeMutationAudit(
        transaction,
        actor,
        audit,
        "CRM_RECEIVABLE_CREATE",
        "crm_receivable",
        receivable.id,
        {
          contractId: contract.id,
          installmentNo: receivable.installmentNo,
          amount: money(receivable.amount)
        }
      );
      return { receivableId: receivable.id };
    } catch (error) {
      const known = error instanceof Prisma.PrismaClientKnownRequestError ? error : null;
      if (known?.code === "P2002") {
        throw new ValidationError("该合同已存在相同回款期次。");
      }
      throw error;
    }
  });
}

export async function recordCrmPayment(
  actor: CrmSalesActor,
  audit: CrmSalesAuditContext,
  receivableId: string,
  input: RecordCrmPaymentInput
) {
  return runSerializable(async (transaction) => {
    const scope = await resolveCrmSalesScope(actor, transaction);
    const receivable = await transaction.crmReceivable.findUnique({
      where: { id: receivableId }
    });
    if (!receivable) throw new NotFoundError("应收记录不存在或当前账号无权访问。");
    assertRecordInCrmSalesScope(scope, actor.userId, receivable);
    if (receivable.status === "CANCELLED") {
      throw new ValidationError("已取消的应收记录不能登记回款。");
    }
    if (receivable.status === "PAID") {
      throw new ValidationError("该应收记录已经全部回款。");
    }
    const payment = new Prisma.Decimal(input.amount);
    const receivedAmount = receivable.receivedAmount.plus(payment);
    if (receivedAmount.gt(receivable.amount)) {
      throw new ValidationError("累计回款金额不能超过应收金额。");
    }
    const paid = receivedAmount.eq(receivable.amount);
    const receivedAt = input.receivedAt ? new Date(input.receivedAt) : new Date();
    const paymentNote = input.notes
      ? `[${receivedAt.toISOString()}] 回款 ${money(payment)}：${input.notes}`
      : `[${receivedAt.toISOString()}] 回款 ${money(payment)}`;
    const updated = await transaction.crmReceivable.update({
      where: { id: receivable.id },
      data: {
        receivedAmount,
        receivedAt,
        status: paid ? "PAID" : "PARTIAL",
        notes: receivable.notes
          ? `${receivable.notes}\n${paymentNote}`
          : paymentNote
      }
    });
    await writeMutationAudit(
      transaction,
      actor,
      audit,
      "CRM_RECEIVABLE_PAYMENT",
      "crm_receivable",
      receivable.id,
      {
        contractId: receivable.contractId,
        paymentAmount: money(payment),
        receivedAmount: money(receivedAmount),
        status: updated.status
      }
    );
    return {
      receivableId: updated.id,
      receivedAmount: money(updated.receivedAmount),
      outstandingAmount: money(updated.amount.minus(updated.receivedAmount)),
      status: updated.status
    };
  });
}
