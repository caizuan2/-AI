import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { requireIngestAdminAccess } from "@/lib/auth/guards";
import { setIngestPortalCookie, toIngestAuthUser } from "@/lib/enterprise/ingest-auth-session";
import { toAppError } from "@/lib/errors";
import { getHighestRole, type AppRole } from "@/lib/rbac/roles";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const hasSessionCookie = Boolean(cookies().get(SESSION_COOKIE_NAME)?.value);

  try {
    const user = await getCurrentUser();
    const authUser = await toIngestAuthUser(user);
    const role = authUser.roles.length > 0
      ? getHighestRole(authUser.roles as AppRole[])
      : null;
    const hasIngestRole = authUser.roles.some((candidateRole) =>
      candidateRole === "kb_admin" || candidateRole === "ingest_admin" || candidateRole === "super_admin"
    );
    let licenseErrorCode: "LICENSE_DISABLED" | "LICENSE_EXPIRED" | undefined;
    let hasCurrentLicenseAccess = false;

    if (user.isActive && hasIngestRole) {
      try {
        await requireIngestAdminAccess(request);
        hasCurrentLicenseAccess = true;
      } catch (error) {
        const appError = toAppError(error);

        if (appError.code === "LICENSE_DISABLED" || appError.code === "LICENSE_EXPIRED") {
          licenseErrorCode = appError.code;
        } else if (appError.statusCode >= 500) {
          throw error;
        }
      }
    }

    const activated = hasCurrentLicenseAccess;
    const hasIngestAccess = user.isActive && hasIngestRole && hasCurrentLicenseAccess;
    const effectiveUser = hasIngestAccess
      ? { ...user, licenseActivated: true }
      : { ...user, licenseActivated: false };
    const responseUser = {
      ...authUser,
      licenseActivated: hasIngestAccess,
      hasIngestAccess
    };

    if (!licenseErrorCode) {
      await setIngestPortalCookie(effectiveUser, request);
    }

    return apiSuccess({
      success: true,
      authenticated: true,
      activated,
      appType: "ingest_admin",
      requiredAppType: "ingest_admin",
      licenseActivated: hasIngestAccess,
      hasIngestAccess,
      redirectTarget: hasIngestAccess ? "/admin-ingest?app=ingest-admin&platform=web" : "/ingest/activate",
      role,
      roles: authUser.roles,
      user: responseUser,
      ...(licenseErrorCode ? {
        errorCode: licenseErrorCode,
        message: "卡密已失效。"
      } : {})
    });
  } catch (error) {
    const appError = toAppError(error);

    if (appError.code === "UNAUTHORIZED") {
      return apiSuccess({
        success: true,
        authenticated: false,
        activated: false,
        appType: "ingest_admin",
        requiredAppType: "ingest_admin",
        licenseActivated: false,
        hasIngestAccess: false,
        redirectTarget: "/ingest/login",
        role: null,
        roles: [],
        user: null,
        errorCode: hasSessionCookie ? "INVALID_SESSION" : "AUTH_REQUIRED",
        message: hasSessionCookie ? "登录状态已失效，请重新登录。" : "请先登录后再继续。"
      });
    }

    return apiError(error);
  }
}
