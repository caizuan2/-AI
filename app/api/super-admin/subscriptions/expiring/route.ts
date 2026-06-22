import { enforceSuperAdminApiAccess, superAdminError, superAdminSuccess } from "@/app/api/super-admin/_shared";
import { listExpiringSubscriptions } from "@/lib/subscription/subscription.service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await enforceSuperAdminApiAccess(request);
    const { searchParams } = new URL(request.url);
    const days = Number(searchParams.get("days") ?? 30);

    return superAdminSuccess(await listExpiringSubscriptions(Number.isFinite(days) ? days : 30));
  } catch (error) {
    return superAdminError(error);
  }
}
