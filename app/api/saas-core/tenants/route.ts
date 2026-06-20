import { createMockTenant, getTenants } from "@/lib/saas-core/tenant.service";
import { getPositiveInteger, saasCoreError, saasCoreSuccess } from "@/app/api/saas-core/_shared";
import type { CreateTenantInput, QueryFilter } from "@/types/saas-core";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filter: QueryFilter = {
      search: searchParams.get("search") ?? undefined,
      status: searchParams.get("status") ?? undefined
    };

    return saasCoreSuccess(await getTenants(filter, {
      page: getPositiveInteger(searchParams.get("page"), 1),
      pageSize: getPositiveInteger(searchParams.get("pageSize"), 20)
    }));
  } catch (error) {
    return saasCoreError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as CreateTenantInput;

    return saasCoreSuccess(await createMockTenant(body));
  } catch (error) {
    return saasCoreError(error);
  }
}
