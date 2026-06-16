import {
  createTenant,
  getTenantById,
  listTenants,
  updateTenant
} from "@/lib/saas-core/repositories/tenant.repository";
import type { CreateTenantInput, PaginationParams, QueryFilter, RepositoryResult, Tenant, UpdateTenantInput } from "@/types/saas-core";

function unwrap<T>(result: RepositoryResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error);
  }

  return result.data;
}

export async function getTenant(id: string): Promise<Tenant | null> {
  return unwrap(await getTenantById(id));
}

export async function getTenants(filter?: QueryFilter, pagination?: PaginationParams): Promise<Tenant[]> {
  return unwrap(await listTenants(filter, pagination));
}

export async function createMockTenant(input: CreateTenantInput): Promise<Tenant> {
  return unwrap(await createTenant(input));
}

export async function updateMockTenant(id: string, input: UpdateTenantInput): Promise<Tenant | null> {
  return unwrap(await updateTenant(id, input));
}
