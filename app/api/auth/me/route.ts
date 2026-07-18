import { apiError, apiSuccess } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import {
  getEntryPathFromAccessProfile,
  getEntryRoleFromAccessProfile,
  getUserAccessProfile
} from "@/lib/auth/access-control";
import type { EntryRole } from "@/lib/auth/product";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";
import { readUserAvatarProfile } from "@/lib/user-avatar";

export const dynamic = "force-dynamic";

interface MeResponse {
  user: {
    id: string;
    phone: string;
    email: string | null;
    name: string;
    displayName: string;
    avatar_url: string | null;
    avatarUrl: string | null;
    avatar_updated_at: string | null;
    avatarUpdatedAt: string | null;
    licenseActivated: boolean;
    isSuperAdmin: boolean;
    role: EntryRole;
    rbacRole: string;
    baseRole: string | null;
    roles: string[];
    productType: string | null;
    cardType: string | null;
    licenseType: string | null;
    appType: string | null;
    permissions: string[];
    entryPath: string;
  };
}

async function toMeResponse(user: Awaited<ReturnType<typeof requireUser>>, request: Request): Promise<MeResponse> {
  const accessProfile = await getUserAccessProfile(user);
  const roles = accessProfile.roles;
  const isSuperAdmin = roles.includes("super_admin");
  const licenseActivated = accessProfile.licenseActivated;
  const role = getEntryRoleFromAccessProfile(accessProfile);
  const avatar = await readUserAvatarProfile(user.id, request);
  const avatarUrl = avatar?.avatar_url ?? null;
  const avatarUpdatedAt = avatar?.updated_at ?? null;

  return {
    user: {
      id: user.id,
      phone: user.phone,
      email: user.email,
      name: user.name,
      displayName: user.name,
      avatar_url: avatarUrl,
      avatarUrl,
      avatar_updated_at: avatarUpdatedAt,
      avatarUpdatedAt,
      licenseActivated,
      isSuperAdmin,
      role,
      rbacRole: accessProfile.role,
      baseRole: accessProfile.baseRole,
      roles,
      productType: accessProfile.productType,
      cardType: accessProfile.cardType,
      licenseType: accessProfile.licenseType,
      appType: accessProfile.appType,
      permissions: accessProfile.permissions,
      entryPath: getEntryPathFromAccessProfile(accessProfile)
    }
  };
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    return apiSuccess<MeResponse>(await toMeResponse(user, request));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const payload = await request.json().catch(() => {
      throw new ValidationError("请求体必须是合法 JSON。");
    });
    const nextName = typeof payload?.name === "string" ? payload.name.trim() : "";
    const nameLength = Array.from(nextName).length;

    if (!nextName) {
      throw new ValidationError("名称不能为空。");
    }

    if (nameLength < 2 || nameLength > 20) {
      throw new ValidationError("名称长度需要在 2 到 20 个字符之间。");
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { name: nextName },
      select: {
        id: true,
        email: true,
        phone: true,
        name: true,
        isActive: true,
        licenseActivated: true
      }
    });

    return apiSuccess<MeResponse>(await toMeResponse({
      id: updatedUser.id,
      email: updatedUser.email,
      phone: updatedUser.phone,
      name: updatedUser.name?.trim() || updatedUser.phone || updatedUser.email || updatedUser.id,
      isActive: updatedUser.isActive,
      licenseActivated: updatedUser.licenseActivated
    }, request));
  } catch (error) {
    return apiError(error);
  }
}
