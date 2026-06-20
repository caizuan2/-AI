import {
  enforceSuperAdminApiAccess,
  superAdminSuccess
} from "@/app/api/super-admin/_shared";
import { databaseConfigError } from "@/lib/api-response";
import { hasDatabaseUrl } from "@/lib/server-config";
import { listSuperAdminUsers } from "@/lib/super-admin/services/user-admin.service";
import { superAdminUserError } from "@/app/api/super-admin/users/_errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await enforceSuperAdminApiAccess(request);

    if (!hasDatabaseUrl()) {
      throw databaseConfigError("读取超级管理员用户列表");
    }

    const { searchParams } = new URL(request.url);

    return superAdminSuccess(await listSuperAdminUsers(searchParams));
  } catch (error) {
    return superAdminUserError(error);
  }
}
