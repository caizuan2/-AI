import { getDataSource } from "@/lib/saas-core/datasource/datasource.factory";
import type {
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

function success<T>(data: T): RepositoryResult<T> {
  return { ok: true, data, source: getDataSource().type };
}

function failure<T>(error: unknown): RepositoryResult<T> {
  return {
    ok: false,
    error: error instanceof Error ? error.message : "User repository failed.",
    source: getDataSource().type
  };
}

export async function getUserById(id: string): Promise<RepositoryResult<SaaSUser | null>> {
  try {
    return success(await getDataSource().users.getUserById(id));
  } catch (error) {
    return failure(error);
  }
}

export async function listUsersByTenant(
  tenantId: string,
  filter?: QueryFilter,
  pagination?: PaginationParams
): Promise<RepositoryResult<SaaSUser[]>> {
  try {
    return success(await getDataSource().users.listUsersByTenant(tenantId, filter, pagination));
  } catch (error) {
    return failure(error);
  }
}

export async function updateUserRole(userId: string, role: SaaSUser["role"]): Promise<RepositoryResult<SaaSUser | null>> {
  try {
    return success(await getDataSource().users.updateUserRole(userId, role));
  } catch (error) {
    return failure(error);
  }
}
