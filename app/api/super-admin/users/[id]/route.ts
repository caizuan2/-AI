import {
  enforceSuperAdminApiAccess,
  superAdminSuccess
} from "@/app/api/super-admin/_shared";
import { superAdminUserError } from "@/app/api/super-admin/users/_errors";
import { databaseConfigError } from "@/lib/api-response";
import { hasDatabaseUrl } from "@/lib/server-config";
import { getSuperAdminUserDetail } from "@/lib/super-admin/services/user-admin.service";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    await enforceSuperAdminApiAccess(request);

    if (!hasDatabaseUrl()) {
      throw databaseConfigError("读取超级管理员用户详情");
    }

    return superAdminSuccess(await getSuperAdminUserDetail(params.id));
  } catch (error) {
    return superAdminUserError(error);
  }
}
