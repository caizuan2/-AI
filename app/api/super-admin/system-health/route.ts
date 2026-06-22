import {
  checkAiModelStatus,
  checkApiStatus,
  checkDatabaseStatus,
  checkStorageStatus,
  getSystemHealth
} from "@/lib/super-admin/services/system.service";
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
      services: getSystemHealth(),
      checks: {
        api: checkApiStatus(),
        database: checkDatabaseStatus(),
        aiModel: checkAiModelStatus(),
        storage: checkStorageStatus()
      }
    });
  } catch (error) {
    return superAdminError(error);
  }
}
