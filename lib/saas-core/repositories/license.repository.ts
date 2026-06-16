import { getDataSource } from "@/lib/saas-core/datasource/datasource.factory";
import type { DataSourceType, LicenseRecord, PaginationParams, PrismaEntityMapping, RepositoryResult } from "@/types/saas-core";

export const licensePrismaMapping: PrismaEntityMapping<"License"> = {
  entity: "License",
  prismaModel: "Prisma.License",
  fields: {
    id: "id",
    tenantId: "tenantId",
    key: "key",
    status: "status",
    expiresAt: "expiresAt",
    plan: "plan",
    createdAt: "createdAt"
  }
};

function success<T>(data: T, source: DataSourceType = getDataSource().type): RepositoryResult<T> {
  return { ok: true, data, source };
}

function failure<T>(error: unknown, source: DataSourceType = getDataSource().type): RepositoryResult<T> {
  return {
    ok: false,
    error: error instanceof Error ? error.message : "License repository failed.",
    source
  };
}

async function listLicensesWithSource(
  source: DataSourceType,
  tenantId?: string,
  pagination?: PaginationParams
): Promise<RepositoryResult<LicenseRecord[]>> {
  try {
    return success(await getDataSource(source).licenses.listLicensesByTenant(tenantId, pagination), source);
  } catch (error) {
    return failure(error, source);
  }
}

export function listLicensesByTenant(tenantId?: string, pagination?: PaginationParams): Promise<RepositoryResult<LicenseRecord[]>> {
  return listLicensesWithSource(getDataSource().type, tenantId, pagination);
}

export function listLicensesByTenantMock(tenantId?: string, pagination?: PaginationParams): Promise<RepositoryResult<LicenseRecord[]>> {
  return listLicensesWithSource("mock", tenantId, pagination);
}

export function listLicensesByTenantPrisma(tenantId?: string, pagination?: PaginationParams): Promise<RepositoryResult<LicenseRecord[]>> {
  return listLicensesWithSource("prisma", tenantId, pagination);
}
