import { apiError, apiSuccess } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import {
  createLocalAuthCookieValue,
  createLocalUser,
  isLocalAuthAllowedHost,
  localAuthCookieOptions,
  LOCAL_AUTH_COOKIE_NAME,
  type LocalAuthUser
} from "@/lib/auth/local";
import { ValidationError, UnauthorizedError } from "@/lib/errors";
import { hasSupabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

interface LocalAuthResponse {
  user: LocalAuthUser;
}

function parseLocalLoginRequest(body: unknown) {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    throw new ValidationError("请输入邮箱和密码。");
  }

  return { email };
}

export async function POST(request: Request) {
  if (hasSupabaseConfig() || !isLocalAuthAllowedHost(request.headers.get("host"))) {
    return apiError(new UnauthorizedError("本地开发登录不可用，请使用 Supabase Auth。"));
  }

  try {
    const input = parseLocalLoginRequest(await request.json());
    const user = createLocalUser(input.email);
    const response = apiSuccess<LocalAuthResponse>({ user });

    response.cookies.set(
      LOCAL_AUTH_COOKIE_NAME,
      createLocalAuthCookieValue(user),
      localAuthCookieOptions
    );

    return response;
  } catch (error) {
    return apiError(error);
  }
}
