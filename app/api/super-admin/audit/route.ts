import { getRecentLogs } from "@/lib/super-admin/services/audit.service";
import {
  enforceSuperAdminApiAccess,
  superAdminError,
  superAdminSuccess
} from "@/app/api/super-admin/_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await enforceSuperAdminApiAccess(request);

    return superAdminSuccess(getRecentLogs());
  } catch (error) {
    return superAdminError(error);
  }
}
