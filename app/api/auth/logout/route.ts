import { apiError, apiSuccess } from "@/lib/api-response";
import { UnauthorizedError } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

interface LogoutResponse {
  signedOut: true;
}

export async function POST() {
  try {
    if (!hasSupabaseConfig()) {
      throw new UnauthorizedError("认证服务未配置，请先设置 Supabase 环境变量。");
    }

    const supabase = createServerSupabaseClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      throw new UnauthorizedError("退出登录失败，请稍后重试。");
    }

    return apiSuccess<LogoutResponse>({ signedOut: true });
  } catch (error) {
    return apiError(error);
  }
}
