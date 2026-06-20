import { enforceSuperAdminApiAccess, superAdminError, superAdminSuccess } from "@/app/api/super-admin/_shared";
import { getPlatformDownloads } from "@/lib/super-admin/services/sync.service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await enforceSuperAdminApiAccess(request);

    return superAdminSuccess(getPlatformDownloads());
  } catch (error) {
    return superAdminError(error);
  }
}
