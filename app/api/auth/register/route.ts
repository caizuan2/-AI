import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { normalizePhone, validatePhone } from "@/lib/auth/phone";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth";
import { ValidationError } from "@/lib/errors";
import { hasDatabaseUrl } from "@/lib/server-config";

export const dynamic = "force-dynamic";

interface RegisterResponse {
  user: {
    id: string;
    phone: string;
    name: string;
    licenseActivated: boolean;
  };
}

function parseRegisterRequest(body: unknown) {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const phone = typeof body.phone === "string" ? normalizePhone(body.phone) : "";
  const password = typeof body.password === "string" ? body.password : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!validatePhone(phone)) {
    throw new ValidationError("请输入合法手机号。");
  }

  if (password.length < 8) {
    throw new ValidationError("密码至少需要 8 位。");
  }

  return {
    phone,
    password,
    name: name || phone
  };
}

export async function POST(request: Request) {
  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("注册账号"));
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return apiError(new ValidationError("请求体必须是合法 JSON。"));
  }

  let input: ReturnType<typeof parseRegisterRequest>;

  try {
    input = parseRegisterRequest(body);
  } catch (error) {
    return apiError(error);
  }

  try {
    const existing = await prisma.user.findUnique({
      where: { phone: input.phone },
      select: { id: true }
    });

    if (existing) {
      return apiError(new ValidationError("该手机号已注册，请直接登录。"));
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
        phone: true,
        name: true,
        licenseActivated: true
      }
    });

    await createSession(user.id);

    return apiSuccess<RegisterResponse>({
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name ?? user.phone,
        licenseActivated: user.licenseActivated
      }
    }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
