import {
  enforceSuperAdminApiAccess,
  superAdminError,
  superAdminSuccess
} from "@/app/api/super-admin/_shared";
import { getSuperAdminLicenseDashboard } from "@/lib/super-admin/services/license-admin.service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await enforceSuperAdminApiAccess(request);

    return superAdminSuccess(await getSuperAdminLicenseDashboard());
  } catch (error) {
    return superAdminError(error);
  }
}
