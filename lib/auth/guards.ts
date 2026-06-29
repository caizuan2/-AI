import "server-only";

import { requireUser } from "@/lib/auth";
import { checkUserLicense } from "@/lib/auth/license";
import { writeAuditLog } from "@/lib/audit-log";
import { ForbiddenError } from "@/lib/errors";
import { getHighestRole } from "@/lib/rbac/roles";
export { requireAuth, requireKbAdmin, requireRole, requireSuperAdmin } from "@/lib/auth/rbac";
import { getUserRoles, requireKbAdmin, requireRole, requireSuperAdmin } from "@/lib/auth/rbac";

export async function requireLicensedUser() {
  const user = await requireUser();

  await checkUserLicense(user.id, "user_app");

  return user;
}

export function requireUserAppAccess(request?: Request) {
  return requireRole("user", {
    request,
    product: "user_app",
    requireLicense: true,
    deniedAction: "RBAC_ACCESS_DENIED",
    targetType: "user_app"
  });
}

export async function requireAiChatAccess(request?: Request, targetType = "ai_chat") {
  const user = await requireUser();
  const roles = await getUserRoles(user);
  const highestRole = getHighestRole(roles);
  const hasIngestAccess = roles.some((role) =>
    role === "kb_admin" ||
    role === "ingest_admin" ||
    role === "enterprise_admin" ||
    role === "super_admin"
  );
  const hasUserAppAccess = highestRole === "user";

  if (!hasUserAppAccess && !hasIngestAccess) {
    await writeAuditLog({
      userId: user.id,
      role: highestRole,
      action: "RBAC_ACCESS_DENIED",
      targetType,
      targetId: null,
      request,
      metadata: {
        requiredAccess: ["user_app", "ingest_admin"],
        actualRole: highestRole,
        roles
      }
    });

    throw new ForbiddenError("当前账号不能访问该产品入口。");
  }

  if (hasIngestAccess) {
    if (!roles.includes("super_admin")) {
      await checkUserLicense(user.id, "ingest_admin");
    }
  } else {
    await checkUserLicense(user.id, "user_app");
  }

  return {
    ...user,
    role: highestRole,
    roles
  };
}

export function requireIngestAdminAccess(request?: Request) {
  return requireKbAdmin(request, {
    product: "ingest_admin",
    requireLicense: true,
    deniedAction: "RBAC_ACCESS_DENIED",
    targetType: "ingest_admin"
  });
}

export function requireSuperAdminAccess(request?: Request) {
  return requireSuperAdmin(request, {
    product: "super_admin",
    deniedAction: "RBAC_ACCESS_DENIED",
    targetType: "super_admin"
  });
}
