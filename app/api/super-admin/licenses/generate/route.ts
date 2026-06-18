import {
  enforceSuperAdminApiAccess,
  superAdminError,
  superAdminSuccess
} from "@/app/api/super-admin/_shared";
import { readOptionalJsonBody } from "@/lib/conversation-control/api";
import { generateSuperAdminLicenses } from "@/lib/super-admin/services/license-admin.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const actor = await enforceSuperAdminApiAccess(request);
    const body = await readOptionalJsonBody(request);

    return superAdminSuccess(await generateSuperAdminLicenses(actor, body, request));
  } catch (error) {
    return superAdminError(error);
  }
}
