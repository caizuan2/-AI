import { getDataSource } from "@/lib/saas-core/datasource/datasource.factory";
import type {
  CreateTenantInput,
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

function success<T>(data: T): RepositoryResult<T> {
  return { ok: true, data, source: getDataSource().type };
}

function failure<T>(error: unknown): RepositoryResult<T> {
  return {
    ok: false,
    error: error instanceof Error ? error.message : "Tenant repository failed.",
    source: getDataSource().type
  };
}

export async function getTenantById(id: string): Promise<RepositoryResult<Tenant | null>> {
  try {
    return success(await getDataSource().tenants.getTenantById(id));
  } catch (error) {
    return failure(error);
  }
}

export async function listTenants(filter?: QueryFilter, pagination?: PaginationParams): Promise<RepositoryResult<Tenant[]>> {
  try {
    return success(await getDataSource().tenants.listTenants(filter, pagination));
  } catch (error) {
    return failure(error);
  }
}

export async function createTenant(input: CreateTenantInput): Promise<RepositoryResult<Tenant>> {
  try {
    return success(await getDataSource().tenants.createTenant(input));
  } catch (error) {
    return failure(error);
  }
}

export async function updateTenant(id: string, input: UpdateTenantInput): Promise<RepositoryResult<Tenant | null>> {
  try {
    return success(await getDataSource().tenants.updateTenant(id, input));
  } catch (error) {
    return failure(error);
  }
}
