import { getUserMetrics } from "@/lib/super-admin/services/user.service";
import {
  enforceSuperAdminApiAccess,
  superAdminError,
  superAdminSuccess
} from "@/app/api/super-admin/_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await enforceSuperAdminApiAccess(request);

    return superAdminSuccess(getUserMetrics());
  } catch (error) {
    return superAdminError(error);
  }
}
