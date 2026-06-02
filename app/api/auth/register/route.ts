import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess, databaseConfigError, sessionConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { normalizePhone, validatePhone } from "@/lib/auth/phone";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth";
import { AppError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { hasDatabaseUrl, hasSessionSecret } from "@/lib/server-config";

export const dynamic = "force-dynamic";

interface RegisterResponse {
  user: {
    id: string;
    phone: string;
    name: string;
    licenseActivated: boolean;
  };
}

interface DatabaseErrorDetails {
  name: string;
  message: string;
  code?: string;
  clientVersion?: string;
  stack?: string;
}

function serializeDatabaseError(error: unknown): DatabaseErrorDetails {
  if (error instanceof Error) {
    const details = error as Error & {
      code?: unknown;
      clientVersion?: unknown;
    };

    return {
      name: error.name,
      message: error.message,
      code: typeof details.code === "string" ? details.code : undefined,
      clientVersion: typeof details.clientVersion === "string" ? details.clientVersion : undefined,
      stack: error.stack
    };
  }

  return {
    name: "UnknownError",
    message: String(error)
  };
}

function isPrismaLikeError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const details = error as Error & {
    code?: unknown;
    clientVersion?: unknown;
  };

  return (
    error.name.startsWith("PrismaClient") ||
    typeof details.clientVersion === "string" ||
    typeof details.code === "string"
  );
}

function toRegisterError(error: unknown) {
  if (!isPrismaLikeError(error)) {
    return error;
  }

  const details = serializeDatabaseError(error);

  logger.error("auth.register.database_error", { ...details });
  console.error("[api/auth/register] database error", details);

  if (details.code === "P2002") {
    return new ValidationError("该手机号已注册，请直接登录。");
  }

  if (
    details.code === "P1001" ||
    details.name === "PrismaClientInitializationError" ||
    /can't reach database server|connect|connection|timeout/i.test(details.message)
  ) {
    return new AppError(
      "DATABASE_ERROR",
      "数据库连接失败，请检查 Netlify 的 DATABASE_URL 是否为 Supabase Pooler 完整连接串。",
      500
    );
  }

  if (
    details.code === "P2021" ||
    details.code === "P2022" ||
    /does not exist|table|column|migration/i.test(details.message)
  ) {
    return new AppError(
      "DATABASE_ERROR",
      "数据库表结构未就绪，请使用 DIRECT_URL 执行 pnpm prisma:migrate:deploy。",
      500
    );
  }

  if (details.name === "PrismaClientValidationError") {
    return new AppError("DATABASE_ERROR", "数据库查询验证失败，请检查 Prisma schema 与迁移状态。", 500);
  }

  return new AppError("DATABASE_ERROR", "数据库操作失败，请检查生产数据库连接和迁移状态。", 500);
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

  if (!hasSessionSecret()) {
    return apiError(sessionConfigError("注册账号"));
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
    return apiError(toRegisterError(error));
  }
}
