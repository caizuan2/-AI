import { prisma } from "@/lib/prisma";
import { requireAdminUser } from "@/lib/admin";
import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { writeAuditLog } from "@/lib/audit-log";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { hasDatabaseUrl } from "@/lib/server-config";

export const dynamic = "force-dynamic";

interface AdminUserResponse {
  id: string;
  email: string | null;
  phone: string | null;
  name: string;
  licenseActivated: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface UpdateLicenseActivationResponse {
  user: AdminUserResponse;
}

function serializeUser(user: {
  id: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  licenseActivated: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): AdminUserResponse {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    name: user.name ?? user.phone ?? user.email ?? user.id,
    licenseActivated: user.licenseActivated,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString()
  };
}

function parsePatchRequest(body: unknown) {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const licenseActivated = typeof body.licenseActivated === "boolean" ? body.licenseActivated : null;

  if (!userId) {
    throw new ValidationError("请选择要更新的用户。");
  }

  if (licenseActivated === null) {
    throw new ValidationError("licenseActivated 必须是布尔值。");
  }

  return { userId, licenseActivated };
}

export async function PATCH(request: Request) {
  let admin: Awaited<ReturnType<typeof requireAdminUser>>;

  try {
    admin = await requireAdminUser(request);
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("更新卡密激活状态"));
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
        licenseActivated: input.licenseActivated
      }
    });

    await writeAuditLog({
      userId: admin.id,
      role: admin.role,
      action: "ADMIN_USER_UPDATE",
      targetType: "user",
      targetId: input.userId,
      request,
      metadata: {
        licenseActivated: input.licenseActivated
      }
    });

    return apiSuccess<UpdateLicenseActivationResponse>({
      user: serializeUser(user)
    });
  } catch (error) {
    return apiError(error);
  }
}
