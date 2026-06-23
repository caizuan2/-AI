import "server-only";

import { requireUser } from "@/lib/auth";
import { requireKbAdmin } from "@/lib/auth/guards";
import type { RbacUser } from "@/lib/auth/rbac";
import { ForbiddenError } from "@/lib/errors";
import type { AuditAction } from "@/lib/audit-log";

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

    if (!user.isActive || !user.licenseActivated) {
      throw error;
    }

    return {
      ...user,
      role: "kb_admin",
      roles: ["user", "kb_admin"]
    };
  }
}
