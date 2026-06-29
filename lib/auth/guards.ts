import "server-only";

import { requireUser } from "@/lib/auth";
import { getUserAccessProfile, hasIngestAccess, hasUserClientAccess } from "@/lib/auth/access-control";
import { checkUserLicense } from "@/lib/auth/license";
import { writeAuditLog } from "@/lib/audit-log";
import { ForbiddenError, LicenseRequiredError } from "@/lib/errors";
export { requireAuth, requireKbAdmin, requireRole, requireSuperAdmin } from "@/lib/auth/rbac";
import { requireSuperAdmin } from "@/lib/auth/rbac";

export async function requireLicensedUser() {
  const user = await requireUser();

  await checkUserLicense(user.id, "user_app");

  return user;
}

export async function requireUserAppAccess(request?: Request) {
  const user = await requireUser();
  const profile = await getUserAccessProfile(user);

  if (!profile.licenseActivated) {
    throw new LicenseRequiredError("请先输入卡密激活知识库。");
  }

  if (!hasUserClientAccess(profile)) {
    await writeAuditLog({
      userId: user.id,
      role: profile.role,
      action: "product.blocked",
      targetType: "user_app",
      targetId: null,
      request,
      metadata: {
        role: profile.role,
        roles: profile.roles,
        baseRole: profile.baseRole,
        licenseType: profile.licenseType,
        productType: profile.productType,
        cardType: profile.cardType,
        appType: profile.appType,
        permissions: profile.permissions,
        source: "require_user_app_access"
      }
    });

    throw new ForbiddenError("当前账号不能访问用户端入口。");
  }

  await checkUserLicense(user.id, "user_app");

  return {
    ...user,
    role: "user" as const,
    roles: profile.roles
  };
}

export async function requireIngestAdminAccess(request?: Request) {
  const user = await requireUser();
  const profile = await getUserAccessProfile(user);

  if (!hasIngestAccess(profile)) {
    await writeAuditLog({
      userId: user.id,
      role: profile.role,
      action: "product.blocked",
      targetType: "ingest_admin",
      targetId: null,
      request,
      metadata: {
        role: profile.role,
        roles: profile.roles,
        baseRole: profile.baseRole,
        licenseType: profile.licenseType,
        productType: profile.productType,
        cardType: profile.cardType,
        appType: profile.appType,
        permissions: profile.permissions,
        source: "require_ingest_admin_access"
      }
    });

    throw new ForbiddenError("当前账号不能访问投喂端入口。");
  }

  return {
    ...user,
    role: profile.role,
    roles: profile.roles
  };
}

export function requireSuperAdminAccess(request?: Request) {
  return requireSuperAdmin(request, {
    product: "super_admin",
    deniedAction: "RBAC_ACCESS_DENIED",
    targetType: "super_admin"
  });
}
