import {
  enforceSuperAdminApiAccess,
  superAdminSuccess
} from "@/app/api/super-admin/_shared";
import { superAdminUserError } from "@/app/api/super-admin/users/_errors";
import { databaseConfigError } from "@/lib/api-response";
import { hasDatabaseUrl } from "@/lib/server-config";
import { getSuperAdminUserAudit } from "@/lib/super-admin/services/user-admin.service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await enforceSuperAdminApiAccess(request);

    if (!hasDatabaseUrl()) {
      throw databaseConfigError("读取用户角色审计");
    }

    return superAdminSuccess(await getSuperAdminUserAudit());
  } catch (error) {
    return superAdminUserError(error);
  }
}
