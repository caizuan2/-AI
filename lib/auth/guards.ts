import "server-only";

import { requireUser } from "@/lib/auth";
import { checkUserLicense } from "@/lib/auth/license";
export { requireAuth, requireKbAdmin, requireRole, requireSuperAdmin } from "@/lib/auth/rbac";
import { requireKbAdmin, requireRole, requireSuperAdmin } from "@/lib/auth/rbac";

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
