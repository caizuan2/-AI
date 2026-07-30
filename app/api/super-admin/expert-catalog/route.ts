import {
  enforceSuperAdminApiAccess,
  superAdminError,
  superAdminSuccess
} from "@/app/api/super-admin/_shared";
import { getExpertCatalog } from "@/lib/super-admin/services/expert-catalog.service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await enforceSuperAdminApiAccess(request);
    return superAdminSuccess(await getExpertCatalog());
  } catch (error) {
    return superAdminError(error);
  }
}
