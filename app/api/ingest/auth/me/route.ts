import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth";
import { setIngestPortalCookie, toIngestAuthUser } from "@/lib/enterprise/ingest-auth-session";
import { toAppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    const authUser = await toIngestAuthUser(user);

    await setIngestPortalCookie(user, request);

    return apiSuccess({
      success: true,
      authenticated: true,
      licenseActivated: authUser.licenseActivated,
      role: authUser.roles[0] ?? null,
      user: authUser
    });
  } catch (error) {
    const appError = toAppError(error);

    if (appError.code === "UNAUTHORIZED") {
      return apiSuccess({
        success: true,
        authenticated: false,
        licenseActivated: false,
        role: null,
        user: null
      });
    }

    return apiError(error);
  }
}
