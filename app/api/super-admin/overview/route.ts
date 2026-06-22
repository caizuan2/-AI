import { getSuperAdminOverview } from "@/lib/super-admin/services/dashboard.service";
import {
  enforceSuperAdminApiAccess,
  superAdminError,
  superAdminSuccess
} from "@/app/api/super-admin/_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await enforceSuperAdminApiAccess(request);

    return superAdminSuccess(getSuperAdminOverview());
  } catch (error) {
    return superAdminError(error);
  }
}
