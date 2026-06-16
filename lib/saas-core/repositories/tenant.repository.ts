import { getDataSource } from "@/lib/saas-core/datasource/datasource.factory";
import type {
  CreateTenantInput,
  DataSourceType,
  PaginationParams,
  PrismaEntityMapping,
  QueryFilter,
  RepositoryResult,
  Tenant,
  UpdateTenantInput
} from "@/types/saas-core";

export const tenantPrismaMapping: PrismaEntityMapping<"Tenant"> = {
  entity: "Tenant",
  prismaModel: "Prisma.Tenant",
  fields: {
    id: "id",
    name: "name",
    plan: "plan",
    status: "status",
    region: "region",
    seatLimit: "seatLimit",
    createdAt: "createdAt",
    updatedAt: "updatedAt"
  }
};

function success<T>(data: T, source: DataSourceType = getDataSource().type): RepositoryResult<T> {
  return { ok: true, data, source };
}

function failure<T>(error: unknown, source: DataSourceType = getDataSource().type): RepositoryResult<T> {
  return {
    ok: false,
    error: error instanceof Error ? error.message : "Tenant repository failed.",
    source
  };
}

async function getTenantByIdWithSource(source: DataSourceType, id: string): Promise<RepositoryResult<Tenant | null>> {
  try {
    return success(await getDataSource(source).tenants.getTenantById(id), source);
  } catch (error) {
    return failure(error, source);
  }
}

async function listTenantsWithSource(
  source: DataSourceType,
  filter?: QueryFilter,
  pagination?: PaginationParams
): Promise<RepositoryResult<Tenant[]>> {
  try {
    return success(await getDataSource(source).tenants.listTenants(filter, pagination), source);
  } catch (error) {
    return failure(error, source);
  }
}

async function createTenantWithSource(source: DataSourceType, input: CreateTenantInput): Promise<RepositoryResult<Tenant>> {
  try {
    return success(await getDataSource(source).tenants.createTenant(input), source);
  } catch (error) {
    return failure(error, source);
  }
}

async function updateTenantWithSource(
  source: DataSourceType,
  id: string,
  input: UpdateTenantInput
): Promise<RepositoryResult<Tenant | null>> {
  try {
    return success(await getDataSource(source).tenants.updateTenant(id, input), source);
  } catch (error) {
    return failure(error, source);
  }
}

export function getTenantById(id: string): Promise<RepositoryResult<Tenant | null>> {
  return getTenantByIdWithSource(getDataSource().type, id);
}

export function getTenantByIdMock(id: string): Promise<RepositoryResult<Tenant | null>> {
  return getTenantByIdWithSource("mock", id);
}

export function getTenantByIdPrisma(id: string): Promise<RepositoryResult<Tenant | null>> {
  return getTenantByIdWithSource("prisma", id);
}

export function listTenants(filter?: QueryFilter, pagination?: PaginationParams): Promise<RepositoryResult<Tenant[]>> {
  return listTenantsWithSource(getDataSource().type, filter, pagination);
}

export function listTenantsMock(filter?: QueryFilter, pagination?: PaginationParams): Promise<RepositoryResult<Tenant[]>> {
  return listTenantsWithSource("mock", filter, pagination);
}

export function listTenantsPrisma(filter?: QueryFilter, pagination?: PaginationParams): Promise<RepositoryResult<Tenant[]>> {
  return listTenantsWithSource("prisma", filter, pagination);
}

export function createTenant(input: CreateTenantInput): Promise<RepositoryResult<Tenant>> {
  return createTenantWithSource(getDataSource().type, input);
}

export function createTenantMock(input: CreateTenantInput): Promise<RepositoryResult<Tenant>> {
  return createTenantWithSource("mock", input);
}

export function createTenantPrisma(input: CreateTenantInput): Promise<RepositoryResult<Tenant>> {
  return createTenantWithSource("prisma", input);
}

export function updateTenant(id: string, input: UpdateTenantInput): Promise<RepositoryResult<Tenant | null>> {
  return updateTenantWithSource(getDataSource().type, id, input);
}

export function updateTenantMock(id: string, input: UpdateTenantInput): Promise<RepositoryResult<Tenant | null>> {
  return updateTenantWithSource("mock", id, input);
}

export function updateTenantPrisma(id: string, input: UpdateTenantInput): Promise<RepositoryResult<Tenant | null>> {
  return updateTenantWithSource("prisma", id, input);
}
