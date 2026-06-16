import type {
  AddKnowledgeInput,
  AIRequestRecord,
  AIStats,
  CreateTenantInput,
  DataSourceType,
  KnowledgeRecord,
  LicenseRecord,
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

export interface IDataSource {
  type: DataSourceType;
  tenants: {
    getTenantById(id: string): Promise<Tenant | null>;
    listTenants(filter?: QueryFilter, pagination?: PaginationParams): Promise<Tenant[]>;
    createTenant(input: CreateTenantInput): Promise<Tenant>;
    updateTenant(id: string, input: UpdateTenantInput): Promise<Tenant | null>;
  };
  users: {
    getUserById(id: string): Promise<SaaSUser | null>;
    listUsersByTenant(tenantId: string, filter?: QueryFilter, pagination?: PaginationParams): Promise<SaaSUser[]>;
    updateUserRole(userId: string, role: SaaSUser["role"]): Promise<SaaSUser | null>;
  };
  knowledge: {
    searchKnowledge(input: SearchKnowledgeInput): Promise<KnowledgeRecord[]>;
    addKnowledge(input: AddKnowledgeInput): Promise<KnowledgeRecord>;
    listKnowledgeByTenant(tenantId: string, pagination?: PaginationParams): Promise<KnowledgeRecord[]>;
  };
  ai: {
    logAIRequest(input: LogAIRequestInput): Promise<AIRequestRecord>;
    getAIStats(filter?: QueryFilter): Promise<AIStats>;
  };
  licenses: {
    listLicensesByTenant(tenantId?: string, pagination?: PaginationParams): Promise<LicenseRecord[]>;
  };
  system: {
    getSystemHealth(): Promise<SystemHealthRecord[]>;
    getMetrics(): Promise<SystemMetric[]>;
  };
}
