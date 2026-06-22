import { enforceSuperAdminApiAccess, superAdminError, superAdminSuccess } from "@/app/api/super-admin/_shared";
import { getSystemUsageOverview } from "@/lib/usage/usage.service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await enforceSuperAdminApiAccess(request);

    return superAdminSuccess(await getSystemUsageOverview());
  } catch (error) {
    return superAdminError(error);
  }
}
