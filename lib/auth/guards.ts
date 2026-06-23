import "server-only";

import { requireUser } from "@/lib/auth";
import { authorize } from "@/lib/auth/authorize";
import { requireKbAdmin } from "@/lib/auth/rbac";
export { requireAuth, requireKbAdmin, requireRole, requireSuperAdmin } from "@/lib/auth/rbac";

export async function requireLicensedUser() {
  const authorization = await authorize(undefined, {
    product: "user_app",
    requiredRole: "user",
    requireLicense: true,
    auditAction: "route.access.denied",
    targetType: "product_route",
    metadata: {
      product: "user_app"
    }
  });

  return authorization.user ?? await requireUser();
}

export async function requireUserAppAccess() {
  const authorization = await authorize(undefined, {
    product: "user_app",
    requiredRole: "user",
    requireLicense: true,
    auditAction: "route.access.denied",
    targetType: "product_route",
    metadata: {
      product: "user_app"
    }
  });

  return authorization.user ?? await requireUser();
}

export async function requireIngestAdminAccess(request?: Request) {
  const authorization = await authorize(request, {
    product: "ingest_admin",
    requiredRole: ["kb_admin", "ingest_admin"],
    requireLicense: true,
    auditAction: "route.access.denied",
    targetType: "product_route",
    metadata: {
      product: "ingest_admin"
    }
  });

  return authorization.user ?? await requireKbAdmin(request, {
    requiredAppType: "ingest_admin",
    product: "ingest_admin"
  });
}
