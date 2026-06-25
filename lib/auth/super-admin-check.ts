import "server-only";

import { redirect } from "next/navigation";
import { writeAuditLog } from "@/lib/audit-log";
import { authorize } from "@/lib/auth/authorize";
import { isBootstrapSuperAdminUser } from "@/lib/auth/bootstrap-super-admin";
import { UnauthorizedError } from "@/lib/errors";

export async function requireSuperAdminAccess(request?: Request) {
  const authorization = await authorize(request, {
    product: "super_admin",
    requiredRole: "super_admin",
    requireLicense: false,
    auditAction: "route.access.denied",
    targetType: "super_admin",
    metadata: {
      product: "super_admin"
    }
  });
  const user = authorization.user;

  if (!user) {
    throw new Error("Super admin authorization did not return a user.");
  }

  if (isBootstrapSuperAdminUser(user)) {
    await writeAuditLog({
      userId: user.id,
      role: user.role,
      action: "bootstrap.admin.access",
      targetType: "super_admin",
      request,
      metadata: {
        product: "super_admin",
        source: "bootstrap_super_admin"
      }
    });
  }

  return user;
}

export async function enforceSuperAdminPageAccess() {
  try {
    return await requireSuperAdminAccess();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect("/login?next=/super-admin");
    }

    redirect("/no-access");
  }
}
