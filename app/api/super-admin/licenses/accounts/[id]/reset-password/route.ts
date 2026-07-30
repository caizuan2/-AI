import {
  enforceSuperAdminApiAccess,
  superAdminError,
  superAdminSuccess
} from "@/app/api/super-admin/_shared";
import { readOptionalJsonBody } from "@/lib/conversation-control/api";
import { resetSuperAdminLicenseAccountPassword } from "@/lib/super-admin/services/license-admin.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const actor = await enforceSuperAdminApiAccess(request);
    const body = await readOptionalJsonBody(request);

    return superAdminSuccess(
      await resetSuperAdminLicenseAccountPassword(actor, context.params.id, body, request)
    );
  } catch (error) {
    return superAdminError(error);
  }
}
