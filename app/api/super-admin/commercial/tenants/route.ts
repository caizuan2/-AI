import { enforceSuperAdminApiAccess, superAdminError, superAdminSuccess } from "@/app/api/super-admin/_shared";
import { getCommercialTenantSummaries } from "@/lib/commercial/commercial-dashboard.service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await enforceSuperAdminApiAccess(request);

    return superAdminSuccess(await getCommercialTenantSummaries());
  } catch (error) {
    return superAdminError(error);
  }
}
