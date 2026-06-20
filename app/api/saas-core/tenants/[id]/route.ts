import { getTenant, updateMockTenant } from "@/lib/saas-core/tenant.service";
import { saasCoreError, saasCoreSuccess } from "@/app/api/saas-core/_shared";
import type { UpdateTenantInput } from "@/types/saas-core";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    return saasCoreSuccess(await getTenant(params.id));
  } catch (error) {
    return saasCoreError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = await request.json() as UpdateTenantInput;

    return saasCoreSuccess(await updateMockTenant(params.id, body));
  } catch (error) {
    return saasCoreError(error);
  }
}
