import { enforceSuperAdminApiAccess, superAdminError, superAdminSuccess } from "@/app/api/super-admin/_shared";
import { getCommercialTenantSummaries } from "@/lib/commercial/commercial-dashboard.service";
import { listExpiringSubscriptions } from "@/lib/subscription/subscription.service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await enforceSuperAdminApiAccess(request);
    const [tenants, expiring] = await Promise.all([
      getCommercialTenantSummaries(),
      listExpiringSubscriptions(30)
    ]);

    return superAdminSuccess({
      total: tenants.length,
      active: tenants.filter((tenant) => tenant.subscription.status === "active").length,
      expired: tenants.filter((tenant) => tenant.subscription.status === "expired").length,
      pending: tenants.filter((tenant) => tenant.subscription.status === "pending").length,
      expiring
    });
  } catch (error) {
    return superAdminError(error);
  }
}
