import {
  enforceSuperAdminApiAccess,
  superAdminError,
  superAdminSuccess
} from "@/app/api/super-admin/_shared";
import { disableSuperAdminLicense } from "@/lib/super-admin/services/license-admin.service";

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

    return superAdminSuccess(await disableSuperAdminLicense(actor, context.params.id, request));
  } catch (error) {
    return superAdminError(error);
  }
}
