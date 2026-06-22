import {
  enforceSuperAdminApiAccess,
  superAdminSuccess
} from "@/app/api/super-admin/_shared";
import { superAdminUserError } from "@/app/api/super-admin/users/_errors";
import { databaseConfigError } from "@/lib/api-response";
import { hasDatabaseUrl } from "@/lib/server-config";
import { updateSuperAdminUserStatus } from "@/lib/super-admin/services/user-admin.service";

export const dynamic = "force-dynamic";

async function readBody(request: Request) {
  try {
    return await request.json() as { isActive?: unknown; reason?: unknown };
  } catch {
    return {};
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await enforceSuperAdminApiAccess(request);

    if (!hasDatabaseUrl()) {
      throw databaseConfigError("修改用户启用状态");
    }

    const body = await readBody(request);

    return superAdminSuccess(await updateSuperAdminUserStatus({
      actor,
      targetUserId: params.id,
      isActive: body.isActive,
      reason: typeof body.reason === "string" ? body.reason : undefined,
      request
    }));
  } catch (error) {
    return superAdminUserError(error);
  }
}
