import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { normalizePhone, validatePhone } from "@/lib/auth/phone";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth";
import { ForbiddenError, UnauthorizedError, ValidationError } from "@/lib/errors";
import { hasDatabaseUrl } from "@/lib/server-config";

export const dynamic = "force-dynamic";

interface LoginResponse {
  success: true;
  licenseActivated: boolean;
  user: {
    id: string;
    phone: string;
    name: string;
  };
}

function parseLoginRequest(body: unknown) {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const phone = typeof body.phone === "string" ? normalizePhone(body.phone) : "";
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
    return apiError(databaseConfigError("登录"));
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return apiError(new ValidationError("请求体必须是合法 JSON。"));
  }

  let input: ReturnType<typeof parseLoginRequest>;

  try {
    input = parseLoginRequest(body);
  } catch (error) {
    return apiError(error);
  }

  try {
    const user = await prisma.user.findUnique({
      where: { phone: input.phone },
      select: {
        id: true,
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

    await createSession(user.id);

    return apiSuccess<LoginResponse>({
      success: true,
      licenseActivated: user.licenseActivated,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name ?? user.phone
      }
    });
  } catch (error) {
    return apiError(error);
  }
}
