import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { setIngestPortalCookie, toIngestAuthUser } from "@/lib/enterprise/ingest-auth-session";
import { resolveIngestAccessTier } from "@/lib/enterprise/ingest-access-tier";
import { toAppError } from "@/lib/errors";
import { getHighestRole, type AppRole } from "@/lib/rbac/roles";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const hasSessionCookie = Boolean(cookies().get(SESSION_COOKIE_NAME)?.value);

  try {
    const user = await getCurrentUser();
    const access = await resolveIngestAccessTier(user);
    const authUser = await toIngestAuthUser(user, access);
    const role = authUser.roles.length > 0
      ? getHighestRole(authUser.roles as AppRole[])
      : null;
    const hasIngestPortalAccess = access.capabilities.enterPortal;
    const hasIngestAccess = access.accessTier === "full_ingest";
    const licenseErrorCode = access.invalidLicenseCode ?? undefined;
    const responseUser = {
      ...authUser,
      licenseActivated: hasIngestPortalAccess,
      hasIngestPortalAccess,
      hasIngestAccess
    };

    if (!licenseErrorCode) {
      await setIngestPortalCookie(user, request, access);
    }

    return apiSuccess({
      success: true,
      authenticated: true,
      activated: hasIngestPortalAccess,
      appType: access.accessTier === "chat_only" ? "user_app" : "ingest_admin",
      requiredAppType: ["user_app", "ingest_admin"],
      licenseActivated: hasIngestPortalAccess,
      hasIngestPortalAccess,
      hasIngestAccess,
      accessTier: access.accessTier,
      capabilities: access.capabilities,
      redirectTarget: hasIngestPortalAccess ? "/admin-ingest?app=ingest-admin&platform=web" : "/ingest/activate",
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
        requiredAppType: ["user_app", "ingest_admin"],
        licenseActivated: false,
        hasIngestPortalAccess: false,
        hasIngestAccess: false,
        accessTier: "none",
        capabilities: {
          enterPortal: false,
          chat: false,
          aiControl: false,
          trainingMemory: false,
          saveKnowledge: false
        },
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
