import "server-only";

import { requireUser } from "@/lib/auth";
import { requireKbAdmin } from "@/lib/auth/guards";
import { getUserRoles, type RbacUser } from "@/lib/auth/rbac";
import { ForbiddenError } from "@/lib/errors";
import type { AuditAction } from "@/lib/audit-log";
import { getHighestRole } from "@/lib/rbac/roles";

type AdminIngestGuardOptions = {
  deniedAction?: AuditAction;
  targetType?: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  requireLicense?: boolean;
};

export async function requireAdminIngestActor(
  request: Request,
  options: AdminIngestGuardOptions = {}
): Promise<RbacUser> {
  try {
    return await requireKbAdmin(request, options);
  } catch (error) {
    if (!(error instanceof ForbiddenError)) {
      throw error;
    }

    const user = await requireUser();
    const roles = await getUserRoles(user);
    const hasIngestAccess = roles.some((role) =>
      role === "kb_admin" || role === "ingest_admin" || role === "super_admin"
    );

    if (!user.isActive || !hasIngestAccess) {
      throw error;
    }

    return {
      ...user,
      role: getHighestRole(roles),
      roles
    };
  }
}
