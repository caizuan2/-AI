import type { IDataSource } from "@/lib/saas-core/datasource/base.datasource";
import type {
  AIRequestRecord,
  CreateTenantInput,
  KnowledgeRecord,
  LogAIRequestInput,
  PaginationParams,
  QueryFilter,
  SaaSUser,
  SearchKnowledgeInput,
  SystemHealthRecord,
  SystemMetric,
  Tenant,
  UpdateTenantInput
} from "@/types/saas-core";

const tenants: Tenant[] = [
  {
    id: "tenant-acme",
    name: "Acme 智能制造",
    plan: "enterprise",
    status: "active",
    region: "cn-east",
    seatLimit: 500,
    createdAt: "2026-06-01T08:00:00.000Z",
    updatedAt: "2026-06-17T08:30:00.000Z"
  },
  {
    id: "tenant-nova",
    name: "Nova 客服中心",
    plan: "business",
    status: "active",
    region: "cn-south",
    seatLimit: 180,
    createdAt: "2026-06-03T09:00:00.000Z",
    updatedAt: "2026-06-16T11:20:00.000Z"
  },
  {
    id: "tenant-pilot",
    name: "Pilot 试点企业",
    plan: "trial",
    status: "pending",
    region: "cn-north",
    seatLimit: 30,
    createdAt: "2026-06-10T10:00:00.000Z",
    updatedAt: "2026-06-15T12:00:00.000Z"
  }
];

const users: SaaSUser[] = [
  {
    id: "user-001",
    tenantId: "tenant-acme",
    name: "张明",
    email: "zhangming@example.com",
    role: "owner",
    status: "active",
    lastActiveAt: "2026-06-17T08:50:00.000Z"
  },
  {
    id: "user-002",
    tenantId: "tenant-acme",
    name: "李雪",
    email: "lixue@example.com",
    role: "admin",
    status: "active",
    lastActiveAt: "2026-06-17T08:20:00.000Z"
  },
  {
    id: "user-003",
    tenantId: "tenant-nova",
    name: "王磊",
    email: "wanglei@example.com",
    role: "member",
    status: "active",
    lastActiveAt: "2026-06-16T17:40:00.000Z"
  }
];

const knowledgeItems: KnowledgeRecord[] = [
  {
    id: "knowledge-001",
    tenantId: "tenant-acme",
    title: "设备巡检 SOP",
    category: "运营流程",
    summary: "制造现场设备日检、周检与异常上报标准。",
    status: "active",
    updatedAt: "2026-06-17T08:10:00.000Z"
  },
  {
    id: "knowledge-002",
    tenantId: "tenant-acme",
    title: "售后质保政策",
    category: "客户服务",
    summary: "不同产品线的质保周期、例外条款和升级流程。",
    status: "active",
    updatedAt: "2026-06-16T16:30:00.000Z"
  },
  {
    id: "knowledge-003",
    tenantId: "tenant-nova",
    title: "客服话术规范",
    category: "客服知识",
    summary: "一线客服处理退款、投诉与升级工单的话术模板。",
    status: "active",
    updatedAt: "2026-06-16T14:15:00.000Z"
  }
];

const aiRequests: AIRequestRecord[] = [
  {
    id: "ai-001",
    tenantId: "tenant-acme",
    userId: "user-001",
    model: "gpt-4.1-mini",
    tokens: 2048,
    status: "success",
    costUsd: 0.012,
    createdAt: "2026-06-17T08:55:00.000Z"
  },
  {
    id: "ai-002",
    tenantId: "tenant-nova",
    userId: "user-003",
    model: "gpt-4.1-mini",
    tokens: 1420,
    status: "success",
    costUsd: 0.008,
    createdAt: "2026-06-17T08:40:00.000Z"
  },
  {
    id: "ai-003",
    tenantId: "tenant-acme",
    userId: "user-002",
    model: "gpt-4.1-mini",
    tokens: 980,
    status: "failed",
    costUsd: 0,
    createdAt: "2026-06-17T08:25:00.000Z"
  }
];

const systemHealth: SystemHealthRecord[] = [
  {
    service: "tenant-core",
    status: "healthy",
    checkedAt: "2026-06-17T09:00:00.000Z",
    message: "Mock tenant repository ready"
  },
  {
    service: "rbac-core",
    status: "healthy",
    checkedAt: "2026-06-17T09:00:00.000Z",
    message: "Mock RBAC repository ready"
  },
  {
    service: "ai-gateway",
    status: "warning",
    checkedAt: "2026-06-17T09:00:00.000Z",
    message: "Mock AI gateway has one failed request"
  }
];

const metrics: SystemMetric[] = [
  {
    key: "tenant_count",
    label: "租户数量",
    value: "3",
    status: "healthy"
  },
  {
    key: "knowledge_count",
    label: "知识记录",
    value: "3",
    status: "healthy"
  },
  {
    key: "ai_error_count",
    label: "AI 异常",
    value: "1",
    unit: "次",
    status: "warning"
  }
];

function applyPagination<T>(items: T[], pagination?: PaginationParams) {
  const page = Math.max(1, pagination?.page ?? 1);
  const pageSize = Math.max(1, pagination?.pageSize ?? (items.length || 1));
  const start = (page - 1) * pageSize;

  return items.slice(start, start + pageSize);
}

function matchesSearch(value: string, search?: string) {
  return !search || value.toLowerCase().includes(search.toLowerCase());
}

function filterByStatus<T extends { status: string }>(items: T[], filter?: QueryFilter) {
  return filter?.status ? items.filter((item) => item.status === filter.status) : items;
}

export const mockDataSource: IDataSource = {
  type: "mock",
  tenants: {
    async getTenantById(id) {
      return tenants.find((tenant) => tenant.id === id) ?? null;
    },
    async listTenants(filter, pagination) {
      const filtered = filterByStatus(tenants, filter).filter((tenant) => matchesSearch(tenant.name, filter?.search));

      return applyPagination(filtered, pagination);
    },
    async createTenant(input: CreateTenantInput) {
      return {
        id: `tenant-mock-${tenants.length + 1}`,
        status: "active",
        createdAt: "2026-06-17T09:00:00.000Z",
        updatedAt: "2026-06-17T09:00:00.000Z",
        ...input
      };
    },
    async updateTenant(id: string, input: UpdateTenantInput) {
      const tenant = tenants.find((item) => item.id === id);

      return tenant ? { ...tenant, ...input, updatedAt: "2026-06-17T09:05:00.000Z" } : null;
    }
  },
  users: {
    async getUserById(id) {
      return users.find((user) => user.id === id) ?? null;
    },
    async listUsersByTenant(tenantId, filter, pagination) {
      const filtered = filterByStatus(users, filter)
        .filter((user) => user.tenantId === tenantId)
        .filter((user) => !filter?.role || user.role === filter.role)
        .filter((user) => matchesSearch(`${user.name} ${user.email}`, filter?.search));

      return applyPagination(filtered, pagination);
    },
    async updateUserRole(userId, role) {
      const user = users.find((item) => item.id === userId);

      return user ? { ...user, role } : null;
    }
  },
  knowledge: {
    async searchKnowledge(input: SearchKnowledgeInput) {
      const filtered = filterByStatus(knowledgeItems, input)
        .filter((item) => !input.tenantId || item.tenantId === input.tenantId)
        .filter((item) => !input.category || item.category === input.category)
        .filter((item) => matchesSearch(`${item.title} ${item.summary}`, input.search));

      return applyPagination(filtered, input);
    },
    async addKnowledge(input) {
      return {
        id: `knowledge-mock-${knowledgeItems.length + 1}`,
        status: "active",
        updatedAt: "2026-06-17T09:10:00.000Z",
        ...input
      };
    },
    async listKnowledgeByTenant(tenantId, pagination) {
      return applyPagination(knowledgeItems.filter((item) => item.tenantId === tenantId), pagination);
    }
  },
  ai: {
    async logAIRequest(input: LogAIRequestInput) {
      return {
        id: `ai-mock-${aiRequests.length + 1}`,
        createdAt: "2026-06-17T09:15:00.000Z",
        ...input
      };
    },
    async getAIStats(filter) {
      const scoped = filter?.tenantId ? aiRequests.filter((item) => item.tenantId === filter.tenantId) : aiRequests;

      return {
        totalRequests: scoped.length,
        totalTokens: scoped.reduce((total, item) => total + item.tokens, 0),
        estimatedCostUsd: Number(scoped.reduce((total, item) => total + item.costUsd, 0).toFixed(4)),
        errorCount: scoped.filter((item) => item.status === "failed").length
      };
    }
  },
  system: {
    async getSystemHealth() {
      return systemHealth;
    },
    async getMetrics() {
      return metrics;
    }
  }
};
