import { apiError, apiSuccess } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { setIngestPortalCookie, toIngestAuthUser } from "@/lib/enterprise/ingest-auth-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser();

    await setIngestPortalCookie(user, request);

    return apiSuccess({
      success: true,
      licenseActivated: user.licenseActivated,
      user: await toIngestAuthUser(user)
    });
  } catch (error) {
    return apiError(error);
  }
}
