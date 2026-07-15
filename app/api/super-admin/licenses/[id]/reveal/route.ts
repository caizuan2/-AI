import {
  enforceSuperAdminApiAccess,
  superAdminError,
  superAdminSuccess
} from "@/app/api/super-admin/_shared";
import { revealSuperAdminLicense } from "@/lib/super-admin/services/license-admin.service";

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
    const response = superAdminSuccess(await revealSuperAdminLicense(actor, context.params.id, request));
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.headers.set("Pragma", "no-cache");

    return response;
  } catch (error) {
    return superAdminError(error);
  }
}
