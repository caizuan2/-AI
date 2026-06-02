import { prisma } from "@/lib/prisma";
import { requireAdminUser } from "@/lib/admin";
import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { hasDatabaseUrl } from "@/lib/server-config";

export const dynamic = "force-dynamic";

interface AdminUserResponse {
  id: string;
  email: string;
  name: string;
  betaAccess: boolean;
  betaRequestedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface UpdateBetaAccessResponse {
  user: AdminUserResponse;
}

function serializeUser(user: {
  id: string;
  email: string;
  name: string;
  betaAccess: boolean;
  betaRequestedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): AdminUserResponse {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    betaAccess: user.betaAccess,
    betaRequestedAt: user.betaRequestedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString()
  };
}

function parsePatchRequest(body: unknown) {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const betaAccess = typeof body.betaAccess === "boolean" ? body.betaAccess : null;

  if (!userId) {
    throw new ValidationError("请选择要更新的用户。");
  }

  if (betaAccess === null) {
    throw new ValidationError("betaAccess 必须是布尔值。");
  }

  return { userId, betaAccess };
}

export async function PATCH(request: Request) {
  try {
    await requireAdminUser();
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("更新 Beta 测试资格"));
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return apiError(new ValidationError("请求体必须是合法 JSON。"));
  }

  let input: ReturnType<typeof parsePatchRequest>;

  try {
    input = parsePatchRequest(body);
  } catch (error) {
    return apiError(error);
  }

  try {
    const existing = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true }
    });

    if (!existing) {
      return apiError(new NotFoundError("用户不存在。"));
    }

    const user = await prisma.user.update({
      where: { id: input.userId },
      data: {
        betaAccess: input.betaAccess
      }
    });

    return apiSuccess<UpdateBetaAccessResponse>({
      user: serializeUser(user)
    });
  } catch (error) {
    return apiError(error);
  }
}
