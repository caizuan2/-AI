import { listLicensesByTenant } from "@/lib/saas-core/repositories/license.repository";
import type { LicenseRecord, PaginationParams, RepositoryResult } from "@/types/saas-core";

function unwrap<T>(result: RepositoryResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error);
  }

  return result.data;
}

export async function getTenantLicenses(tenantId?: string, pagination?: PaginationParams): Promise<LicenseRecord[]> {
  return unwrap(await listLicensesByTenant(tenantId, pagination));
}
