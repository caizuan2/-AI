import { enforceSuperAdminApiAccess, superAdminError, superAdminSuccess } from "@/app/api/super-admin/_shared";
import { getCommercialOverview } from "@/lib/commercial/commercial-dashboard.service";
import { quotaPolicies } from "@/lib/quota/quota.policy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await enforceSuperAdminApiAccess(request);
    const overview = await getCommercialOverview();

    return superAdminSuccess({
      policies: quotaPolicies,
      warnings: overview.quotaWarnings,
      planDistribution: overview.planDistribution
    });
  } catch (error) {
    return superAdminError(error);
  }
}
