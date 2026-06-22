import { enforceSuperAdminApiAccess, superAdminError, superAdminSuccess } from "@/app/api/super-admin/_shared";
import { getSyncOverview } from "@/lib/super-admin/services/sync.service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await enforceSuperAdminApiAccess(request);

    return superAdminSuccess(getSyncOverview());
  } catch (error) {
    return superAdminError(error);
  }
}
