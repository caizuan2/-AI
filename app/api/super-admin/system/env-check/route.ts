import { enforceSuperAdminApiAccess, superAdminError, superAdminSuccess } from "@/app/api/super-admin/_shared";
import { getEnvironmentConfigStatus } from "@/lib/super-admin/services/system-env.service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await enforceSuperAdminApiAccess(request);

    return superAdminSuccess(getEnvironmentConfigStatus());
  } catch (error) {
    return superAdminError(error);
  }
}
