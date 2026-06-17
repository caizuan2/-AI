import { enforceSuperAdminApiAccess, superAdminError, superAdminSuccess } from "@/app/api/super-admin/_shared";
import { getDataSourceHealth } from "@/lib/super-admin/services/system-env.service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await enforceSuperAdminApiAccess(request);

    return superAdminSuccess(getDataSourceHealth());
  } catch (error) {
    return superAdminError(error);
  }
}
