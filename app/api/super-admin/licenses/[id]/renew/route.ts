import {
  enforceSuperAdminApiAccess,
  superAdminError,
  superAdminSuccess
} from "@/app/api/super-admin/_shared";
import { readOptionalJsonBody } from "@/lib/conversation-control/api";
import { renewSuperAdminLicense } from "@/lib/super-admin/services/license-admin.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

export async function POST(request: Request, context: RouteContext) {
  try {
    const actor = await enforceSuperAdminApiAccess(request);
    const body = await readOptionalJsonBody(request) as { days?: number };
    return superAdminSuccess(await renewSuperAdminLicense(actor, context.params.id, body, request));
  } catch (error) {
    return superAdminError(error);
  }
}
