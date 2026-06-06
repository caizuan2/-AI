import "server-only";

import { requireSuperAdmin } from "@/lib/auth/rbac";

export { getAdminConfig, isAdminUser } from "@/lib/auth/admin-config";

export async function requireAdminUser(request?: Request) {
  return requireSuperAdmin(request, {
    deniedAction: "RBAC_ACCESS_DENIED",
    targetType: "admin"
  });
}
