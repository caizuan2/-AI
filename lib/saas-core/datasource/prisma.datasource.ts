import type { IDataSource } from "@/lib/saas-core/datasource/base.datasource";
import { prisma } from "@/lib/db/prisma";
import type {
  AIRequestRecord,
  EntityStatus,
  KnowledgeRecord,
  LicenseRecord,
  PaginationParams,
  SaaSPlan,
  SaaSUser,
  SearchKnowledgeInput,
  Tenant
} from "@/types/saas-core";
import type { LicenseStatus, Prisma, TenantPlan, TenantStatus, UserRole } from "@prisma/client";

const tenantStatuses: TenantStatus[] = ["active", "inactive", "pending", "disabled", "archived"];
const licenseStatuses: LicenseStatus[] = ["active", "inactive", "expired", "revoked"];

function paginationArgs(pagination?: PaginationParams): { skip?: number; take?: number } {
  if (!pagination) {
    return {};
  }

  const page = Math.max(1, pagination.page ?? 1);
  const take = Math.max(1, pagination.pageSize ?? 20);

  return {
    skip: (page - 1) * take,
    take
  };
}

function toTenantPlan(plan?: SaaSPlan): TenantPlan {
  if (plan === "enterprise") {
    return "enterprise";
  }

  if (plan === "pro" || plan === "business") {
    return "pro";
  }

  return "free";
}

function toTenantStatus(status?: string): TenantStatus | undefined {
  return tenantStatuses.includes(status as TenantStatus) ? status as TenantStatus : undefined;
}

function toLicenseStatus(status?: string): LicenseStatus | undefined {
  return licenseStatuses.includes(status as LicenseStatus) ? status as LicenseStatus : undefined;
}

function toLicenseRecordStatus(status: string): LicenseRecord["status"] {
  if (status === "active" || status === "expired" || status === "revoked") {
    return status;
  }

  return "inactive";
}

function toPrismaUserRole(role: SaaSUser["role"]): UserRole {
  if (role === "super_admin" || role === "ingest_admin" || role === "enterprise_admin") {
    return role;
  }

  if (role === "owner" || role === "admin") {
    return "enterprise_admin";
  }

  return "user";
}

function fromPrismaUserRole(role: UserRole): SaaSUser["role"] {
  if (role === "kb_admin") {
    return "admin";
  }

  return role;
}

function mapTenant(tenant: {
  id: string;
  name: string;
  plan: TenantPlan;
  status: TenantStatus;
  region: string;
  seatLimit: number;
  createdAt: Date;
  updatedAt: Date;
}): Tenant {
  return {
    id: tenant.id,
    name: tenant.name,
    plan: tenant.plan,
    status: tenant.status,
    region: tenant.region,
    seatLimit: tenant.seatLimit,
    createdAt: tenant.createdAt.toISOString(),
    updatedAt: tenant.updatedAt.toISOString()
  };
}

function mapUser(user: {
  id: string;
  tenantId: string | null;
  name: string | null;
  email: string | null;
  phone: string;
  role: UserRole;
  isActive: boolean;
  updatedAt: Date;
}): SaaSUser {
  return {
    id: user.id,
    tenantId: user.tenantId ?? "",
    name: user.name ?? user.email ?? user.phone,
    email: user.email ?? user.phone,
    role: fromPrismaUserRole(user.role),
    status: user.isActive ? "active" : "inactive",
    lastActiveAt: user.updatedAt.toISOString()
  };
}

function mapKnowledge(item: {
  id: string;
  tenantId: string;
  title: string;
  category: string;
  summary: string;
  status: TenantStatus;
  updatedAt: Date;
}): KnowledgeRecord {
  return {
    id: item.id,
    tenantId: item.tenantId,
    title: item.title,
    category: item.category,
    summary: item.summary,
    status: item.status as EntityStatus,
    updatedAt: item.updatedAt.toISOString()
  };
}

function mapAIRequest(item: {
  id: string;
  tenantId: string;
  userId: string;
  prompt: string;
  response: string;
  model: string;
  tokens: number;
  status: string;
  costUsd: number;
  createdAt: Date;
}): AIRequestRecord {
  return {
    id: item.id,
    tenantId: item.tenantId,
    userId: item.userId,
    prompt: item.prompt,
    response: item.response,
    model: item.model,
    tokens: item.tokens,
    status: item.status === "failed" ? "failed" : "success",
    costUsd: item.costUsd,
    createdAt: item.createdAt.toISOString()
  };
}

function mapLicense(item: {
  id: string;
  tenantId: string | null;
  key: string;
  status: string;
  expiresAt: Date | null;
  plan: TenantPlan;
  createdAt: Date;
}): LicenseRecord {
  return {
    id: item.id,
    tenantId: item.tenantId,
    key: item.key,
    status: toLicenseRecordStatus(item.status),
    expiresAt: item.expiresAt?.toISOString() ?? null,
    plan: item.plan,
    createdAt: item.createdAt.toISOString()
  };
}

function knowledgeWhere(input: SearchKnowledgeInput): Prisma.KnowledgeWhereInput {
  const status = toTenantStatus(input.status);

  return {
    tenantId: input.tenantId,
    category: input.category,
    status,
    ...(input.search
      ? {
          OR: [
            { title: { contains: input.search, mode: "insensitive" } },
            { summary: { contains: input.search, mode: "insensitive" } },
            { content: { contains: input.search, mode: "insensitive" } }
          ]
        }
      : {})
  };
}

export const prismaDataSource: IDataSource = {
  type: "prisma",
  tenants: {
    async getTenantById(id) {
      const tenant = await prisma.tenant.findUnique({ where: { id } });

      return tenant ? mapTenant(tenant) : null;
    },
    async listTenants(filter, pagination) {
      const status = toTenantStatus(filter?.status);
      const where: Prisma.TenantWhereInput = {
        status,
        ...(filter?.search ? { name: { contains: filter.search, mode: "insensitive" } } : {})
      };
      const tenants = await prisma.tenant.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...paginationArgs(pagination)
      });

      return tenants.map(mapTenant);
    },
    async createTenant(input) {
      const tenant = await prisma.tenant.create({
        data: {
          name: input.name,
          plan: toTenantPlan(input.plan),
          region: input.region,
          seatLimit: input.seatLimit,
          status: "active"
        }
      });

      return mapTenant(tenant);
    },
    async updateTenant(id, input) {
      const tenant = await prisma.tenant.update({
        where: { id },
        data: {
          name: input.name,
          plan: input.plan ? toTenantPlan(input.plan) : undefined,
          status: toTenantStatus(input.status),
          region: input.region,
          seatLimit: input.seatLimit
        }
      });

      return mapTenant(tenant);
    }
  },
  users: {
    async getUserById(id) {
      const user = await prisma.user.findUnique({ where: { id } });

      return user ? mapUser(user) : null;
    },
    async listUsersByTenant(tenantId, filter, pagination) {
      const where: Prisma.UserWhereInput = {
        tenantId,
        role: filter?.role ? toPrismaUserRole(filter.role as SaaSUser["role"]) : undefined,
        ...(filter?.search
          ? {
              OR: [
                { name: { contains: filter.search, mode: "insensitive" } },
                { email: { contains: filter.search, mode: "insensitive" } },
                { phone: { contains: filter.search, mode: "insensitive" } }
              ]
            }
          : {})
      };
      const users = await prisma.user.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        ...paginationArgs(pagination)
      });

      return users.map(mapUser);
    },
    async updateUserRole(userId, role) {
      const user = await prisma.user.update({
        where: { id: userId },
        data: { role: toPrismaUserRole(role) }
      });

      return mapUser(user);
    }
  },
  knowledge: {
    async searchKnowledge(input) {
      const items = await prisma.knowledge.findMany({
        where: knowledgeWhere(input),
        orderBy: { updatedAt: "desc" },
        ...paginationArgs(input)
      });

      return items.map(mapKnowledge);
    },
    async addKnowledge(input) {
      const item = await prisma.knowledge.create({
        data: {
          tenantId: input.tenantId,
          title: input.title,
          content: input.summary,
          summary: input.summary,
          category: input.category,
          source: "ingest",
          status: "active"
        }
      });

      return mapKnowledge(item);
    },
    async listKnowledgeByTenant(tenantId, pagination) {
      const items = await prisma.knowledge.findMany({
        where: { tenantId },
        orderBy: { updatedAt: "desc" },
        ...paginationArgs(pagination)
      });

      return items.map(mapKnowledge);
    }
  },
  ai: {
    async logAIRequest(input) {
      const item = await prisma.aIRequest.create({
        data: {
          tenantId: input.tenantId,
          userId: input.userId,
          prompt: input.prompt ?? "",
          response: input.response ?? "",
          model: input.model,
          tokens: input.tokens,
          status: input.status,
          costUsd: input.costUsd
        }
      });

      return mapAIRequest(item);
    },
    async getAIStats(filter) {
      const where: Prisma.AIRequestWhereInput = {
        tenantId: filter?.tenantId
      };
      const [totalRequests, tokenAggregate, costAggregate, errorCount] = await Promise.all([
        prisma.aIRequest.count({ where }),
        prisma.aIRequest.aggregate({ where, _sum: { tokens: true } }),
        prisma.aIRequest.aggregate({ where, _sum: { costUsd: true } }),
        prisma.aIRequest.count({ where: { ...where, status: "failed" } })
      ]);

      return {
        totalRequests,
        totalTokens: tokenAggregate._sum.tokens ?? 0,
        estimatedCostUsd: Number((costAggregate._sum.costUsd ?? 0).toFixed(4)),
        errorCount
      };
    }
  },
  licenses: {
    async listLicensesByTenant(tenantId, pagination) {
      const where: Prisma.LicenseWhereInput = {
        tenantId,
        status: toLicenseStatus(undefined)
      };
      const licenses = await prisma.license.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...paginationArgs(pagination)
      });

      return licenses.map(mapLicense);
    }
  },
  system: {
    async getSystemHealth() {
      await prisma.$queryRaw`SELECT 1`;

      return [
        {
          service: "prisma-database",
          status: "healthy",
          checkedAt: new Date().toISOString(),
          message: "Prisma datasource is reachable"
        },
        {
          service: "tenant-isolation",
          status: "healthy",
          checkedAt: new Date().toISOString(),
          message: "Tenant-scoped repositories are enabled"
        }
      ];
    },
    async getMetrics() {
      const [tenantCount, knowledgeCount, aiErrorCount, licenseCount] = await Promise.all([
        prisma.tenant.count(),
        prisma.knowledge.count(),
        prisma.aIRequest.count({ where: { status: "failed" } }),
        prisma.license.count()
      ]);

      return [
        {
          key: "tenant_count",
          label: "租户数量",
          value: String(tenantCount),
          status: "healthy"
        },
        {
          key: "knowledge_count",
          label: "知识记录",
          value: String(knowledgeCount),
          status: "healthy"
        },
        {
          key: "license_count",
          label: "授权数量",
          value: String(licenseCount),
          status: "healthy"
        },
        {
          key: "ai_error_count",
          label: "AI 异常",
          value: String(aiErrorCount),
          unit: "次",
          status: aiErrorCount > 0 ? "warning" : "healthy"
        }
      ];
    }
  }
};
