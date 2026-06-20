import { enforceSuperAdminApiAccess, superAdminError, superAdminSuccess } from "@/app/api/super-admin/_shared";
import { getCommercialOverview } from "@/lib/commercial/commercial-dashboard.service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await enforceSuperAdminApiAccess(request);

    return superAdminSuccess(await getCommercialOverview());
  } catch (error) {
    return superAdminError(error);
  }
}
