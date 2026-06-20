import { getDataSource } from "@/lib/saas-core/datasource/datasource.factory";
import type {
  DataSourceType,
  PaginationParams,
  PrismaEntityMapping,
  QueryFilter,
  RepositoryResult,
  SaaSUser
} from "@/types/saas-core";

export const userPrismaMapping: PrismaEntityMapping<"User"> = {
  entity: "User",
  prismaModel: "Prisma.User",
  fields: {
    id: "id",
    tenantId: "tenantId",
    name: "name",
    email: "email",
    role: "role",
    status: "status",
    lastActiveAt: "lastActiveAt"
  }
};

function success<T>(data: T, source: DataSourceType = getDataSource().type): RepositoryResult<T> {
  return { ok: true, data, source };
}

function failure<T>(error: unknown, source: DataSourceType = getDataSource().type): RepositoryResult<T> {
  return {
    ok: false,
    error: error instanceof Error ? error.message : "User repository failed.",
    source
  };
}

async function getUserByIdWithSource(source: DataSourceType, id: string): Promise<RepositoryResult<SaaSUser | null>> {
  try {
    return success(await getDataSource(source).users.getUserById(id), source);
  } catch (error) {
    return failure(error, source);
  }
}

async function listUsersByTenantWithSource(
  source: DataSourceType,
  tenantId: string,
  filter?: QueryFilter,
  pagination?: PaginationParams
): Promise<RepositoryResult<SaaSUser[]>> {
  try {
    return success(await getDataSource(source).users.listUsersByTenant(tenantId, filter, pagination), source);
  } catch (error) {
    return failure(error, source);
  }
}

async function updateUserRoleWithSource(
  source: DataSourceType,
  userId: string,
  role: SaaSUser["role"]
): Promise<RepositoryResult<SaaSUser | null>> {
  try {
    return success(await getDataSource(source).users.updateUserRole(userId, role), source);
  } catch (error) {
    return failure(error, source);
  }
}

export function getUserById(id: string): Promise<RepositoryResult<SaaSUser | null>> {
  return getUserByIdWithSource(getDataSource().type, id);
}

export function getUserByIdMock(id: string): Promise<RepositoryResult<SaaSUser | null>> {
  return getUserByIdWithSource("mock", id);
}

export function getUserByIdPrisma(id: string): Promise<RepositoryResult<SaaSUser | null>> {
  return getUserByIdWithSource("prisma", id);
}

export function listUsersByTenant(
  tenantId: string,
  filter?: QueryFilter,
  pagination?: PaginationParams
): Promise<RepositoryResult<SaaSUser[]>> {
  return listUsersByTenantWithSource(getDataSource().type, tenantId, filter, pagination);
}

export function listUsersByTenantMock(
  tenantId: string,
  filter?: QueryFilter,
  pagination?: PaginationParams
): Promise<RepositoryResult<SaaSUser[]>> {
  return listUsersByTenantWithSource("mock", tenantId, filter, pagination);
}

export function listUsersByTenantPrisma(
  tenantId: string,
  filter?: QueryFilter,
  pagination?: PaginationParams
): Promise<RepositoryResult<SaaSUser[]>> {
  return listUsersByTenantWithSource("prisma", tenantId, filter, pagination);
}

export function updateUserRole(userId: string, role: SaaSUser["role"]): Promise<RepositoryResult<SaaSUser | null>> {
  return updateUserRoleWithSource(getDataSource().type, userId, role);
}

export function updateUserRoleMock(userId: string, role: SaaSUser["role"]): Promise<RepositoryResult<SaaSUser | null>> {
  return updateUserRoleWithSource("mock", userId, role);
}

export function updateUserRolePrisma(userId: string, role: SaaSUser["role"]): Promise<RepositoryResult<SaaSUser | null>> {
  return updateUserRoleWithSource("prisma", userId, role);
}
