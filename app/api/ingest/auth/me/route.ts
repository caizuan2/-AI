import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth";
import { setIngestPortalCookie, toIngestAuthUser } from "@/lib/enterprise/ingest-auth-session";
import { toAppError } from "@/lib/errors";
import { getHighestRole, type AppRole } from "@/lib/rbac/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    const authUser = await toIngestAuthUser(user);
    const hasIngestAccess = authUser.roles.some((role) =>
      role === "kb_admin" || role === "ingest_admin" || role === "super_admin"
    );
    const effectiveUser = hasIngestAccess
      ? { ...user, licenseActivated: true }
      : { ...user, licenseActivated: false };
    const responseUser = {
      ...authUser,
      licenseActivated: hasIngestAccess
    };
    const role = authUser.roles.length > 0
      ? getHighestRole(authUser.roles as AppRole[])
      : null;

    await setIngestPortalCookie(effectiveUser, request);

    return apiSuccess({
      success: true,
      authenticated: true,
      appType: "ingest_admin",
      requiredAppType: "ingest_admin",
      licenseActivated: hasIngestAccess,
      redirectTarget: hasIngestAccess ? "/admin-ingest?app=ingest-admin&platform=web" : "/ingest/activate",
      role,
      user: responseUser
    });
  } catch (error) {
    const appError = toAppError(error);

    if (appError.code === "UNAUTHORIZED") {
      return apiSuccess({
        success: true,
        authenticated: false,
        appType: "ingest_admin",
        requiredAppType: "ingest_admin",
        licenseActivated: false,
        redirectTarget: "/ingest/login",
        role: null,
        user: null
      });
    }

    return apiError(error);
  }
}
