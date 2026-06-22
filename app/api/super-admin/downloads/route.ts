import {
  getDownloadPackages,
  getIngestAppVersions,
  getSuperAdminAppVersions,
  getUserAppVersions
} from "@/lib/super-admin/services/download.service";
import {
  enforceSuperAdminApiAccess,
  superAdminError,
  superAdminSuccess
} from "@/app/api/super-admin/_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await enforceSuperAdminApiAccess(request);

    return superAdminSuccess({
      all: getDownloadPackages(),
      user: getUserAppVersions(),
      ingest: getIngestAppVersions(),
      superAdmin: getSuperAdminAppVersions()
    });
  } catch (error) {
    return superAdminError(error);
  }
}
