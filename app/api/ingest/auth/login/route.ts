import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess, databaseConfigError, sessionConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { createSession, type AppUser } from "@/lib/auth";
import { normalizePhone, validatePhone } from "@/lib/auth/phone";
import { verifyPassword } from "@/lib/auth/password";
import { ForbiddenError, UnauthorizedError, ValidationError } from "@/lib/errors";
import { setIngestPortalCookie, toIngestAuthUser } from "@/lib/enterprise/ingest-auth-session";
import { hasDatabaseUrl, hasSessionSecret } from "@/lib/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readLoginRequest(body: unknown) {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const phone = normalizePhone(readString(body.phone) || readString(body.username));
  const password = typeof body.password === "string" ? body.password : "";

  if (!validatePhone(phone)) {
    throw new ValidationError("请输入合法手机号。");
  }

  if (!password) {
    throw new ValidationError("请输入密码。");
  }

  return { phone, password };
}

export async function POST(request: Request) {
  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("登录投喂账号"));
  }

  if (!hasSessionSecret()) {
    return apiError(sessionConfigError("登录投喂账号"));
  }

  let input: ReturnType<typeof readLoginRequest>;

  try {
    input = readLoginRequest(await request.json());
  } catch (error) {
    return apiError(error instanceof Error ? error : new ValidationError("请求体必须是合法 JSON。"));
  }

  try {
    const user = await prisma.user.findUnique({
      where: { phone: input.phone },
      select: {
        id: true,
        email: true,
        phone: true,
        name: true,
        passwordHash: true,
        isActive: true,
        licenseActivated: true
      }
    });

    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new UnauthorizedError("手机号或密码错误。");
    }

    if (!user.isActive) {
      throw new ForbiddenError("账号已禁用。");
    }

    const session = await createSession(user.id, request);
    const appUser: AppUser = {
      id: user.id,
      email: user.email,
      phone: user.phone,
      name: user.name?.trim() || user.phone,
      isActive: user.isActive,
      licenseActivated: user.licenseActivated
    };

    await setIngestPortalCookie(appUser, request);

    return apiSuccess({
      success: true,
      sessionToken: session.token,
      licenseActivated: appUser.licenseActivated,
      user: await toIngestAuthUser(appUser)
    });
  } catch (error) {
    return apiError(error);
  }
}
