import { getTenantUsers } from "@/lib/saas-core/rbac.service";
import { getPositiveInteger, saasCoreError, saasCoreSuccess } from "@/app/api/saas-core/_shared";
import type { QueryFilter } from "@/types/saas-core";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId") ?? "tenant-acme";
    const filter: QueryFilter = {
      role: searchParams.get("role") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      status: searchParams.get("status") ?? undefined
    };

    return saasCoreSuccess(await getTenantUsers(tenantId, filter, {
      page: getPositiveInteger(searchParams.get("page"), 1),
      pageSize: getPositiveInteger(searchParams.get("pageSize"), 20)
    }));
  } catch (error) {
    return saasCoreError(error);
  }
}
