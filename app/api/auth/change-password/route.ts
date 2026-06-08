import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { requireUser } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { UnauthorizedError, ValidationError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChangePasswordResponse {
  changed: true;
}

function readString(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string") {
      return value;
    }
  }

  return "";
}

function parseChangePasswordRequest(body: unknown) {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const record = body as Record<string, unknown>;
  const currentPassword = readString(record, "current_password", "currentPassword");
  const newPassword = readString(record, "new_password", "newPassword");
  const confirmPassword = readString(record, "confirm_password", "confirmPassword");

  if (!currentPassword || !newPassword || !confirmPassword) {
    throw new ValidationError("当前密码、新密码和确认密码不能为空。");
  }

  if (newPassword.length < 6) {
    throw new ValidationError("新密码至少需要 6 位。");
  }

  if (newPassword !== confirmPassword) {
    throw new ValidationError("两次输入的新密码不一致。");
  }

  return {
    currentPassword,
    newPassword
  };
}

export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof requireUser>>;

  try {
    user = await requireUser();
  } catch (error) {
    return apiError(error);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return apiError(new ValidationError("请求体必须是合法 JSON。"));
  }

  let input: ReturnType<typeof parseChangePasswordRequest>;

  try {
    input = parseChangePasswordRequest(body);
  } catch (error) {
    return apiError(error);
  }

  try {
    const current = await prisma.user.findUnique({
      where: {
        id: user.id
      },
      select: {
        passwordHash: true
      }
    });

    if (!current || !(await verifyPassword(input.currentPassword, current.passwordHash))) {
      throw new UnauthorizedError("当前密码不正确。");
    }

    await prisma.user.update({
      where: {
        id: user.id
      },
      data: {
        passwordHash: await hashPassword(input.newPassword)
      }
    });

    return apiSuccess<ChangePasswordResponse>({ changed: true });
  } catch (error) {
    return apiError(error);
  }
}
