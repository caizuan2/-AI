import { apiError, apiSuccess } from "@/lib/api-response";
import { destroySession } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface LogoutResponse {
  signedOut: true;
}

export async function POST(request: Request) {
  try {
    await destroySession(request);

    return apiSuccess<LogoutResponse>({ signedOut: true });
  } catch (error) {
    return apiError(error);
  }
}
