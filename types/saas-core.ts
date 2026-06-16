export type DataSourceType = "mock" | "prisma";

export type EntityStatus = "active" | "inactive" | "pending" | "disabled" | "archived";

export type HealthState = "healthy" | "warning" | "error";

export type RepositoryResult<T> =
  | {
      ok: true;
      data: T;
      source: DataSourceType;
    }
  | {
      ok: false;
      error: string;
      source: DataSourceType;
    };

export type QueryFilter = {
  tenantId?: string;
  search?: string;
  status?: string;
  role?: string;
  category?: string;
  [key: string]: string | number | boolean | undefined;
};

export type PaginationParams = {
  page?: number;
  pageSize?: number;
};

export type Tenant = {
  id: string;
  name: string;
  plan: "trial" | "business" | "enterprise";
  status: EntityStatus;
  region: string;
  seatLimit: number;
  createdAt: string;
  updatedAt: string;
};

export type SaaSUser = {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "member" | "viewer";
  status: EntityStatus;
  lastActiveAt: string;
};

export type KnowledgeRecord = {
  id: string;
  tenantId: string;
  title: string;
  category: string;
  summary: string;
  status: EntityStatus;
  updatedAt: string;
};

export type AIRequestRecord = {
  id: string;
  tenantId: string;
  userId: string;
  model: string;
  tokens: number;
  status: "success" | "failed";
  costUsd: number;
  createdAt: string;
};

export type AIStats = {
  totalRequests: number;
  totalTokens: number;
  estimatedCostUsd: number;
  errorCount: number;
};

export type SystemHealthRecord = {
  service: string;
  status: HealthState;
  checkedAt: string;
  message: string;
};

export type SystemMetric = {
  key: string;
  label: string;
  value: string;
  unit?: string;
  status: HealthState;
};

export type CreateTenantInput = Pick<Tenant, "name" | "plan" | "region" | "seatLimit">;

export type UpdateTenantInput = Partial<Pick<Tenant, "name" | "plan" | "status" | "region" | "seatLimit">>;

export type UpdateUserRoleInput = {
  userId: string;
  role: SaaSUser["role"];
};

export type SearchKnowledgeInput = QueryFilter & PaginationParams;

export type AddKnowledgeInput = Pick<KnowledgeRecord, "tenantId" | "title" | "category" | "summary">;

export type LogAIRequestInput = Pick<AIRequestRecord, "tenantId" | "userId" | "model" | "tokens" | "status" | "costUsd">;

export type DatabaseEntityMap = {
  User: SaaSUser;
  Tenant: Tenant;
  Knowledge: KnowledgeRecord;
  AIRequest: AIRequestRecord;
};

export type PrismaEntityMapping<T extends keyof DatabaseEntityMap> = {
  entity: T;
  prismaModel: `Prisma.${T}`;
  fields: Partial<Record<keyof DatabaseEntityMap[T], string>>;
};

export type SaaSCoreApiResponse<T> = {
  success: true;
  data: T;
  timestamp: number;
  datasource: DataSourceType;
};
