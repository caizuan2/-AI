import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess, databaseConfigError, sessionConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { createSession, type AppUser } from "@/lib/auth";
import { normalizePhone, validatePhone } from "@/lib/auth/phone";
import { hashPassword } from "@/lib/auth/password";
import { ensureRegistrationSchema } from "@/lib/db/registration-schema";
import { AppError, ValidationError } from "@/lib/errors";
import { setIngestPortalCookie, toIngestAuthUser } from "@/lib/enterprise/ingest-auth-session";
import { hasDatabaseUrl, hasSessionSecret } from "@/lib/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readRegisterRequest(body: unknown) {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const phone = normalizePhone(readString(body.phone) || readString(body.username));
  const password = typeof body.password === "string" ? body.password : "";
  const name = readString(body.name) || phone;

  if (!validatePhone(phone)) {
    throw new ValidationError("请输入合法手机号。");
  }

  if (password.length < 8) {
    throw new ValidationError("密码至少需要 8 位。");
  }

  return { phone, password, name };
}

export async function POST(request: Request) {
  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("注册投喂账号"));
  }

  if (!hasSessionSecret()) {
    return apiError(sessionConfigError("注册投喂账号"));
  }

  let input: ReturnType<typeof readRegisterRequest>;

  try {
    input = readRegisterRequest(await request.json());
  } catch (error) {
    return apiError(error instanceof Error ? error : new ValidationError("请求体必须是合法 JSON。"));
  }

  try {
    const schema = await ensureRegistrationSchema();

    if (!schema.ready) {
      throw new AppError("DATABASE_ERROR", "数据库表结构未就绪，请联系管理员。", 500);
    }

    const existing = await prisma.user.findUnique({
      where: { phone: input.phone },
      select: { id: true }
    });

    if (existing) {
      throw new AppError("VALIDATION_ERROR", "该手机号已注册，请直接登录。", 409);
    }

    const user = await prisma.user.create({
      data: {
        phone: input.phone,
        passwordHash: await hashPassword(input.password),
        name: input.name,
        isActive: true,
        licenseActivated: false
      },
      select: {
        id: true,
        email: true,
        phone: true,
        name: true,
        isActive: true,
        licenseActivated: true
      }
    });
    const session = await createSession(user.id, request);
    const appUser: AppUser = {
      ...user,
      name: user.name?.trim() || user.phone
    };

    await setIngestPortalCookie(appUser, request);

    return apiSuccess({
      success: true,
      sessionToken: session.token,
      licenseActivated: appUser.licenseActivated,
      user: await toIngestAuthUser(appUser)
    }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
