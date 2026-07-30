import {
  enforceSuperAdminApiAccess,
  superAdminError,
  superAdminSuccess
} from "@/app/api/super-admin/_shared";
import { readOptionalJsonBody } from "@/lib/conversation-control/api";
import { searchSuperAdminLicenseAccounts } from "@/lib/super-admin/services/license-admin.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await enforceSuperAdminApiAccess(request);
    const body = await readOptionalJsonBody(request);

    return superAdminSuccess(await searchSuperAdminLicenseAccounts(body));
  } catch (error) {
    return superAdminError(error);
  }
}
