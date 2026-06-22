import { enforceSuperAdminApiAccess, superAdminError, superAdminSuccess } from "@/app/api/super-admin/_shared";
import { getPlatformVersions } from "@/lib/super-admin/services/sync.service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await enforceSuperAdminApiAccess(request);

    return superAdminSuccess(getPlatformVersions());
  } catch (error) {
    return superAdminError(error);
  }
}
