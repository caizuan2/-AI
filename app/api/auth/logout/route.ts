import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentAuthUser } from "@/lib/auth";
import { LOCAL_AUTH_COOKIE_NAME } from "@/lib/auth/local";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

interface LogoutResponse {
  signedOut: true;
}

export async function POST() {
  try {
    if (!hasSupabaseConfig()) {
      const response = apiSuccess<LogoutResponse>({ signedOut: true });

      response.cookies.set(LOCAL_AUTH_COOKIE_NAME, "", {
        path: "/",
        maxAge: 0
      });

      return response;
    }

    await getCurrentAuthUser();
    const supabase = createServerSupabaseClient();

    await supabase.auth.signOut();

    const response = apiSuccess<LogoutResponse>({ signedOut: true });

    response.cookies.set(LOCAL_AUTH_COOKIE_NAME, "", {
      path: "/",
      maxAge: 0
    });

    return response;
  } catch (error) {
    return apiError(error);
  }
}
