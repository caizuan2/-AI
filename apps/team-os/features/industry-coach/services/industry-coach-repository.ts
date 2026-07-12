import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { TeamRole } from "@/apps/team-os/types";
import { parseCoachRuleRules } from "@/apps/team-os/features/industry-coach/utils/industry-coach-input";
import type {
  CoachRuleRecord,
  CoachRulesData,
  CreateCoachRuleInput,
  CreateIndustryStandardInput,
  IndustryCatalogContext,
  IndustryCompanyOption,
  IndustryStandardRecord,
  IndustryStandardsData
} from "@/apps/team-os/features/industry-coach/types";

const CATALOG_LIMIT = 100;
const CATALOG_READER_ROLES = new Set<TeamRole>(["TEAM_OWNER", "TEAM_MANAGER", "TRAINER"]);
const ROLE_PRIORITY: Record<TeamRole, number> = {
  TEAM_MEMBER: 0,
  TRAINER: 1,
  TEAM_MANAGER: 2,
  TEAM_OWNER: 3
};

function canViewCatalog(role: TeamRole) {
  return CATALOG_READER_ROLES.has(role);
}

function canManage(role: TeamRole) {
  return role === "TEAM_OWNER";
}

function strongerRole(current: TeamRole | undefined, candidate: TeamRole) {
  return !current || ROLE_PRIORITY[candidate] > ROLE_PRIORITY[current] ? candidate : current;
}

async function resolveIndustryCatalogContext(
  userId: string,
  requestedCompanyId?: string
): Promise<IndustryCatalogContext> {
  const memberships = await prisma.teamMember.findMany({
    where: {
      userId,
      status: "ACTIVE",
      team: { status: "ACTIVE" }
    },
    select: {
      role: true,
      createdAt: true,
      team: {
        select: {
          companyId: true,
          name: true
        }
      }
    },
    orderBy: [
      { createdAt: "asc" },
      { id: "asc" }
    ]
  });

  if (memberships.length === 0) {
    throw new ForbiddenError("当前账号尚未加入有效企业，无法访问行业教练目录。");
  }

  const roleByCompany = new Map<string, TeamRole>();
  const fallbackNameByCompany = new Map<string, string>();
  for (const membership of memberships) {
    roleByCompany.set(
      membership.team.companyId,
      strongerRole(roleByCompany.get(membership.team.companyId), membership.role)
    );
    if (!fallbackNameByCompany.has(membership.team.companyId)) {
      fallbackNameByCompany.set(membership.team.companyId, membership.team.name);
    }
  }

  const companyIds = Array.from(roleByCompany.keys());
  if (requestedCompanyId && !roleByCompany.has(requestedCompanyId)) {
    throw new ForbiddenError("当前账号无权访问所选企业的行业教练目录。");
  }

  const selectedCompanyId = requestedCompanyId || companyIds[0];
  const tenants = await prisma.tenant.findMany({
    where: { id: { in: companyIds } },
    select: { id: true, name: true }
  });
  const tenantNameById = new Map(tenants.map((tenant) => [tenant.id, tenant.name]));
  const companies: IndustryCompanyOption[] = companyIds.map((companyId) => {
    const role = roleByCompany.get(companyId)!;
    return {
      id: companyId,
      name: tenantNameById.get(companyId) ?? fallbackNameByCompany.get(companyId) ?? companyId,
      role,
      canViewCatalog: canViewCatalog(role),
      canManage: canManage(role)
    };
  });
  const selected = companies.find((company) => company.id === selectedCompanyId)!;

  return {
    companyId: selected.id,
    companyName: selected.name,
    companies,
    canViewCatalog: selected.canViewCatalog,
    canManage: selected.canManage
  };
}

function serializeStandard(standard: {
  id: string;
  companyId: string;
  category: string;
  title: string;
  content: string;
  version: number;
  status: "ACTIVE" | "DISABLED";
  createdAt: Date;
  updatedAt: Date;
}): IndustryStandardRecord {
  return {
    id: standard.id,
    companyId: standard.companyId,
    category: standard.category,
    title: standard.title,
    content: standard.content,
    version: standard.version,
    status: standard.status,
    createdAt: standard.createdAt.toISOString(),
    updatedAt: standard.updatedAt.toISOString()
  };
}

function serializeRule(rule: {
  id: string;
  companyId: string;
  name: string;
  description: string;
  rules: Prisma.JsonValue;
  createdAt: Date;
}): CoachRuleRecord | null {
  try {
    return {
      id: rule.id,
      companyId: rule.companyId,
      name: rule.name,
      description: rule.description,
      rules: parseCoachRuleRules(rule.rules),
      createdAt: rule.createdAt.toISOString()
    };
  } catch {
    logger.warn("industry_coach.invalid_rule_skipped", {
      companyId: rule.companyId,
      ruleId: rule.id
    });
    return null;
  }
}

async function lockTransaction(transaction: Prisma.TransactionClient, key: string) {
  await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

async function assertOwnerInTransaction(
  transaction: Prisma.TransactionClient,
  userId: string,
  companyId: string
) {
  const owner = await transaction.teamMember.findFirst({
    where: {
      userId,
      role: "TEAM_OWNER",
      status: "ACTIVE",
      team: {
        companyId,
        status: "ACTIVE"
      }
    },
    select: { id: true }
  });
  if (!owner) {
    throw new ForbiddenError("只有企业负责人可以管理行业教练目录。");
  }
}

async function runSerializableTransaction<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  conflictMessage: string
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      });
    } catch (error) {
      const knownError = error instanceof Prisma.PrismaClientKnownRequestError ? error : null;
      if (knownError?.code === "P2034" && attempt < 2) {
        continue;
      }
      if (knownError?.code === "P2002") {
        throw new ValidationError(conflictMessage);
      }
      if (knownError?.code === "P2034") {
        throw new ValidationError("并发更新冲突，请重新提交。");
      }
      throw error;
    }
  }

  throw new ValidationError("并发更新冲突，请重新提交。");
}

export async function listIndustryStandards(
  userId: string,
  requestedCompanyId?: string
): Promise<IndustryStandardsData> {
  const context = await resolveIndustryCatalogContext(userId, requestedCompanyId);
  if (!context.canViewCatalog) {
    return { context, items: [], total: 0, activeCount: 0, truncated: false };
  }

  const [items, total, activeCount] = await Promise.all([
    prisma.industryStandard.findMany({
      where: { companyId: context.companyId },
      orderBy: [
        { updatedAt: "desc" },
        { id: "asc" }
      ],
      take: CATALOG_LIMIT
    }),
    prisma.industryStandard.count({ where: { companyId: context.companyId } }),
    prisma.industryStandard.count({
      where: { companyId: context.companyId, status: "ACTIVE" }
    })
  ]);

  return {
    context,
    items: items.map(serializeStandard),
    total,
    activeCount,
    truncated: total > items.length
  };
}

export async function listCoachRules(
  userId: string,
  requestedCompanyId?: string
): Promise<CoachRulesData> {
  const context = await resolveIndustryCatalogContext(userId, requestedCompanyId);
  if (!context.canViewCatalog) {
    return { context, items: [], total: 0, truncated: false };
  }

  const [items, total] = await Promise.all([
    prisma.coachRule.findMany({
      where: { companyId: context.companyId },
      orderBy: [
        { createdAt: "desc" },
        { id: "asc" }
      ],
      take: CATALOG_LIMIT
    }),
    prisma.coachRule.count({ where: { companyId: context.companyId } })
  ]);
  const serializedItems = items.flatMap((item) => {
    const serialized = serializeRule(item);
    return serialized ? [serialized] : [];
  });
  const invalidVisibleCount = items.length - serializedItems.length;

  return {
    context,
    items: serializedItems,
    total: Math.max(0, total - invalidVisibleCount),
    truncated: total > items.length
  };
}

export async function createIndustryStandard(
  userId: string,
  input: CreateIndustryStandardInput
): Promise<IndustryStandardRecord> {
  const context = await resolveIndustryCatalogContext(userId, input.companyId);
  if (!context.canManage) {
    throw new ForbiddenError("只有企业负责人可以新增行业标准。");
  }

  const created = await runSerializableTransaction(async (transaction) => {
    await assertOwnerInTransaction(transaction, userId, context.companyId);
    await lockTransaction(
      transaction,
      `team-os:industry-standard:${context.companyId}:${input.category}:${input.title}`
    );

    const duplicate = await transaction.industryStandard.findFirst({
      where: {
        companyId: context.companyId,
        category: input.category,
        title: input.title,
        version: input.version
      },
      select: { id: true }
    });
    if (duplicate) {
      throw new ValidationError("相同分类、标题和版本的行业标准已经存在。");
    }

    if (input.status === "ACTIVE") {
      await transaction.industryStandard.updateMany({
        where: {
          companyId: context.companyId,
          category: input.category,
          title: input.title,
          status: "ACTIVE"
        },
        data: { status: "DISABLED" }
      });
    }

    return transaction.industryStandard.create({
      data: {
        companyId: context.companyId,
        category: input.category,
        title: input.title,
        content: input.content,
        version: input.version,
        status: input.status
      }
    });
  }, "相同分类、标题和版本的行业标准已经存在。");

  return serializeStandard(created);
}

export async function createCoachRule(
  userId: string,
  input: CreateCoachRuleInput
): Promise<CoachRuleRecord> {
  const context = await resolveIndustryCatalogContext(userId, input.companyId);
  if (!context.canManage) {
    throw new ForbiddenError("只有企业负责人可以新增评分规则。");
  }

  const created = await runSerializableTransaction(async (transaction) => {
    await assertOwnerInTransaction(transaction, userId, context.companyId);
    await lockTransaction(transaction, `team-os:coach-rule:${context.companyId}:${input.name}`);

    const duplicate = await transaction.coachRule.findFirst({
      where: { companyId: context.companyId, name: input.name },
      select: { id: true }
    });
    if (duplicate) {
      throw new ValidationError("当前企业已存在同名评分规则。");
    }

    return transaction.coachRule.create({
      data: {
        companyId: context.companyId,
        name: input.name,
        description: input.description,
        rules: input.rules as unknown as Prisma.InputJsonObject
      }
    });
  }, "当前企业已存在同名评分规则。");

  const serialized = serializeRule(created);
  if (!serialized) {
    throw new ValidationError("评分规则保存后校验失败，请重新创建。");
  }
  return serialized;
}
