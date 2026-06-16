import "server-only";

import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/rbac";

export async function requireSuperAdminAccess(request?: Request) {
  return requireSuperAdmin(request, {
    deniedAction: "RBAC_ACCESS_DENIED",
    targetType: "super_admin"
  });
}

export async function enforceSuperAdminPageAccess() {
  try {
    return await requireSuperAdminAccess();
  } catch {
    redirect("/login?next=/super-admin");
  }
}
